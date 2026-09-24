const SUPABASE_URL = 'https://zpllkynavzeorenclwrc.supabase.co';
const ANON_KEY = 'sb_publishable_Znj1iNQM4v8icsDBeAYJiw_JgZJGlsS';
const EVENT_ID = 'f61e6438-ac7e-4ad3-9f5c-43c3d074e52b';
const SESSION_ID = '__load_test_500__';
const CONCURRENT = 100;

async function fetchMSSVs() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?select=mssv&mssv=like.N*&limit=500`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
  });
  return (await res.json()).map(d => d.mssv);
}

async function checkin(mssv) {
  const start = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/checkin_atomic`, {
      method: 'POST',
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_event_id: EVENT_ID, p_session_id: SESSION_ID, p_session_name: 'Load Test 500', p_mssv: mssv, p_role: 'participant', p_checked_by: 'LoadTest', p_max_participants: 0 }),
    });
    const data = await res.json();
    return { success: data?.success === true, dup: data?.is_duplicate === true, elapsed: Date.now() - start };
  } catch (e) { return { success: false, dup: false, elapsed: Date.now() - start }; }
}

async function run() {
  console.log('📡 Lấy 500 MSSV thật...');
  const mssvs = await fetchMSSVs();
  const TOTAL = mssvs.length;
  console.log(`   Tìm thấy ${TOTAL} MSSV\n🚀 TEST: ${TOTAL} SV, ${CONCURRENT} concurrent\n`);

  const allStart = Date.now();
  const results = [];
  for (let b = 0; b < Math.ceil(TOTAL / CONCURRENT); b++) {
    const s = b * CONCURRENT, size = Math.min(CONCURRENT, TOTAL - s);
    const br = await Promise.all(Array.from({ length: size }, (_, i) => checkin(mssvs[s + i])));
    results.push(...br);
    const ok = br.filter(r => r.success).length, avg = Math.round(br.reduce((a, r) => a + r.elapsed, 0) / size);
    console.log(`  Batch ${b + 1}: ✅${ok}/${size} | avg ${avg}ms`);
  }

  const ms = Date.now() - allStart, ok = results.filter(r => r.success).length;
  const times = results.map(r => r.elapsed).sort((a, b) => a - b);
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 KẾT QUẢ: ${ok}/${TOTAL} thành công`);
  console.log(`⏱️  ${(ms/1000).toFixed(1)}s | ${Math.round(TOTAL/(ms/1000))} req/s | P50: ${times[Math.floor(TOTAL*0.5)]}ms | P95: ${times[Math.floor(TOTAL*0.95)]}ms | Max: ${times[TOTAL-1]}ms`);
  console.log(`${'═'.repeat(50)}`);

  // Cleanup ALL test data
  console.log('\n🧹 Dọn dữ liệu test...');
  const d1 = await fetch(`${SUPABASE_URL}/rest/v1/session_checkins?session_id=eq.${SESSION_ID}`, {
    method: 'DELETE', headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
  });
  const d2 = await fetch(`${SUPABASE_URL}/rest/v1/session_checkins?session_id=eq.__load_test__`, {
    method: 'DELETE', headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
  });
  const d3 = await fetch(`${SUPABASE_URL}/rest/v1/session_checkins?session_id=eq.test`, {
    method: 'DELETE', headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
  });
  const d4 = await fetch(`${SUPABASE_URL}/rest/v1/check_ins?checked_by=eq.LoadTest`, {
    method: 'DELETE', headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
  });
  const d5 = await fetch(`${SUPABASE_URL}/rest/v1/check_ins?checked_by=eq.Test`, {
    method: 'DELETE', headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
  });
  console.log(`  session_checkins: ${d1.ok && d2.ok && d3.ok ? '✅' : '⚠️'}`);
  console.log(`  check_ins test:   ${d4.ok && d5.ok ? '✅' : '⚠️'}`);
  
  // Verify cleanup
  const verify = await fetch(`${SUPABASE_URL}/rest/v1/session_checkins?session_id=like.__load_test*&select=count`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Prefer': 'count=exact' },
  });
  const remaining = verify.headers.get('content-range');
  console.log(`  Còn lại: ${remaining || '0'}`);
  console.log('\n✅ DỌN XONG — dữ liệu thật không bị ảnh hưởng!');
}

run().catch(console.error);
