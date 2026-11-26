'use client';

import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import RankingBoard from '@/components/RankingBoard';
import { fetchMeCached } from '@/lib/client/me-cache';
import { normalizeLcdCode, resolveStudentLcd } from '@/lib/utils/lcd';
import type { SessionUser } from '@/lib/types';

export default function RankingPage() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { json } = await fetchMeCached();
        if (active && json?.success && json?.data) {
          setUser(json.data as SessionUser);
        }
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, []);

  const highlightLcd = user
    ? normalizeLcdCode(user.email) ||
      resolveStudentLcd(user.class_id, user.mssv)?.code ||
      null
    : null;

  const canExport = Boolean(
    user?.isSuperAdmin ||
      user?.tier === 'super_admin' ||
      user?.tier === 'youth_union' ||
      user?.tier === 'event_admin' ||
      user?.isEventAdmin
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Header user={user} title="BẢNG XẾP HẠNG SỰ KIỆN" />
      <main
        style={{
          maxWidth: 1360,
          margin: '0 auto',
          padding: '1.25rem 1.5rem 3rem',
        }}
      >
        <RankingBoard highlightLcdCode={highlightLcd} canExport={canExport} />
      </main>
    </div>
  );
}
