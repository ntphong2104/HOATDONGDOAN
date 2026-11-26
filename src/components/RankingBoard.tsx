'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  BadgeMedalIcon,
  BuildingIcon,
  UsersIcon,
  CalendarIcon,
  DownloadIcon,
  SearchIcon,
  SettingsIcon,
  RefreshIcon,
  YouthUnionIcon,
} from '@/components/icons';
import { LCD_DEFINITIONS } from '@/lib/utils/lcd';
import type {
  RankingResponseData,
  RankingScopeKey,
  RankingScopeDataset,
} from '@/lib/types';
import styles from './RankingBoard.module.css';

interface RankingBoardProps {
  highlightLcdCode?: string | null;
  canExport?: boolean;
  allowSemesterSelect?: boolean;
  onManageSemestersClick?: () => void;
}

type BoardTab = 'lcd' | 'units' | 'students';

const CLIENT_RANKING_FRESH_MS = 180_000; // 3 phút fresh ngay tại trình duyệt
const CLIENT_RANKING_STALE_MS = 900_000; // 15 phút hiện tức thì + làm mới ngầm
const clientRankingCache = new Map<string, { ts: number; data: RankingResponseData }>();

function formatDateVN(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function normalizeText(str: string): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export default function RankingBoard({
  highlightLcdCode,
  canExport = false,
  allowSemesterSelect,
  onManageSemestersClick,
}: RankingBoardProps) {
  const initialCached = clientRankingCache.get('default')?.data || null;
  const [data, setData] = useState<RankingResponseData | null>(initialCached);
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>(
    initialCached?.semester?.id || ''
  );
  const [loading, setLoading] = useState(!initialCached);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeScope, setActiveScope] = useState<RankingScopeKey>('all');
  const [activeTab, setActiveTab] = useState<BoardTab>('lcd');

  // Student tab filters
  const [studentSearch, setStudentSearch] = useState('');
  const [studentLcdFilter, setStudentLcdFilter] = useState('ALL');
  const requestIdRef = useRef(0);

  const fetchRanking = useCallback(async (semesterId?: string, forceRefresh = false) => {
    const reqId = ++requestIdRef.current;
    const cacheKey = semesterId || 'default';
    const cached = !forceRefresh ? clientRankingCache.get(cacheKey) : undefined;
    const now = Date.now();

    if (cached && now - cached.ts < CLIENT_RANKING_FRESH_MS) {
      setData(cached.data);
      if (!semesterId && cached.data.semester?.id) {
        setSelectedSemesterId(cached.data.semester.id);
      }
      setLoading(false);
      return;
    }

    const hasStale = Boolean(cached && now - cached.ts < CLIENT_RANKING_STALE_MS);
    if (hasStale && cached) {
      setData(cached.data);
      if (!semesterId && cached.data.semester?.id) {
        setSelectedSemesterId(cached.data.semester.id);
      }
      setLoading(false);
    } else {
      setLoading(true);
    }
    setErrorMsg('');

    try {
      const params = new URLSearchParams();
      if (semesterId) params.set('semester_id', semesterId);
      if (forceRefresh) params.set('refresh', '1');
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/ranking${qs}`, { cache: 'no-store' });
      const json = await res.json();
      if (reqId !== requestIdRef.current) return;
      if (json.success && json.data) {
        const d = json.data as RankingResponseData;
        const ts = Date.now();
        clientRankingCache.set(cacheKey, { ts, data: d });
        if (d.semester?.id) {
          clientRankingCache.set(d.semester.id, { ts, data: d });
        }
        setData(d);
        if (!semesterId && d.semester?.id) {
          setSelectedSemesterId(d.semester.id);
        }
      } else if (!hasStale) {
        setErrorMsg(json.error || 'Không thể tải dữ liệu bảng xếp hạng');
      }
    } catch {
      if (reqId === requestIdRef.current && !hasStale) {
        setErrorMsg('Lỗi kết nối máy chủ khi tải bảng xếp hạng.');
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) await fetchRanking();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchRanking]);

  const handleSemesterChange = (newId: string) => {
    setSelectedSemesterId(newId);
    fetchRanking(newId);
  };

  // Fallback dataset in case cached data predates `scopes`
  const fallbackAllScope: RankingScopeDataset | null = useMemo(() => {
    if (!data) return null;
    if (data.scopes?.all) return data.scopes.all;
    return {
      scope: 'all',
      total_events: data.total_events_in_semester,
      total_participations: data.total_participations_in_semester,
      total_students_participated: data.total_students_participated,
      lcd_rankings: data.lcd_rankings,
      top_students: data.top_students,
      my_rank: data.my_rank ?? null,
    };
  }, [data]);

  const activeScopeData: RankingScopeDataset | null = useMemo(() => {
    if (!data) return null;
    if (data.scopes && data.scopes[activeScope]) {
      return data.scopes[activeScope];
    }
    return fallbackAllScope;
  }, [data, activeScope, fallbackAllScope]);

  const schoolLcdMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data?.scopes?.school?.lcd_rankings || []) {
      map.set(item.lcd_code, item.total_participations);
    }
    return map;
  }, [data]);

  const otherLcdMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data?.scopes?.other?.lcd_rankings || []) {
      map.set(item.lcd_code, item.total_participations);
    }
    return map;
  }, [data]);

  const schoolEvents = useMemo(() => data?.school_events || [], [data]);

  const maxLcdParticipations = useMemo(() => {
    if (!activeScopeData?.lcd_rankings?.length) return 1;
    return Math.max(1, ...activeScopeData.lcd_rankings.map((x) => x.total_participations));
  }, [activeScopeData]);

  const maxUnitParticipants = useMemo(() => {
    if (!data?.unit_rankings?.length) return 1;
    return Math.max(1, ...data.unit_rankings.map((x) => x.total_participants));
  }, [data]);

  const maxSchoolEventParticipants = useMemo(() => {
    if (!schoolEvents.length) return 1;
    return Math.max(1, ...schoolEvents.map((x) => x.total_participants));
  }, [schoolEvents]);

  const filteredStudents = useMemo(() => {
    if (!activeScopeData?.top_students) return [];
    const q = normalizeText(studentSearch);
    return activeScopeData.top_students.filter((st) => {
      if (studentLcdFilter !== 'ALL' && st.lcd_code !== studentLcdFilter) return false;
      if (q) {
        const hay = normalizeText(`${st.mssv} ${st.full_name} ${st.class_id} ${st.lcd_name || ''}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activeScopeData, studentSearch, studentLcdFilter]);

  const handleExportExcel = async () => {
    if (!data || !fallbackAllScope) return;
    const { downloadStyledWorkbook } = await import('@/lib/utils/styled-excel');
    const semName = data.semester?.name || 'Học kỳ hiện tại';
    const semRange =
      data.semester?.start_date && data.semester?.end_date
        ? ` (${formatDateVN(data.semester.start_date)} – ${formatDateVN(data.semester.end_date)})`
        : '';
    const semSubtitle = `Học kỳ: ${semName}${semRange}`;

    const allDataset = data.scopes?.all || fallbackAllScope;
    const schoolDataset = data.scopes?.school;
    const otherDataset = data.scopes?.other;

    const buildLcdSheet = (
      dataset: RankingScopeDataset,
      sheetName: string,
      reportTitle: string,
      includeScopeSplit = false
    ) => {
      const rows = dataset.lcd_rankings.map((r) => {
        const weightRate =
          r.participation_weight_rate !== undefined
            ? r.participation_weight_rate
            : r.total_students > 0
            ? Math.round((r.total_participations / r.total_students) * 1000) / 10
            : 0;
        return {
          rank: r.rank,
          lcd_code: r.lcd_code,
          lcd_name: r.lcd_name,
          ...(includeScopeSplit
            ? {
                school_participations: schoolLcdMap.get(r.lcd_code) || 0,
                other_participations: otherLcdMap.get(r.lcd_code) || 0,
              }
            : {}),
          total_participations: r.total_participations,
          active_students_count: r.active_students_count,
          total_students: r.total_students,
          participation_rate: `${r.participation_rate}%`,
          participation_weight_rate: `${weightRate}%`,
          events_organized_count: r.events_organized_count,
        };
      });

      const sumPart = dataset.lcd_rankings.reduce((s, r) => s + r.total_participations, 0);
      const sumSchool = dataset.lcd_rankings.reduce(
        (s, r) => s + (schoolLcdMap.get(r.lcd_code) || 0),
        0
      );
      const sumOther = dataset.lcd_rankings.reduce(
        (s, r) => s + (otherLcdMap.get(r.lcd_code) || 0),
        0
      );
      const sumActive = dataset.lcd_rankings.reduce((s, r) => s + r.active_students_count, 0);
      const sumTotal = dataset.lcd_rankings.reduce((s, r) => s + r.total_students, 0);
      const sumEvents = dataset.lcd_rankings.reduce((s, r) => s + r.events_organized_count, 0);
      const totalRate =
        sumTotal > 0 ? `${Number(((sumActive / sumTotal) * 100).toFixed(1))}%` : '0%';
      const totalWeightRate =
        sumTotal > 0 ? `${Number(((sumPart / sumTotal) * 100).toFixed(1))}%` : '0%';

      const columns: any[] = [
        { key: 'rank', label: 'Hạng', align: 'center', width: 9, numFmt: 'rawInt' },
        { key: 'lcd_code', label: 'Mã LCĐ', align: 'center', width: 13, tone: 'code' },
        { key: 'lcd_name', label: 'Liên Chi Đoàn', align: 'left', width: 32, tone: 'bold' },
      ];
      if (includeScopeSplit) {
        columns.push(
          { key: 'school_participations', label: 'Lượt Đoàn Trường', align: 'right', width: 19, numFmt: 'int' },
          { key: 'other_participations', label: 'Lượt Cơ Sở (LCĐ/CLB)', align: 'right', width: 21, numFmt: 'int' }
        );
      }
      columns.push(
        { key: 'total_participations', label: 'Tổng Lượt Tham Gia', align: 'right', width: 20, numFmt: 'int' },
        { key: 'active_students_count', label: 'ĐV Tham Gia (Duy Nhất)', align: 'right', width: 23, numFmt: 'int' },
        { key: 'total_students', label: 'Tổng Đoàn Viên', align: 'right', width: 17, numFmt: 'int' },
        { key: 'participation_rate', label: 'Tỷ Lệ Phủ (%)', align: 'center', width: 17, tone: 'bold' },
        { key: 'participation_weight_rate', label: 'Tỷ Trọng / Tổng SV (%)', align: 'center', width: 22, tone: 'bold' }
      );
      if (dataset.scope !== 'school') {
        columns.push({
          key: 'events_organized_count',
          label: 'SK Đã Tổ Chức',
          align: 'right',
          width: 17,
          numFmt: 'int',
        });
      }

      return {
        sheetName,
        reportTitle,
        reportSubtitle: semSubtitle,
        showSignatureBlock: true,
        columns,
        rows,
        summaryRow: {
          rank: '',
          lcd_code: 'TOÀN TRƯỜNG',
          lcd_name: 'TỔNG CỘNG 8 LIÊN CHI ĐOÀN',
          ...(includeScopeSplit
            ? {
                school_participations: sumSchool,
                other_participations: sumOther,
              }
            : {}),
          total_participations: sumPart,
          active_students_count: sumActive,
          total_students: sumTotal,
          participation_rate: totalRate,
          participation_weight_rate: totalWeightRate,
          events_organized_count: sumEvents,
        },
      };
    };

    const unitSheetRows = data.unit_rankings.map((u) => ({
      rank: u.rank,
      unit_name: u.unit_name,
      events_count: u.events_count,
      total_participants: u.total_participants,
      unique_participants: u.unique_participants,
      avg_participants_per_event: u.avg_participants_per_event,
    }));
    const sumUnitEvents = data.unit_rankings.reduce((s, u) => s + u.events_count, 0);
    const sumUnitParticipants = data.unit_rankings.reduce((s, u) => s + u.total_participants, 0);

    const schoolEventRows = schoolEvents.map((ev) => ({
      rank: ev.rank,
      event_name: ev.event_name,
      campaign_type:
        ev.campaign_kind === 'support' ? 'Đợt phát động / Hỗ trợ' : 'Sự kiện Đoàn Trường',
      unit_name: ev.unit_name,
      event_date: formatDateVN(ev.event_date),
      total_participants: ev.total_participants,
    }));

    const studentSheetRows = (activeScopeData || allDataset).top_students.map((s) => ({
      rank: s.rank,
      mssv: s.mssv,
      full_name: s.full_name,
      class_id: s.class_id,
      lcd_name: s.lcd_name || 'Chưa xác định',
      participations_count: s.participations_count,
    }));

    const sheets: any[] = [
      buildLcdSheet(
        allDataset,
        '1_TongHop_8LCD',
        'BẢNG TỔNG HỢP XẾP HẠNG THI ĐUA 8 LIÊN CHI ĐOÀN (TOÀN TRƯỜNG)',
        Boolean(schoolDataset && otherDataset)
      ),
    ];

    if (schoolDataset) {
      sheets.push(
        buildLcdSheet(
          schoolDataset,
          '2_DoanTruong_8LCD',
          'BẢNG THI ĐUA HƯỞNG ỨNG HOẠT ĐỘNG ĐOÀN TRƯỜNG & PHÁT ĐỘNG (8 LCĐ)',
          false
        ),
        {
          sheetName: '3_DS_HD_DoanTruong',
          reportTitle: 'DANH SÁCH CÁC HOẠT ĐỘNG ĐOÀN TRƯỜNG & PHÁT ĐỘNG TRONG KỲ',
          reportSubtitle: semSubtitle,
          columns: [
            { key: 'rank', label: 'STT', align: 'center', width: 8, numFmt: 'rawInt' },
            { key: 'event_name', label: 'Tên Hoạt Động / Sự Kiện', align: 'left', width: 44, tone: 'bold' },
            { key: 'campaign_type', label: 'Phân Loại', align: 'center', width: 24 },
            { key: 'unit_name', label: 'Đơn Vị Phát Động', align: 'left', width: 30 },
            { key: 'event_date', label: 'Ngày Tổ Chức', align: 'center', width: 16 },
            { key: 'total_participants', label: 'Lượt ĐV Tham Gia', align: 'right', width: 20, numFmt: 'int' },
          ],
          rows: schoolEventRows,
          summaryRow: {
            rank: '',
            event_name: `TỔNG CỘNG (${schoolEventRows.length} hoạt động cấp Trường)`,
            campaign_type: '',
            unit_name: '',
            event_date: '',
            total_participants: schoolEventRows.reduce((s, r) => s + r.total_participants, 0),
          },
        }
      );
    }

    if (otherDataset) {
      sheets.push(
        buildLcdSheet(
          otherDataset,
          '4_CoSo_8LCD',
          'BẢNG THI ĐUA PHONG TRÀO CƠ SỞ — LCĐ / CLB / KHOA (8 LCĐ)',
          false
        )
      );
    }

    sheets.push(
      {
        sheetName: '5_XepHang_16CLB',
        reportTitle: 'BẢNG XẾP HẠNG HOẠT ĐỘNG CLB / ĐỘI / NHÓM TRỰC THUỘC',
        reportSubtitle: semSubtitle,
        columns: [
          { key: 'rank', label: 'Hạng', align: 'center', width: 9, numFmt: 'rawInt' },
          { key: 'unit_name', label: 'CLB / Đội / Nhóm', align: 'left', width: 38, tone: 'bold' },
          { key: 'events_count', label: 'Số SK Tổ Chức', align: 'right', width: 17, numFmt: 'int' },
          { key: 'total_participants', label: 'Tổng Lượt Tham Gia', align: 'right', width: 22, numFmt: 'int' },
          { key: 'unique_participants', label: 'SV Tham Gia Duy Nhất', align: 'right', width: 22, numFmt: 'int' },
          { key: 'avg_participants_per_event', label: 'TB Lượt / Sự Kiện', align: 'right', width: 20, numFmt: 'float' },
        ],
        rows: unitSheetRows,
        summaryRow: {
          rank: '',
          unit_name: `TỔNG CỘNG (${unitSheetRows.length} CLB/Đội/Nhóm)`,
          events_count: sumUnitEvents,
          total_participants: sumUnitParticipants,
          unique_participants: '—',
          avg_participants_per_event:
            sumUnitEvents > 0 ? Number((sumUnitParticipants / sumUnitEvents).toFixed(1)) : 0,
        },
      },
      {
        sheetName: '6_Top_DoanVien',
        reportTitle: 'DANH SÁCH ĐOÀN VIÊN TIÊU BIỂU TÍCH CỰC NHẤT HỌC KỲ',
        reportSubtitle: semSubtitle,
        columns: [
          { key: 'rank', label: 'Hạng', align: 'center', width: 9, numFmt: 'rawInt' },
          { key: 'mssv', label: 'MSSV', align: 'center', width: 15, tone: 'code' },
          { key: 'full_name', label: 'Họ Và Tên', align: 'left', width: 28, tone: 'bold' },
          { key: 'class_id', label: 'Chi Đoàn / Lớp', align: 'center', width: 18 },
          { key: 'lcd_name', label: 'Liên Chi Đoàn', align: 'left', width: 30 },
          { key: 'participations_count', label: 'Số Sự Kiện Tham Gia', align: 'right', width: 21, numFmt: 'int' },
        ],
        rows: studentSheetRows,
      }
    );

    const safeSem = (data.semester?.id || 'hoc-ky').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadStyledWorkbook({
      filename: `BangXepHang_ThiDuaDoan_${safeSem}.xlsx`,
      sheets,
    });
  };

  const renderRankBadge = (rank: number) => {
    if (rank === 1) {
      return <span className={`${styles.rankPill} ${styles.rankGold}`}>🥇 Hạng 1</span>;
    }
    if (rank === 2) {
      return <span className={`${styles.rankPill} ${styles.rankSilver}`}>🥈 Hạng 2</span>;
    }
    if (rank === 3) {
      return <span className={`${styles.rankPill} ${styles.rankBronze}`}>🥉 Hạng 3</span>;
    }
    return <span className={`${styles.rankPill} ${styles.rankNormal}`}>#{rank}</span>;
  };

  const topLcd = activeScopeData?.lcd_rankings?.[0];
  const top3Lcds = (activeScopeData?.lcd_rankings || []).slice(0, 3);
  const canSwitchSemester =
    allowSemesterSelect !== undefined
      ? allowSemesterSelect
      : Boolean(data?.can_select_semester);

  const allCount = data?.scopes?.all?.total_events ?? data?.total_events_in_semester ?? 0;
  const schoolCount = data?.scopes?.school?.total_events ?? 0;
  const otherCount = data?.scopes?.other?.total_events ?? Math.max(0, allCount - schoolCount);
  const supportCount = data?.scopes?.school?.support_events_count ?? 0;
  const officialSchoolCount = data?.scopes?.school?.official_school_events_count ?? 0;

  return (
    <div className={styles.wrapper}>
      {/* Hero & Semester Selector */}
      <section className={styles.heroCard}>
        <div className={styles.heroInfo}>
          <span className={styles.heroEyebrow}>
            <BadgeMedalIcon size={14} color="#fde047" />
            <span>Thi đua &amp; Tổng hợp theo Học kỳ</span>
          </span>
          <h1 className={styles.heroTitle}>Bảng Xếp Hạng &amp; Xét Thi Đua Sự Kiện</h1>
          <p className={styles.heroDesc}>
            {data?.semester ? (
              <>
                Thống kê thi đua 8 Liên Chi Đoàn, hoạt động phát động Đoàn Trường, CLB/Đội/Nhóm và đoàn viên trong{' '}
                <strong>{data.semester.name}</strong> (từ{' '}
                <strong>{formatDateVN(data.semester.start_date)}</strong> đến{' '}
                <strong>{formatDateVN(data.semester.end_date)}</strong>).
              </>
            ) : (
              'Tổng hợp xếp hạng Liên Chi Đoàn, hoạt động phát động Đoàn Trường, đơn vị cơ sở và đoàn viên tích cực.'
            )}
          </p>
        </div>

        <div className={styles.heroControls}>
          {canSwitchSemester ? (
            <div className={styles.semesterSelectWrap}>
              <label htmlFor="ranking-semester-select" className={styles.semesterSelectLabel}>
                Chọn Học Kỳ Thống Kê
              </label>
              <select
                id="ranking-semester-select"
                value={selectedSemesterId || data?.semester?.id || ''}
                onChange={(e) => handleSemesterChange(e.target.value)}
                className={styles.semesterSelect}
                disabled={loading && !data}
              >
                {(data?.all_semesters || []).map((sem) => (
                  <option key={sem.id} value={sem.id}>
                    {sem.name} {sem.is_active ? '(Hiện tại)' : ''} — {formatDateVN(sem.start_date)} → {formatDateVN(sem.end_date)}
                  </option>
                ))}
              </select>
            </div>
          ) : data?.semester ? (
            <div className={styles.semesterSelectWrap}>
              <span className={styles.semesterSelectLabel}>Học Kỳ Hiện Tại</span>
              <div className={styles.semesterStaticBadge}>
                <CalendarIcon size={14} color="var(--text-brand)" />
                <span>
                  {data.semester.name} ({formatDateVN(data.semester.start_date)} → {formatDateVN(data.semester.end_date)})
                </span>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className={styles.heroActionBtn}
            onClick={() => fetchRanking(canSwitchSemester ? selectedSemesterId || undefined : undefined, true)}
            title="Làm mới bảng xếp hạng"
          >
            <RefreshIcon size={15} />
            <span>Làm mới</span>
          </button>

          {onManageSemestersClick && (
            <button
              type="button"
              className={styles.heroActionBtn}
              onClick={onManageSemestersClick}
            >
              <SettingsIcon size={15} />
              <span>Gán thời gian Học kỳ</span>
            </button>
          )}

          {canExport && data && (
            <button
              type="button"
              className={`${styles.heroActionBtn} ${styles.heroActionBtnGreen}`}
              onClick={handleExportExcel}
            >
              <DownloadIcon size={15} />
              <span>Xuất Excel</span>
            </button>
          )}
        </div>
      </section>

      {errorMsg && <div className={styles.emptyState}>{errorMsg}</div>}

      {loading && !data ? (
        <div className={styles.loadingBox}>Đang tổng hợp dữ liệu bảng xếp hạng học kỳ...</div>
      ) : data && activeScopeData ? (
        <>
          {/* ── 3-Scope Emulation Filter Bar (Tổng hợp | Đoàn Trường & Phát động | Hoạt động Cơ sở) ── */}
          <nav className={styles.scopeBar} aria-label="Phạm vi xét thi đua">
            <button
              type="button"
              onClick={() => setActiveScope('all')}
              className={`${styles.scopeTabBtn} ${activeScope === 'all' ? styles.scopeTabBtnActive : ''}`}
            >
              <div className={styles.scopeTabTop}>
                <span className={styles.scopeTabTitle}>
                  <BadgeMedalIcon size={16} />
                  <span>Tổng hợp Toàn trường</span>
                </span>
                <span className={styles.scopeCountPill}>{allCount} SK</span>
              </div>
              <span className={styles.scopeTabDesc}>
                Gộp toàn bộ hoạt động Đoàn Trường &amp; phong trào cơ sở trong kỳ
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveScope('school')}
              className={`${styles.scopeTabBtn} ${activeScope === 'school' ? styles.scopeTabBtnActive : ''}`}
            >
              <div className={styles.scopeTabTop}>
                <span className={styles.scopeTabTitle}>
                  <YouthUnionIcon size={16} />
                  <span>Đoàn Trường &amp; Phát động</span>
                </span>
                <span className={styles.scopeCountPill}>{schoolCount} SK</span>
              </div>
              <span className={styles.scopeTabDesc}>
                Hoạt động phát động/hỗ trợ ({supportCount}) &amp; sự kiện từ TK Đoàn Trường ({officialSchoolCount})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveScope('other')}
              className={`${styles.scopeTabBtn} ${activeScope === 'other' ? styles.scopeTabBtnActive : ''}`}
            >
              <div className={styles.scopeTabTop}>
                <span className={styles.scopeTabTitle}>
                  <BuildingIcon size={16} />
                  <span>Hoạt động Cơ sở (Còn lại)</span>
                </span>
                <span className={styles.scopeCountPill}>{otherCount} SK</span>
              </div>
              <span className={styles.scopeTabDesc}>
                Sự kiện tự chủ của 8 Liên Chi Đoàn, 16 CLB/Đội/Nhóm &amp; các Khoa
              </span>
            </button>
          </nav>

          {/* Summary KPI Row */}
          <section className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>
                {activeScope === 'school'
                  ? 'HĐ Đoàn Trường & Phát động'
                  : activeScope === 'other'
                  ? 'Sự kiện Cơ sở trong kỳ'
                  : 'Tổng sự kiện trong kỳ'}
              </span>
              <span className={styles.kpiValue} style={{ color: 'var(--text-brand)' }}>
                {activeScopeData.total_events.toLocaleString('vi-VN')}
              </span>
              <span className={styles.kpiSub}>
                {activeScope === 'school'
                  ? `${supportCount} đợt phát động/hỗ trợ · ${officialSchoolCount} SK chính thức`
                  : activeScope === 'other'
                  ? 'Do 8 LCĐ, 16 CLB/Đội/Nhóm & Khoa tổ chức'
                  : `${schoolCount} Đoàn Trường · ${otherCount} Cơ sở`}
              </span>
            </div>

            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>
                {activeScope === 'school' ? 'Tổng lượt hưởng ứng' : 'Tổng lượt tham gia'}
              </span>
              <span className={styles.kpiValue} style={{ color: 'var(--status-green-text)' }}>
                {activeScopeData.total_participations.toLocaleString('vi-VN')}
              </span>
              <span className={styles.kpiSub}>
                {activeScope === 'school'
                  ? 'Lượt ĐV tham gia HĐ Đoàn Trường'
                  : activeScope === 'other'
                  ? 'Lượt ĐV tham gia HĐ cơ sở'
                  : 'Lượt điểm danh hợp lệ toàn trường'}
              </span>
            </div>

            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Đoàn viên tham gia</span>
              <span className={styles.kpiValue} style={{ color: 'var(--status-purple-text)' }}>
                {activeScopeData.total_students_participated.toLocaleString('vi-VN')}
              </span>
              <span className={styles.kpiSub}>
                {activeScope === 'school'
                  ? 'SV hưởng ứng ít nhất 1 HĐ Trường'
                  : 'Sinh viên tham gia ít nhất 1 SK'}
              </span>
            </div>

            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>
                {activeScope === 'school' ? 'LCĐ hưởng ứng dẫn đầu' : 'LCĐ dẫn đầu kỳ này'}
              </span>
              <span
                className={styles.kpiValue}
                style={{ fontSize: '1.12rem', color: topLcd?.lcd_color || 'var(--status-amber-text)' }}
              >
                {topLcd && topLcd.total_participations > 0 ? topLcd.lcd_short_name : 'Chưa có dữ liệu'}
              </span>
              <span className={styles.kpiSub}>
                {topLcd && topLcd.total_participations > 0
                  ? `${topLcd.total_participations.toLocaleString('vi-VN')} lượt (${topLcd.participation_rate}% ĐV khoa)`
                  : 'Chưa ghi nhận lượt check-in trong phạm vi này'}
              </span>
            </div>
          </section>

          {/* Top 3 LCĐ Podium when viewing LCĐ tab */}
          {activeTab === 'lcd' && top3Lcds.some((x) => x.total_participations > 0) && (
            <section className={styles.podiumGrid}>
              {top3Lcds.map((item) => (
                <div
                  key={item.lcd_code}
                  className={`${styles.podiumCard} ${
                    item.rank === 1
                      ? styles.podiumFirst
                      : item.rank === 2
                      ? styles.podiumSecond
                      : styles.podiumThird
                  }`}
                >
                  <div className={styles.podiumTop}>
                    {renderRankBadge(item.rank)}
                    <span className={styles.podiumMeta}>{item.participation_rate}% ĐV khoa</span>
                  </div>
                  <div className={styles.podiumName} style={{ color: item.lcd_color }}>
                    {item.lcd_name}
                  </div>
                  <div className={styles.podiumStats}>
                    <div>
                      <span className={styles.podiumBigNum}>
                        {item.total_participations.toLocaleString('vi-VN')}
                      </span>{' '}
                      <span className={styles.podiumMeta}>
                        {activeScope === 'school' ? 'lượt hưởng ứng' : 'lượt tham gia'}
                      </span>
                    </div>
                    <span className={styles.podiumMeta}>
                      {item.active_students_count.toLocaleString('vi-VN')} / {item.total_students.toLocaleString('vi-VN')} SV
                    </span>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Main Ranking Tabs & Table */}
          <section className={styles.boardCard}>
            <div className={styles.tabsHeader}>
              <div className={styles.tabGroup}>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${activeTab === 'lcd' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('lcd')}
                >
                  <BuildingIcon size={15} />
                  <span>
                    {activeScope === 'school'
                      ? '8 LCĐ hưởng ứng Đoàn Trường'
                      : activeScope === 'other'
                      ? 'Xếp hạng 8 LCĐ (Phong trào cơ sở)'
                      : 'Xếp hạng 8 Liên Chi Đoàn'}
                  </span>
                </button>

                <button
                  type="button"
                  className={`${styles.tabBtn} ${activeTab === 'units' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('units')}
                >
                  <CalendarIcon size={15} />
                  <span>
                    {activeScope === 'school'
                      ? `Danh sách HĐ Đoàn Trường & Phát động (${schoolEvents.length})`
                      : `Xếp hạng CLB / Đội / Nhóm (${data.unit_rankings.length})`}
                  </span>
                </button>

                <button
                  type="button"
                  className={`${styles.tabBtn} ${activeTab === 'students' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('students')}
                >
                  <UsersIcon size={15} />
                  <span>
                    {activeScope === 'school'
                      ? `Top SV hưởng ứng Đoàn Trường (${activeScopeData.top_students.length})`
                      : `Top Sinh viên tích cực (${activeScopeData.top_students.length})`}
                  </span>
                </button>
              </div>
            </div>

            {/* TAB 1: Xếp hạng 8 Liên Chi Đoàn */}
            {activeTab === 'lcd' && (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Hạng</th>
                      <th style={{ minWidth: 230 }}>Liên Chi Đoàn</th>
                      <th style={{ width: 260 }}>
                        {activeScope === 'school' ? 'Lượt hưởng ứng HĐ Trường' : 'Tổng lượt tham gia'}
                      </th>
                      <th className={styles.cellNowrap}>Đoàn viên tham gia</th>
                      <th className={styles.cellCenter}>Tỷ lệ phủ (%)</th>
                      <th
                        className={`${styles.cellCenter} ${styles.cellNowrap}`}
                        title="Tổng lượt tham gia chia cho Tổng số sinh viên của Liên Chi Đoàn"
                      >
                        Tỷ trọng / Tổng SV
                      </th>
                      <th className={styles.cellRight}>
                        {activeScope === 'school' ? 'Tỷ trọng hưởng ứng' : 'SK đã tổ chức'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeScopeData.lcd_rankings.map((item) => {
                      const pctWidth = Math.min(
                        100,
                        Math.round((item.total_participations / maxLcdParticipations) * 100)
                      );
                      const isMine = highlightLcdCode && highlightLcdCode === item.lcd_code;
                      const schoolSharePct =
                        activeScopeData.total_participations > 0
                          ? Math.round((item.total_participations / activeScopeData.total_participations) * 1000) / 10
                          : 0;
                      const weightOnLcdStudentsPct =
                        item.participation_weight_rate !== undefined
                          ? item.participation_weight_rate
                          : item.total_students > 0
                          ? Math.round((item.total_participations / item.total_students) * 1000) / 10
                          : 0;
                      const avgPerLcdStudent =
                        item.avg_participations_per_student !== undefined
                          ? item.avg_participations_per_student
                          : item.total_students > 0
                          ? Math.round((item.total_participations / item.total_students) * 100) / 100
                          : 0;
                      const splitSchool = schoolLcdMap.get(item.lcd_code) || 0;
                      const splitOther = otherLcdMap.get(item.lcd_code) || 0;

                      return (
                        <tr
                          key={item.lcd_code}
                          className={isMine ? styles.rowHighlight : undefined}
                        >
                          <td className={styles.cellNowrap}>{renderRankBadge(item.rank)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <strong style={{ color: item.lcd_color }}>{item.lcd_name}</strong>
                              {isMine && (
                                <span
                                  className={styles.lcdBadge}
                                  style={{ background: 'var(--tint-blue-strong)', color: 'var(--text-brand)' }}
                                >
                                  LCĐ của bạn
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                              {item.total_participations.toLocaleString('vi-VN')} lượt
                            </div>
                            {activeScope === 'all' && data.scopes && (
                              <div className={styles.splitSubMeta}>
                                Đoàn Trường: {splitSchool.toLocaleString('vi-VN')} · Cơ sở: {splitOther.toLocaleString('vi-VN')}
                              </div>
                            )}
                            <div className={styles.barTrack}>
                              <div
                                className={styles.barFill}
                                style={{
                                  width: `${pctWidth}%`,
                                  background: item.lcd_color || '#2563eb',
                                }}
                              />
                            </div>
                          </td>
                          <td className={styles.cellNowrap}>
                            <strong>{item.active_students_count.toLocaleString('vi-VN')}</strong>
                            <span style={{ color: 'var(--text-muted)' }}>
                              {' '}
                              / {item.total_students.toLocaleString('vi-VN')} SV
                            </span>
                          </td>
                          <td className={styles.cellCenter}>
                            <span
                              className={`${styles.lcdBadge} ${styles.rateBadge}`}
                              style={{
                                background: item.participation_rate >= 30 ? 'var(--tint-green-strong)' : 'var(--bg-muted)',
                                color: item.participation_rate >= 30 ? 'var(--status-green-text)' : 'var(--text-secondary)',
                              }}
                            >
                              {item.participation_rate}%
                            </span>
                          </td>
                          <td className={`${styles.cellCenter} ${styles.cellNowrap}`}>
                            <span
                              className={`${styles.lcdBadge} ${styles.rateBadge}`}
                              style={{
                                background: weightOnLcdStudentsPct >= 50 ? 'var(--tint-blue-strong)' : 'var(--bg-muted)',
                                color: weightOnLcdStudentsPct >= 50 ? 'var(--text-brand)' : 'var(--text-secondary)',
                              }}
                              title={`${item.total_participations.toLocaleString('vi-VN')} lượt / ${item.total_students.toLocaleString('vi-VN')} SV của ${item.lcd_short_name}`}
                            >
                              {weightOnLcdStudentsPct.toLocaleString('vi-VN')}%
                            </span>
                            <div className={styles.splitSubMeta}>
                              {avgPerLcdStudent.toLocaleString('vi-VN')} lượt/SV
                            </div>
                          </td>
                          <td className={`${styles.cellRight} ${styles.cellNowrap}`} style={{ fontWeight: 700, color: 'var(--text-body)' }}>
                            {activeScope === 'school' ? `${schoolSharePct}% toàn trường` : `${item.events_organized_count} SK`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 2A: Khi đang xem phân hệ Đoàn Trường -> Hiển thị Danh sách Hoạt động Đoàn Trường & Phát động */}
            {activeTab === 'units' && activeScope === 'school' && (
              schoolEvents.length === 0 ? (
                <div className={styles.emptyState}>
                  Chưa có hoạt động phát động hoặc sự kiện Đoàn Trường nào trong <strong>{data.semester.name}</strong>.
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>Hạng</th>
                        <th style={{ minWidth: 260 }}>Tên Hoạt Động / Đợt Phát Động</th>
                        <th style={{ width: 180 }}>Phân loại</th>
                        <th className={styles.cellNowrap}>Ngày tổ chức</th>
                        <th style={{ width: 230 }}>Lượt đoàn viên tham gia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schoolEvents.map((ev) => {
                        const pctWidth = Math.min(
                          100,
                          Math.round((ev.total_participants / maxSchoolEventParticipants) * 100)
                        );
                        return (
                          <tr key={ev.event_id}>
                            <td className={styles.cellNowrap}>{renderRankBadge(ev.rank)}</td>
                            <td>
                              <div style={{ fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                                {ev.event_name}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.18rem' }}>
                                {ev.unit_name}
                              </div>
                            </td>
                            <td className={styles.cellNowrap}>
                              {ev.campaign_kind === 'support' ? (
                                <span className={styles.campaignBadgeSupport}>Đợt phát động / Hỗ trợ</span>
                              ) : (
                                <span className={styles.campaignBadgeOfficial}>Sự kiện Đoàn Trường</span>
                              )}
                            </td>
                            <td className={styles.cellNowrap} style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {formatDateVN(ev.event_date)}
                            </td>
                            <td>
                              <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                                {ev.total_participants.toLocaleString('vi-VN')} lượt
                              </div>
                              <div className={styles.barTrack}>
                                <div
                                  className={styles.barFill}
                                  style={{
                                    width: `${pctWidth}%`,
                                    background: ev.campaign_kind === 'support' ? '#0d9488' : '#2563eb',
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* TAB 2B: Xếp hạng CLB / Đội / Nhóm (ở tab Tổng hợp & Cơ sở) */}
            {activeTab === 'units' && activeScope !== 'school' && (
              data.unit_rankings.length === 0 ? (
                <div className={styles.emptyState}>
                  Chưa có sự kiện nào của CLB / Đội / Nhóm trong <strong>{data.semester.name}</strong>.
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ width: 120 }}>Hạng</th>
                        <th style={{ minWidth: 230 }}>CLB / Đội / Nhóm</th>
                        <th style={{ width: 250 }}>Tổng lượt người tham gia</th>
                        <th className={styles.cellRight}>Số sự kiện</th>
                        <th className={styles.cellRight}>TB lượt / SK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.unit_rankings.map((unit) => {
                        const pctWidth = Math.min(
                          100,
                          Math.round((unit.total_participants / maxUnitParticipants) * 100)
                        );
                        return (
                          <tr key={unit.unit_name}>
                            <td className={styles.cellNowrap}>{renderRankBadge(unit.rank)}</td>
                            <td>
                              <strong style={{ color: unit.lcd_color || 'var(--status-purple-text)' }}>
                                {unit.unit_name}
                              </strong>
                            </td>
                            <td>
                              <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                                {unit.total_participants.toLocaleString('vi-VN')} lượt
                              </div>
                              <div className={styles.barTrack}>
                                <div
                                  className={styles.barFill}
                                  style={{
                                    width: `${pctWidth}%`,
                                    background: unit.lcd_color || '#7c3aed',
                                  }}
                                />
                              </div>
                            </td>
                            <td className={`${styles.cellRight} ${styles.cellNowrap}`} style={{ fontWeight: 700 }}>{unit.events_count} SK</td>
                            <td className={`${styles.cellRight} ${styles.cellNowrap}`} style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                              {unit.avg_participants_per_event.toLocaleString('vi-VN')} lượt/SK
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* TAB 3: Top Sinh viên tích cực */}
            {activeTab === 'students' && (
              <>
                {activeScopeData.my_rank && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      padding: '0.85rem 1.05rem',
                      borderRadius: 12,
                      background: 'var(--tint-blue-bg)',
                      border: '1px solid var(--tint-blue-border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {activeScopeData.my_rank.rank > 0 ? (
                        renderRankBadge(activeScopeData.my_rank.rank)
                      ) : (
                        <span className={`${styles.rankPill} ${styles.rankNormal}`}>Chưa xếp hạng</span>
                      )}
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          Vị trí của bạn: {activeScopeData.my_rank.full_name} ({activeScopeData.my_rank.mssv})
                        </div>
                        <div style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', marginTop: '0.12rem' }}>
                          {activeScopeData.my_rank.rank > 0 ? (
                            <>
                              Đang xếp hạng <strong>#{activeScopeData.my_rank.rank}</strong> /{' '}
                              {activeScopeData.my_rank.total_ranked_students.toLocaleString('vi-VN')} sinh viên tham gia
                              {activeScopeData.my_rank.rank <= 50
                                ? ' — Xuất sắc! Bạn đang nằm trong Top 50.'
                                : ` — Tham gia thêm ${activeScopeData.my_rank.gap_to_top50} sự kiện nữa để lọt Top 50!`}
                            </>
                          ) : (
                            'Bạn chưa có lượt điểm danh nào trong phạm vi này.'
                          )}
                        </div>
                      </div>
                    </div>

                    <span
                      className={styles.lcdBadge}
                      style={{ background: 'var(--tint-blue-strong)', color: 'var(--text-brand)', fontSize: '0.82rem', padding: '0.32rem 0.75rem' }}
                    >
                      {activeScopeData.my_rank.participations_count} sự kiện
                    </span>
                  </div>
                )}

                <div className={styles.filterRow}>
                  <div className={styles.searchWrap}>
                    <span className={styles.searchIcon}>
                      <SearchIcon size={15} />
                    </span>
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Tìm sinh viên theo MSSV, Họ tên, Lớp..."
                      className={styles.searchInput}
                    />
                  </div>

                  <select
                    value={studentLcdFilter}
                    onChange={(e) => setStudentLcdFilter(e.target.value)}
                    className={styles.filterSelect}
                  >
                    <option value="ALL">Tất cả 8 Liên Chi Đoàn</option>
                    {LCD_DEFINITIONS.map((lcd) => (
                      <option key={lcd.code} value={lcd.code}>
                        {lcd.shortName}
                      </option>
                    ))}
                  </select>
                </div>

                {filteredStudents.length === 0 ? (
                  <div className={styles.emptyState}>
                    Không có dữ liệu xếp hạng sinh viên phù hợp trong phạm vi này ({data.semester.name}).
                  </div>
                ) : (
                  <div className={styles.studentCompactList}>
                    {filteredStudents.map((st) => {
                      const isMe = activeScopeData.my_rank?.mssv === st.mssv;
                      return (
                        <div
                          key={st.mssv}
                          className={`${styles.studentCompactRow} ${isMe ? styles.rowHighlight : ''}`}
                        >
                          <div className={styles.studentCompactRank}>
                            {renderRankBadge(st.rank)}
                          </div>

                          <div className={styles.studentCompactInfo}>
                            <div className={styles.studentCompactNameRow}>
                              <span className={styles.studentCompactName} title={st.full_name}>
                                {st.full_name}
                              </span>
                              {isMe && (
                                <span className={styles.studentCompactMeBadge}>Bạn</span>
                              )}
                            </div>

                            <div
                              className={styles.studentCompactMeta}
                              title={`${st.class_id} • ${st.mssv}${st.lcd_name ? ` • ${st.lcd_name}` : ''}`}
                            >
                              <span className={styles.studentCompactClass}>{st.class_id}</span>
                              <span className={styles.studentCompactDot}>•</span>
                              <span className={styles.studentCompactMssv}>{st.mssv}</span>
                              {st.lcd_name && (
                                <>
                                  <span className={styles.studentCompactDot}>•</span>
                                  <span
                                    className={styles.studentCompactLcd}
                                    style={{ color: st.lcd_color || 'var(--text-secondary)' }}
                                  >
                                    {st.lcd_name}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <span className={styles.studentCompactCount}>
                            {st.participations_count} sự kiện
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
