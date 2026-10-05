import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { reconcileAllPastEvents } from '@/lib/utils/blacklist-logic';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth || (!auth.isSuperAdmin && !auth.isEventAdmin)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());

  const { data: penalties, error } = await supabase
    .from('user_penalties')
    .select('*')
    .order('is_blacklisted', { ascending: false })
    .order('missed_count', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }

  const penaltyList = penalties || [];

  if (penaltyList.length > 0) {
    const rawMssvs = Array.from(new Set(penaltyList.map((p: any) => p.mssv).filter(Boolean)));

    if (rawMssvs.length > 0) {
      // 1. Fetch authoritative student profiles from `users` table in chunks (by MSSV and by Email)
      const userMap = new Map<string, { full_name?: string; class_id?: string; email?: string }>();
      const CHUNK_SIZE = 100;
      for (let i = 0; i < rawMssvs.length; i += CHUNK_SIZE) {
        const mssvChunk = rawMssvs.slice(i, i + CHUNK_SIZE);
        const emailChunk = penaltyList
          .slice(i, i + CHUNK_SIZE)
          .map((p: any) => p.email?.trim().toLowerCase())
          .filter(Boolean);

        const allMssvs = Array.from(
          new Set([
            ...mssvChunk.map((m: string) => m.toUpperCase().trim()),
            ...mssvChunk.map((m: string) => m.toLowerCase().trim()),
          ])
        );

        try {
          const [{ data: userRowsByMssv }, { data: userRowsByEmail }] = await Promise.all([
            supabase
              .from('users')
              .select('mssv, full_name, class_id, email')
              .in('mssv', allMssvs),
            emailChunk.length > 0
              ? supabase
                  .from('users')
                  .select('mssv, full_name, class_id, email')
                  .in('email', emailChunk)
              : { data: [] },
          ]);

          const combinedUsers = [...(userRowsByMssv || []), ...(userRowsByEmail || [])];
          for (const u of combinedUsers) {
            if (u.mssv) {
              userMap.set(u.mssv.toUpperCase().trim(), u);
              userMap.set(u.mssv.toLowerCase().trim(), u);
            }
            if (u.email) {
              userMap.set(u.email.toLowerCase().trim(), u);
            }
          }
        } catch {}
      }

      // 2. For any MSSVs without a valid name in `users`, check `event_registrations`
      const isPlaceholderName = (name?: string, mssv?: string) =>
        !name || !name.trim() || name.trim().toUpperCase() === (mssv || '').toUpperCase() || name.includes('@');

      const missingMssvs = rawMssvs.filter((m: string) => {
        const cleanM = m.toUpperCase().trim();
        const p = penaltyList.find((item: any) => item.mssv?.toUpperCase().trim() === cleanM);
        const cleanE = (p?.email || '').toLowerCase().trim();
        const u = userMap.get(cleanM) || (cleanE ? userMap.get(cleanE) : undefined);
        return isPlaceholderName(u?.full_name, cleanM) && isPlaceholderName(p?.full_name, cleanM);
      });

      const regMap = new Map<string, { full_name?: string; class_id?: string; email?: string }>();
      if (missingMssvs.length > 0) {
        for (let i = 0; i < missingMssvs.length; i += CHUNK_SIZE) {
          const chunk = missingMssvs.slice(i, i + CHUNK_SIZE);
          const allRegMssvs = Array.from(
            new Set([
              ...chunk.map((m: string) => m.toUpperCase().trim()),
              ...chunk.map((m: string) => m.toLowerCase().trim()),
            ])
          );
          try {
            const { data: regRows } = await supabase
              .from('event_registrations')
              .select('mssv, full_name, class_id, email')
              .in('mssv', allRegMssvs)
              .not('full_name', 'is', null)
              .order('created_at', { ascending: false });

            if (regRows) {
              for (const r of regRows) {
                const cleanM = r.mssv?.toUpperCase().trim();
                if (cleanM && !regMap.has(cleanM) && !isPlaceholderName(r.full_name, cleanM)) {
                  regMap.set(cleanM, r);
                  regMap.set(r.mssv?.toLowerCase().trim(), r);
                }
                if (r.email) {
                  regMap.set(r.email.toLowerCase().trim(), r);
                }
              }
            }
          } catch {}
        }
      }

      // 3. Enrich penalties and collect rows that need auto-healing in `user_penalties`
      const healUpdates: Array<{ mssv: string; full_name?: string; class_id?: string; email?: string }> = [];

      for (const pen of penaltyList) {
        const cleanM = (pen.mssv || '').toUpperCase().trim();
        const cleanE = (pen.email || '').toLowerCase().trim();
        const u = userMap.get(cleanM) || (cleanE ? userMap.get(cleanE) : undefined);
        const r = regMap.get(cleanM) || (cleanE ? regMap.get(cleanE) : undefined);

        const realName =
          !isPlaceholderName(u?.full_name, cleanM)
            ? u!.full_name!.trim()
            : !isPlaceholderName(r?.full_name, cleanM)
              ? r!.full_name!.trim()
              : !isPlaceholderName(pen.full_name, cleanM)
                ? pen.full_name.trim()
                : (u?.full_name || r?.full_name || pen.full_name || pen.mssv);

        const realClass =
          u?.class_id && u.class_id.trim() !== 'PTIT-HCM'
            ? u.class_id.trim()
            : r?.class_id && r.class_id.trim() !== 'PTIT-HCM'
              ? r.class_id.trim()
              : pen.class_id && pen.class_id.trim() !== 'PTIT-HCM'
                ? pen.class_id.trim()
                : (u?.class_id || r?.class_id || pen.class_id || 'PTIT-HCM');

        const realEmail = u?.email || r?.email || pen.email;

        // Check if database row needs updating
        const shouldUpdateDb =
          (!isPlaceholderName(realName, cleanM) && isPlaceholderName(pen.full_name, cleanM)) ||
          (realClass !== 'PTIT-HCM' && pen.class_id === 'PTIT-HCM');

        if (shouldUpdateDb) {
          healUpdates.push({
            mssv: pen.mssv,
            full_name: realName,
            class_id: realClass,
            email: realEmail,
          });
        }

        pen.full_name = realName;
        pen.class_id = realClass;
        pen.email = realEmail;
      }

      // 4. Background auto-heal DB rows
      if (healUpdates.length > 0) {
        (async () => {
          try {
            for (const item of healUpdates) {
              await supabase
                .from('user_penalties')
                .update({
                  full_name: item.full_name,
                  class_id: item.class_id,
                  email: item.email,
                  updated_at: new Date().toISOString(),
                })
                .eq('mssv', item.mssv);
            }
          } catch (healErr) {
            console.error('Failed to background auto-heal user_penalties:', healErr);
          }
        })();
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: penaltyList,
  });
}
