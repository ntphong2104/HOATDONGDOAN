'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  CalendarIcon,
  UsersIcon,
  BuildingIcon,
  ShieldCheckIcon,
  DownloadIcon,
  RefreshIcon,
  ClockIcon,
  CheckCircleIcon,
} from '@/components/icons';
import type { AcademicSemester } from '@/lib/types';
import styles from './AdminOverviewDashboard.module.css';

interface DashboardPayload {
  generated_at: string;
  today_vn: string;
  tomorrow_vn: string;
  semester: AcademicSemester;
  all_semesters: AcademicSemester[];
  action_center: {
    pending_proposals: {
      total: number;
      by_stage: { youth_union: number; ctsv: number; facility: number };
    };
    office_borrows: {
      pending: number;
      overdue: number;
    };
    delegates_gap: {
      classes_without_delegate: number;
      total_classes: number;
    };
    discipline: {
      blacklisted_students: number;
      banned_units: number;
    };
  };
  live_schedule: Array<{
    event_id: string;
    proposal_id: string | null;
    event_name: string;
    unit_name: string;
    event_date: string;
    is_today: boolean;
    time_range: string;
    room_name: string;
    key_status: 'not_needed' | 'pending' | 'handed_over' | 'returned';
    registered_count: number;
    checked_in_count: number;
  }>;
  kpis: {
    total_active_students: number;
    active_students_in_semester: number;
    student_coverage_rate: number;
    total_events_in_semester: number;
    open_events_count: number;
    closed_events_count: number;
    total_checkins_in_semester: number;
    role_breakdown: { participant: number; volunteer: number; organizer: number };
    total_registrations_in_semester: number;
    attended_from_registered: number;
    no_show_count: number;
    attendance_conversion_rate: number;
    avg_rating_stars: number | null;
    total_ratings_count: number;
    push_subscribers: { total: number; ios: number; android: number; desktop: number };
  };
  monthly_trend: Array<{
    key: string;
    label: string;
    events_count: number;
    checkins_count: number;
  }>;
  source_breakdown: {
    school: { events: number; checkins: number };
    lcd: { events: number; checkins: number };
    clb: { events: number; checkins: number };
  };
  lcd_health: Array<{
    lcd_code: string;
    lcd_name: string;
    lcd_short_name: string;
    lcd_color: string;
    total_students: number;
    active_students: number;
    coverage_rate: number;
    events_count: number;
    total_participations: number;
    classes_with_delegate: number;
    total_classes: number;
  }>;
  clb_health: {
    total_clubs: number;
    active_clubs_count: number;
    inactive_clubs: string[];
    top_clubs: Array<{ unit_name: string; events_count: number; total_participants: number }>;
    all_clubs: Array<{ unit_name: string; events_count: number; total_participants: number }>;
  };
  event_leaderboards: {
    top_attended: Array<{
      event_id: string;
      event_name: string;
      unit_name: string;
      event_date: string | null;
      checkins_count: number;
      registered_count: number;
    }>;
    top_rated: Array<{
      event_id: string;
      event_name: string;
      unit_name: string;
      avg_stars: number | null;
      reviews_count: number;
      checkins_count: number;
    }>;
    highest_noshow: Array<{
      event_id: string;
      event_name: string;
      unit_name: string;
      registered_count: number;
      checkins_count: number;
      noshow_count: number;
      noshow_rate: number;
    }>;
  };
}

interface AdminOverviewDashboardProps {
  onNavigateTab?: (
    tab: 'events' | 'proposals' | 'delegates' | 'blacklist' | 'settings' | 'ranking'
  ) => void;
}

type LeaderboardTab = 'attended' | 'rated' | 'noshow';

const CLIENT_FRESH_MS = 60_000;
const CLIENT_STALE_MS = 300_000;
const clientDashCache = new Map<string, { ts: number; data: DashboardPayload }>();

function fmtDateVN(d?: string | null): string {
  if (!d) return '—';
  const p = String(d).slice(0, 10).split('-');
  if (p.length !== 3) return d;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

export default function AdminOverviewDashboard({ onNavigateTab }: AdminOverviewDashboardProps) {
  const initialCached = clientDashCache.get('default')?.data || null;
  const [data, setData] = useState<DashboardPayload | null>(initialCached);
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>(
    initialCached?.semester?.id || ''
  );
  const [loading, setLoading] = useState(!initialCached);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [leaderTab, setLeaderTab] = useState<LeaderboardTab>('attended');
  const requestIdRef = useRef(0);

  const loadDashboard = useCallback(async (semesterId?: string, force = false) => {
    const reqId = ++requestIdRef.current;
    const cacheKey = semesterId || 'default';
    const cached = !force ? clientDashCache.get(cacheKey) : undefined;
    const now = Date.now();

    if (cached && now - cached.ts < CLIENT_FRESH_MS) {
      setData(cached.data);
      if (!semesterId && cached.data.semester?.id) {
        setSelectedSemesterId(cached.data.semester.id);
      }
      setLoading(false);
      return;
    }

    const hasStale = Boolean(cached && now - cached.ts < CLIENT_STALE_MS);
    if (hasStale && cached) {
      setData(cached.data);
      if (!semesterId && cached.data.semester?.id) {
        setSelectedSemesterId(cached.data.semester.id);
      }
      setLoading(false);
    } else if (!force) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setErrorMsg('');

    try {
      const params = new URLSearchParams();
      if (semesterId) params.set('semester_id', semesterId);
      if (force) params.set('refresh', '1');
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/admin/dashboard${qs}`, { cache: 'no-store' });
      const json = await res.json();
      if (reqId !== requestIdRef.current) return;
      if (json.success && json.data) {
        const d = json.data as DashboardPayload;
        const ts = Date.now();
        clientDashCache.set(cacheKey, { ts, data: d });
        if (d.semester?.id) {
          clientDashCache.set(d.semester.id, { ts, data: d });
        }
        setData(d);
        if (!semesterId && d.semester?.id) {
          setSelectedSemesterId(d.semester.id);
        }
      } else if (!hasStale) {
        setErrorMsg(json.error || 'Không thể tải dữ liệu tổng quan điều hành.');
      }
    } catch {
      if (reqId === requestIdRef.current && !hasStale) {
        setErrorMsg('Lỗi kết nối máy chủ khi tải Dashboard.');
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) await loadDashboard();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDashboard]);

  const maxMonthlyCheckins = useMemo(() => {
    if (!data?.monthly_trend?.length) return 1;
    return Math.max(1, ...data.monthly_trend.map((m) => m.checkins_count));
  }, [data]);

  const handleExportReport = async () => {
    if (!data) return;
    const { downloadStyledWorkbook } = await import('@/lib/utils/styled-excel');
    const sem = data.semester;
    const semSubtitle = `Học kỳ áp dụng: ${sem.name} (${fmtDateVN(sem.start_date)} – ${fmtDateVN(sem.end_date)})`;

    const totalPendingProposals = data.action_center.pending_proposals.total;
    const totalOfficeAlerts =
      data.action_center.office_borrows.pending + data.action_center.office_borrows.overdue;
    const totalDiscipline =
      data.action_center.discipline.blacklisted_students +
      data.action_center.discipline.banned_units;

    // Sheet 1: Tổng quan điều hành học kỳ (6 cột chuẩn hành chính)
    const overviewRows = [
      {
        stt: 1,
        group: 'Đoàn viên & Quy mô',
        metric: 'Tổng đoàn viên đang theo học',
        value: data.kpis.total_active_students,
        detail: 'Đã trừ các khóa đã tốt nghiệp và khóa đã xóa khỏi hệ thống',
        status: 'Ổn định',
      },
      {
        stt: 2,
        group: 'Đoàn viên & Quy mô',
        metric: 'Đoàn viên tham gia ít nhất 1 sự kiện',
        value: data.kpis.active_students_in_semester,
        detail: `Độ phủ toàn trường đạt ${data.kpis.student_coverage_rate}% quân số đang học`,
        status:
          data.kpis.student_coverage_rate >= 40
            ? 'Tốt'
            : data.kpis.student_coverage_rate >= 20
            ? 'Khá'
            : 'Cần đôn đốc',
      },
      {
        stt: 3,
        group: 'Tổ chức Sự kiện',
        metric: 'Tổng sự kiện tổ chức trong học kỳ',
        value: data.kpis.total_events_in_semester,
        detail: `${data.kpis.open_events_count} sự kiện đang mở  |  ${data.kpis.closed_events_count} sự kiện đã đóng`,
        status: 'Đang hoạt động',
      },
      {
        stt: 4,
        group: 'Minh chứng ĐRL',
        metric: 'Tổng lượt điểm danh hợp lệ',
        value: data.kpis.total_checkins_in_semester,
        detail: `Người tham gia: ${data.kpis.role_breakdown.participant}  |  CTV: ${data.kpis.role_breakdown.volunteer}  |  BTC: ${data.kpis.role_breakdown.organizer}`,
        status: 'Hợp lệ',
      },
      {
        stt: 5,
        group: 'Phễu tham dự',
        metric: 'Tỷ lệ có mặt thực tế so với đăng ký',
        value: `${data.kpis.attendance_conversion_rate}%`,
        detail: `${data.kpis.attended_from_registered}/${data.kpis.total_registrations_in_semester} lượt ĐK (Vắng mặt: ${data.kpis.no_show_count} lượt)`,
        status:
          data.kpis.attendance_conversion_rate >= 70
            ? 'Tốt'
            : data.kpis.attendance_conversion_rate >= 50
            ? 'Khá'
            : 'Cần chú ý',
      },
      {
        stt: 6,
        group: 'Chất lượng SK',
        metric: 'Điểm đánh giá chất lượng trung bình',
        value: data.kpis.avg_rating_stars ? `${data.kpis.avg_rating_stars} / 5.0 ★` : 'Chưa có',
        detail: `${data.kpis.total_ratings_count} lượt sinh viên gửi thẩm định & góp ý`,
        status: data.kpis.total_ratings_count > 0 ? 'Đạt' : 'Chưa đánh giá',
      },
      {
        stt: 7,
        group: 'Hạ tầng App PWA',
        metric: 'Thiết bị bật Thông báo đẩy',
        value: data.kpis.push_subscribers.total,
        detail: `iOS: ${data.kpis.push_subscribers.ios}  |  Android: ${data.kpis.push_subscribers.android}  |  Desktop Web: ${data.kpis.push_subscribers.desktop}`,
        status: 'Đang hoạt động',
      },
      {
        stt: 8,
        group: 'Cơ cấu Nguồn tổ chức',
        metric: 'Sự kiện cấp Đoàn Trường / Học viện',
        value: data.source_breakdown.school.events,
        detail: `Thu hút ${data.source_breakdown.school.checkins.toLocaleString('en-US')} lượt điểm danh`,
        status: 'Đạt',
      },
      {
        stt: 9,
        group: 'Cơ cấu Nguồn tổ chức',
        metric: 'Sự kiện khối 8 Liên Chi Đoàn (LCĐ)',
        value: data.source_breakdown.lcd.events,
        detail: `Thu hút ${data.source_breakdown.lcd.checkins.toLocaleString('en-US')} lượt điểm danh`,
        status: 'Đạt',
      },
      {
        stt: 10,
        group: 'Cơ cấu Nguồn tổ chức',
        metric: 'Sự kiện khối 16 CLB / Đội / Nhóm',
        value: data.source_breakdown.clb.events,
        detail: `Thu hút ${data.source_breakdown.clb.checkins.toLocaleString('en-US')} lượt điểm danh (${data.clb_health.active_clubs_count}/${data.clb_health.total_clubs} CLB hoạt động)`,
        status: data.clb_health.inactive_clubs.length > 0 ? 'Cần chú ý' : 'Tốt',
      },
      {
        stt: 11,
        group: 'Tồn đọng Điều hành',
        metric: 'Kế hoạch & Đề xuất chờ duyệt',
        value: totalPendingProposals,
        detail: `Đoàn TN: ${data.action_center.pending_proposals.by_stage.youth_union}  |  CTSV: ${data.action_center.pending_proposals.by_stage.ctsv}  |  TC-HC-QT: ${data.action_center.pending_proposals.by_stage.facility}`,
        status: totalPendingProposals > 0 ? 'Chờ Duyệt' : 'Hoàn thành',
      },
      {
        stt: 12,
        group: 'Tồn đọng Điều hành',
        metric: 'Mượn thiết bị Văn phòng Đoàn',
        value: totalOfficeAlerts,
        detail: `Đơn chờ duyệt: ${data.action_center.office_borrows.pending}  |  Đang quá hạn trả: ${data.action_center.office_borrows.overdue}`,
        status:
          data.action_center.office_borrows.overdue > 0
            ? 'Quá hạn'
            : data.action_center.office_borrows.pending > 0
            ? 'Chờ Duyệt'
            : 'Ổn định',
      },
      {
        stt: 13,
        group: 'Tồn đọng Điều hành',
        metric: 'Chi đoàn chưa có BCH phụ trách ĐRL',
        value: data.action_center.delegates_gap.classes_without_delegate,
        detail: `${data.action_center.delegates_gap.classes_without_delegate}/${data.action_center.delegates_gap.total_classes} chi đoàn đang hoạt động cần kiện toàn`,
        status:
          data.action_center.delegates_gap.classes_without_delegate > 0 ? 'Cần chú ý' : 'Hoàn thành',
      },
      {
        stt: 14,
        group: 'Tồn đọng Điều hành',
        metric: 'Kỷ luật & Danh sách đen',
        value: totalDiscipline,
        detail: `${data.action_center.discipline.blacklisted_students} sinh viên hạn chế  |  ${data.action_center.discipline.banned_units} đơn vị đang bị khóa mượn đồ`,
        status: totalDiscipline > 0 ? 'Vi phạm' : 'Ổn định',
      },
    ];

    // Sheet 2: Xu hướng theo tháng
    const monthRows = data.monthly_trend.map((m, idx) => ({
      stt: idx + 1,
      label: m.label,
      key: m.key,
      events_count: m.events_count,
      checkins_count: m.checkins_count,
      avg_per_event:
        m.events_count > 0 ? Number((m.checkins_count / m.events_count).toFixed(1)) : 0,
    }));
    const totalTrendEvents = monthRows.reduce((s, r) => s + r.events_count, 0);
    const totalTrendCheckins = monthRows.reduce((s, r) => s + r.checkins_count, 0);

    // Sheet 3: Sức khỏe 8 LCĐ
    const lcdRows = data.lcd_health.map((l, idx) => ({
      stt: idx + 1,
      lcd_name: l.lcd_name,
      active_students: l.active_students,
      total_students: l.total_students,
      coverage_rate: `${l.coverage_rate}%`,
      total_participations: l.total_participations,
      events_count: l.events_count,
      delegates_progress: `${l.classes_with_delegate}/${l.total_classes} lớp`,
      health_level:
        l.coverage_rate >= 40 ? 'Tốt' : l.coverage_rate >= 20 ? 'Khá' : 'Cần đôn đốc',
    }));
    const sumLcdActive = data.lcd_health.reduce((s, l) => s + l.active_students, 0);
    const sumLcdTotal = data.lcd_health.reduce((s, l) => s + l.total_students, 0);
    const sumLcdPart = data.lcd_health.reduce((s, l) => s + l.total_participations, 0);
    const sumLcdEvents = data.lcd_health.reduce((s, l) => s + l.events_count, 0);
    const sumLcdDelDone = data.lcd_health.reduce((s, l) => s + l.classes_with_delegate, 0);
    const sumLcdDelTotal = data.lcd_health.reduce((s, l) => s + l.total_classes, 0);
    const overallLcdCov =
      sumLcdTotal > 0 ? `${Number(((sumLcdActive / sumLcdTotal) * 100).toFixed(1))}%` : '0%';

    // Sheet 4: Hoạt động 16 CLB
    const clbRows = data.clb_health.all_clubs.map((c, idx) => ({
      rank: idx + 1,
      unit_name: c.unit_name,
      events_count: c.events_count,
      total_participants: c.total_participants,
      avg_per_event:
        c.events_count > 0 ? Number((c.total_participants / c.events_count).toFixed(1)) : 0,
      status: c.events_count > 0 ? 'Đang hoạt động' : 'Chưa có SK trong kỳ (Cần đôn đốc)',
    }));
    const sumClbEvents = data.clb_health.all_clubs.reduce((s, c) => s + c.events_count, 0);
    const sumClbParticipants = data.clb_health.all_clubs.reduce((s, c) => s + c.total_participants, 0);

    // Sheet 5: Sự kiện tiêu biểu
    const topEventRows = data.event_leaderboards.top_attended.map((e, idx) => ({
      rank: idx + 1,
      event_name: e.event_name,
      unit_name: e.unit_name,
      event_date: fmtDateVN(e.event_date),
      checkins_count: e.checkins_count,
      registered_count: e.registered_count,
      attendance_rate:
        e.registered_count > 0
          ? `${Math.min(100, Math.round((e.checkins_count / e.registered_count) * 100))}%`
          : '—',
    }));

    const safeSem = (sem.id || 'hoc-ky').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadStyledWorkbook({
      filename: `BaoCao_DieuHanh_Doan_${safeSem}.xlsx`,
      sheets: [
        {
          sheetName: 'TongQuan_HocKy',
          reportTitle: 'BÁO CÁO TỔNG QUAN ĐIỀU HÀNH HOẠT ĐỘNG ĐOÀN HỌC KỲ',
          reportSubtitle: semSubtitle,
          showSignatureBlock: true,
          columns: [
            { key: 'stt', label: 'STT', align: 'center', width: 7, numFmt: 'rawInt' },
            { key: 'group', label: 'Nhóm Nghiệp Vụ', align: 'left', width: 22, tone: 'bold' },
            { key: 'metric', label: 'Chỉ Tiêu Điều Hành', align: 'left', width: 34 },
            { key: 'value', label: 'Kết Quả', align: 'center', width: 16, tone: 'bold' },
            { key: 'detail', label: 'Diễn Giải Chi Tiết', align: 'left', width: 46 },
            { key: 'status', label: 'Đánh Giá / Trạng Thái', align: 'center', width: 20 },
          ],
          rows: overviewRows,
        },
        {
          sheetName: 'XuHuong_TheoThang',
          reportTitle: 'BIẾN ĐỘNG TỔ CHỨC SỰ KIỆN & LƯỢT THAM GIA THEO THÁNG',
          reportSubtitle: semSubtitle,
          columns: [
            { key: 'stt', label: 'STT', align: 'center', width: 8, numFmt: 'rawInt' },
            { key: 'label', label: 'Tháng', align: 'center', width: 18, tone: 'bold' },
            { key: 'key', label: 'Mã Tháng', align: 'center', width: 14, tone: 'code' },
            { key: 'events_count', label: 'Số Sự Kiện Tổ Chức', align: 'right', width: 22, numFmt: 'int' },
            { key: 'checkins_count', label: 'Tổng Lượt Điểm Danh', align: 'right', width: 24, numFmt: 'int' },
            { key: 'avg_per_event', label: 'TB Lượt / Sự Kiện', align: 'right', width: 20, numFmt: 'float' },
          ],
          rows: monthRows,
          summaryRow: {
            stt: '',
            label: 'TỔNG CỘNG',
            key: `${monthRows.length} tháng`,
            events_count: totalTrendEvents,
            checkins_count: totalTrendCheckins,
            avg_per_event:
              totalTrendEvents > 0 ? Number((totalTrendCheckins / totalTrendEvents).toFixed(1)) : 0,
          },
        },
        {
          sheetName: 'SucKhoe_8LCD',
          reportTitle: 'BẢNG ĐÁNH GIÁ SỨC KHỎE PHONG TRÀO 8 LIÊN CHI ĐOÀN',
          reportSubtitle: semSubtitle,
          showSignatureBlock: true,
          columns: [
            { key: 'stt', label: 'STT', align: 'center', width: 7, numFmt: 'rawInt' },
            { key: 'lcd_name', label: 'Liên Chi Đoàn', align: 'left', width: 32, tone: 'bold' },
            { key: 'active_students', label: 'ĐV Tham Gia', align: 'right', width: 15, numFmt: 'int' },
            { key: 'total_students', label: 'Tổng ĐV Đang Học', align: 'right', width: 18, numFmt: 'int' },
            { key: 'coverage_rate', label: 'Độ Phủ (%)', align: 'center', width: 14, tone: 'bold' },
            { key: 'total_participations', label: 'Tổng Lượt Tham Gia', align: 'right', width: 20, numFmt: 'int' },
            { key: 'events_count', label: 'SK Tổ Chức', align: 'right', width: 14, numFmt: 'int' },
            { key: 'delegates_progress', label: 'Chi Đoàn Có BCH', align: 'center', width: 18 },
            { key: 'health_level', label: 'Mức Độ', align: 'center', width: 16 },
          ],
          rows: lcdRows,
          summaryRow: {
            stt: '',
            lcd_name: 'TỔNG TOÀN TRƯỜNG (8 LCĐ)',
            active_students: sumLcdActive,
            total_students: sumLcdTotal,
            coverage_rate: overallLcdCov,
            total_participations: sumLcdPart,
            events_count: sumLcdEvents,
            delegates_progress: `${sumLcdDelDone}/${sumLcdDelTotal} lớp`,
            health_level: '',
          },
        },
        {
          sheetName: 'HoatDong_16CLB',
          reportTitle: 'TÌNH HÌNH HOẠT ĐỘNG 16 CÂU LẠC BỘ / ĐỘI / NHÓM TRỰC THUỘC',
          reportSubtitle: `${semSubtitle}  •  Đang hoạt động: ${data.clb_health.active_clubs_count}/${data.clb_health.total_clubs} đơn vị`,
          columns: [
            { key: 'rank', label: 'Hạng', align: 'center', width: 9, numFmt: 'rawInt' },
            { key: 'unit_name', label: 'Tên CLB / Đội / Nhóm', align: 'left', width: 36, tone: 'bold' },
            { key: 'events_count', label: 'Số Sự Kiện', align: 'right', width: 15, numFmt: 'int' },
            { key: 'total_participants', label: 'Tổng Lượt Tham Gia', align: 'right', width: 21, numFmt: 'int' },
            { key: 'avg_per_event', label: 'TB Lượt / SK', align: 'right', width: 16, numFmt: 'float' },
            { key: 'status', label: 'Trạng Thái Hoạt Động', align: 'center', width: 34 },
          ],
          rows: clbRows,
          summaryRow: {
            rank: '',
            unit_name: `TỔNG CỘNG (${clbRows.length} CLB/Đội/Nhóm)`,
            events_count: sumClbEvents,
            total_participants: sumClbParticipants,
            avg_per_event:
              sumClbEvents > 0 ? Number((sumClbParticipants / sumClbEvents).toFixed(1)) : 0,
            status: `Chưa có SK: ${data.clb_health.inactive_clubs.length} CLB`,
          },
        },
        {
          sheetName: 'Top_SuKien',
          reportTitle: 'DANH SÁCH SỰ KIỆN TIÊU BIỂU CÓ QUY MÔ THAM GIA LỚN NHẤT',
          reportSubtitle: semSubtitle,
          columns: [
            { key: 'rank', label: 'Hạng', align: 'center', width: 9, numFmt: 'rawInt' },
            { key: 'event_name', label: 'Tên Sự Kiện / Chương Trình', align: 'left', width: 42, tone: 'bold' },
            { key: 'unit_name', label: 'Đơn Vị Tổ Chức', align: 'left', width: 28 },
            { key: 'event_date', label: 'Ngày Tổ Chức', align: 'center', width: 15 },
            { key: 'checkins_count', label: 'Lượt Điểm Danh', align: 'right', width: 17, numFmt: 'int' },
            { key: 'registered_count', label: 'Lượt Đăng Ký', align: 'right', width: 16, numFmt: 'int' },
            { key: 'attendance_rate', label: 'Tỷ Lệ Có Mặt', align: 'center', width: 16 },
          ],
          rows: topEventRows,
        },
      ],
    });
  };

  const renderKeyStatus = (status: 'not_needed' | 'pending' | 'handed_over' | 'returned') => {
    if (status === 'not_needed') {
      return (
        <span className={styles.statusPill} style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
          Không mượn phòng
        </span>
      );
    }
    if (status === 'handed_over') {
      return (
        <span className={styles.statusPill} style={{ background: 'var(--tint-amber-strong)', color: 'var(--status-amber-text)' }}>
          Đang nhận khóa
        </span>
      );
    }
    if (status === 'returned') {
      return (
        <span className={styles.statusPill} style={{ background: 'var(--tint-green-strong)', color: 'var(--status-green-text)' }}>
          Đã trả khóa
        </span>
      );
    }
    return (
      <span className={styles.statusPill} style={{ background: 'var(--tint-blue-bg)', color: 'var(--text-brand)' }}>
        Chờ nhận khóa
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className={styles.loadingState}>
        Đang tổng hợp số liệu điều hành toàn Học viện...
      </div>
    );
  }

  if (errorMsg && !data) {
    return <div className={styles.loadingState}>{errorMsg}</div>;
  }

  if (!data) return null;

  const ac = data.action_center;
  const kpis = data.kpis;
  const totalSourceCheckins = Math.max(
    1,
    data.source_breakdown.school.checkins +
      data.source_breakdown.lcd.checkins +
      data.source_breakdown.clb.checkins
  );

  return (
    <div className={styles.wrapper}>
      {/* ── TẦNG 0: THANH ĐIỀU KHIỂN HỌC KỲ & XUẤT BÁO CÁO ── */}
      <section className={styles.controlBar}>
        <div className={styles.controlTitleGroup}>
          <span className={styles.eyebrow}>Trung tâm Điều hành Đoàn Học viện</span>
          <h2 className={styles.heading}>Tổng Quan Hoạt Động &amp; Phong Trào Sinh Viên</h2>
          <span className={styles.subHeading}>
            {data.semester.name} ({fmtDateVN(data.semester.start_date)} – {fmtDateVN(data.semester.end_date)})
          </span>
        </div>

        <div className={styles.controlActions}>
          <select
            className={styles.semesterSelect}
            value={selectedSemesterId || data.semester.id}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedSemesterId(nextId);
              loadDashboard(nextId, false);
            }}
            aria-label="Chọn học kỳ xem báo cáo"
          >
            {data.all_semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.is_active ? '(Đang mở)' : ''}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={styles.btnSecondary}
            disabled={refreshing}
            onClick={() => loadDashboard(selectedSemesterId || data.semester.id, true)}
          >
            <RefreshIcon size={14} />
            <span>{refreshing ? 'Đang tải...' : 'Làm mới'}</span>
          </button>

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleExportReport}
          >
            <DownloadIcon size={14} />
            <span>Xuất Báo Cáo Học Kỳ (.xlsx)</span>
          </button>
        </div>
      </section>

      {/* ── TẦNG 1: VIỆC CẦN XỬ LÝ NGAY (ACTION CARDS) ── */}
      <section className={styles.actionGrid}>
        <button
          type="button"
          onClick={() => onNavigateTab?.('proposals')}
          className={`${styles.actionCard} ${ac.pending_proposals.total > 0 ? styles.actionCardUrgent : ''}`}
        >
          <div className={styles.actionTop}>
            <span className={styles.actionLabel}>Kế hoạch chờ duyệt</span>
            <span className={ac.pending_proposals.total > 0 ? styles.actionBadgeRed : styles.actionBadgeNeutral}>
              {ac.pending_proposals.total > 0 ? 'Cần xử lý' : 'Đã sạch'}
            </span>
          </div>
          <div className={styles.actionValue}>{ac.pending_proposals.total}</div>
          <div className={styles.actionMeta}>
            Đoàn: {ac.pending_proposals.by_stage.youth_union} · CTSV: {ac.pending_proposals.by_stage.ctsv} · TC-HC-QT: {ac.pending_proposals.by_stage.facility}
          </div>
        </button>

        <Link
          href="/office/admin"
          className={`${styles.actionCard} ${
            ac.office_borrows.pending > 0 || ac.office_borrows.overdue > 0 ? styles.actionCardUrgent : ''
          }`}
        >
          <div className={styles.actionTop}>
            <span className={styles.actionLabel}>Mượn dụng cụ VPĐ</span>
            <span
              className={
                ac.office_borrows.pending > 0 || ac.office_borrows.overdue > 0
                  ? styles.actionBadgeRed
                  : styles.actionBadgeNeutral
              }
            >
              {ac.office_borrows.overdue > 0
                ? `${ac.office_borrows.overdue} trễ hạn`
                : ac.office_borrows.pending > 0
                ? 'Chờ duyệt'
                : 'Ổn định'}
            </span>
          </div>
          <div className={styles.actionValue}>{ac.office_borrows.pending}</div>
          <div className={styles.actionMeta}>
            Đơn chờ duyệt · {ac.office_borrows.overdue} đơn đang mượn quá hạn trả
          </div>
        </Link>

        <button
          type="button"
          onClick={() => onNavigateTab?.('delegates')}
          className={`${styles.actionCard} ${
            ac.delegates_gap.classes_without_delegate > 0 ? styles.actionCardWarn : ''
          }`}
        >
          <div className={styles.actionTop}>
            <span className={styles.actionLabel}>Chi đoàn thiếu BCH</span>
            <span
              className={
                ac.delegates_gap.classes_without_delegate > 0
                  ? styles.actionBadgeWarn
                  : styles.actionBadgeNeutral
              }
            >
              {ac.delegates_gap.total_classes > 0
                ? `${ac.delegates_gap.total_classes - ac.delegates_gap.classes_without_delegate}/${ac.delegates_gap.total_classes} lớp`
                : 'Đủ BCH'}
            </span>
          </div>
          <div className={styles.actionValue}>{ac.delegates_gap.classes_without_delegate}</div>
          <div className={styles.actionMeta}>
            Lớp đang học chưa được gán quyền BCH tra cứu ĐRL
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab?.('blacklist')}
          className={styles.actionCard}
        >
          <div className={styles.actionTop}>
            <span className={styles.actionLabel}>Kỷ luật &amp; Cấm mượn</span>
            <span
              className={
                ac.discipline.blacklisted_students > 0 || ac.discipline.banned_units > 0
                  ? styles.actionBadgeWarn
                  : styles.actionBadgeNeutral
              }
            >
              Giám sát
            </span>
          </div>
          <div className={styles.actionValue}>{ac.discipline.blacklisted_students}</div>
          <div className={styles.actionMeta}>
            SV bị khóa đăng ký · {ac.discipline.banned_units} đơn vị đang bị cấm mượn VPĐ
          </div>
        </button>
      </section>

      {/* ── LỊCH TRỰC CHIẾN HÔM NAY & NGÀY MAI ── */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>
            <ClockIcon size={16} color="var(--text-brand)" />
            <span>Lịch Hoạt Động Hôm Nay &amp; Ngày Mai ({data.live_schedule.length})</span>
          </h3>
          <span className={styles.cardHint}>
            Hôm nay {fmtDateVN(data.today_vn)} · Ngày mai {fmtDateVN(data.tomorrow_vn)}
          </span>
        </div>

        {data.live_schedule.length === 0 ? (
          <div className={styles.emptyText}>
            Không có sự kiện nào diễn ra trong hôm nay và ngày mai.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Chương trình &amp; Đơn vị</th>
                  <th>Phòng tổ chức</th>
                  <th>Chìa khóa Bảo vệ</th>
                  <th style={{ textAlign: 'right' }}>Tiến độ Điểm danh</th>
                </tr>
              </thead>
              <tbody>
                {data.live_schedule.map((ev) => (
                  <tr key={ev.event_id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span
                        className={styles.statusPill}
                        style={{
                          background: ev.is_today ? 'var(--tint-blue-strong)' : 'var(--bg-muted)',
                          color: ev.is_today ? 'var(--text-brand)' : 'var(--text-secondary)',
                          marginRight: 6,
                        }}
                      >
                        {ev.is_today ? 'Hôm nay' : 'Ngày mai'}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '0.78rem' }}>{ev.time_range}</span>
                    </td>
                    <td>
                      <Link href={`/admin/events/${ev.event_id}`} className={styles.eventLink}>
                        {ev.event_name}
                      </Link>
                      <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{ev.unit_name}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{ev.room_name}</td>
                    <td>{renderKeyStatus(ev.key_status)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800 }}>
                      <span style={{ color: 'var(--status-green-text)' }}>
                        {ev.checked_in_count.toLocaleString('vi-VN')}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                        {' '}
                        / {ev.registered_count.toLocaleString('vi-VN')} ĐK
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── TẦNG 2: 6 CHỈ SỐ CỐT LÕI HỌC KỲ (KPI STRIP) ── */}
      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Độ phủ Đoàn viên</span>
          <span className={styles.kpiValue} style={{ color: 'var(--text-brand)' }}>
            {kpis.student_coverage_rate}%
          </span>
          <span className={styles.kpiSub}>
            {kpis.active_students_in_semester.toLocaleString('vi-VN')} /{' '}
            {kpis.total_active_students.toLocaleString('vi-VN')} SV đang học
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Sự kiện trong kỳ</span>
          <span className={styles.kpiValue}>
            {kpis.total_events_in_semester.toLocaleString('vi-VN')}
          </span>
          <span className={styles.kpiSub}>
            {kpis.open_events_count} đang mở · {kpis.closed_events_count} đã đóng
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Lượt điểm danh</span>
          <span className={styles.kpiValue} style={{ color: 'var(--status-green-text)' }}>
            {kpis.total_checkins_in_semester.toLocaleString('vi-VN')}
          </span>
          <span className={styles.kpiSub}>
            SV: {kpis.role_breakdown.participant.toLocaleString('vi-VN')} · CTV:{' '}
            {kpis.role_breakdown.volunteer} · BTC: {kpis.role_breakdown.organizer}
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Tỷ lệ đi thực tế</span>
          <span className={styles.kpiValue}>
            {kpis.total_registrations_in_semester > 0 ? `${kpis.attendance_conversion_rate}%` : '—'}
          </span>
          <span className={styles.kpiSub}>
            {kpis.attended_from_registered.toLocaleString('vi-VN')} /{' '}
            {kpis.total_registrations_in_semester.toLocaleString('vi-VN')} lượt đăng ký
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Chất lượng sự kiện</span>
          <span className={styles.kpiValue}>
            {kpis.avg_rating_stars !== null ? `${kpis.avg_rating_stars} / 5.0` : 'Chưa chấm'}
          </span>
          <span className={styles.kpiSub}>
            {kpis.total_ratings_count} lượt đánh giá thẩm định
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Thiết bị bật App Push</span>
          <span className={styles.kpiValue}>
            {kpis.push_subscribers.total.toLocaleString('vi-VN')}
          </span>
          <span className={styles.kpiSub}>
            iOS: {kpis.push_subscribers.ios} · Android: {kpis.push_subscribers.android} · Web:{' '}
            {kpis.push_subscribers.desktop}
          </span>
        </div>
      </section>

      {/* ── TẦNG 3: BIỂU ĐỒ XU HƯỚNG THEO THÁNG & CƠ CẤU PHONG TRÀO ── */}
      <section className={styles.chartsRow}>
        {/* Cột trái: Biểu đồ cột kép theo tháng */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <CalendarIcon size={16} color="var(--text-brand)" />
              <span>Nhịp Độ Phong Trào Theo Tháng Trong Học Kỳ</span>
            </h3>
            <span className={styles.cardHint}>Cột xanh: Lượt tham gia · Nhãn trên: Số sự kiện</span>
          </div>

          {data.monthly_trend.length === 0 ? (
            <div className={styles.emptyText}>Chưa có dữ liệu tháng cho học kỳ này.</div>
          ) : (
            <div className={styles.chartWrap}>
              <div className={styles.barChartGrid}>
                {data.monthly_trend.map((m) => {
                  const pct = Math.max(
                    m.checkins_count > 0 ? 6 : 0,
                    Math.round((m.checkins_count / maxMonthlyCheckins) * 100)
                  );
                  return (
                    <div key={m.key} className={styles.barCol}>
                      <span className={styles.barEventPill}>{m.events_count} SK</span>
                      <span className={styles.barTopStat}>
                        {m.checkins_count.toLocaleString('vi-VN')}
                      </span>
                      <div className={styles.barTrack}>
                        <div className={styles.barFill} style={{ width: '100%', height: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={styles.barMonthLabels}>
                {data.monthly_trend.map((m) => (
                  <div key={m.key}>{m.label}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cột phải: Cơ cấu nguồn tổ chức & Phễu chuyên cần */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <BuildingIcon size={16} color="var(--text-brand)" />
              <span>Cơ Cấu Nguồn Tổ Chức &amp; Chuyên Cần</span>
            </h3>
          </div>

          <div className={styles.stackList}>
            {[
              {
                label: 'Cấp Học viện / Đoàn trường',
                events: data.source_breakdown.school.events,
                checkins: data.source_breakdown.school.checkins,
                color: 'var(--text-brand)',
              },
              {
                label: 'Khối 8 Liên Chi Đoàn',
                events: data.source_breakdown.lcd.events,
                checkins: data.source_breakdown.lcd.checkins,
                color: '#0f766e',
              },
              {
                label: 'Khối 16 CLB / Đội / Nhóm',
                events: data.source_breakdown.clb.events,
                checkins: data.source_breakdown.clb.checkins,
                color: 'var(--status-purple-text)',
              },
            ].map((src) => {
              const pct = Math.round((src.checkins / totalSourceCheckins) * 100);
              return (
                <div key={src.label} className={styles.stackRow}>
                  <div className={styles.stackRowTop}>
                    <span>{src.label}</span>
                    <span>
                      {src.checkins.toLocaleString('vi-VN')} lượt ({pct}%)
                    </span>
                  </div>
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${pct}%`, background: src.color }}
                    />
                  </div>
                  <span className={styles.stackRowMeta}>{src.events} sự kiện đã tổ chức</span>
                </div>
              );
            })}
          </div>

          <div className={styles.divider} />

          <div className={styles.stackList}>
            <div className={styles.stackRowTop}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Phễu Chuyên Cần (Đăng ký trước)
              </span>
              <span style={{ fontSize: '0.76rem', color: 'var(--status-green-text)' }}>
                Đi thực tế: {kpis.attendance_conversion_rate}%
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem', textAlign: 'center' }}>
              <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '0.45rem 0.35rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {kpis.total_registrations_in_semester.toLocaleString('vi-VN')}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Tổng ĐK</div>
              </div>
              <div style={{ background: 'var(--tint-green-bg)', border: '1px solid var(--tint-green-border)', borderRadius: 8, padding: '0.45rem 0.35rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--status-green-text)' }}>
                  {kpis.attended_from_registered.toLocaleString('vi-VN')}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--status-green-text)', fontWeight: 600 }}>Có mặt</div>
              </div>
              <div style={{ background: 'var(--tint-red-bg)', border: '1px solid var(--tint-red-border)', borderRadius: 8, padding: '0.45rem 0.35rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--status-red-text)' }}>
                  {kpis.no_show_count.toLocaleString('vi-VN')}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--status-red-text)', fontWeight: 600 }}>Vắng mặt</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TẦNG 4: SỨC KHỎE 8 LCĐ / 16 CLB & SỰ KIỆN TIÊU BIỂU ── */}
      <section className={styles.twoColGrid}>
        {/* Cột trái: 8 LCĐ + Cảnh báo CLB 0 SK */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <ShieldCheckIcon size={16} color="var(--text-brand)" />
              <span>Sức Khỏe 8 Liên Chi Đoàn &amp; 16 CLB</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab?.('ranking')}
              className={styles.pillTab}
            >
              Xem BXH đầy đủ →
            </button>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Liên Chi Đoàn</th>
                  <th>Độ phủ SV</th>
                  <th style={{ textAlign: 'right' }}>SK</th>
                  <th style={{ textAlign: 'right' }}>BCH Lớp</th>
                </tr>
              </thead>
              <tbody>
                {data.lcd_health.map((lcd) => {
                  const fullDelegates =
                    lcd.total_classes > 0 && lcd.classes_with_delegate >= lcd.total_classes;
                  return (
                    <tr key={lcd.lcd_code}>
                      <td>
                        <strong style={{ color: lcd.lcd_color }}>{lcd.lcd_short_name}</strong>
                        <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                          {lcd.active_students.toLocaleString('vi-VN')}/
                          {lcd.total_students.toLocaleString('vi-VN')} SV
                        </div>
                      </td>
                      <td style={{ minWidth: 105 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.78rem', marginBottom: 3 }}>
                          {lcd.coverage_rate}%
                        </div>
                        <div className={styles.progressTrack}>
                          <div
                            className={styles.progressFill}
                            style={{
                              width: `${Math.min(100, lcd.coverage_rate)}%`,
                              background: lcd.lcd_color || '#1d4ed8',
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{lcd.events_count}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span
                          className={styles.statusPill}
                          style={{
                            background: fullDelegates ? 'var(--tint-green-strong)' : 'var(--tint-amber-strong)',
                            color: fullDelegates ? 'var(--status-green-text)' : 'var(--status-amber-text)',
                          }}
                        >
                          {lcd.classes_with_delegate}/{lcd.total_classes}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data.clb_health.inactive_clubs.length > 0 ? (
            <div className={styles.inactiveClubBox}>
              <div className={styles.inactiveClubTitle}>
                CLB / Đội / Nhóm chưa có sự kiện trong kỳ ({data.clb_health.inactive_clubs.length}/
                {data.clb_health.total_clubs} đơn vị):
              </div>
              <div className={styles.clubChips}>
                {data.clb_health.inactive_clubs.map((name) => (
                  <span key={name} className={styles.clubChip}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                marginTop: '0.8rem',
                padding: '0.6rem 0.85rem',
                borderRadius: 8,
                background: 'var(--tint-green-bg)',
                border: '1px solid var(--tint-green-border)',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--status-green-text)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <CheckCircleIcon size={15} color="var(--status-green-text)" />
              <span>Toàn bộ {data.clb_health.total_clubs}/16 CLB đều đã có hoạt động trong kỳ!</span>
            </div>
          )}
        </div>

        {/* Cột phải: Sự kiện tiêu biểu (3 tab) */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <UsersIcon size={16} color="var(--text-brand)" />
              <span>Phân Tích Sự Kiện Trong Kỳ</span>
            </h3>

            <div className={styles.pillTabs}>
              <button
                type="button"
                className={`${styles.pillTab} ${leaderTab === 'attended' ? styles.pillTabActive : ''}`}
                onClick={() => setLeaderTab('attended')}
              >
                Đông nhất
              </button>
              <button
                type="button"
                className={`${styles.pillTab} ${leaderTab === 'rated' ? styles.pillTabActive : ''}`}
                onClick={() => setLeaderTab('rated')}
              >
                Đánh giá cao
              </button>
              <button
                type="button"
                className={`${styles.pillTab} ${leaderTab === 'noshow' ? styles.pillTabActive : ''}`}
                onClick={() => setLeaderTab('noshow')}
              >
                Tỷ lệ vắng cao
              </button>
            </div>
          </div>

          {leaderTab === 'attended' && (
            data.event_leaderboards.top_attended.length === 0 ? (
              <div className={styles.emptyText}>Chưa có sự kiện nào trong học kỳ này.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Sự kiện &amp; Đơn vị</th>
                      <th style={{ textAlign: 'right' }}>Ngày</th>
                      <th style={{ textAlign: 'right' }}>Điểm danh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.event_leaderboards.top_attended.map((ev) => (
                      <tr key={ev.event_id}>
                        <td>
                          <Link href={`/admin/events/${ev.event_id}`} className={styles.eventLink}>
                            {ev.event_name}
                          </Link>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ev.unit_name}</div>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                          {fmtDateVN(ev.event_date)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--status-green-text)', whiteSpace: 'nowrap' }}>
                          {ev.checkins_count.toLocaleString('vi-VN')} SV
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {leaderTab === 'rated' && (
            data.event_leaderboards.top_rated.length === 0 ? (
              <div className={styles.emptyText}>Chưa có lượt đánh giá sao nào trong học kỳ này.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Sự kiện &amp; Đơn vị</th>
                      <th style={{ textAlign: 'right' }}>Điểm sao</th>
                      <th style={{ textAlign: 'right' }}>Quy mô</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.event_leaderboards.top_rated.map((ev) => (
                      <tr key={ev.event_id}>
                        <td>
                          <Link href={`/admin/events/${ev.event_id}`} className={styles.eventLink}>
                            {ev.event_name}
                          </Link>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ev.unit_name}</div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--status-amber-text)', whiteSpace: 'nowrap' }}>
                          {ev.avg_stars} / 5.0 ({ev.reviews_count})
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {ev.checkins_count.toLocaleString('vi-VN')} SV
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {leaderTab === 'noshow' && (
            data.event_leaderboards.highest_noshow.length === 0 ? (
              <div className={styles.emptyText}>
                Chưa ghi nhận sự kiện nào (≥10 ĐK) có tỷ lệ vắng mặt đáng kể.
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Sự kiện &amp; Đơn vị</th>
                      <th style={{ textAlign: 'right' }}>Vắng / ĐK</th>
                      <th style={{ textAlign: 'right' }}>Tỷ lệ vắng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.event_leaderboards.highest_noshow.map((ev) => (
                      <tr key={ev.event_id}>
                        <td>
                          <Link href={`/admin/events/${ev.event_id}`} className={styles.eventLink}>
                            {ev.event_name}
                          </Link>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ev.unit_name}</div>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {ev.noshow_count}/{ev.registered_count}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span
                            className={styles.statusPill}
                            style={{ background: 'var(--tint-red-bg)', color: 'var(--status-red-text)' }}
                          >
                            {ev.noshow_rate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}
