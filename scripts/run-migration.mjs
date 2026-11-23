// Script kiểm tra hoặc chạy SQL migration qua biến môi trường.
// Mặc định chỉ đọc file migration (dry-run); truyền --apply (kèm DATABASE_URL và --allow-remote nếu trỏ DB remote) để thực thi qua psql.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

for (const name of ['.env.local', '.env', '.env.production']) {
  const p = path.join(process.cwd(), name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const MIGRATION_FILE = process.env.MIGRATION_FILE || 'supabase/migrations/016_security_and_schema_hardening.sql';
const APPLY = process.argv.includes('--apply');
const ALLOW_REMOTE = process.argv.includes('--allow-remote');

async function runMigration() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error(`❌ Không tìm thấy file migration: ${MIGRATION_FILE}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
  console.log(`📄 Migration file: ${MIGRATION_FILE} (${sql.length} chars)`);

  if (!APPLY) {
    console.log('ℹ️  Dry-run mode. Truyền --apply cùng DATABASE_URL (và --allow-remote nếu trỏ remote) để chạy qua psql, hoặc dán file SQL vào Supabase SQL Editor.');
    if (SUPABASE_URL && serviceKey) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/session_checkins?select=id&limit=1`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      console.log(res.ok ? '✅ Kết nối REST kiểm tra bảng session_checkins thành công.' : `⚠️  session_checkins chưa tồn tại hoặc bị chặn (HTTP ${res.status}).`);
    }
    return;
  }

  if (!DATABASE_URL) {
    console.error('❌ Thiếu DATABASE_URL để chạy psql. PostgREST không hỗ trợ thực thi DDL SQL trực tiếp — vui lòng chạy file SQL trong Supabase SQL Editor hoặc cung cấp DATABASE_URL.');
    process.exit(1);
  }

  if (/supabase\.(co|com)|pooler\.supabase/i.test(DATABASE_URL) && !ALLOW_REMOTE) {
    console.error('🛑 Chặn an toàn: từ chối áp dụng migration lên remote Supabase khi chưa truyền --allow-remote.');
    process.exit(1);
  }

  console.log(`🚀 Đang chạy SQL migration qua psql: ${MIGRATION_FILE}`);
  execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', MIGRATION_FILE], {
    stdio: 'inherit',
  });
  console.log('✅ Migration thành công!');
}

runMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
