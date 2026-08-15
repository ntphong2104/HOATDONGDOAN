import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    const { data } = await supabase
      .from('event_roles')
      .select('id, email, role_type, created_at')
      .eq('event_id', id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ success: true, data: data || [] });
  } catch {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    const body = await request.json();
    const { email, role_type } = body;
    if (!email || !['event_admin', 'checker'].includes(role_type)) {
      return NextResponse.json({ success: false, error: 'validation_error' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('event_roles')
      .insert({ event_id: id, email, role_type })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'duplicate', message: 'Quyền đã được gán' }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại', message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
