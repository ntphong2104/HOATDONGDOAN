// ════════════════════════════════════════════════════════════════
// src/lib/utils/blacklist-logic.ts — No-Show & Blacklist Utilities
// ════════════════════════════════════════════════════════════════


import { vnWallClockToDate } from './vn-date';

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

export interface ParsedPenaltyItem {
  id: string;
  raw: string;
  isPardoned: boolean;
  eventName: string;
  eventDate?: string;
  eventId?: string;
  pardonReason?: string;
  pardonedBy?: string;
  pardonedAt?: string;
}

/**
 * Parses the raw `user_penalties.notes` text into structured items,
 * differentiating active missed event strikes from pardoned strikes and admin notes.
 */
export function parsePenaltyNotes(notesStr?: string | null): ParsedPenaltyItem[] {
  if (!notesStr || !notesStr.trim()) return [];

  const rawSegments = notesStr
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return rawSegments.map((segment, idx) => {
    const isPardoned =
      segment.startsWith('[Đã miễn vắng:') ||
      segment.startsWith('[Đã mở khóa') ||
      segment.startsWith('[Đã xóa vi phạm:') ||
      segment.includes('Đã miễn vắng');

    let eventId: string | undefined;
    const eventIdMatch = segment.match(/\[([a-zA-Z0-9_-]{6,})\]/);
    if (eventIdMatch) {
      eventId = eventIdMatch[1];
    }

    if (isPardoned) {
      let eventName = 'Sự kiện đã miễn trừ';
      let eventDate: string | undefined;
      let pardonReason: string | undefined;
      let pardonedBy: string | undefined;
      let pardonedAt: string | undefined;

      const titleMatch = segment.match(/\[(?:Đã miễn vắng|Đã xóa vi phạm|Đã mở khóa)(?::\s*([^\]]+))?\]/i);
      if (titleMatch && titleMatch[1]) {
        const titleContent = titleMatch[1].trim();
        const dateMatch = titleContent.match(/^(.*?)\s*\(([^)]+)\)$/);
        if (dateMatch) {
          eventName = dateMatch[1].trim();
          eventDate = dateMatch[2].trim();
        } else {
          eventName = titleContent;
        }
      } else if (segment.startsWith('[Đã mở khóa')) {
        eventName = 'Mở khóa toàn bộ vi phạm';
      }

      const reasonMatch = segment.match(/Lý do:\s*([^(\[]+)/i);
      if (reasonMatch) {
        pardonReason = reasonMatch[1].trim();
      }

      const metaMatch = segment.match(/\(Bởi\s+([^\s)]+)(?:\s+lúc\s+([^)]+))?\)/i);
      if (metaMatch) {
        pardonedBy = metaMatch[1].trim();
        pardonedAt = metaMatch[2]?.trim();
      }

      return {
        id: `pardoned-${idx}-${eventId || idx}`,
        raw: segment,
        isPardoned: true,
        eventName,
        eventDate,
        eventId,
        pardonReason,
        pardonedBy,
        pardonedAt,
      };
    }

    const absentMatch = segment.match(/^(?:Vắng mặt tại sự kiện|Vắng mặt|Vắng):\s*(.*?)(?:\s*\[([a-zA-Z0-9_-]+)\])?$/i);
    if (absentMatch) {
      const mainTitle = absentMatch[1].trim();
      if (!eventId && absentMatch[2]) {
        eventId = absentMatch[2];
      }

      let eventName = mainTitle;
      let eventDate: string | undefined;
      const dateMatch = mainTitle.match(/^(.*?)\s*\(([^)]+)\)$/);
      if (dateMatch) {
        eventName = dateMatch[1].trim();
        eventDate = dateMatch[2].trim();
      }

      return {
        id: `absent-${idx}-${eventId || idx}`,
        raw: segment,
        isPardoned: false,
        eventName,
        eventDate,
        eventId,
      };
    }

    return {
      id: `note-${idx}`,
      raw: segment,
      isPardoned: false,
      eventName: segment,
      eventId,
    };
  });
}

/**
 * Checks whether a penalty notes string contains an active manual ban.
 * A manual ban is active if 'Khóa thủ công' appears and is not subsequently cleared
 * by '[Đã mở khóa]' or '[Đã mở khóa toàn bộ]'.
 */
export function hasActiveManualBan(notesStr?: string | null): boolean {
  if (!notesStr || !notesStr.trim()) return false;
  const lower = notesStr.toLowerCase();
  const lastManualBanIndex = lower.lastIndexOf('khóa thủ công');
  if (lastManualBanIndex === -1) return false;

  const lastUnlockIndex = Math.max(
    lower.lastIndexOf('[đã mở khóa]'),
    lower.lastIndexOf('[đã mở khóa toàn bộ]'),
    lower.lastIndexOf('[đã mở khóa')
  );

  return lastManualBanIndex > lastUnlockIndex;
}

/**
 * Checks whether a student's penalty notes string contains an active, unpardoned
 * strike specifically for the given targetEventId or targetEventName.
 */
export function hasActiveStrikeForEvent(
  notesStr?: string | null,
  targetEventId?: string,
  targetEventName?: string
): boolean {
  if (!notesStr || !notesStr.trim()) return false;
  const items = parsePenaltyNotes(notesStr);
  const cleanTargetName = targetEventName?.trim().toLowerCase();

  return items.some((item) => {
    if (item.isPardoned) return false;
    if (targetEventId && item.eventId && item.eventId === targetEventId) {
      return true;
    }
    if (targetEventId && item.raw.includes(`[${targetEventId}]`)) {
      return true;
    }
    if (
      cleanTargetName &&
      cleanTargetName.length >= 3 &&
      item.eventName &&
      item.eventName.toLowerCase().includes(cleanTargetName)
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Waives a single event absence strike in the notes text while retaining the [eventId] marker
 * so future automatic reconciliations do not re-penalize the student.
 */
export function pardonEventInNotes({
  notesStr,
  targetEventId,
  targetEventName,
  targetIndex,
  reason,
  adminEmail,
  nowFormatted,
}: {
  notesStr?: string | null;
  targetEventId?: string;
  targetEventName?: string;
  targetIndex?: number;
  reason?: string;
  adminEmail?: string;
  nowFormatted?: string;
}): string {
  if (!notesStr || !notesStr.trim()) return '';

  const rawSegments = notesStr
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const cleanReason = (reason || 'Miễn trừ theo quyết định của Ban Tổ Chức').trim();
  const timeStr = nowFormatted || new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const adminTag = adminEmail ? ` (Bởi ${adminEmail} lúc ${timeStr})` : ` (Lúc ${timeStr})`;

  const updatedSegments = rawSegments.map((segment, idx) => {
    const hasEventId = Boolean(targetEventId && segment.includes(`[${targetEventId}]`));
    const cleanTargetName = targetEventName?.trim().toLowerCase();
    const hasEventName = Boolean(cleanTargetName && cleanTargetName.length >= 3 && segment.toLowerCase().includes(cleanTargetName));
    const isTarget = hasEventId || hasEventName || (targetIndex !== undefined && targetIndex === idx);

    if (!isTarget) return segment;

    if (segment.startsWith('[Đã miễn vắng:') || segment.includes('Đã miễn vắng')) {
      return segment;
    }

    let nameAndDate = '';
    const absentMatch = segment.match(/^(?:Vắng mặt tại sự kiện|Vắng mặt|Vắng):\s*(.*?)(?:\s*\[([a-zA-Z0-9_-]+)\])?$/i);
    let eventIdTag = targetEventId ? ` [${targetEventId}]` : '';

    if (absentMatch) {
      nameAndDate = absentMatch[1].trim();
      if (!eventIdTag && absentMatch[2]) {
        eventIdTag = ` [${absentMatch[2]}]`;
      }
    } else {
      nameAndDate = segment.replace(/\[([a-zA-Z0-9_-]+)\]/, '').trim();
    }

    return `[Đã miễn vắng: ${nameAndDate}] Lý do: ${cleanReason}${adminTag}${eventIdTag}`;
  });

  return updatedSegments.join('; ');
}

/**
 * Pardons all active strikes for a student and records the admin note.
 */
export function pardonAllInNotes({
  notesStr,
  reason,
  adminEmail,
  nowFormatted,
}: {
  notesStr?: string | null;
  reason?: string;
  adminEmail?: string;
  nowFormatted?: string;
}): string {
  const cleanReason = (reason || 'Ban Tổ Chức mở khóa toàn bộ').trim();
  const timeStr = nowFormatted || new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const adminTag = adminEmail ? ` (Bởi ${adminEmail} lúc ${timeStr})` : ` (Lúc ${timeStr})`;

  if (!notesStr || !notesStr.trim()) {
    return `[Đã mở khóa toàn bộ] Lý do: ${cleanReason}${adminTag}`;
  }

  const rawSegments = notesStr
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  let pardonedCount = 0;
  const updatedSegments = rawSegments.map((segment) => {
    if (segment.startsWith('[Đã miễn vắng:') || segment.startsWith('[Đã mở khóa') || segment.includes('Đã miễn vắng')) {
      return segment;
    }
    pardonedCount++;
    const eventName = segment
      .replace(/^Vắng:\s*/i, '')
      .replace(/^Vắng mặt tại sự kiện:\s*/i, '')
      .replace(/^Vắng mặt:\s*/i, '');
    const eventIdMatch = segment.match(/\[([a-zA-Z0-9_-]+)\]/);
    const eventIdTag = eventIdMatch ? ` [${eventIdMatch[1]}]` : '';
    const nameWithoutId = eventName.replace(/\[([a-zA-Z0-9_-]+)\]/, '').trim();
    return `[Đã miễn vắng: ${nameWithoutId}] Lý do: ${cleanReason}${adminTag}${eventIdTag}`;
  });

  if (pardonedCount === 0) {
    updatedSegments.push(`[Đã mở khóa toàn bộ] Lý do: ${cleanReason}${adminTag}`);
  }

  return updatedSegments.join('; ');
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
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day) || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return { isOpen: true };
  }
  const eventStart = vnWallClockToDate(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  );

  if (!eventStart || isNaN(eventStart.getTime())) {
    return { isOpen: true };
  }

  // If organizer explicitly opened registration, keep it open!
  if (isRegistrationOpen === true) {
    return {
      isOpen: true,
      eventStartTime: eventStart,
    };
  }

  const now = new Date();

  // 3. Closes when event starts by default
  if (now > eventStart) {
    return {
      isOpen: false,
      eventStartTime: eventStart,
      reason: 'Sự kiện đã bắt đầu diễn ra hoặc đã kết thúc.',
    };
  }

  // 4. Auto-close 12 hours before event start by default
  const hoursDiff = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursDiff < 12) {
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

