import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; roleId: string }> }) {
  try {
    const { roleId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    const { error } = await supabase.from('event_roles').delete().eq('id', parseInt(roleId));
    if (error) return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại', message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
