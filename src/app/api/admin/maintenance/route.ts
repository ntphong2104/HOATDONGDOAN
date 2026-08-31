import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('system_settings').select('maintenance_mode, maintenance_message').maybeSingle();
    
    if (error) {
      console.error('Maintenance API error:', error.message);
      return NextResponse.json({ success: true, data: { maintenance_mode: false, maintenance_message: '' } });
    }
    return NextResponse.json({ success: true, data: data || { maintenance_mode: false, maintenance_message: '' } });
  } catch (err) {
    return NextResponse.json({ success: true, data: { maintenance_mode: false, maintenance_message: '' } });
  }
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
