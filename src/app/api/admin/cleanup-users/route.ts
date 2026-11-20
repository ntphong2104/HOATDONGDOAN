import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

/**
 * One-time cleanup: remove corrupted user records where MSSV contains
 * dynamic QR token strings (UUID:MSSV:ROLE:SESSION:HASH format).
 * 
 * Only super_admin can run this. DELETE after use.
 */
export async function POST() {
  const auth = await getAuthContext();
  if (!auth || !auth.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới chạy được' }, { status: 403 });
  }

  const supabase = await createAdminClient();

  // Find corrupted users:
  // 1. MSSV containing colons (raw dynamic QR token strings)
  // 2. Purely numeric MSSV (e.g. 179482749 — 10-second QR time windows accidentally scanned as MSSV)
  const [{ data: colonUsers, error: colonErr }, { data: allUsers, error: allErr }] = await Promise.all([
    supabase.from('users').select('mssv, full_name, class_id, email').like('mssv', '%:%'),
    supabase.from('users').select('mssv, full_name, class_id, email').eq('class_id', 'PTIT-HCM'),
  ]);

  if (colonErr || allErr) {
    return NextResponse.json({ success: false, error: (colonErr || allErr)?.message }, { status: 500 });
  }

  const numericTimestampUsers = (allUsers || []).filter((u: any) => /^\d{7,13}$/.test(String(u.mssv || '').trim()));
  const corruptedMap = new Map<string, any>();
  for (const u of [...(colonUsers || []), ...numericTimestampUsers]) {
    corruptedMap.set(u.mssv, u);
  }
  const corruptedUsers = Array.from(corruptedMap.values());

  if (!corruptedUsers || corruptedUsers.length === 0) {
    return NextResponse.json({ success: true, message: 'Không tìm thấy user rác nào', deleted: 0 });
  }

  const results: any[] = [];

  for (const user of corruptedUsers) {
    try {
      // First delete any check_ins referencing this corrupted MSSV
      await supabase.from('check_ins').delete().eq('mssv', user.mssv);
      
      // Then delete the corrupted user record
      const { error: deleteErr } = await supabase
        .from('users')
        .delete()
        .eq('mssv', user.mssv);

      if (deleteErr) {
        results.push({ mssv: user.mssv.slice(0, 50) + '...', status: 'error', reason: deleteErr.message });
      } else {
        results.push({ mssv: user.mssv.slice(0, 50) + '...', status: 'deleted' });
      }
    } catch (err: any) {
      results.push({ mssv: user.mssv.slice(0, 50) + '...', status: 'error', reason: err.message });
    }
  }

  const deletedCount = results.filter(r => r.status === 'deleted').length;

  return NextResponse.json({
    success: true,
    message: `Đã xóa ${deletedCount}/${corruptedUsers.length} user rác`,
    total_found: corruptedUsers.length,
    deleted: deletedCount,
    results,
  });
}
