// Sửa các kế hoạch bị chuyển nhầm sang CTSV dù số SV <= 50.
// Chạy thử (không ghi):  node scripts/fix-ctsv-routing.mjs
// Ghi thật:               node scripts/fix-ctsv-routing.mjs --apply
import fs from 'fs';
import path from 'path';

for (const name of ['.env.local', '.env', '.env.production']) {
  const p = path.join(process.cwd(), name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const APPLY = process.argv.includes('--apply');
const ALLOW_REMOTE = process.argv.includes('--allow-remote');
if (APPLY && /supabase\.co/i.test(URL_) && !ALLOW_REMOTE) {
  console.error('🛑 Chặn an toàn: từ chối ghi trực tiếp lên remote *.supabase.co khi chưa truyền --allow-remote.');
  process.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const rows = [];
const pageSize = 1000;
for (let offset = 0; ; offset += pageSize) {
  const res = await fetch(
    `${URL_}/rest/v1/event_proposals?select=id,title,organization_unit,participant_count,requires_ctsv_approval,requires_facility_approval,current_stage,status&status=eq.pending&order=id.asc&limit=${pageSize}&offset=${offset}`,
    { headers: { ...headers, Range: `${offset}-${offset + pageSize - 1}` } }
  );
  if (!res.ok) {
    console.error('Lỗi đọc dữ liệu:', res.status, await res.text());
    process.exit(1);
  }
  const batch = await res.json();
  if (!Array.isArray(batch) || batch.length === 0) break;
  rows.push(...batch);
  if (batch.length < pageSize) break;
}

const wrong = rows.filter((p) => (Number(p.participant_count) || 0) <= 50 && p.requires_ctsv_approval);
console.log(`Kế hoạch đang chờ: ${rows.length} • Bị gán CTSV nhầm (SV <= 50): ${wrong.length}`);

for (const p of wrong) {
  const patch = { requires_ctsv_approval: false };
  let note = '';
  if (p.current_stage === 'ctsv') {
    // Nếu có mượn phòng -> chuyển thẳng sang Phòng TC-HC-QT ('facility').
    // Nếu không mượn phòng -> trả về 'youth_union' để Đoàn Học Viện / Super Admin bấm Duyệt 1 lần tạo sự kiện chính thức (không gán stage cũ 'super_admin').
    patch.current_stage = p.requires_facility_approval ? 'facility' : 'youth_union';
    note = ` | stage ctsv -> ${patch.current_stage}`;
  }
  console.log(`- ${p.title} [${p.organization_unit}] SV=${p.participant_count} stage=${p.current_stage}${note}`);
  if (APPLY) {
    const r = await fetch(`${URL_}/rest/v1/event_proposals?id=eq.${encodeURIComponent(p.id)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    console.log(r.ok ? '   ✓ đã sửa' : `   ✗ lỗi ${r.status} ${await r.text()}`);
  }
}
if (!APPLY && wrong.length) console.log('\n(Chạy thử — thêm --apply [--allow-remote] để ghi thật)');
