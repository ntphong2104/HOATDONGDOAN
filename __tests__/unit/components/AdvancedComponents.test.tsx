import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataTable from '@/components/DataTable';
import EventCard from '@/components/EventCard';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import Header from '@/components/Header';
import MaintenanceToggle from '@/components/MaintenanceToggle';

describe('Unit Tests: Additional UI Components', () => {
  describe('DataTable', () => {
    const columns = [
      { key: 'mssv', label: 'Mã SV' },
      { key: 'name', label: 'Họ Tên' },
      { key: 'role', label: 'Vai Trò' },
    ];

    const data = [
      { mssv: 'N22DCCN001', name: 'Nguyễn Văn An', role: 'Người tham gia' },
      { mssv: 'N22DCCN002', name: 'Trần Thị Bích', role: 'Cộng tác viên' },
    ];

    test('renders table headers and row contents', () => {
      render(<DataTable columns={columns} data={data} />);
      expect(screen.getByText('Mã SV')).toBeInTheDocument();
      expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument();
      expect(screen.getByText('Trần Thị Bích')).toBeInTheDocument();
    });

    test('filters rows based on search input', async () => {
      render(<DataTable columns={columns} data={data} searchable searchPlaceholder="Tìm..." />);
      const searchInput = screen.getByPlaceholderText('Tìm...');
      await userEvent.type(searchInput, 'Bích');
      expect(screen.queryByText('Nguyễn Văn An')).not.toBeInTheDocument();
      expect(screen.getByText('Trần Thị Bích')).toBeInTheDocument();
    });

    test('shows empty message when dataset is empty', () => {
      render(<DataTable columns={columns} data={[]} emptyMessage="Không có dữ liệu" />);
      expect(screen.getByText('Không có dữ liệu')).toBeInTheDocument();
    });
  });

  describe('EventCard', () => {
    const mockEvent: any = {
      event_id: 'ev-1',
      event_name: 'Ngày Hội Sinh Viên 2026',
      event_date: '2026-10-20',
      semester: '2026-2027-HK1',
      status: 'active',
      checkin_count: 142,
    };

    test('renders event details and active status', () => {
      render(<EventCard event={mockEvent} />);
      expect(screen.getByText('Ngày Hội Sinh Viên 2026')).toBeInTheDocument();
      expect(screen.getByText('20/10/2026')).toBeInTheDocument();
      expect(screen.getByText('Đang mở')).toBeInTheDocument();
      expect(screen.getByText('142')).toBeInTheDocument();
    });

    test('handles click events when onClick is provided', async () => {
      const handleClick = jest.fn();
      render(<EventCard event={mockEvent} onClick={handleClick} />);
      await userEvent.click(screen.getByText('Ngày Hội Sinh Viên 2026'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('QRCodeDisplay', () => {
    test('renders student information and monospace MSSV label', () => {
      render(
        <QRCodeDisplay
          value="N22DCCN001"
          studentName="Nguyễn Văn An"
          studentClass="D22CQCN01-N"
        />
      );
      expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument();
      expect(screen.getByText('D22CQCN01-N')).toBeInTheDocument();
      expect(screen.getByText('N22DCCN001')).toBeInTheDocument();
      expect(screen.getByText('Lưu ảnh QR')).toBeInTheDocument();
    });
  });

  describe('Header', () => {
    test('renders user name in user dropdown menu', () => {
      render(<Header userName="Nguyễn Văn An" />);
      expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument();
    });
  });

  describe('MaintenanceToggle', () => {
    test('renders toggle switch in disabled state', () => {
      render(
        <MaintenanceToggle
          isEnabled={false}
          message="Bảo trì chốt điểm"
          onToggle={jest.fn()}
        />
      );
      expect(screen.getByText('Chế độ bảo trì')).toBeInTheDocument();
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    });
  });
});
