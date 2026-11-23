// Load test RPC checkin_atomic (yêu cầu SUPABASE_SERVICE_ROLE_KEY & cờ --apply).
// Mặc định chỉ in hướng dẫn; CHỈ chạy khi truyền --apply (và thêm --allow-remote nếu trỏ tới supabase.co).

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_OR_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const EVENT_ID = process.env.LOAD_TEST_EVENT_ID || '';
const SESSION_ID = process.env.LOAD_TEST_SESSION_ID || '__load_test_500__';
const CONCURRENT = Math.max(1, Number(process.env.CONCURRENT || 100));
const APPLY = process.argv.includes('--apply');
const ALLOW_REMOTE = process.argv.includes('--allow-remote');

if (!SUPABASE_URL || !SERVICE_OR_KEY || !EVENT_ID) {
  console.error('❌ Thiếu biến môi trường: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOAD_TEST_EVENT_ID (RPC checkin_atomic chỉ cấp quyền cho service_role).');
  process.exit(1);
}

if (!APPLY) {
  console.log('ℹ️  Dry-run mode. Truyền --apply để thực thi load test (và --allow-remote nếu muốn trỏ tới supabase.co).');
  process.exit(0);
}

if (/supabase\.co/i.test(SUPABASE_URL) && !ALLOW_REMOTE) {
  console.error('🛑 Chặn an toàn: từ chối chạy load-test trực tiếp lên remote *.supabase.co khi chưa truyền --allow-remote.');
  process.exit(1);
}

async function fetchMSSVs() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?select=mssv&mssv=like.N*&limit=500`, {
    headers: { apikey: SERVICE_OR_KEY, Authorization: `Bearer ${SERVICE_OR_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Không thể tải danh sách MSSV: HTTP ${res.status} ${await res.text()}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows.map((d) => d.mssv) : [];
}

async function checkin(mssv) {
  const start = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/checkin_atomic`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_OR_KEY,
        Authorization: `Bearer ${SERVICE_OR_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_event_id: EVENT_ID,
        p_session_id: SESSION_ID,
        p_session_name: 'Load Test',
        p_mssv: mssv,
        p_role: 'participant',
        p_checked_by: 'LoadTest',
        p_max_participants: 0,
      }),
    });
    const data = await res.json();
    return { success: data?.success === true, dup: data?.is_duplicate === true, elapsed: Date.now() - start };
  } catch {
    return { success: false, dup: false, elapsed: Date.now() - start };
  }
}

async function run() {
  console.log('📡 Lấy tối đa 500 MSSV để kiểm thử...');
  const mssvs = await fetchMSSVs();
  const TOTAL = mssvs.length;
  console.log(`   Tìm thấy ${TOTAL} MSSV\n🚀 TEST: ${TOTAL} SV, ${CONCURRENT} concurrent\n`);

  const allStart = Date.now();
  const results = [];
  for (let b = 0; b < Math.ceil(TOTAL / CONCURRENT); b++) {
    const s = b * CONCURRENT;
    const size = Math.min(CONCURRENT, TOTAL - s);
    const br = await Promise.all(Array.from({ length: size }, (_, i) => checkin(mssvs[s + i])));
    results.push(...br);
    const ok = br.filter((r) => r.success).length;
    const avg = Math.round(br.reduce((a, r) => a + r.elapsed, 0) / Math.max(1, size));
    console.log(`  Batch ${b + 1}: ✅${ok}/${size} | avg ${avg}ms`);
  }

  const ms = Date.now() - allStart;
  const ok = results.filter((r) => r.success).length;
  const times = results.map((r) => r.elapsed).sort((a, b) => a - b);
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 KẾT QUẢ: ${ok}/${TOTAL} thành công`);
  if (TOTAL > 0) {
    console.log(`⏱️  ${(ms / 1000).toFixed(1)}s | ${Math.round(TOTAL / (ms / 1000))} req/s | P50: ${times[Math.floor(TOTAL * 0.5)]}ms | P95: ${times[Math.floor(TOTAL * 0.95)]}ms | Max: ${times[TOTAL - 1]}ms`);
  }
  console.log(`${'═'.repeat(50)}`);

  console.log('\n🧹 Dọn dữ liệu test...');
  await fetch(`${SUPABASE_URL}/rest/v1/session_checkins?session_id=eq.${encodeURIComponent(SESSION_ID)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_OR_KEY, Authorization: `Bearer ${SERVICE_OR_KEY}` },
  });
  await fetch(`${SUPABASE_URL}/rest/v1/check_ins?checked_by=eq.LoadTest`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_OR_KEY, Authorization: `Bearer ${SERVICE_OR_KEY}` },
  });
  console.log('✅ Đã dọn dữ liệu test.');
}

run().catch(console.error);
