import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.isSuperAdmin && auth.tier !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim();

    const isUnitAccount = (u: { mssv?: string; email?: string }) => {
      const m = (u.mssv || '').toUpperCase();
      const e = (u.email || '').toLowerCase();
      return (
        m.startsWith('LCD_') ||
        m.startsWith('CLB_') ||
        m.startsWith('DOI_') ||
        m.startsWith('PHONG_') ||
        m.startsWith('DOAN_') ||
        m.startsWith('SUPER_') ||
        e.startsWith('lcd') ||
        e.startsWith('clb') ||
        e.startsWith('doi') ||
        e.includes('doanthanhnien') ||
        e.includes('ctsv') ||
        e.includes('quantri') ||
        e.includes('superadmin')
      );
    };

    if (query) {
      // Direct server-side search across all records
      const { data: searchResults, error } = await supabase
        .from('users')
        .select('*')
        .or(`mssv.ilike.%${query}%,full_name.ilike.%${query}%,email.ilike.%${query}%,class_id.ilike.%${query}%`)
        .order('mssv', { ascending: true })
        .limit(200);

      if (error) {
        return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
      }

      const filtered = (searchResults || []).filter((u) => !isUnitAccount(u));
      return NextResponse.json({ success: true, data: filtered });
    }

    // When fetching full list: fetch all records using pagination ranges (1000 per page to bypass PostgREST limit)
    let allUsers: any[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore && page < 20) {
      const start = page * pageSize;
      const end = start + pageSize - 1;

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('mssv', { ascending: true })
        .range(start, end);

      if (error) {
        console.error('Error fetching page', page, error);
        break;
      }

      if (data && data.length > 0) {
        allUsers = allUsers.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    const studentsOnly = allUsers.filter((u) => !isUnitAccount(u));
    return NextResponse.json({ success: true, data: studentsOnly });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
