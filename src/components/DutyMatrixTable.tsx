'use client';

import React, { useMemo } from 'react';

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'];

function fmtShortDate(d: string): string {
  const p = String(d || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : d;
}

export interface DutyVolunteerItem {
  mssv: string;
  email: string;
  full_name?: string | null;
  class_id?: string | null;
}

export interface DutyRegistrationItem {
  id: string;
  duty_date: string;
  shift: 'morning' | 'afternoon';
  mssv: string;
  email: string;
  full_name?: string | null;
}

interface DutyMatrixTableProps {
  workdays: string[];
  todayVN?: string;
  volunteers: DutyVolunteerItem[];
  registrations: DutyRegistrationItem[];
  maxPerShift: number;
  mode: 'admin' | 'volunteer';
  currentUserEmail?: string;
  openDates?: string[];
  busyKey?: string | null;
  onRegister: (mssv: string, dutyDate: string, shift: 'morning' | 'afternoon') => void;
  onCancel: (regId: string) => void;
}

export default function DutyMatrixTable({
  workdays,
  todayVN,
  volunteers,
  registrations,
  maxPerShift,
  mode,
  currentUserEmail,
  openDates = [],
  busyKey,
  onRegister,
  onCancel,
}: DutyMatrixTableProps) {
  const openSet = useMemo(() => new Set(openDates), [openDates]);
  const myEmailLower = (currentUserEmail || '').trim().toLowerCase();

  // Hợp nhất danh sách CTV trực + bất kỳ CTV nào đã có lịch trong tuần
  const rows = useMemo(() => {
    const byMssv = new Map<string, DutyVolunteerItem>();
    for (const v of volunteers || []) {
      const m = String(v.mssv || '').trim().toUpperCase();
      if (!m) continue;
      byMssv.set(m, { ...v, mssv: m });
    }
    for (const r of registrations || []) {
      const m = String(r.mssv || '').trim().toUpperCase();
      if (!m || byMssv.has(m)) continue;
      byMssv.set(m, {
        mssv: m,
        email: r.email,
        full_name: r.full_name || m,
        class_id: '',
      });
    }
    const list = Array.from(byMssv.values());
    list.sort((a, b) => {
      if (mode === 'volunteer' && myEmailLower) {
        const aMe = String(a.email || '').toLowerCase() === myEmailLower;
        const bMe = String(b.email || '').toLowerCase() === myEmailLower;
        if (aMe !== bMe) return aMe ? -1 : 1;
      }
      return String(a.full_name || a.mssv).localeCompare(String(b.full_name || b.mssv), 'vi');
    });
    return list;
  }, [volunteers, registrations, mode, myEmailLower]);

  // Map nhanh: `${mssv}__${dutyDate}__${shift}` -> registration
  const regMap = useMemo(() => {
    const map = new Map<string, DutyRegistrationItem>();
    for (const r of registrations || []) {
      const key = `${String(r.mssv || '').trim().toUpperCase()}__${r.duty_date}__${r.shift}`;
      map.set(key, r);
    }
    return map;
  }, [registrations]);

  // Đếm số người đã đăng ký theo từng ô `${dutyDate}__${shift}`
  const slotCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of registrations || []) {
      const k = `${r.duty_date}__${r.shift}`;
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }, [registrations]);

  if (!workdays || workdays.length === 0) return null;

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.83rem',
          minWidth: 820,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <thead>
          {/* Hàng 1: STT | Họ tên | Thứ 2 (colSpan=2) | Thứ 3 ... | Thứ 6 | Tổng */}
          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
            <th
              rowSpan={2}
              style={{
                padding: '0.6rem 0.5rem',
                textAlign: 'center',
                width: 48,
                fontWeight: 800,
                color: '#334155',
                borderRight: '1px solid #cbd5e1',
              }}
            >
              STT
            </th>
            <th
              rowSpan={2}
              style={{
                padding: '0.6rem 0.85rem',
                textAlign: 'left',
                minWidth: 195,
                fontWeight: 800,
                color: '#0f172a',
                borderRight: '1px solid #cbd5e1',
              }}
            >
              Họ và Tên CTV
            </th>
            {workdays.map((dayStr, i) => {
              const isToday = dayStr === todayVN;
              return (
                <th
                  key={dayStr}
                  colSpan={2}
                  style={{
                    padding: '0.5rem 0.4rem',
                    textAlign: 'center',
                    fontWeight: 800,
                    color: isToday ? '#1d4ed8' : '#0f172a',
                    background: isToday ? '#dbeafe' : '#f1f5f9',
                    borderRight: '1px solid #cbd5e1',
                  }}
                >
                  <div>{DAY_LABELS[i]}</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: isToday ? '#1d4ed8' : '#64748b' }}>
                    {fmtShortDate(dayStr)}
                  </div>
                </th>
              );
            })}
            <th
              rowSpan={2}
              style={{
                padding: '0.6rem 0.5rem',
                textAlign: 'center',
                width: 66,
                fontWeight: 800,
                color: '#334155',
              }}
            >
              Tổng
            </th>
          </tr>

          {/* Hàng 2: Sáng | Chiều + bộ đếm nhỏ 0/2, 1/2 ngay dưới */}
          <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
            {workdays.map((dayStr) => {
              const isToday = dayStr === todayVN;
              const mCount = slotCountMap.get(`${dayStr}__morning`) || 0;
              const aCount = slotCountMap.get(`${dayStr}__afternoon`) || 0;
              return (
                <React.Fragment key={`${dayStr}_sub`}>
                  <th
                    style={{
                      padding: '0.36rem 0.25rem',
                      textAlign: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#475569',
                      background: isToday ? '#eff6ff' : '#f8fafc',
                      borderRight: '1px solid #e2e8f0',
                      width: 64,
                    }}
                  >
                    <div>Sáng</div>
                    <div
                      style={{
                        fontSize: '0.67rem',
                        fontWeight: 800,
                        marginTop: 1,
                        color: mCount >= maxPerShift ? '#15803d' : mCount > 0 ? '#b45309' : '#94a3b8',
                      }}
                    >
                      {mCount}/{maxPerShift}
                    </div>
                  </th>
                  <th
                    style={{
                      padding: '0.36rem 0.25rem',
                      textAlign: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#475569',
                      background: isToday ? '#eff6ff' : '#f8fafc',
                      borderRight: '1px solid #cbd5e1',
                      width: 64,
                    }}
                  >
                    <div>Chiều</div>
                    <div
                      style={{
                        fontSize: '0.67rem',
                        fontWeight: 800,
                        marginTop: 1,
                        color: aCount >= maxPerShift ? '#15803d' : aCount > 0 ? '#b45309' : '#94a3b8',
                      }}
                    >
                      {aCount}/{maxPerShift}
                    </div>
                  </th>
                </React.Fragment>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3 + workdays.length * 2} style={{ padding: '1.6rem', textAlign: 'center', color: '#64748b' }}>
                Chưa có CTV trực nào trong danh sách. Hãy thêm MSSV ở tab <strong>Danh sách CTV trực</strong> trước.
              </td>
            </tr>
          ) : (
            rows.map((vol, idx) => {
              const isMe = myEmailLower && String(vol.email || '').toLowerCase() === myEmailLower;
              const rowTotal = workdays.reduce((acc, d) => {
                return (
                  acc +
                  (regMap.has(`${vol.mssv}__${d}__morning`) ? 1 : 0) +
                  (regMap.has(`${vol.mssv}__${d}__afternoon`) ? 1 : 0)
                );
              }, 0);

              return (
                <tr
                  key={vol.mssv}
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    background: isMe ? '#f0f9ff' : '#ffffff',
                  }}
                >
                  <td
                    style={{
                      padding: '0.55rem 0.4rem',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#64748b',
                      borderRight: '1px solid #e2e8f0',
                    }}
                  >
                    {idx + 1}
                  </td>
                  <td
                    style={{
                      padding: '0.55rem 0.85rem',
                      borderRight: '1px solid #cbd5e1',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong style={{ color: '#0f172a' }}>{vol.full_name || vol.mssv}</strong>
                      {isMe && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: 999,
                            background: '#dbeafe',
                            color: '#1d4ed8',
                          }}
                        >
                          Bạn
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                      {vol.mssv}
                      {vol.class_id ? ` • ${vol.class_id}` : ''}
                    </div>
                  </td>

                  {workdays.map((dayStr) => {
                    return (['morning', 'afternoon'] as const).map((shift) => {
                      const reg = regMap.get(`${vol.mssv}__${dayStr}__${shift}`);
                      const slotCount = slotCountMap.get(`${dayStr}__${shift}`) || 0;
                      const isFull = slotCount >= maxPerShift;
                      const isOpen = openSet.has(dayStr);

                      const canInteract =
                        mode === 'admin'
                          ? Boolean(reg) || !isFull
                          : Boolean(isMe && isOpen && (Boolean(reg) || !isFull));

                      const cellKey = reg ? reg.id : `${vol.mssv}_${dayStr}_${shift}`;
                      const isBusy = busyKey === cellKey || busyKey === `${dayStr}_${shift}`;

                      return (
                        <td
                          key={`${dayStr}_${shift}`}
                          style={{
                            padding: '0.35rem',
                            textAlign: 'center',
                            borderRight: shift === 'afternoon' ? '1px solid #cbd5e1' : '1px solid #e2e8f0',
                            background: reg ? '#dcfce7' : undefined,
                          }}
                        >
                          {canInteract ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                if (reg) {
                                  onCancel(reg.id);
                                } else {
                                  onRegister(vol.mssv, dayStr, shift);
                                }
                              }}
                              title={
                                reg
                                  ? 'Bấm để hủy ca này'
                                  : `Bấm để đăng ký ${shift === 'morning' ? 'Ca Sáng' : 'Ca Chiều'} (${fmtShortDate(dayStr)})`
                              }
                              style={{
                                width: 32,
                                height: 30,
                                borderRadius: 7,
                                border: reg ? '1.5px solid #16a34a' : '1.5px dashed #cbd5e1',
                                background: reg ? '#16a34a' : '#ffffff',
                                color: reg ? '#ffffff' : '#94a3b8',
                                fontWeight: 900,
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.12s ease',
                              }}
                            >
                              {isBusy ? '…' : reg ? '✓' : '+'}
                            </button>
                          ) : reg ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 28,
                                height: 28,
                                borderRadius: 7,
                                background: '#16a34a',
                                color: '#ffffff',
                                fontWeight: 900,
                                fontSize: '0.88rem',
                              }}
                              title="Đã đăng ký trực"
                            >
                              ✓
                            </span>
                          ) : (
                            <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>—</span>
                          )}
                        </td>
                      );
                    });
                  })}

                  <td
                    style={{
                      padding: '0.55rem 0.4rem',
                      textAlign: 'center',
                      fontWeight: 800,
                      color: rowTotal > 0 ? '#1d4ed8' : '#94a3b8',
                    }}
                  >
                    {rowTotal}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
