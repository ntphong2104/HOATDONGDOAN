import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventBulkImportModal from '@/components/EventBulkImportModal';

// Mock fetch
global.fetch = jest.fn() as jest.Mock;

describe('EventBulkImportModal - Preview and Exclusion Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders modal when open and handles validation preview with warnings and deletions', async () => {
    const handleClose = jest.fn();
    const handleSuccess = jest.fn();

    // Mock validation response with 1 warning
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        success: true,
        total: 2,
        valid: 1,
        warnings_count: 1,
        rejected: 0,
        rejected_mssvs: [],
        summary: {
          total_valid: 2,
          already_checked_in: 0,
          in_file_duplicates: 0,
          not_in_system: 1,
          not_registered: 0,
          capacity: {
            max_participants: 0,
            current_count: 0,
            new_add_count: 2,
            projected_total: 2,
            remaining_slots: 0,
            is_overflow: false,
            overflow_count: 0,
          },
        },
        students: [
          {
            mssv: 'N21DCCN001',
            full_name: 'Nguyen Van A',
            class_id: 'D21CQCN01-N',
            in_system: true,
            is_registered: true,
            is_already_checked_in: false,
            is_duplicate_in_file: false,
            from_excel: false,
            warnings: [],
            badges: [{ type: 'success', text: 'Hợp lệ' }],
          },
          {
            mssv: 'N21DCCN999',
            full_name: 'N21DCCN999',
            class_id: 'PTIT-HCM',
            in_system: false,
            is_registered: false,
            is_already_checked_in: false,
            is_duplicate_in_file: false,
            from_excel: false,
            warnings: ['Chưa có trong hệ thống'],
            badges: [{ type: 'warning', text: 'Chưa có trong hệ thống' }],
          },
        ],
      }),
    });

    render(
      <EventBulkImportModal
        eventId="test-event-123"
        eventName="Sự kiện thử nghiệm"
        isOpen={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    // Type MSSVs
    const textarea = screen.getByPlaceholderText(/Dán danh sách MSSV vào đây/i);
    fireEvent.change(textarea, { target: { value: 'N21DCCN001\nN21DCCN999' } });

    // Submit for validation
    const submitBtn = screen.getByRole('button', { name: /Kiểm tra danh sách/i });
    fireEvent.click(submitBtn);

    // Wait for preview modal to appear
    await waitFor(() => {
      expect(screen.getByText(/Kiểm tra danh sách trước khi nạp/i)).toBeInTheDocument();
    });

    // Check that warning student is displayed
    expect(screen.getByText('N21DCCN999')).toBeInTheDocument();
    expect(screen.getByText('Chưa có trong hệ thống')).toBeInTheDocument();

    // Test filter tabs: "Cần lưu ý (1)"
    const warningTab = screen.getByRole('button', { name: /Cần lưu ý \(1\)/i });
    fireEvent.click(warningTab);
    expect(screen.getByText('N21DCCN999')).toBeInTheDocument();

    // Switch back to all
    const allTab = screen.getByRole('button', { name: /Tất cả \(2\)/i });
    fireEvent.click(allTab);

    // Test individual row deletion: Delete warning student
    const deleteBtn = screen.getByTitle('Xóa N21DCCN999');
    fireEvent.click(deleteBtn);

    // Now warnings_count should be 0 and N21DCCN999 removed
    await waitFor(() => {
      expect(screen.queryByText('N21DCCN999')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cần lưu ý \(0\)/i })).toBeInTheDocument();
    });
  });

  it('allows 1-click skip warnings to import only valid students', async () => {
    const handleClose = jest.fn();
    const handleSuccess = jest.fn();

    // Mock validation response
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          total: 2,
          valid: 1,
          warnings_count: 1,
          rejected: 0,
          rejected_mssvs: [],
          summary: {
            total_valid: 2,
            already_checked_in: 0,
            in_file_duplicates: 0,
            not_in_system: 1,
            not_registered: 0,
            capacity: {
              max_participants: 0,
              current_count: 0,
              new_add_count: 2,
              projected_total: 2,
              remaining_slots: 0,
              is_overflow: false,
              overflow_count: 0,
            },
          },
          students: [
            {
              mssv: 'N21DCCN001',
              full_name: 'Nguyen Van A',
              class_id: 'D21CQCN01-N',
              in_system: true,
              is_registered: true,
              is_already_checked_in: false,
              is_duplicate_in_file: false,
              from_excel: false,
              warnings: [],
              badges: [{ type: 'success', text: 'Hợp lệ' }],
            },
            {
              mssv: 'N21DCCN999',
              full_name: 'N21DCCN999',
              class_id: 'PTIT-HCM',
              in_system: false,
              is_registered: false,
              is_already_checked_in: false,
              is_duplicate_in_file: false,
              from_excel: false,
              warnings: ['Chưa có trong hồ sơ sinh viên'],
              badges: [{ type: 'warning', text: 'Chưa có trong hồ sơ sinh viên' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          count: 1,
          message: 'Đã nạp thành công 1 sinh viên!',
        }),
      });

    render(
      <EventBulkImportModal
        eventId="test-event-123"
        eventName="Sự kiện thử nghiệm"
        isOpen={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    const textarea = screen.getByPlaceholderText(/Dán danh sách MSSV vào đây/i);
    fireEvent.change(textarea, { target: { value: 'N21DCCN001\nN21DCCN999' } });

    const submitBtn = screen.getByRole('button', { name: /Kiểm tra danh sách/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Kiểm tra danh sách trước khi nạp/i)).toBeInTheDocument();
    });

    // Click "Loại bỏ tất cả cảnh báo" then confirm import of the 1 valid student
    const removeWarningsBtn = screen.getByRole('button', { name: /Loại bỏ tất cả cảnh báo/i });
    fireEvent.click(removeWarningsBtn);

    const confirmBtn = await screen.findByRole('button', { name: /Xác nhận nạp \(1 sinh viên\)/i });
    fireEvent.click(confirmBtn);

    // Verify import API call only contains valid MSSV
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const secondCallBody = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
      expect(secondCallBody.mssv_list).toEqual(['N21DCCN001']);
    });
  });
});
