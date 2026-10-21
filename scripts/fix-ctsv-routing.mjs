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
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const res = await fetch(
  `${URL_}/rest/v1/event_proposals?select=id,title,organization_unit,participant_count,requires_ctsv_approval,requires_facility_approval,current_stage,status&status=eq.pending`,
  { headers }
);
const rows = await res.json();
if (!Array.isArray(rows)) {
  console.error('Lỗi đọc dữ liệu:', rows);
  process.exit(1);
}

const wrong = rows.filter((p) => (Number(p.participant_count) || 0) <= 50 && p.requires_ctsv_approval);
console.log(`Kế hoạch đang chờ: ${rows.length} • Bị gán CTSV nhầm (SV <= 50): ${wrong.length}`);

for (const p of wrong) {
  const patch = { requires_ctsv_approval: false };
  let note = '';
  if (p.current_stage === 'ctsv') {
    // Đã qua Đoàn Học Viện → chuyển thẳng sang bước tiếp theo
    patch.current_stage = p.requires_facility_approval ? 'facility' : 'super_admin';
    note = ` | stage ctsv -> ${patch.current_stage}`;
  }
  console.log(`- ${p.title} [${p.organization_unit}] SV=${p.participant_count} stage=${p.current_stage}${note}`);
  if (APPLY) {
    const r = await fetch(`${URL_}/rest/v1/event_proposals?id=eq.${p.id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    console.log(r.ok ? '   ✓ đã sửa' : `   ✗ lỗi ${r.status} ${await r.text()}`);
  }
}
if (!APPLY && wrong.length) console.log('\n(Chạy thử — thêm --apply để ghi thật)');
