// ════════════════════════════════════════════════════════════════
// src/lib/utils/blacklist-logic.ts — No-Show & Blacklist Utilities
// ════════════════════════════════════════════════════════════════

export const MAX_MISSED_STRIKES = 3;

export interface PenaltyEvaluation {
  isBlacklisted: boolean;
  missedCount: number;
  strikesLeft: number;
  statusLabel: string;
  badgeColor: string;
}

/**
 * Calculates current penalty standing and strikes left before blacklisting.
 */
export function evaluatePenaltyStanding(missedCount: number, manualBlacklist = false): PenaltyEvaluation {
  const effectiveMissed = Math.max(0, missedCount);
  const isBlacklisted = manualBlacklist || effectiveMissed >= MAX_MISSED_STRIKES;
  const strikesLeft = Math.max(0, MAX_MISSED_STRIKES - effectiveMissed);

  let statusLabel = 'Bình thường';
  let badgeColor = 'var(--success-500)';

  if (isBlacklisted) {
    statusLabel = 'Đã bị Blacklist (Khóa đăng ký)';
    badgeColor = 'var(--error-500)';
  } else if (effectiveMissed === 2) {
    statusLabel = 'Cảnh báo nguy cấp (Vắng 2/3 lần)';
    badgeColor = 'var(--error-500)';
  } else if (effectiveMissed === 1) {
    statusLabel = 'Cảnh báo nhẹ (Vắng 1/3 lần)';
    badgeColor = 'var(--warning-500)';
  }

  return {
    isBlacklisted,
    missedCount: effectiveMissed,
    strikesLeft,
    statusLabel,
    badgeColor,
  };
}

/**
 * Reconciles registrations against actual check-ins.
 * Returns array of attended students and absent students.
 */
export function reconcileAttendance(
  registrations: { mssv: string; email: string; full_name?: string; class_id?: string }[],
  checkIns: { mssv: string }[]
): {
  attended: { mssv: string; email: string }[];
  absent: { mssv: string; email: string; full_name?: string; class_id?: string }[];
} {
  const checkInSet = new Set(checkIns.map((c) => c.mssv.toUpperCase().trim()));

  const attended: { mssv: string; email: string }[] = [];
  const absent: { mssv: string; email: string; full_name?: string; class_id?: string }[] = [];

  for (const reg of registrations) {
    const cleanMssv = reg.mssv.toUpperCase().trim();
    if (checkInSet.has(cleanMssv)) {
      attended.push({ mssv: cleanMssv, email: reg.email });
    } else {
      absent.push({
        mssv: cleanMssv,
        email: reg.email,
        full_name: reg.full_name,
        class_id: reg.class_id,
      });
    }
  }

  return { attended, absent };
}

export const REGISTRATION_CUTOFF_HOURS = 12;

/**
 * Checks if the registration window is currently open (Registration is allowed until event starts, or unless closed manually by organizer).
 */
export function isRegistrationWindowOpen(
  eventDate?: string,
  startTime?: string,
  eventStatus?: string,
  isRegistrationOpen?: boolean | null
): {
  isOpen: boolean;
  eventStartTime?: Date;
  reason?: string;
} {
  // 1. Check if organizer manually toggled registration off
  if (isRegistrationOpen === false) {
    return {
      isOpen: false,
      reason: 'Ban tổ chức đã chủ động đóng cổng đăng ký cho sự kiện này.',
    };
  }

  // 2. Check if event is closed or rejected
  if (eventStatus === 'closed' || eventStatus === 'rejected') {
    return {
      isOpen: false,
      reason: 'Sự kiện đã kết thúc hoặc đã đóng.',
    };
  }

  if (!eventDate) {
    return { isOpen: true };
  }

  const cleanDate = eventDate.split('T')[0];
  const timeParts = (startTime || '07:30').slice(0, 5).split(':');
  const hours = parseInt(timeParts[0] || '7', 10);
  const minutes = parseInt(timeParts[1] || '30', 10);

  const dateParts = cleanDate.split('-').map(Number);
  if (dateParts.length < 3) {
    return { isOpen: true };
  }

  const [year, month, day] = dateParts;
  const eventStart = new Date(year, month - 1, day, hours, minutes, 0);

  if (isNaN(eventStart.getTime())) {
    return { isOpen: true };
  }

  const now = new Date();

  // 3. Closes when event starts
  if (now > eventStart) {
    return {
      isOpen: false,
      eventStartTime: eventStart,
      reason: 'Sự kiện đã bắt đầu diễn ra hoặc đã kết thúc.',
    };
  }

  // 4. Auto-close 12 hours before event start (unless organizer explicitly opened it with isRegistrationOpen === true)
  const hoursDiff = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (isRegistrationOpen !== true && hoursDiff < 12) {
    return {
      isOpen: false,
      eventStartTime: eventStart,
      reason: 'Cổng đăng ký đã tự động đóng (trước giờ khai mạc 12 tiếng). Ban tổ chức có thể mở lại thủ công.',
    };
  }

  return {
    isOpen: true,
    eventStartTime: eventStart,
  };
}
