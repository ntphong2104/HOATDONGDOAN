'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './ProfileCompletionGate.module.css';

type MissingField = 'full_name' | 'class_id';

// Pages where the gate must never appear
const EXCLUDED_PREFIXES = ['/login', '/auth', '/maintenance'];

/**
 * Forces a logged-in student whose profile still has placeholder values
 * (name = MSSV / class = PTIT-HCM, typically from MSSV-only imports) to enter
 * their real name and class before continuing. Saved via PATCH /api/me.
 */
export default function ProfileCompletionGate() {
  const pathname = usePathname();
  const [missing, setMissing] = useState<MissingField[]>([]);
  const [mssv, setMssv] = useState('');
  const [fullName, setFullName] = useState('');
  const [classId, setClassId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [checkedFor, setCheckedFor] = useState<'none' | 'guest' | 'user'>('none');

  const excluded = EXCLUDED_PREFIXES.some((p) => (pathname || '').startsWith(p));

  useEffect(() => {
    if (excluded) return;
    // Re-check on navigation only while we haven't found a logged-in user yet
    // (e.g. student logs in via One Tap without a full page reload).
    if (checkedFor === 'user') return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok) {
          if (!cancelled) setCheckedFor('guest');
          return;
        }
        const json = await res.json();
        const u = json?.data;
        if (cancelled || !u) return;
        setCheckedFor('user');
        const fields: MissingField[] = Array.isArray(u.profile_missing_fields)
          ? u.profile_missing_fields
          : u.profile_incomplete
          ? ['full_name', 'class_id']
          : [];
        if (fields.length > 0) {
          setMssv(u.mssv || '');
          setMissing(fields);
        }
      } catch {
        if (!cancelled) setCheckedFor('guest');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, excluded, checkedFor]);

  if (excluded || missing.length === 0) return null;

  const needName = missing.includes('full_name');
  const needClass = missing.includes('class_id');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const name = fullName.trim().replace(/\s+/g, ' ');
    const cls = classId.trim().toUpperCase().replace(/\s+/g, '');
    if (needName && name.split(' ').length < 2) {
      setError('Vui lòng nhập đầy đủ họ và tên.');
      return;
    }
    if (needClass && !/^[A-Z]\d{2}[A-Z0-9-]{2,15}$/.test(cls)) {
      setError('Mã lớp chưa đúng định dạng (ví dụ: D25CQMR02-N).');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (needName) body.full_name = name;
      if (needClass) body.class_id = cls;
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        setError(json?.error || 'Không lưu được thông tin, vui lòng thử lại.');
        return;
      }
      setMissing([]);
      // Reload so every screen picks up the real name/class
      window.location.reload();
    } catch {
      setError('Lỗi kết nối, vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="profile-gate-title">
      <form className={styles.card} onSubmit={handleSubmit}>
        <h2 id="profile-gate-title" className={styles.title}>Cập nhật thông tin cá nhân</h2>
        <p className={styles.desc}>
          Hệ thống chưa có {needName && needClass ? 'họ tên và lớp' : needName ? 'họ tên' : 'lớp'} của bạn
          {mssv ? <> (MSSV <b>{mssv}</b>)</> : null}. Vui lòng nhập để Ban tổ chức ghi nhận điểm danh và minh chứng
          chính xác.
        </p>

        {needName && (
          <label className={styles.field}>
            <span className={styles.label}>Họ và tên</span>
            <input
              className={styles.input}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="VD: Nguyễn Văn An"
              autoComplete="name"
              maxLength={60}
              required
              autoFocus
            />
          </label>
        )}

        {needClass && (
          <label className={styles.field}>
            <span className={styles.label}>Lớp</span>
            <input
              className={styles.input}
              value={classId}
              onChange={(e) => setClassId(e.target.value.toUpperCase())}
              placeholder="VD: D25CQMR02-N"
              autoCapitalize="characters"
              maxLength={20}
              required
              autoFocus={!needName}
            />
          </label>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" className={styles.submit} disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu thông tin'}
        </button>
        <p className={styles.note}>Sau khi lưu, chỉ Đoàn trường mới chỉnh sửa được thông tin này.</p>
      </form>
    </div>
  );
}
