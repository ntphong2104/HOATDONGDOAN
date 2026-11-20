'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
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

  const fetchRanking = useCallback(async (semesterId?: string, forceRefresh = false) => {
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
      if (!hasStale) {
        setErrorMsg('Lỗi kết nối máy chủ khi tải bảng xếp hạng.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRanking();
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

  const handleExportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    const lcdSheetRows = data.lcd_rankings.map((r) => ({
      'Hạng': r.rank,
      'Mã LCĐ': r.lcd_code,
      'Liên Chi Đoàn': r.lcd_name,
      'Tổng lượt tham gia': r.total_participations,
      'Đoàn viên tham gia (duy nhất)': r.active_students_count,
      'Tổng Đoàn viên': r.total_students,
      'Tỷ lệ tham gia (%)': `${r.participation_rate}%`,
      'Sự kiện đã tổ chức': r.events_organized_count,
    }));
    const wsLcd = XLSX.utils.json_to_sheet(lcdSheetRows);
    XLSX.utils.book_append_sheet(wb, wsLcd, 'XepHang_LCD');

    const unitSheetRows = data.unit_rankings.map((u) => ({
      'Hạng': u.rank,
      'Đơn vị tổ chức': u.unit_name,
      'Phân loại': u.unit_type === 'lcd' ? 'Liên Chi Đoàn' : u.unit_type === 'school' ? 'Cấp Học viện' : 'CLB / Đội / Nhóm',
      'Số sự kiện tổ chức': u.events_count,
      'Tổng lượt người tham gia': u.total_participants,
      'Người tham gia duy nhất': u.unique_participants,
      'Trung bình lượt / sự kiện': u.avg_participants_per_event,
    }));
    const wsUnits = XLSX.utils.json_to_sheet(unitSheetRows);
    XLSX.utils.book_append_sheet(wb, wsUnits, 'DonVi_ToChuc');

    const studentSheetRows = data.top_students.map((s) => ({
      'Hạng': s.rank,
      'MSSV': s.mssv,
      'Họ và Tên': s.full_name,
      'Chi đoàn / Lớp': s.class_id,
      'Liên Chi Đoàn': s.lcd_name || 'Chưa xác định',
      'Số sự kiện tham gia': s.participations_count,
    }));
    const wsStudents = XLSX.utils.json_to_sheet(studentSheetRows);
    XLSX.utils.book_append_sheet(wb, wsStudents, 'Top_SinhVien');

    const safeSem = (data.semester?.id || 'hoc-ky').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `BangXepHang_HoatDongDoan_${safeSem}.xlsx`);
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
                  <span>Đơn vị tổ chức ({data.unit_rankings.length})</span>
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

            {/* TAB 2: Xếp hạng Đơn vị tổ chức */}
            {activeTab === 'units' && (
              data.unit_rankings.length === 0 ? (
                <div className={styles.emptyState}>
                  Chưa có sự kiện nào được tổ chức trong <strong>{data.semester.name}</strong>.
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ width: 120 }}>Hạng</th>
                        <th style={{ minWidth: 230 }}>Đơn vị tổ chức (LCĐ / CLB / Ban)</th>
                        <th className={styles.cellCenter}>Phân loại</th>
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
                              <strong style={{ color: unit.lcd_color || '#0f172a' }}>
                                {unit.unit_name}
                              </strong>
                            </td>
                            <td className={styles.cellCenter}>
                              <span
                                className={styles.lcdBadge}
                                style={{
                                  background:
                                    unit.unit_type === 'lcd'
                                      ? '#eff6ff'
                                      : unit.unit_type === 'school'
                                      ? '#fef3c7'
                                      : '#f5f3ff',
                                  color:
                                    unit.unit_type === 'lcd'
                                      ? '#1d4ed8'
                                      : unit.unit_type === 'school'
                                      ? '#b45309'
                                      : '#6d28d9',
                                }}
                              >
                                {unit.unit_type === 'lcd'
                                  ? 'Liên Chi Đoàn'
                                  : unit.unit_type === 'school'
                                  ? 'Cấp Học viện'
                                  : 'CLB / Đội / Nhóm'}
                              </span>
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
                                    background: unit.lcd_color || '#2563eb',
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
