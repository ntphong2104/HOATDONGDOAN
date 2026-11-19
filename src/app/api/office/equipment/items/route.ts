import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isOfficeAdminAuth } from '@/lib/utils/office-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const supabase = (await createAdminClient()) || (await createClient());
    const { data, error } = await supabase
      .from('office_items')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message.includes('does not exist')
            ? 'Bảng office_items chưa tồn tại — vui lòng chạy migration 014_office_equipment.sql trên Supabase.'
            : error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi tải danh mục vật phẩm' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json({ success: false, error: 'Chỉ Admin VPĐ mới được thêm vật phẩm.' }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body?.name || '').trim();
    const category = String(body?.category || 'Dụng cụ sự kiện').trim();
    const total_qty = Math.max(1, Number(body?.total_qty) || 1);
    const unit = String(body?.unit || 'Cái').trim();
    const condition_note = String(body?.condition_note || '').trim();

    if (!name) return NextResponse.json({ success: false, error: 'Vui lòng nhập tên vật phẩm.' }, { status: 400 });

    const supabase = (await createAdminClient()) || (await createClient());
    const { data, error } = await supabase
      .from('office_items')
      .insert({
        name,
        category,
        total_qty,
        available_qty: total_qty,
        unit,
        condition_note,
        is_active: true,
        created_by: auth!.email,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message: `Đã thêm "${name}" vào kho VPĐ.`, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi thêm vật phẩm' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ success: false, error: 'Thiếu ID vật phẩm.' }, { status: 400 });

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.category !== undefined) patch.category = String(body.category).trim();
    if (body.unit !== undefined) patch.unit = String(body.unit).trim();
    if (body.condition_note !== undefined) patch.condition_note = String(body.condition_note).trim();
    if (body.total_qty !== undefined) patch.total_qty = Math.max(0, Number(body.total_qty) || 0);
    if (body.available_qty !== undefined) patch.available_qty = Math.max(0, Number(body.available_qty) || 0);

    const supabase = (await createAdminClient()) || (await createClient());
    const { data, error } = await supabase.from('office_items').update(patch).eq('id', id).select('*').single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi cập nhật vật phẩm' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get('id') || '').trim();
    if (!id) return NextResponse.json({ success: false, error: 'Thiếu ID vật phẩm.' }, { status: 400 });

    const supabase = (await createAdminClient()) || (await createClient());
    const { error } = await supabase.from('office_items').update({ is_active: false }).eq('id', id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message: 'Đã ẩn vật phẩm khỏi danh mục.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi xóa vật phẩm' }, { status: 500 });
  }
}
