'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangleIcon,
  CalendarIcon,
  ClockIcon,
  CloseIcon,
  MapPinIcon,
  ScanCameraIcon,
} from '@/components/icons';
import {
  buildStudentScheduleItems,
  findNextUpcomingItem,
  formatDateShortVN,
  getWeekDaysVN,
  shiftDateVN,
  type BorrowRequestInput,
  type DutyShiftHours,
  type DutyShiftInput,
  type ScheduleItemStatus,
  type TimetablePeriod,
  type WeeklyScheduleItem,
} from '@/lib/utils/student-schedule';
import styles from './StudentWeeklyTimetable.module.css';

interface StudentWeeklyTimetableProps {
  registrations: any[];
  checkedInEventIds: Set<string>;
  dutyShifts?: DutyShiftInput[];
  borrowRequests?: BorrowRequestInput[];
  shiftHours?: DutyShiftHours;
  todayVN: string;
  onOpenScanner?: () => void;
}

type CategoryFilter = 'all' | 'event' | 'duty' | 'borrow';

const PERIODS: Array<{ key: TimetablePeriod; label: string }> = [
  { key: 'morning', label: 'Sáng' },
  { key: 'afternoon', label: 'Chiều' },
  { key: 'evening', label: 'Tối' },
];

const STATUS_LABEL: Record<ScheduleItemStatus, string> = {
  today: 'Hôm nay',
  upcoming: 'Sắp tới',
  completed: 'Đã hoàn thành',
  pending_review: 'Chờ duyệt',
  overdue: 'Quá hạn trả',
};

function matchesCategoryFilter(item: WeeklyScheduleItem, filter: CategoryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'event') return item.type === 'event';
  if (filter === 'duty') return item.type === 'duty';
  return item.type === 'borrow_pickup' || item.type === 'borrow_return';
}

function getActionLabel(item: WeeklyScheduleItem): string {
  if (item.type === 'event') return 'Xem sự kiện & điểm danh →';
  if (item.type === 'duty') return 'Vào Trực Văn phòng →';
  return 'Mở đơn mượn dụng cụ →';
}

function getPillVariantClass(item: WeeklyScheduleItem): string {
  if (item.status === 'overdue') return styles.pillOverdue;
  if (item.status === 'completed') return styles.pillCompleted;
  if (item.type === 'duty') return styles.pillDuty;
  if (item.type === 'borrow_pickup' || item.type === 'borrow_return') return styles.pillBorrow;
  return styles.pillEvent;
}

function getStatusBadgeClass(status: ScheduleItemStatus): string {
  if (status === 'today') return styles.statusToday;
  if (status === 'completed') return styles.statusCompleted;
  if (status === 'pending_review') return styles.statusPending;
  if (status === 'overdue') return styles.statusOverdue;
  return styles.statusUpcoming;
}

export default function StudentWeeklyTimetable({
  registrations,
  checkedInEventIds,
  dutyShifts = [],
  borrowRequests = [],
  shiftHours,
  todayVN,
  onOpenScanner,
}: StudentWeeklyTimetableProps) {
  const [weekAnchor, setWeekAnchor] = useState<string>(todayVN);
  const [typeFilter, setTypeFilter] = useState<CategoryFilter>('all');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [mobileSelectedDate, setMobileSelectedDate] = useState<string>(todayVN);

  const allItems = useMemo(
    () =>
      buildStudentScheduleItems({
        registrations,
        checkedInEventIds,
        dutyShifts,
        borrowRequests,
        shiftHours,
        todayVN,
      }),
    [registrations, checkedInEventIds, dutyShifts, borrowRequests, shiftHours, todayVN]
  );

  const weekDays = useMemo(() => getWeekDaysVN(weekAnchor), [weekAnchor]);
  const weekStart = weekDays[0]?.date || todayVN;
  const weekEnd = weekDays[weekDays.length - 1]?.date || todayVN;
  const isViewingCurrentWeek = weekDays.some((d) => d.date === todayVN);

  const weekRangeLabel = useMemo(() => {
    if (weekDays.length < 7) return '';
    const year = weekDays[6].date.slice(0, 4);
    return `${weekDays[0].dayLabel} – ${weekDays[6].dayLabel}/${year}`;
  }, [weekDays]);

  const weekAllItems = useMemo(
    () => allItems.filter((item) => item.date >= weekStart && item.date <= weekEnd),
    [allItems, weekStart, weekEnd]
  );

  const weekCounts = useMemo(() => {
    let eventCount = 0;
    let dutyCount = 0;
    let borrowCount = 0;
    for (const item of weekAllItems) {
      if (item.type === 'event') eventCount++;
      else if (item.type === 'duty') dutyCount++;
      else borrowCount++;
    }
    return {
      all: weekAllItems.length,
      event: eventCount,
      duty: dutyCount,
      borrow: borrowCount,
    };
  }, [weekAllItems]);

  const filteredWeekItems = useMemo(
    () => weekAllItems.filter((item) => matchesCategoryFilter(item, typeFilter)),
    [weekAllItems, typeFilter]
  );

  const overdueItems = useMemo(
    () => allItems.filter((item) => item.status === 'overdue'),
    [allItems]
  );

  const todayPendingItems = useMemo(
    () => allItems.filter((item) => item.date === todayVN && item.status !== 'completed'),
    [allItems, todayVN]
  );

  const nextUpcomingAfterWeek = useMemo(
    () => findNextUpcomingItem(allItems, weekEnd),
    [allItems, weekEnd]
  );

  const selectedItem = useMemo(
    () => filteredWeekItems.find((item) => item.id === selectedItemId) || null,
    [filteredWeekItems, selectedItemId]
  );

  const cellItemsMap = useMemo(() => {
    const map = new Map<string, WeeklyScheduleItem[]>();
    for (const item of filteredWeekItems) {
      const key = `${item.date}__${item.period}`;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [filteredWeekItems]);

  const effectiveMobileDate = useMemo(() => {
    if (weekDays.some((d) => d.date === mobileSelectedDate)) {
      return mobileSelectedDate;
    }
    if (weekDays.some((d) => d.date === todayVN)) {
      return todayVN;
    }
    const firstWithItem = weekDays.find((d) =>
      filteredWeekItems.some((item) => item.date === d.date)
    );
    return firstWithItem?.date || weekStart;
  }, [weekDays, mobileSelectedDate, todayVN, filteredWeekItems, weekStart]);

  const mobileDayColumn = useMemo(
    () => weekDays.find((d) => d.date === effectiveMobileDate) || weekDays[0],
    [weekDays, effectiveMobileDate]
  );

  const mobileDayItems = useMemo(
    () => filteredWeekItems.filter((item) => item.date === effectiveMobileDate),
    [filteredWeekItems, effectiveMobileDate]
  );

  const firstOtherDayInWeekWithItem = useMemo(() => {
    if (mobileDayItems.length > 0) return null;
    const hit = weekDays.find(
      (d) =>
        d.date !== effectiveMobileDate &&
        filteredWeekItems.some((item) => item.date === d.date)
    );
    return hit || null;
  }, [mobileDayItems.length, weekDays, effectiveMobileDate, filteredWeekItems]);

  const selectedDayCol = useMemo(() => {
    if (!selectedItem) return null;
    return weekDays.find((d) => d.date === selectedItem.date) || null;
  }, [selectedItem, weekDays]);

  const selectedPeriodLabel = useMemo(() => {
    if (!selectedItem) return '';
    return PERIODS.find((p) => p.key === selectedItem.period)?.label || '';
  }, [selectedItem]);

  return (
    <section className={styles.timetableCard} aria-label="Lịch hoạt động tuần">
      {/* Header Row */}
      <div className={styles.headerRow}>
        <div className={styles.titleGroup}>
          <CalendarIcon size={17} color="#1e3a8a" />
          <h3 className={styles.titleText}>Lịch hoạt động tuần</h3>
          {weekRangeLabel && <span className={styles.weekRange}>{weekRangeLabel}</span>}
          {filteredWeekItems.length > 0 && (
            <span className={styles.weekCountBadge}>{filteredWeekItems.length} lịch</span>
          )}
        </div>

        <div className={styles.navSegmented} role="group" aria-label="Chuyển tuần">
          <button
            type="button"
            className={styles.segBtn}
            aria-label="Tuần trước"
            title="Tuần trước"
            onClick={() => setWeekAnchor(shiftDateVN(weekStart, -7))}
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.segBtn} ${styles.segCenterBtn} ${
              isViewingCurrentWeek ? styles.segBtnActive : ''
            }`}
            onClick={() => {
              setWeekAnchor(todayVN);
              setMobileSelectedDate(todayVN);
            }}
          >
            Tuần này
          </button>
          <button
            type="button"
            className={styles.segBtn}
            aria-label="Tuần sau"
            title="Tuần sau"
            onClick={() => setWeekAnchor(shiftDateVN(weekStart, 7))}
          >
            ›
          </button>
        </div>
      </div>

      {/* Overdue Borrow Warning Strip */}
      {overdueItems.length > 0 && (
        <div className={styles.overdueBanner} role="alert">
          <div className={styles.overdueLeft}>
            <AlertTriangleIcon size={15} color="#dc2626" />
            <span>
              Bạn có <strong>{overdueItems.length}</strong> lịch trả dụng cụ VPĐ đã quá hạn!
            </span>
          </div>
          <Link href="/office/borrow" className={styles.overdueLink}>
            Xem &amp; trả đồ →
          </Link>
        </div>
      )}

      {/* Today Daily Summary Notification Strip */}
      {isViewingCurrentWeek && todayPendingItems.length > 0 && (
        <div className={styles.todayBanner}>
          <div className={styles.todayLeft}>
            <ClockIcon size={15} color="#1d4ed8" />
            <span>
              Hôm nay ({formatDateShortVN(todayVN)}) có{' '}
              <strong>{todayPendingItems.length}</strong> lịch: {todayPendingItems[0].title} (
              {todayPendingItems[0].timeLabel})
            </span>
          </div>
          <button
            type="button"
            className={styles.todayActionBtn}
            onClick={() => {
              setTypeFilter('all');
              setSelectedItemId(todayPendingItems[0].id);
            }}
          >
            Xem chi tiết
          </button>
        </div>
      )}

      {/* Filter / Category Legend Pills (rendered when week has scheduled items) */}
      {weekAllItems.length > 0 && (
        <div className={styles.filterRow} role="group" aria-label="Lọc loại lịch">
          <button
            type="button"
            className={`${styles.filterPill} ${typeFilter === 'all' ? styles.filterPillActive : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            <span>Tất cả ({weekCounts.all})</span>
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${
              typeFilter === 'event' ? styles.filterPillActive : ''
            }`}
            onClick={() => setTypeFilter('event')}
          >
            <span className={`${styles.dot} ${styles.dotEvent}`} />
            <span>Sự kiện{weekCounts.event > 0 ? ` (${weekCounts.event})` : ''}</span>
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${
              typeFilter === 'duty' ? styles.filterPillActive : ''
            }`}
            onClick={() => setTypeFilter('duty')}
          >
            <span className={`${styles.dot} ${styles.dotDuty}`} />
            <span>Trực VPĐ{weekCounts.duty > 0 ? ` (${weekCounts.duty})` : ''}</span>
          </button>
          <button
            type="button"
            className={`${styles.filterPill} ${
              typeFilter === 'borrow' ? styles.filterPillActive : ''
            }`}
            onClick={() => setTypeFilter('borrow')}
          >
            <span className={`${styles.dot} ${styles.dotBorrow}`} />
            <span>Mượn / Trả đồ{weekCounts.borrow > 0 ? ` (${weekCounts.borrow})` : ''}</span>
          </button>
        </div>
      )}

      {/* Desktop 7-Column Timetable Grid (>= 680px) */}
      <div className={styles.desktopGridWrap} data-testid="weekly-timetable-grid">
        <div className={styles.timetableGrid}>
          <div className={styles.cornerHeader}>Buổi</div>
          {weekDays.map((day) => {
            const isToday = day.date === todayVN;
            return (
              <div
                key={day.date}
                className={`${styles.dayHeader} ${day.isWeekend ? styles.dayHeaderWeekend : ''} ${
                  isToday ? styles.dayHeaderToday : ''
                }`}
              >
                <span className={styles.dayShort}>{day.dayShort}</span>
                <span className={styles.dayNum}>{day.dayLabel}</span>
              </div>
            );
          })}

          {PERIODS.map((period) => {
            const rowHasItems = weekDays.some(
              (d) => (cellItemsMap.get(`${d.date}__${period.key}`)?.length || 0) > 0
            );
            return (
              <React.Fragment key={period.key}>
                <div className={styles.periodLabelCell}>{period.label}</div>
                {weekDays.map((day) => {
                  const isToday = day.date === todayVN;
                  const cellItems = cellItemsMap.get(`${day.date}__${period.key}`) || [];
                  return (
                    <div
                      key={`${day.date}-${period.key}`}
                      className={`${styles.gridCell} ${
                        !rowHasItems ? styles.gridCellEmptyRow : ''
                      } ${day.isWeekend ? styles.gridCellWeekend : ''} ${
                        isToday ? styles.gridCellToday : ''
                      }`}
                    >
                      {cellItems.map((item) => {
                        const isSelected = selectedItemId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              setSelectedItemId((prev) => (prev === item.id ? null : item.id))
                            }
                            className={`${styles.itemPill} ${getPillVariantClass(item)} ${
                              isSelected ? styles.itemPillSelected : ''
                            }`}
                            title={`${item.timeLabel} · ${item.title}`}
                          >
                            <div className={styles.pillMetaRow}>
                              <span className={styles.pillTime}>{item.timeLabel}</span>
                              <span className={styles.pillBadge}>
                                {item.status === 'completed'
                                  ? `✓ ${item.badgeLabel}`
                                  : item.badgeLabel}
                              </span>
                            </div>
                            <span className={styles.pillTitle}>{item.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Mobile 7-Day Selector + Selected Day Agenda (< 680px) */}
      <div className={styles.mobileAgendaWrap} data-testid="weekly-timetable-mobile">
        <div className={styles.mobileDayStrip}>
          {weekDays.map((day) => {
            const isSelected = day.date === effectiveMobileDate;
            const isToday = day.date === todayVN;
            const dayItems = filteredWeekItems.filter((item) => item.date === day.date);
            const hasEvent = dayItems.some((i) => i.type === 'event');
            const hasDuty = dayItems.some((i) => i.type === 'duty');
            const hasBorrow = dayItems.some(
              (i) => i.type === 'borrow_pickup' || i.type === 'borrow_return'
            );

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setMobileSelectedDate(day.date)}
                className={`${styles.mobileDayBtn} ${
                  isSelected ? styles.mobileDayBtnActive : ''
                } ${isToday ? styles.mobileDayBtnToday : ''}`}
              >
                <span className={styles.mobileDayShort}>{day.dayShort}</span>
                <span className={styles.mobileDayDate}>{day.dayLabel.slice(0, 2)}</span>
                <span className={styles.mobileDotsRow}>
                  {hasEvent && <span className={`${styles.dot} ${styles.dotEvent}`} />}
                  {hasDuty && <span className={`${styles.dot} ${styles.dotDuty}`} />}
                  {hasBorrow && <span className={`${styles.dot} ${styles.dotBorrow}`} />}
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.mobileDayCards}>
          {mobileDayItems.length === 0 ? (
            <div className={styles.mobileEmptyDay}>
              <span>
                {mobileDayColumn?.dayFull} ({mobileDayColumn?.dayLabel}) chưa có lịch.
              </span>
              {firstOtherDayInWeekWithItem && (
                <button
                  type="button"
                  className={styles.quietJumpBtn}
                  onClick={() => setMobileSelectedDate(firstOtherDayInWeekWithItem.date)}
                >
                  Xem {firstOtherDayInWeekWithItem.dayShort} ({firstOtherDayInWeekWithItem.dayLabel})
                </button>
              )}
            </div>
          ) : (
            mobileDayItems.map((item) => {
              const pLabel = PERIODS.find((p) => p.key === item.period)?.label || '';
              return (
                <div
                  key={`m-${item.id}`}
                  className={`${styles.mobileAgendaCard} ${getPillVariantClass(item)}`}
                >
                  <div className={styles.mobileAgendaCardTop}>
                    <span className={styles.pillTime}>
                      {pLabel} · {item.timeLabel}
                    </span>
                    <span
                      className={`${styles.detailStatusBadge} ${getStatusBadgeClass(item.status)}`}
                    >
                      {item.badgeLabel} · {STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  <div className={styles.detailTitle}>{item.title}</div>
                  {item.subtitle && <div className={styles.detailSub}>{item.subtitle}</div>}
                  <div className={styles.mobileAgendaCardActions}>
                    <Link href={item.href} className={styles.detailPrimaryLink}>
                      {getActionLabel(item)}
                    </Link>
                    {item.type === 'event' && item.status === 'today' && onOpenScanner && (
                      <button
                        type="button"
                        onClick={onOpenScanner}
                        className={styles.detailScanBtn}
                      >
                        <ScanCameraIcon size={13} color="#ffffff" />
                        <span>Quét QR điểm danh</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Inline Detail Card on Desktop Click / Today Click */}
      {selectedItem && (
        <div className={styles.detailCard} data-testid="timetable-item-detail">
          <div className={styles.detailTop}>
            <div className={styles.detailBadges}>
              <span className={styles.detailTypeBadge}>{selectedItem.badgeLabel}</span>
              <span
                className={`${styles.detailStatusBadge} ${getStatusBadgeClass(selectedItem.status)}`}
              >
                {STATUS_LABEL[selectedItem.status]}
              </span>
            </div>
            <button
              type="button"
              className={styles.detailCloseBtn}
              aria-label="Đóng chi tiết lịch"
              onClick={() => setSelectedItemId(null)}
            >
              <CloseIcon size={14} />
            </button>
          </div>

          <h4 className={styles.detailTitle}>{selectedItem.title}</h4>

          <div className={styles.detailMeta}>
            <span>
              <ClockIcon size={13} />{' '}
              {selectedDayCol ? `${selectedDayCol.dayFull}, ${selectedDayCol.dayLabel}` : formatDateShortVN(selectedItem.date)}{' '}
              · Buổi {selectedPeriodLabel} ({selectedItem.timeLabel})
            </span>
            {selectedItem.meta?.roomName && (
              <span>
                <MapPinIcon size={13} /> {selectedItem.meta.roomName}
              </span>
            )}
          </div>

          {selectedItem.subtitle && <div className={styles.detailSub}>{selectedItem.subtitle}</div>}

          <div className={styles.detailActions}>
            <Link href={selectedItem.href} className={styles.detailPrimaryLink}>
              {getActionLabel(selectedItem)}
            </Link>
            {selectedItem.type === 'event' && selectedItem.status === 'today' && onOpenScanner && (
              <button type="button" onClick={onOpenScanner} className={styles.detailScanBtn}>
                <ScanCameraIcon size={14} color="#ffffff" />
                <span>Quét QR điểm danh</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Slim Non-Duplicate Empty / Filtered Footer */}
      {weekAllItems.length === 0 ? (
        <div className={styles.quietFooter}>
          <div className={styles.quietLeft}>
            {nextUpcomingAfterWeek ? (
              <>
                <span>
                  Tuần này trống lịch · Gần nhất:{' '}
                  <strong>{formatDateShortVN(nextUpcomingAfterWeek.date)}</strong> (
                  {nextUpcomingAfterWeek.title})
                </span>
                <button
                  type="button"
                  className={styles.quietJumpBtn}
                  onClick={() => {
                    setWeekAnchor(nextUpcomingAfterWeek.date);
                    setMobileSelectedDate(nextUpcomingAfterWeek.date);
                  }}
                >
                  Xem tuần đó →
                </button>
              </>
            ) : (
              <span>Tuần này chưa có lịch sự kiện, trực VPĐ hay mượn dụng cụ.</span>
            )}
          </div>
          <div className={styles.quietLegend} aria-label="Chú thích màu lịch">
            <span className={styles.quietLegendItem}>
              <span className={`${styles.dot} ${styles.dotEvent}`} /> Sự kiện
            </span>
            <span className={styles.quietLegendItem}>
              <span className={`${styles.dot} ${styles.dotDuty}`} /> Trực VPĐ
            </span>
            <span className={styles.quietLegendItem}>
              <span className={`${styles.dot} ${styles.dotBorrow}`} /> Dụng cụ
            </span>
          </div>
        </div>
      ) : (
        filteredWeekItems.length === 0 && (
          <div className={styles.quietFooter}>
            <span>Không có lịch thuộc mục này trong tuần đang xem.</span>
            <button
              type="button"
              className={styles.quietJumpBtn}
              onClick={() => setTypeFilter('all')}
            >
              Xem tất cả ({weekAllItems.length})
            </button>
          </div>
        )
      )}
    </section>
  );
}
