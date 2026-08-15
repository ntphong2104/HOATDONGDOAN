import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/types';

export function handleSupabaseError(error: any): NextResponse<ApiError> {
  let status = 500;
  let message = 'Lỗi hệ thống';

  if (error?.code) {
    switch (error.code) {
      case '23505':
        status = 409;
        message = 'Dữ liệu đã tồn tại (Duplicate)';
        break;
      case '23503':
        status = 404;
        message = 'Không tìm thấy dữ liệu liên quan';
        break;
      case 'P0003': // Custom logic for event_closed maybe
        status = 403;
        message = 'Sự kiện đã đóng';
        break;
      default:
        message = error.message || message;
    }
  }

  return NextResponse.json(
    { success: false, error: error?.code || 'UNKNOWN', message, details: error },
    { status }
  );
}
