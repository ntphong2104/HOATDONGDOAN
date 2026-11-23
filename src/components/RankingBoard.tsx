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
} from '@/components/icons';
import { LCD_DEFINITIONS } from '@/lib/utils/lcd';
import type { RankingResponseData } from '@/lib/types';
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

  const maxLcdParticipations = useMemo(() => {
    if (!data?.lcd_rankings?.length) return 1;
    return Math.max(1, ...data.lcd_rankings.map((x) => x.total_participations));
  }, [data]);

  const maxUnitParticipants = useMemo(() => {
    if (!data?.unit_rankings?.length) return 1;
    return Math.max(1, ...data.unit_rankings.map((x) => x.total_participants));
  }, [data]);

  const filteredStudents = useMemo(() => {
    if (!data?.top_students) return [];
    const q = normalizeText(studentSearch);
    return data.top_students.filter((st) => {
      if (studentLcdFilter !== 'ALL' && st.lcd_code !== studentLcdFilter) return false;
      if (q) {
        const hay = normalizeText(`${st.mssv} ${st.full_name} ${st.class_id} ${st.lcd_name || ''}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, studentSearch, studentLcdFilter]);

  const handleExportExcel = async () => {
    if (!data) return;
    const { downloadStyledWorkbook } = await import('@/lib/utils/styled-excel');
    const semName = data.semester?.name || 'Học kỳ hiện tại';
    const semRange =
      data.semester?.start_date && data.semester?.end_date
        ? ` (${formatDateVN(data.semester.start_date)} – ${formatDateVN(data.semester.end_date)})`
        : '';
    const semSubtitle = `Học kỳ: ${semName}${semRange}`;

    const lcdSheetRows = data.lcd_rankings.map((r) => ({
      rank: r.rank,
      lcd_code: r.lcd_code,
      lcd_name: r.lcd_name,
      total_participations: r.total_participations,
      active_students_count: r.active_students_count,
      total_students: r.total_students,
      participation_rate: `${r.participation_rate}%`,
      events_organized_count: r.events_organized_count,
    }));
    const sumLcdPart = data.lcd_rankings.reduce((s, r) => s + r.total_participations, 0);
    const sumLcdActive = data.lcd_rankings.reduce((s, r) => s + r.active_students_count, 0);
    const sumLcdTotal = data.lcd_rankings.reduce((s, r) => s + r.total_students, 0);
    const sumLcdEvents = data.lcd_rankings.reduce((s, r) => s + r.events_organized_count, 0);
    const totalLcdRate =
      sumLcdTotal > 0 ? `${Number(((sumLcdActive / sumLcdTotal) * 100).toFixed(1))}%` : '0%';

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

    const studentSheetRows = data.top_students.map((s) => ({
      rank: s.rank,
      mssv: s.mssv,
      full_name: s.full_name,
      class_id: s.class_id,
      lcd_name: s.lcd_name || 'Chưa xác định',
      participations_count: s.participations_count,
    }));

    const safeSem = (data.semester?.id || 'hoc-ky').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadStyledWorkbook({
      filename: `BangXepHang_HoatDongDoan_${safeSem}.xlsx`,
      sheets: [
        {
          sheetName: 'XepHang_8LCD',
          reportTitle: 'BẢNG XẾP HẠNG PHONG TRÀO 8 LIÊN CHI ĐOÀN',
          reportSubtitle: semSubtitle,
          showSignatureBlock: true,
          columns: [
            { key: 'rank', label: 'Hạng', align: 'center', width: 9, numFmt: 'rawInt' },
            { key: 'lcd_code', label: 'Mã LCĐ', align: 'center', width: 13, tone: 'code' },
            { key: 'lcd_name', label: 'Liên Chi Đoàn', align: 'left', width: 32, tone: 'bold' },
            { key: 'total_participations', label: 'Tổng Lượt Tham Gia', align: 'right', width: 20, numFmt: 'int' },
            { key: 'active_students_count', label: 'ĐV Tham Gia (Duy Nhất)', align: 'right', width: 23, numFmt: 'int' },
            { key: 'total_students', label: 'Tổng Đoàn Viên', align: 'right', width: 17, numFmt: 'int' },
            { key: 'participation_rate', label: 'Tỷ Lệ Tham Gia (%)', align: 'center', width: 19, tone: 'bold' },
            { key: 'events_organized_count', label: 'SK Đã Tổ Chức', align: 'right', width: 17, numFmt: 'int' },
          ],
          rows: lcdSheetRows,
          summaryRow: {
            rank: '',
            lcd_code: 'TOÀN TRƯỜNG',
            lcd_name: 'TỔNG CỘNG 8 LIÊN CHI ĐOÀN',
            total_participations: sumLcdPart,
            active_students_count: sumLcdActive,
            total_students: sumLcdTotal,
            participation_rate: totalLcdRate,
            events_organized_count: sumLcdEvents,
          },
        },
        {
          sheetName: 'XepHang_16CLB',
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
          sheetName: 'Top_DoanVien',
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
        },
      ],
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

  const topLcd = data?.lcd_rankings?.[0];
  const top3Lcds = (data?.lcd_rankings || []).slice(0, 3);
  const canSwitchSemester =
    allowSemesterSelect !== undefined
      ? allowSemesterSelect
      : Boolean(data?.can_select_semester);

  return (
    <div className={styles.wrapper}>
      {/* Hero & Semester Selector */}
      <section className={styles.heroCard}>
        <div className={styles.heroInfo}>
          <span className={styles.heroEyebrow}>
            <BadgeMedalIcon size={14} color="#fde047" />
            <span>Thi đua &amp; Tổng hợp theo Học kỳ</span>
          </span>
          <h1 className={styles.heroTitle}>Bảng Xếp Hạng Tham Gia Sự Kiện</h1>
          <p className={styles.heroDesc}>
            {data?.semester ? (
              <>
                Thống kê xếp hạng 8 Liên Chi Đoàn, các đơn vị tổ chức và đoàn viên tích cực trong{' '}
                <strong>{data.semester.name}</strong> (từ{' '}
                <strong>{formatDateVN(data.semester.start_date)}</strong> đến{' '}
                <strong>{formatDateVN(data.semester.end_date)}</strong>).
              </>
            ) : (
              'Tổng hợp xếp hạng Liên Chi Đoàn, đơn vị tổ chức và sinh viên tham gia sự kiện tích cực nhất theo học kỳ.'
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
                <CalendarIcon size={14} color="#bfdbfe" />
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
      ) : data ? (
        <>
          {/* Summary KPI Row */}
          <section className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Sự kiện trong kỳ</span>
              <span className={styles.kpiValue} style={{ color: '#1d4ed8' }}>
                {data.total_events_in_semester.toLocaleString('vi-VN')}
              </span>
              <span className={styles.kpiSub}>
                {formatDateVN(data.semester.start_date)} – {formatDateVN(data.semester.end_date)}
              </span>
            </div>

            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Tổng lượt tham gia</span>
              <span className={styles.kpiValue} style={{ color: '#059669' }}>
                {data.total_participations_in_semester.toLocaleString('vi-VN')}
              </span>
              <span className={styles.kpiSub}>Lượt điểm danh hợp lệ trong kỳ</span>
            </div>

            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Đoàn viên tham gia</span>
              <span className={styles.kpiValue} style={{ color: '#7c3aed' }}>
                {data.total_students_participated.toLocaleString('vi-VN')}
              </span>
              <span className={styles.kpiSub}>Sinh viên tham gia ít nhất 1 SK</span>
            </div>

            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>LCĐ Dẫn đầu kỳ này</span>
              <span
                className={styles.kpiValue}
                style={{ fontSize: '1.12rem', color: topLcd?.lcd_color || '#b45309' }}
              >
                {topLcd && topLcd.total_participations > 0 ? topLcd.lcd_short_name : 'Chưa có dữ liệu'}
              </span>
              <span className={styles.kpiSub}>
                {topLcd && topLcd.total_participations > 0
                  ? `${topLcd.total_participations.toLocaleString('vi-VN')} lượt (${topLcd.participation_rate}% ĐV khoa)`
                  : 'Chưa ghi nhận lượt check-in trong kỳ'}
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
                      <span className={styles.podiumMeta}>lượt tham gia</span>
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
                  <span>Xếp hạng 8 Liên Chi Đoàn</span>
                </button>

                <button
                  type="button"
                  className={`${styles.tabBtn} ${activeTab === 'units' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('units')}
                >
                  <CalendarIcon size={15} />
                  <span>Xếp hạng CLB / Đội / Nhóm ({data.unit_rankings.length})</span>
                </button>

                <button
                  type="button"
                  className={`${styles.tabBtn} ${activeTab === 'students' ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab('students')}
                >
                  <UsersIcon size={15} />
                  <span>Top Sinh viên tích cực ({data.top_students.length})</span>
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
                      <th style={{ width: 250 }}>Tổng lượt tham gia</th>
                      <th className={styles.cellNowrap}>Đoàn viên tham gia</th>
                      <th className={styles.cellCenter}>Tỷ lệ phủ (%)</th>
                      <th className={styles.cellRight}>SK đã tổ chức</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lcd_rankings.map((item) => {
                      const pctWidth = Math.min(
                        100,
                        Math.round((item.total_participations / maxLcdParticipations) * 100)
                      );
                      const isMine = highlightLcdCode && highlightLcdCode === item.lcd_code;
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
                                  style={{ background: '#dbeafe', color: '#1d4ed8' }}
                                >
                                  LCĐ của bạn
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>
                              {item.total_participations.toLocaleString('vi-VN')} lượt
                            </div>
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
                            <span style={{ color: '#64748b' }}>
                              {' '}
                              / {item.total_students.toLocaleString('vi-VN')} SV
                            </span>
                          </td>
                          <td className={styles.cellCenter}>
                            <span
                              className={`${styles.lcdBadge} ${styles.rateBadge}`}
                              style={{
                                background: item.participation_rate >= 30 ? '#dcfce7' : '#f1f5f9',
                                color: item.participation_rate >= 30 ? '#15803d' : '#475569',
                              }}
                            >
                              {item.participation_rate}%
                            </span>
                          </td>
                          <td className={`${styles.cellRight} ${styles.cellNowrap}`} style={{ fontWeight: 700, color: '#334155' }}>
                            {item.events_organized_count} SK
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 2: Xếp hạng CLB / Đội / Nhóm */}
            {activeTab === 'units' && (
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
                              <strong style={{ color: unit.lcd_color || '#6d28d9' }}>
                                {unit.unit_name}
                              </strong>
                            </td>
                            <td>
                              <div style={{ fontWeight: 800, color: '#0f172a' }}>
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
                            <td className={`${styles.cellRight} ${styles.cellNowrap}`} style={{ color: '#475569', fontWeight: 600 }}>
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
                {data.my_rank && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      padding: '0.85rem 1.05rem',
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
                      border: '1px solid #bfdbfe',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {data.my_rank.rank > 0 ? (
                        renderRankBadge(data.my_rank.rank)
                      ) : (
                        <span className={`${styles.rankPill} ${styles.rankNormal}`}>Chưa xếp hạng</span>
                      )}
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                          Vị trí của bạn: {data.my_rank.full_name} ({data.my_rank.mssv})
                        </div>
                        <div style={{ fontSize: '0.79rem', color: '#475569', marginTop: '0.12rem' }}>
                          {data.my_rank.rank > 0 ? (
                            <>
                              Đang xếp hạng <strong>#{data.my_rank.rank}</strong> /{' '}
                              {data.my_rank.total_ranked_students.toLocaleString('vi-VN')} sinh viên tham gia kỳ này
                              {data.my_rank.rank <= 50
                                ? ' — Xuất sắc! Bạn đang nằm trong Top 50 toàn Học viện.'
                                : ` — Tham gia thêm ${data.my_rank.gap_to_top50} sự kiện nữa để lọt Top 50!`}
                            </>
                          ) : (
                            'Bạn chưa có lượt điểm danh nào trong kỳ này — Hãy đăng ký tham gia sự kiện để ghi tên lên bảng xếp hạng!'
                          )}
                        </div>
                      </div>
                    </div>

                    <span
                      className={styles.lcdBadge}
                      style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.82rem', padding: '0.32rem 0.75rem' }}
                    >
                      {data.my_rank.participations_count} sự kiện
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
                    Không có dữ liệu xếp hạng sinh viên phù hợp trong <strong>{data.semester.name}</strong>.
                  </div>
                ) : (
                  <div className={styles.studentCompactList}>
                    {filteredStudents.map((st) => {
                      const isMe = data.my_rank?.mssv === st.mssv;
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
                                    style={{ color: st.lcd_color || '#475569' }}
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
