import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatCard from '@/components/StatCard';
import EventSelector from '@/components/EventSelector';
import RoleSelector from '@/components/RoleSelector';
import InAppBrowserWarning from '@/components/InAppBrowserWarning';
import ScanResultOverlay from '@/components/ScanResultOverlay';

describe('Unit Tests: UI Components', () => {
  describe('StatCard', () => {
    test('renders title and numerical value', () => {
      render(<StatCard title="Tổng số sinh viên" value={7000} color="primary" />);
      expect(screen.getByText('Tổng số sinh viên')).toBeInTheDocument();
      expect(screen.getByText('7000')).toBeInTheDocument();
    });

    test('handles onClick callback when clicked', async () => {
      const handleClick = jest.fn();
      render(<StatCard title="Tổng sự kiện" value={10} onClick={handleClick} />);
      const card = screen.getByRole('button');
      await userEvent.click(card);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('EventSelector', () => {
    const mockEvents = [
      { event_id: 'e1', event_name: 'Ngày hội CN 2026' },
      { event_id: 'e2', event_name: 'Hiến máu tình nguyện' },
    ];

    test('renders dropdown options and handles selection change', async () => {
      const handleChange = jest.fn();
      render(
        <EventSelector
          events={mockEvents}
          selectedEventId="e1"
          onChange={handleChange}
        />
      );

      expect(screen.getByText('Ngày hội CN 2026')).toBeInTheDocument();
      expect(screen.getByText('Hiến máu tình nguyện')).toBeInTheDocument();

      const select = screen.getByRole('combobox');
      await userEvent.selectOptions(select, 'e2');
      expect(handleChange).toHaveBeenCalledWith('e2');
    });
  });

  describe('RoleSelector', () => {
    test('renders 3 roles and triggers change callback on selection', async () => {
      const handleChange = jest.fn();
      render(
        <RoleSelector
          selectedRole="participant"
          onChange={handleChange}
        />
      );

      const volunteerBtn = screen.getByText('CTV');
      await userEvent.click(volunteerBtn);
      expect(handleChange).toHaveBeenCalledWith('volunteer');
    });
  });

  describe('InAppBrowserWarning', () => {
    test('renders warning banner when Zalo user-agent is detected', () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Zalo/23.05.01 Mobile',
        configurable: true,
        writable: true,
      });

      render(<InAppBrowserWarning />);
      expect(screen.getByText(/Trình duyệt không hỗ trợ/i)).toBeInTheDocument();
      expect(screen.getByText(/Zalo/i)).toBeInTheDocument();
    });

    test('renders nothing when running on standard Safari/Chrome browser', () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
        configurable: true,
        writable: true,
      });

      const { container } = render(<InAppBrowserWarning />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('ScanResultOverlay', () => {
    test('renders success overlay with student details', () => {
      render(
        <ScanResultOverlay
          status="success"
          studentName="Nguyễn Văn An"
          studentClass="D22CQCN01-N"
          onDone={jest.fn()}
        />
      );

      expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument();
      expect(screen.getByText('Thành công')).toBeInTheDocument();
      expect(screen.getByText('D22CQCN01-N')).toBeInTheDocument();
    });

    test('renders duplicate error overlay with timestamp', () => {
      render(
        <ScanResultOverlay
          status="duplicate"
          checkedAt="2026-09-15T14:30:00Z"
          onDone={jest.fn()}
        />
      );

      expect(screen.getByRole('heading', { name: 'Đã điểm danh' })).toBeInTheDocument();
      expect(screen.getByText(/Đã điểm danh lúc:/i)).toBeInTheDocument();
    });

    test('renders idle state with no UI', () => {
      const { container } = render(
        <ScanResultOverlay status="idle" onDone={jest.fn()} />
      );
      expect(container.firstChild).toBeNull();
    });
  });
});
