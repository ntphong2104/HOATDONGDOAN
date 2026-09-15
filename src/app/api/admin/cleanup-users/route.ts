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

  // Find corrupted users: MSSV containing colons (normal MSSV is just digits)
  const { data: corruptedUsers, error } = await supabase
    .from('users')
    .select('mssv, full_name, class_id, email')
    .like('mssv', '%:%');

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

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
