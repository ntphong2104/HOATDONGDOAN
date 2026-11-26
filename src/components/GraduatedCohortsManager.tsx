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
  const [savedSelectedSet, setSavedSelectedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingCohort, setDeletingCohort] = useState<string | null>(null);
  const [deleteModalCohort, setDeleteModalCohort] = useState<string | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

  const applyResponseData = useCallback((data: any) => {
    setCohorts(data.cohorts || []);
    setDeletedCohorts(data.deleted_cohorts || []);
    const nextSet = new Set<string>();
    for (const r of (data.rules || []) as GraduatedCohortRule[]) {
      nextSet.add(`${r.lcd_code}::${r.cohort}`);
    }
    setSelectedSet(nextSet);
    setSavedSelectedSet(new Set(nextSet));
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
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) await loadConfig();
    })();
    return () => {
      cancelled = true;
    };
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

  const openDeleteModal = (cohort: string) => {
    setDeleteModalCohort(cohort);
    setDeleteConfirmStep(1);
    setDeleteConfirmInput('');
  };

  const closeDeleteModal = () => {
    if (deletingCohort) return;
    setDeleteModalCohort(null);
    setDeleteConfirmStep(1);
    setDeleteConfirmInput('');
  };

  const handleConfirmDeleteCohort = async () => {
    if (!deleteModalCohort) return;
    const cohort = deleteModalCohort;
    const expectedConfirm = `XOA ${cohort}`;
    const normalizedInput = deleteConfirmInput
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
    if (normalizedInput !== expectedConfirm) {
      toast.error(`Vui lòng nhập chính xác "${expectedConfirm}" để xác nhận.`);
      return;
    }

    setDeletingCohort(cohort);
    try {
      const res = await fetch(
        `/api/admin/graduated-cohorts?cohort=${encodeURIComponent(cohort)}&confirm=${encodeURIComponent(expectedConfirm)}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (json.success) {
        if (json.data) applyResponseData(json.data);
        setDeleteModalCohort(null);
        setDeleteConfirmStep(1);
        setDeleteConfirmInput('');
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

  const hasUnsavedChanges =
    selectedSet.size !== savedSelectedSet.size ||
    Array.from(selectedSet).some((key) => !savedSelectedSet.has(key));

  const activeMatrixRuleCount = Array.from(selectedSet).filter((key) => {
    const [, cohort] = key.split('::');
    return !deletedCohorts.includes(cohort);
  }).length;

  return (
    <section
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
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
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <ShieldCheckIcon size={18} color="var(--status-amber-text)" />
            <span>Quản lý Khóa Đã Tốt Nghiệp theo từng Liên Chi Đoàn</span>
          </h3>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            Đánh dấu từng cặp <strong>LCĐ + Khóa</strong> đã ra trường (VD: khối Kinh tế 4 năm tốt nghiệp sớm hơn khối Kỹ thuật 4.5–5 năm). Sau khi{' '}
            <strong>toàn bộ {LCD_DEFINITIONS.length}/{LCD_DEFINITIONS.length} LCĐ của một khóa đã tốt nghiệp và được lưu cấu hình</strong>, nút{' '}
            <strong style={{ color: 'var(--status-red-text)' }}>✕ Xóa DS</strong> mới xuất hiện để xóa khóa cũ khỏi Danh sách Sinh viên (kèm xác nhận 2 bước, vẫn giữ nguyên lịch sử sự kiện cũ).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {hasUnsavedChanges && (
            <span
              style={{
                padding: '0.28rem 0.6rem',
                borderRadius: 999,
                background: 'var(--tint-amber-strong)',
                border: '1px solid var(--tint-amber-border)',
                color: 'var(--status-amber-text)',
                fontSize: '0.74rem',
                fontWeight: 700,
              }}
            >
              Chưa lưu thay đổi
            </span>
          )}
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
              border: '1px solid var(--border-strong)',
              background: 'var(--bg-subtle)',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--text-body)',
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
              border: hasUnsavedChanges ? '2px solid #f59e0b' : 'none',
              background: '#1d4ed8',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: saving ? 'not-allowed' : 'pointer',
              boxShadow: hasUnsavedChanges ? '0 0 0 3px rgba(245, 158, 11, 0.2)' : 'none',
            }}
          >
            {saving ? 'Đang lưu...' : `Lưu cấu hình (${activeMatrixRuleCount} nhóm)`}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
          Đang tải ma trận khóa tốt nghiệp...
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 800, color: 'var(--text-body)', minWidth: 210 }}>
                    Liên Chi Đoàn ({LCD_DEFINITIONS.length} LCĐ)
                  </th>
                  {cohorts.map((cohort) => {
                    const graduatedCount = LCD_DEFINITIONS.filter((lcd) =>
                      selectedSet.has(`${lcd.code}::${cohort}`)
                    ).length;
                    const allChecked = graduatedCount === LCD_DEFINITIONS.length;
                    const savedAllChecked = LCD_DEFINITIONS.every((lcd) =>
                      savedSelectedSet.has(`${lcd.code}::${cohort}`)
                    );
                    const canDeleteCohort = allChecked && savedAllChecked;
                    const isDeleting = deletingCohort === cohort;
                    return (
                      <th key={cohort} style={{ padding: '0.5rem 0.45rem', textAlign: 'center', minWidth: 86 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => toggleWholeCohort(cohort)}
                            title={`Bấm để chọn / bỏ chọn toàn bộ ${LCD_DEFINITIONS.length} LCĐ khóa ${cohort}`}
                            style={{
                              padding: '0.25rem 0.55rem',
                              borderRadius: 7,
                              border: `1px solid ${allChecked ? '#d97706' : 'var(--border-strong)'}`,
                              background: allChecked ? 'var(--tint-amber-strong)' : 'var(--bg-surface)',
                              color: allChecked ? 'var(--status-amber-text)' : 'var(--text-primary)',
                              fontWeight: 800,
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                            }}
                          >
                            {cohort}
                          </button>
                          {canDeleteCohort ? (
                            <button
                              type="button"
                              disabled={Boolean(deletingCohort)}
                              onClick={() => openDeleteModal(cohort)}
                              title={`Khóa ${cohort} đã tốt nghiệp đủ ${LCD_DEFINITIONS.length}/${LCD_DEFINITIONS.length} LCĐ — bấm để mở xác nhận xóa 2 bước`}
                              style={{
                                marginTop: 2,
                                padding: '2px 6px',
                                borderRadius: 5,
                                border: '1px solid var(--tint-red-border)',
                                background: 'var(--tint-red-bg)',
                                color: 'var(--status-red-text)',
                                fontWeight: 700,
                                fontSize: '0.66rem',
                                cursor: deletingCohort ? 'not-allowed' : 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {isDeleting ? 'Đang xóa...' : '✕ Xóa DS'}
                            </button>
                          ) : allChecked && !savedAllChecked ? (
                            <span
                              title="Bấm 'Lưu cấu hình' ở góc trên để lưu trạng thái tốt nghiệp trước khi xóa DS"
                              style={{
                                marginTop: 2,
                                padding: '2px 6px',
                                borderRadius: 5,
                                border: '1px solid var(--tint-amber-border)',
                                background: 'var(--tint-amber-bg)',
                                color: 'var(--status-amber-text)',
                                fontWeight: 700,
                                fontSize: '0.64rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {LCD_DEFINITIONS.length}/{LCD_DEFINITIONS.length} · Chưa lưu
                            </span>
                          ) : (
                            <span
                              title={`Chỉ được xóa DS sau khi toàn bộ ${LCD_DEFINITIONS.length} LCĐ khóa ${cohort} đã tốt nghiệp và được lưu`}
                              style={{
                                marginTop: 2,
                                padding: '2px 6px',
                                borderRadius: 5,
                                border: `1px solid ${graduatedCount > 0 ? 'var(--tint-amber-border)' : 'var(--border-color)'}`,
                                background: graduatedCount > 0 ? 'var(--tint-amber-bg)' : 'var(--bg-subtle)',
                                color: graduatedCount > 0 ? 'var(--status-amber-text)' : 'var(--text-subtle)',
                                fontWeight: 700,
                                fontSize: '0.65rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {graduatedCount}/{LCD_DEFINITIONS.length} TN
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {LCD_DEFINITIONS.map((lcd) => (
                  <tr key={lcd.code} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
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
                              border: `1px solid ${checked ? '#f59e0b' : 'var(--border-color)'}`,
                              background: checked ? 'var(--tint-amber-strong)' : 'var(--bg-surface)',
                              color: checked ? 'var(--status-amber-text)' : 'var(--text-subtle)',
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
                color: 'var(--text-muted)',
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
                    background: 'var(--bg-muted)',
                    border: '1px solid var(--border-strong)',
                    color: 'var(--text-body)',
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

      {deleteModalCohort && (() => {
        const expectedPhrase = `XOA ${deleteModalCohort}`;
        const normalizedTyped = deleteConfirmInput.trim().replace(/\s+/g, ' ').toUpperCase();
        const isConfirmMatched = normalizedTyped === expectedPhrase;
        const isSubmittingDelete = deletingCohort === deleteModalCohort;

        return (
          <div
            onClick={closeDeleteModal}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.58)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 16,
                width: '100%',
                maxWidth: 480,
                boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
                overflow: 'hidden',
                border: '1px solid var(--tint-red-border)',
              }}
            >
              {/* Header */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)',
                  color: '#ffffff',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>
                    Xóa toàn bộ sinh viên khóa {deleteModalCohort}
                  </h4>
                  <span
                    style={{
                      padding: '0.15rem 0.55rem',
                      borderRadius: 999,
                      background: 'rgba(255, 255, 255, 0.2)',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                    }}
                  >
                    Bước {deleteConfirmStep}/2
                  </span>
                </div>
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  disabled={Boolean(deletingCohort)}
                  aria-label="Đóng"
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    color: '#ffffff',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    cursor: deletingCohort ? 'not-allowed' : 'pointer',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '1.2rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {deleteConfirmStep === 1 ? (
                  <>
                    <div
                      style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: 10,
                        background: 'var(--tint-green-bg)',
                        border: '1px solid var(--tint-green-border)',
                        color: 'var(--status-green-text)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      ✓ Toàn bộ {LCD_DEFINITIONS.length}/{LCD_DEFINITIONS.length} Liên Chi Đoàn khóa {deleteModalCohort} đã tốt nghiệp và đã lưu cấu hình
                    </div>

                    <div
                      style={{
                        padding: '0.85rem 1rem',
                        borderRadius: 10,
                        background: 'var(--tint-red-bg)',
                        border: '1px solid var(--tint-red-border)',
                        color: 'var(--status-red-text)',
                        fontSize: '0.82rem',
                        lineHeight: 1.55,
                      }}
                    >
                      <div style={{ fontWeight: 800, marginBottom: '0.4rem', color: 'var(--status-red-text)' }}>
                        Vui lòng kiểm tra kỹ ảnh hưởng trước khi xóa:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <li>
                          Xóa toàn bộ hồ sơ sinh viên khóa <strong>{deleteModalCohort}</strong> khỏi <strong>Danh sách Sinh viên</strong> &amp; <strong>Tổng sinh viên</strong> toàn trường.
                        </li>
                        <li>
                          Gỡ bỏ các phân quyền BCH Chi đoàn &amp; đăng ký thông báo đẩy thuộc khóa <strong>{deleteModalCohort}</strong>.
                        </li>
                        <li>
                          <strong>Lịch sử điểm danh, đăng ký sự kiện và thống kê sự kiện cũ vẫn được bảo lưu nguyên vẹn.</strong>
                        </li>
                        <li>
                          <strong>Thao tác không thể hoàn tác trên giao diện.</strong>
                        </li>
                      </ul>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={closeDeleteModal}
                        style={{
                          padding: '0.5rem 0.95rem',
                          borderRadius: 9,
                          border: '1px solid var(--border-strong)',
                          background: 'var(--bg-subtle)',
                          color: 'var(--text-body)',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                        }}
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirmStep(2);
                          setDeleteConfirmInput('');
                        }}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: 9,
                          border: 'none',
                          background: '#dc2626',
                          color: '#ffffff',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                        }}
                      >
                        Tiếp tục xác nhận (Bước 2/2) →
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-body)', lineHeight: 1.5 }}>
                      Để chắc chắn không ấn nhầm, vui lòng nhập chính xác{' '}
                      <code
                        style={{
                          padding: '0.15rem 0.45rem',
                          borderRadius: 6,
                          background: 'var(--tint-red-bg)',
                          border: '1px solid var(--tint-red-border)',
                          color: 'var(--status-red-text)',
                          fontWeight: 800,
                        }}
                      >
                        {expectedPhrase}
                      </code>{' '}
                      vào ô bên dưới:
                    </div>

                    <div>
                      <input
                        type="text"
                        autoFocus
                        value={deleteConfirmInput}
                        disabled={isSubmittingDelete}
                        onChange={(e) => setDeleteConfirmInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && isConfirmMatched && !isSubmittingDelete) {
                            void handleConfirmDeleteCohort();
                          }
                        }}
                        placeholder={`Nhập ${expectedPhrase}`}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.62rem 0.85rem',
                          borderRadius: 10,
                          border: `2px solid ${isConfirmMatched ? '#16a34a' : 'var(--border-strong)'}`,
                          outline: 'none',
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          background: isSubmittingDelete ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                        }}
                      />
                      <div
                        style={{
                          marginTop: '0.35rem',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          color: isConfirmMatched ? 'var(--status-green-text)' : 'var(--text-muted)',
                        }}
                      >
                        {isConfirmMatched
                          ? '✓ Mã xác nhận hợp lệ'
                          : `Cần nhập chính xác: ${expectedPhrase}`}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        disabled={isSubmittingDelete}
                        onClick={() => setDeleteConfirmStep(1)}
                        style={{
                          padding: '0.5rem 0.9rem',
                          borderRadius: 9,
                          border: '1px solid var(--border-strong)',
                          background: 'var(--bg-subtle)',
                          color: 'var(--text-body)',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          cursor: isSubmittingDelete ? 'not-allowed' : 'pointer',
                        }}
                      >
                        ← Quay lại
                      </button>
                      <button
                        type="button"
                        disabled={!isConfirmMatched || isSubmittingDelete}
                        onClick={handleConfirmDeleteCohort}
                        style={{
                          padding: '0.52rem 1.05rem',
                          borderRadius: 9,
                          border: 'none',
                          background: isConfirmMatched && !isSubmittingDelete ? '#dc2626' : '#fca5a5',
                          color: '#ffffff',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          cursor: isConfirmMatched && !isSubmittingDelete ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {isSubmittingDelete
                          ? 'Đang xóa...'
                          : `Xác nhận XÓA DS khóa ${deleteModalCohort}`}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
