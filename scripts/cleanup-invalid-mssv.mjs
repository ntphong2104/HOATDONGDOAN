import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zpllkynavzeorenclwrc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Znj1iNQM4v8icsDBeAYJiw_JgZJGlsS';

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
  while ((m = concatPattern.exec(s)) !== null) { concatMatches.push(m.index); }
  if (concatMatches.length > 1) return false;
  return true;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('\n🔍 Đang quét toàn bộ event_registrations...\n');

  const { data: regs, error } = await supabase
    .from('event_registrations')
    .select('id, event_id, mssv, full_name, class_id, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Lỗi query:', error.message);
    process.exit(1);
  }

  const allRegs = regs || [];
  const invalidRegs = allRegs.filter(r => !isValidMSSV(r.mssv || ''));

  console.log(`📊 Tổng registrations: ${allRegs.length}`);
  console.log(`✅ Hợp lệ: ${allRegs.length - invalidRegs.length}`);
  console.log(`❌ Sai format: ${invalidRegs.length}`);

  if (invalidRegs.length === 0) {
    console.log('\n✨ Không có dữ liệu sai. DB sạch!');
    return;
  }

  console.log('\n--- Danh sách MSSV sai format ---\n');
  invalidRegs.forEach(r => {
    console.log(`  ❌ ${(r.mssv || 'NULL').padEnd(25)} | ${(r.full_name || '').padEnd(25)} | ${r.class_id || ''}`);
  });

  // Delete
  console.log(`\n🗑️  Đang xóa ${invalidRegs.length} dòng sai format...`);
  const invalidIds = invalidRegs.map(r => r.id);
  let totalDeleted = 0;

  for (let i = 0; i < invalidIds.length; i += 100) {
    const batch = invalidIds.slice(i, i + 100);
    const { error: delError } = await supabase
      .from('event_registrations')
      .delete()
      .in('id', batch);
    if (delError) {
      console.error(`   ❌ Lỗi batch ${i / 100 + 1}:`, delError.message);
    } else {
      totalDeleted += batch.length;
      console.log(`   ✅ Batch ${i / 100 + 1}: xóa ${batch.length} dòng`);
    }
  }

  // Also check_ins
  console.log('\n🔍 Đang quét bảng check_ins...');
  const { data: checkins, error: ciErr } = await supabase
    .from('check_ins')
    .select('id, event_id, mssv, full_name');

  if (!ciErr && checkins) {
    const invalidCI = checkins.filter(c => !isValidMSSV(c.mssv || ''));
    console.log(`📊 Tổng check_ins: ${checkins.length} | ❌ Sai: ${invalidCI.length}`);
    if (invalidCI.length > 0) {
      invalidCI.forEach(c => console.log(`  ❌ ${(c.mssv || 'NULL').padEnd(25)} | ${c.full_name || ''}`));
      const ciIds = invalidCI.map(c => c.id);
      for (let i = 0; i < ciIds.length; i += 100) {
        const batch = ciIds.slice(i, i + 100);
        const { error: de } = await supabase.from('check_ins').delete().in('id', batch);
        if (de) console.error(`   ❌ Lỗi:`, de.message);
        else { totalDeleted += batch.length; console.log(`   ✅ Xóa ${batch.length} check_ins`); }
      }
    }
  }

  console.log(`\n✨ HOÀN TẤT: Đã xóa ${totalDeleted} dòng dữ liệu rác khỏi DB.\n`);
}

main().catch(console.error);
