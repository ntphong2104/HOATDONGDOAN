// Script chạy SQL migration qua Supabase REST API
// Cần SUPABASE_SERVICE_ROLE_KEY để chạy DDL

const SUPABASE_URL = 'https://zpllkynavzeorenclwrc.supabase.co';

async function runMigration() {
  // Thử đọc service role key từ env
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceKey) {
    console.log('');
    console.log('⚠️  Không tìm thấy SUPABASE_SERVICE_ROLE_KEY');
    console.log('');
    console.log('Bạn cần chạy SQL migration THỦ CÔNG:');
    console.log('');
    console.log('1. Mở: https://supabase.com/dashboard/project/zpllkynavzeorenclwrc/sql/new');
    console.log('2. Copy nội dung file: supabase/migrations/20260924_session_checkins.sql');
    console.log('3. Paste vào SQL Editor → Bấm "Run"');
    console.log('');
    console.log('Hoặc set biến env rồi chạy lại:');
    console.log('  SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/run-migration.mjs');
    console.log('');
    
    // Thử kiểm tra bảng đã tồn tại chưa bằng anon key
    const anonKey = 'sb_publishable_Znj1iNQM4v8icsDBeAYJiw_JgZJGlsS';
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/session_checkins?select=count&limit=0`, {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        }
      });
      if (res.ok) {
        console.log('✅ Bảng session_checkins ĐÃ TỒN TẠI — có thể đã chạy migration rồi!');
      } else {
        console.log('❌ Bảng session_checkins CHƯA TỒN TẠI — cần chạy migration.');
      }
    } catch (e) {
      console.log('❌ Không kết nối được Supabase');
    }
    return;
  }

  // Có service key → chạy migration qua SQL endpoint  
  const fs = await import('fs');
  const sql = fs.readFileSync('supabase/migrations/20260924_session_checkins.sql', 'utf-8');
  
  console.log('🚀 Đang chạy SQL migration...');
  
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  
  if (res.ok) {
    console.log('✅ Migration thành công!');
  } else {
    const err = await res.text();
    console.log('❌ Lỗi:', err);
    console.log('');
    console.log('→ Hãy chạy thủ công trong SQL Editor:');
    console.log('  https://supabase.com/dashboard/project/zpllkynavzeorenclwrc/sql/new');
  }
}

runMigration();
