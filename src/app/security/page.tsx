export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext, parseDemoCookie } from '@/lib/supabase/auth-helper';
import Header from '@/components/Header';
import SecurityDashboardClient from './SecurityDashboardClient';
import type { SessionUser, EventProposal } from '@/lib/types';
import styles from './page.module.css';

export default async function SecurityPage() {
  let auth = await getAuthContext();
  if (!auth) {
    try {
      const cookieStore = await cookies();
      const demoCookie = cookieStore.get('demo_session');
      if (demoCookie?.value) {
        const demoUser = parseDemoCookie(demoCookie.value);
        if (demoUser?.email) {
          auth = {
            email: demoUser.email,
            isSuperAdmin: demoUser.tier === 'super_admin',
            isEventAdmin: ['super_admin', 'youth_union', 'ctsv', 'facility', 'event_admin'].includes(demoUser.tier),
            isChecker: true,
            isSecurity: demoUser.tier === 'security' || demoUser.email.includes('baove'),
            tier: demoUser.tier || 'security',
          };
        }
      }
    } catch {}
  }

  if (!auth) {
    redirect('/login');
  }

  const isAuthorized =
    auth.isSuperAdmin ||
    auth.tier === 'security' ||
    auth.tier === 'facility' ||
    auth.tier === 'youth_union' ||
    auth.email.includes('baove') ||
    auth.email.includes('security');

  if (!isAuthorized) {
    console.log('--- SECURITY PAGE: NOT AUTHORIZED, REDIRECTING TO / ---');
    redirect('/');
  }

  const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());

  let dbProposals: any[] = [];
  try {
    const { data } = await supabase
      .from('event_proposals')
      .select('*')
      .eq('status', 'approved')
      .neq('room_name', 'Không mượn')
      .order('start_datetime', { ascending: true });
    if (data && data.length > 0) {
      dbProposals = data;
    }
  } catch (err) {
    console.warn('Could not fetch proposals from DB in security page:', err);
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

  const mockApprovedProposals: EventProposal[] = [
    {
      id: 'mock-prop-01',
      title: 'Tập Huấn Kỹ Năng Cán Bộ Đoàn - Hội Năm 2026',
      created_by: 'doanthanhnien@ptithcm.edu.vn',
      organization_unit: 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
      start_date: todayStr,
      start_time: '07:30',
      end_date: todayStr,
      end_time: '11:30',
      start_datetime: `${todayStr}T07:30:00.000Z`,
      end_datetime: `${todayStr}T11:30:00.000Z`,
      participant_count: 120,
      volunteer_count: 10,
      organizer_count: 10,
      total_count: 140,
      room_name: 'Hội trường 2A08',
      requires_ctsv_approval: true,
      requires_facility_approval: true,
      current_stage: 'approved',
      status: 'approved',
      key_status: 'pending',
      description: 'Chương trình tập huấn công tác phong trào & nghiệp vụ điểm danh sinh viên.',
      plan_url: 'https://drive.google.com/file/d/sample-kehoach-doan/view',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mock-prop-02',
      title: 'Workshop Lập Trình AI & Phát Triển Ứng Dụng Web',
      created_by: 'clb.itmc@student.ptithcm.edu.vn',
      organization_unit: 'CLB ITMC',
      start_date: todayStr,
      start_time: '13:30',
      end_date: todayStr,
      end_time: '17:00',
      start_datetime: `${todayStr}T13:30:00.000Z`,
      end_datetime: `${todayStr}T17:00:00.000Z`,
      participant_count: 85,
      volunteer_count: 5,
      organizer_count: 10,
      total_count: 100,
      room_name: 'Phòng Hội Thảo 2B12',
      requires_ctsv_approval: true,
      requires_facility_approval: true,
      current_stage: 'approved',
      status: 'approved',
      key_status: 'handed_over',
      key_handed_at: `${todayStr}T13:15:00.000Z`,
      key_handed_by: 'baove@ptithcm.edu.vn',
      description: 'Chia sẻ kiến thức AI thực chiến và các công cụ lập trình mới nhất.',
      plan_url: 'https://drive.google.com/file/d/sample-workshop-itmc/view',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mock-prop-03',
      title: 'Giải Bóng Đá Mini Chào Tân Sinh Viên Khóa 2026',
      created_by: 'clbbongda@student.ptithcm.edu.vn',
      organization_unit: 'CLB Bóng Đá PTIT',
      start_date: tomorrowStr,
      start_time: '08:00',
      end_date: tomorrowStr,
      end_time: '11:00',
      start_datetime: `${tomorrowStr}T08:00:00.000Z`,
      end_datetime: `${tomorrowStr}T11:00:00.000Z`,
      participant_count: 60,
      volunteer_count: 8,
      organizer_count: 6,
      total_count: 74,
      room_name: 'Sân Vận Động Đa Năng',
      requires_ctsv_approval: true,
      requires_facility_approval: true,
      current_stage: 'approved',
      status: 'approved',
      key_status: 'pending',
      description: 'Giải đấu giao lưu thể thao tân sinh viên các khoa.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const finalProposals = dbProposals.length > 0 ? dbProposals : mockApprovedProposals;

  const sessionUser: SessionUser = {
    mssv: 'TO-BAOVE',
    email: auth.email,
    full_name: 'Tổ Bảo Vệ (Quản Lý Chìa Khóa)',
    class_id: 'TO-BAO-VE',
    tier: auth.tier,
    isSuperAdmin: auth.isSuperAdmin,
    isSecurity: true,
    managed_events: [],
  };

  return (
    <div className={styles.container}>
      <Header
        showBack={auth.isSuperAdmin}
        backHref={auth.isSuperAdmin ? '/super-admin' : '/'}
        user={sessionUser}
        userName={sessionUser.full_name}
      />
      <main className={styles.main}>
        <SecurityDashboardClient
          initialProposals={finalProposals}
          currentUser={sessionUser}
        />
      </main>
    </div>
  );
}
