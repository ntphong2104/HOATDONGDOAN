// Quét MSSV sai format trong event_registrations & check_ins.
// Mặc định chỉ kiểm tra (dry-run); truyền --apply để xóa dữ liệu sai format (thêm --allow-remote nếu trỏ *.supabase.co).

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

for (const name of ['.env.local', '.env', '.env.production']) {
  const p = path.join(process.cwd(), name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APPLY = process.argv.includes('--apply');
const ALLOW_REMOTE = process.argv.includes('--allow-remote');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong env / .env.local.');
  process.exit(1);
}

if (APPLY && /supabase\.co/i.test(SUPABASE_URL) && !ALLOW_REMOTE) {
  console.error('🛑 Chặn an toàn: từ chối xóa dữ liệu trực tiếp trên remote *.supabase.co khi chưa truyền --allow-remote.');
  process.exit(1);
}

async function fetchAllPaginated(supabase, table, selectCols, orderCol = 'id') {
  const all = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(selectCols)
      .order(orderCol, { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Lỗi query ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function isValidMSSV(mssv) {
  if (!mssv || typeof mssv !== 'string') return false;
  const s = mssv.trim().toUpperCase();
  if (s.length < 8 || s.length > 15) return false;
  if (!/^[A-Z]\d{2}/.test(s)) return false;
  const MSSV_REGEX = /^[A-Z]\d{2}[A-Z]{2,6}\d{1,5}(-[A-Z0-9]{1,3})?$/;
  if (!MSSV_REGEX.test(s)) return false;
  const concatPattern = /[A-Z]\d{2}[A-Z]{2}/g;
  const concatMatches = [];
  let m;
  while ((m = concatPattern.exec(s)) !== null) {
    concatMatches.push(m.index);
  }
  return concatMatches.length <= 1;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('\n🔍 Đang quét toàn bộ event_registrations...\n');
  const allRegs = await fetchAllPaginated(
    supabase,
    'event_registrations',
    'id, event_id, mssv, full_name, class_id, created_at',
    'id'
  );
  const invalidRegs = allRegs.filter((r) => !isValidMSSV(r.mssv || ''));

  console.log(`📊 Tổng registrations: ${allRegs.length}`);
  console.log(`✅ Hợp lệ: ${allRegs.length - invalidRegs.length}`);
  console.log(`❌ Sai format: ${invalidRegs.length}`);

  invalidRegs.forEach((r) => {
    console.log(`  ❌ ${(r.mssv || 'NULL').padEnd(25)} | ${(r.full_name || '').padEnd(25)} | ${r.class_id || ''}`);
  });

  if (!APPLY) {
    console.log('\nℹ️  Dry-run mode — chưa xóa dữ liệu. Truyền --apply (và --allow-remote nếu remote) để thực thi.');
    return;
  }

  let totalDeleted = 0;
  const invalidIds = invalidRegs.map((r) => r.id);
  for (let i = 0; i < invalidIds.length; i += 100) {
    const batch = invalidIds.slice(i, i + 100);
    const { error: delError } = await supabase
      .from('event_registrations')
      .delete()
      .in('id', batch);
    if (delError) {
      console.error('❌ Lỗi xóa event_registrations batch:', delError.message);
    } else {
      totalDeleted += batch.length;
    }
  }

  const checkins = await fetchAllPaginated(
    supabase,
    'check_ins',
    'id, event_id, mssv, full_name',
    'id'
  );

  const invalidCI = checkins.filter((c) => !isValidMSSV(c.mssv || ''));
  const ciIds = invalidCI.map((c) => c.id);
  for (let i = 0; i < ciIds.length; i += 100) {
    const batch = ciIds.slice(i, i + 100);
    const { error: de } = await supabase.from('check_ins').delete().in('id', batch);
    if (de) {
      console.error('❌ Lỗi xóa check_ins batch:', de.message);
    } else {
      totalDeleted += batch.length;
    }
  }

  console.log(`\n✨ HOÀN TẤT: Đã xóa ${totalDeleted} dòng dữ liệu rác khỏi DB.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
