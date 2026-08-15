import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('system_settings').select('maintenance_mode, maintenance_message').single();
  
  if (error) return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const email = session.user.email!;
  const { data: superAdmin } = await supabase.from('super_admins').select('email').eq('email', email).single();

  if (!superAdmin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const { enabled, message } = await req.json();

  const { data, error } = await supabase
    .from('system_settings')
    .update({ 
      maintenance_mode: enabled,
      maintenance_message: message 
    })
    .eq('id', 1)
    .select().single();

  if (error) return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });

  return NextResponse.json({ success: true, data });
}
