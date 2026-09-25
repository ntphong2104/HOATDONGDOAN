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
        students: [
          { mssv: 'N21DCCN001', full_name: 'Nguyen Van A', class_id: 'D21CQCN01-N', in_system: true, from_excel: false, warnings: [] },
          { mssv: 'N21DCCN999', full_name: 'N21DCCN999', class_id: 'PTIT-HCM', in_system: false, from_excel: false, warnings: ['Chưa có trong hệ thống'] },
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
    const submitBtn = screen.getByRole('button', { name: /Xác nhận nạp/i });
    fireEvent.click(submitBtn);

    // Wait for preview modal to appear
    await waitFor(() => {
      expect(screen.getByText(/⚠️ Kiểm tra trước khi nạp/i)).toBeInTheDocument();
    });

    // Check that warning student is displayed
    expect(screen.getByText('N21DCCN999')).toBeInTheDocument();
    expect(screen.getByText('Chưa có trong hệ thống')).toBeInTheDocument();

    // Test filter tabs: "Chỉ xem cảnh báo (1)"
    const warningTab = screen.getByRole('button', { name: /Chỉ xem cảnh báo \(1\)/i });
    fireEvent.click(warningTab);
    expect(screen.getByText('N21DCCN999')).toBeInTheDocument();

    // Switch back to all
    const allTab = screen.getByRole('button', { name: /Tất cả \(2\)/i });
    fireEvent.click(allTab);

    // Test individual row deletion: Delete warning student
    const deleteButtons = screen.getAllByRole('button', { name: /Xóa/i });
    // Find the one for N21DCCN999 and click it
    fireEvent.click(deleteButtons[1]);

    // Now warnings_count should be 0, header changes to "Danh sách hợp lệ"
    await waitFor(() => {
      expect(screen.getByText(/Danh sách hợp lệ/i)).toBeInTheDocument();
      expect(screen.queryByText('N21DCCN999')).not.toBeInTheDocument();
      expect(screen.getByText(/Tất cả sinh viên đã sẵn sàng nạp/i)).toBeInTheDocument();
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
          students: [
            { mssv: 'N21DCCN001', full_name: 'Nguyen Van A', class_id: 'D21CQCN01-N', in_system: true, from_excel: false, warnings: [] },
            { mssv: 'N21DCCN999', full_name: 'N21DCCN999', class_id: 'PTIT-HCM', in_system: false, from_excel: false, warnings: ['Chưa có trong hồ sơ sinh viên'] },
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

    const submitBtn = screen.getByRole('button', { name: /Xác nhận nạp/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/⚠️ Kiểm tra trước khi nạp/i)).toBeInTheDocument();
    });

    // Click "✓ Bỏ lỗi & Nạp 1 SV hợp lệ"
    const skipErrorBtn = screen.getByRole('button', { name: /Bỏ lỗi & Nạp 1 SV hợp lệ/i });
    fireEvent.click(skipErrorBtn);

    // Verify import API call only contains valid MSSV
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const secondCallBody = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
      expect(secondCallBody.mssv_list).toEqual(['N21DCCN001']);
    });
  });
});
