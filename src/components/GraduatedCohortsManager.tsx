'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { LCD_DEFINITIONS, type LcdCode } from '@/lib/utils/lcd';
import { useToast } from '@/components/ToastProvider';
import { ShieldCheckIcon, RefreshIcon } from '@/components/icons';
import type { GraduatedCohortRule } from '@/lib/utils/graduated-cohorts';

interface GraduatedCohortsManagerProps {
  onCohortChanged?: () => void;
}

export default function GraduatedCohortsManager({ onCohortChanged }: GraduatedCohortsManagerProps = {}) {
  const toast = useToast();
  const [cohorts, setCohorts] = useState<string[]>([]);
  const [deletedCohorts, setDeletedCohorts] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingCohort, setDeletingCohort] = useState<string | null>(null);

  const applyResponseData = useCallback((data: any) => {
    setCohorts(data.cohorts || []);
    setDeletedCohorts(data.deleted_cohorts || []);
    const nextSet = new Set<string>();
    for (const r of (data.rules || []) as GraduatedCohortRule[]) {
      nextSet.add(`${r.lcd_code}::${r.cohort}`);
    }
    setSelectedSet(nextSet);
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/graduated-cohorts', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        applyResponseData(json.data);
      }
    } catch {
      toast.error('Không thể tải cấu hình khóa tốt nghiệp.');
    } finally {
      setLoading(false);
    }
  }, [applyResponseData, toast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const toggleCell = (lcdCode: LcdCode, cohort: string) => {
    const key = `${lcdCode}::${cohort}`;
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleWholeCohort = (cohort: string) => {
    const allChecked = LCD_DEFINITIONS.every((lcd) =>
      selectedSet.has(`${lcd.code}::${cohort}`)
    );
    setSelectedSet((prev) => {
      const next = new Set(prev);
      for (const lcd of LCD_DEFINITIONS) {
        const key = `${lcd.code}::${cohort}`;
        if (allChecked) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const rules: GraduatedCohortRule[] = Array.from(selectedSet).map((key) => {
        const [lcd_code, cohort] = key.split('::');
        return { lcd_code: lcd_code as LcdCode, cohort };
      });
      const res = await fetch('/api/admin/graduated-cohorts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      const json = await res.json();
      if (json.success) {
        if (json.data) applyResponseData(json.data);
        toast.success(json.message || 'Đã lưu cấu hình khóa tốt nghiệp!');
        onCohortChanged?.();
      } else {
        toast.error(json.error || 'Không thể lưu cấu hình.');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCohort = async (cohort: string) => {
    const confirmed = window.confirm(
      `Xác nhận XÓA toàn bộ sinh viên khóa ${cohort} khỏi Danh sách Sinh viên hệ thống?\n\n` +
        `• Toàn bộ hồ sơ khóa ${cohort} sẽ bị xóa khỏi danh sách quản lý & Tổng sinh viên.\n` +
        `• Lịch sử số lượt điểm danh của các sự kiện cũ vẫn được giữ nguyên.`
    );
    if (!confirmed) return;

    setDeletingCohort(cohort);
    try {
      const res = await fetch(`/api/admin/graduated-cohorts?cohort=${encodeURIComponent(cohort)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        if (json.data) applyResponseData(json.data);
        toast.success(json.message || `Đã xóa khóa ${cohort} khỏi danh sách hệ thống!`);
        onCohortChanged?.();
      } else {
        toast.error(json.error || `Không thể xóa khóa ${cohort}.`);
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ khi xóa khóa.');
    } finally {
      setDeletingCohort(null);
    }
  };

  const activeMatrixRuleCount = Array.from(selectedSet).filter((key) => {
    const [, cohort] = key.split('::');
    return !deletedCohorts.includes(cohort);
  }).length;

  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: '1.35rem',
        marginTop: '1.25rem',
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '1.05rem',
              fontWeight: 800,
              color: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <ShieldCheckIcon size={18} color="#b45309" />
            <span>Quản lý Khóa Đã Tốt Nghiệp theo từng Liên Chi Đoàn</span>
          </h3>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.84rem', color: '#64748b', lineHeight: 1.45 }}>
            Đánh dấu từng cặp <strong>LCĐ + Khóa</strong> đã ra trường (VD: khối Kinh tế 4 năm tốt nghiệp sớm hơn khối Kỹ thuật 4.5–5 năm), hoặc bấm{' '}
            <strong style={{ color: '#dc2626' }}>✕ Xóa DS</strong> dưới tên khóa để xóa hẳn sinh viên khóa cũ khỏi Danh sách Sinh viên hệ thống (vẫn giữ nguyên số lượt sự kiện cũ).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={loadConfig}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '0.45rem 0.8rem',
              borderRadius: 9,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            <RefreshIcon size={14} /> Làm mới
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              padding: '0.48rem 1.05rem',
              borderRadius: 9,
              border: 'none',
              background: '#1d4ed8',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Đang lưu...' : `Lưu cấu hình (${activeMatrixRuleCount} nhóm)`}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.86rem' }}>
          Đang tải ma trận khóa tốt nghiệp...
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 800, color: '#334155', minWidth: 210 }}>
                    Liên Chi Đoàn (8 LCĐ)
                  </th>
                  {cohorts.map((cohort) => {
                    const allChecked = LCD_DEFINITIONS.every((lcd) =>
                      selectedSet.has(`${lcd.code}::${cohort}`)
                    );
                    const isDeleting = deletingCohort === cohort;
                    return (
                      <th key={cohort} style={{ padding: '0.5rem 0.45rem', textAlign: 'center', minWidth: 80 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => toggleWholeCohort(cohort)}
                            title={`Bấm để chọn / bỏ chọn toàn bộ 8 LCĐ khóa ${cohort}`}
                            style={{
                              padding: '0.25rem 0.55rem',
                              borderRadius: 7,
                              border: `1px solid ${allChecked ? '#d97706' : '#cbd5e1'}`,
                              background: allChecked ? '#fef3c7' : '#ffffff',
                              color: allChecked ? '#92400e' : '#0f172a',
                              fontWeight: 800,
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                            }}
                          >
                            {cohort}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(deletingCohort)}
                            onClick={() => handleDeleteCohort(cohort)}
                            title={`Xóa toàn bộ sinh viên khóa ${cohort} khỏi Danh sách Sinh viên hệ thống`}
                            style={{
                              padding: '2px 6px',
                              borderRadius: 5,
                              border: '1px solid #fecaca',
                              background: '#fef2f2',
                              color: '#dc2626',
                              fontWeight: 700,
                              fontSize: '0.66rem',
                              cursor: deletingCohort ? 'not-allowed' : 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isDeleting ? 'Đang xóa...' : '✕ Xóa DS'}
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {LCD_DEFINITIONS.map((lcd) => (
                  <tr key={lcd.code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: '#0f172a' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: lcd.color,
                            flexShrink: 0,
                          }}
                        />
                        <span>{lcd.shortName}</span>
                      </span>
                    </td>
                    {cohorts.map((cohort) => {
                      const checked = selectedSet.has(`${lcd.code}::${cohort}`);
                      return (
                        <td key={cohort} style={{ padding: '0.4rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => toggleCell(lcd.code, cohort)}
                            style={{
                              width: '100%',
                              minWidth: 62,
                              padding: '0.32rem 0.35rem',
                              borderRadius: 8,
                              border: `1px solid ${checked ? '#f59e0b' : '#e2e8f0'}`,
                              background: checked ? '#fef3c7' : '#ffffff',
                              color: checked ? '#b45309' : '#94a3b8',
                              fontWeight: checked ? 800 : 600,
                              fontSize: '0.74rem',
                              cursor: 'pointer',
                            }}
                          >
                            {checked ? '✓ Đã TN' : '—'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {deletedCohorts.length > 0 && (
            <div
              style={{
                marginTop: '0.75rem',
                fontSize: '0.78rem',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.4rem',
              }}
            >
              <span>Đã xóa khỏi Danh sách Sinh viên hệ thống:</span>
              {deletedCohorts.map((dc) => (
                <span
                  key={dc}
                  style={{
                    padding: '0.15rem 0.5rem',
                    borderRadius: 999,
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#334155',
                    fontWeight: 700,
                    fontSize: '0.73rem',
                  }}
                >
                  {dc}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
