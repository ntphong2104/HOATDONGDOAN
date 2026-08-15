import { handleSupabaseError } from '@/lib/utils/api-error';

describe('Unit Tests: handleSupabaseError', () => {
  test('translates code 23505 (Unique violation) to 409 Conflict', async () => {
    const pgError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const response = handleSupabaseError(pgError);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('23505');
    expect(body.message).toContain('Duplicate');
  });

  test('translates code 23503 (Foreign key violation) to 404 Not Found', async () => {
    const pgError = { code: '23503', message: 'insert or update on table violates foreign key constraint' };
    const response = handleSupabaseError(pgError);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('23503');
    expect(body.message).toContain('Không tìm thấy');
  });

  test('translates custom code P0003 (Event closed) to 403 Forbidden', async () => {
    const pgError = { code: 'P0003', message: 'Event is closed' };
    const response = handleSupabaseError(pgError);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('P0003');
    expect(body.message).toBe('Sự kiện đã đóng');
  });

  test('translates unknown error to 500 Internal Server Error with original message', async () => {
    const pgError = { code: '42P01', message: 'relation does not exist' };
    const response = handleSupabaseError(pgError);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('42P01');
    expect(body.message).toBe('relation does not exist');
  });

  test('handles null/undefined error gracefully with fallback defaults', async () => {
    const response = handleSupabaseError(null);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('UNKNOWN');
    expect(body.message).toBe('Lỗi hệ thống');
  });
});
