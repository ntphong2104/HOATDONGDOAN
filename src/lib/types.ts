// ═══════════════════════════════
// src/lib/types.ts — Shared Types
// ═══════════════════════════════

// ──── Database Entities ────
export interface User {
  mssv: string;
  email: string;
  full_name: string;
  class_id: string;
  created_at?: string;
}

export interface Event {
  event_id: string;
  event_name: string;
  event_date?: string;
  start_time?: string;
  end_time?: string;
  semester?: string;
  is_active?: boolean;
  is_registration_open?: boolean;
  status?: 'active' | 'closed' | 'pending' | 'rejected';
  created_by?: string;
  created_at?: string;
}

export interface EventRole {
  id: number;
  event_id: string;
  email: string;
  role_type: 'event_admin' | 'checker';
  created_at: string;
}

export interface CheckIn {
  id: number;
  mssv: string;
  event_id: string;
  participate_role: ParticipateRole;
  checked_by: string;
  created_at: string;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  email: string;
  mssv: string;
  full_name: string;
  class_id: string;
  role_type: 'participant' | 'volunteer';
  attended: boolean;
  created_at: string;
}

export interface UserPenalty {
  mssv: string;
  email: string;
  full_name: string;
  class_id: string;
  missed_count: number;
  is_blacklisted: boolean;
  blacklisted_at?: string;
  unbanned_at?: string;
  unbanned_by?: string;
  notes?: string;
  updated_at: string;
}

export interface UnitRating {
  id: string;
  event_id: string;
  proposal_id?: string;
  organization_unit: string;
  rater_email: string;
  rater_tier: 'youth_union' | 'ctsv' | 'facility' | 'super_admin';
  stars: number;
  feedback?: string;
  created_at: string;
}

export interface UnitRatingSummary {
  organization_unit: string;
  average_stars: number;
  total_reviews: number;
  has_low_rating_warning: boolean; // True if average <= 3 or recent review <= 3
  recent_low_ratings: UnitRating[];
}

// ──── Enums & Constants ────
export type ParticipateRole = 'participant' | 'volunteer' | 'organizer';

export const ROLE_LABELS: Record<ParticipateRole, string> = {
  participant: 'Người tham gia',
  volunteer: 'Cộng tác viên',
  organizer: 'Ban tổ chức',
};

export const ROLE_COLORS: Record<ParticipateRole, string> = {
  participant: 'var(--success-500)',
  volunteer: 'var(--warning-500)',
  organizer: 'var(--error-500)',
};

// ──── User Tier (Multi-Department RBAC) ────
export type UserTier =
  | 'user'
  | 'checker'
  | 'event_admin'
  | 'youth_union' // Đoàn Thanh Niên Học Viện
  | 'ctsv'        // Phòng Công Tác Sinh Viên
  | 'facility'    // Phòng Quản Trị CSVC & Thiết Bị
  | 'security'    // Tổ Bảo Vệ (Bàn Giao & Quản Lý Chìa Khóa Phòng)
  | 'super_admin';

export interface SessionUser {
  mssv: string;
  email: string;
  full_name: string;
  class_id: string;
  tier: UserTier;
  isSuperAdmin?: boolean;
  isEventAdmin?: boolean;
  isChecker?: boolean;
  isSecurity?: boolean;
  avatar_url?: string;
  unit_name?: string;
  unit_code?: string;
  managed_events: ManagedEvent[];
}

export interface ManagedEvent {
  event_id: string;
  event_name: string;
  role_type: 'event_admin' | 'checker';
  status?: string;
  is_active?: boolean;
  event_date?: string;
  start_time?: string;
  end_time?: string;
}

// ──── API Response Types ────
export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  message: string;
  details?: unknown;
  checked_at?: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ──── Check-in Request/Response ────
export interface CheckInRequest {
  mssv: string;
  event_id: string;
  participate_role: ParticipateRole;
}

export interface CheckInSuccessData {
  student: {
    mssv: string;
    full_name: string;
    class_id: string;
  };
  checkin_time: string;
}

// ──── History Item ────
export interface HistoryItem {
  event_name: string;
  event_date?: string;
  semester?: string;
  participate_role: ParticipateRole;
  checkin_time: string;
}

// ──── Event with count ────
export interface EventWithCount extends Event {
  checkin_count: number;
}

// ──── Room & Facility Management Entities ────
export interface Room {
  id: string;
  room_name: string;
  capacity: number;
  location?: string;
  is_available: boolean;
  created_at?: string;
}

// ──── Event Proposal & Multi-Stage Approval Entities ────
export type ProposalStage =
  | 'youth_union' // Bước 1: Đoàn TN Học viện
  | 'ctsv'        // Bước 2: Phòng CTSV (nếu > 50 người)
  | 'facility'    // Bước 3: Phòng Quản trị/Tổ chức (nếu mượn phòng)
  | 'super_admin' // Bước 4: Super Admin Đoàn Trường duyệt cuối
  | 'approved'    // Đã hoàn tất & Tự động tạo sự kiện
  | 'rejected';   // Bị từ chối

export type ProposalStatus = 'pending' | 'approved' | 'rejected';

export interface EventProposal {
  id: string;
  title: string;
  created_by: string;
  organization_unit?: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  start_datetime: string;
  end_datetime: string;
  participant_count: number;
  volunteer_count: number;
  organizer_count: number;
  total_count: number;
  room_id?: string | null;
  room_name: string;
  requires_ctsv_approval: boolean;
  requires_facility_approval: boolean;
  current_stage: ProposalStage;
  status: ProposalStatus;
  description?: string | null;
  plan_url?: string | null;
  key_status?: 'pending' | 'handed_over' | 'returned';
  key_handed_at?: string | null;
  key_handed_by?: string | null;
  key_returned_at?: string | null;
  key_returned_by?: string | null;
  created_event_id?: string | null;
  ratingSummary?: UnitRatingSummary;
  eventRatings?: UnitRating[];
  created_at: string;
  updated_at: string;
}

export interface ProposalLog {
  id: string;
  proposal_id: string;
  stage: ProposalStage;
  action: 'approved' | 'rejected' | 'comment';
  actor_email: string;
  actor_name?: string;
  notes?: string;
  created_at: string;
}
