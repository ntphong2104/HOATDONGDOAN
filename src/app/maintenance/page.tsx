export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { LockIcon } from '@/components/icons';
import styles from './page.module.css';

export default async function MaintenancePage() {
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'maintenance_mode')
    .maybeSingle();

  let customMessage = '';
  if (settings?.value) {
    let val: any = settings.value;
    if (typeof val === 'string') {
      try {
        val = JSON.parse(val);
      } catch {}
    }
    if (val && typeof val === 'object') {
      customMessage = val.message || val.maintenance_message || '';
    }
  }

  const message = customMessage || 'Hệ thống đang bảo trì để nâng cấp. Vui lòng quay lại sau.';

  return (
    <div className={styles.container}>
      <div className={styles.iconWrapper}>
        <LockIcon size={64} />
      </div>
      <h1 className={styles.title}>Đang Bảo Trì</h1>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
