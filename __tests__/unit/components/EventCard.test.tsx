import React from 'react';
import { render, screen } from '@testing-library/react';
import EventCard from '@/components/EventCard';
import { isEventPastDeadline } from '@/lib/utils/event-logic';

jest.mock('@/lib/utils/event-logic', () => ({
  isEventPastDeadline: jest.fn(),
}));

describe('EventCard branches', () => {
  beforeEach(() => {
    (isEventPastDeadline as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders pending status', () => {
    render(<EventCard event={{ event_id: '1', event_name: 'Test', status: 'pending' }} />);
    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
  });

  it('renders rejected status', () => {
    render(<EventCard event={{ event_id: '1', event_name: 'Test', status: 'rejected' }} />);
    expect(screen.getByText('Từ chối')).toBeInTheDocument();
  });

  it('renders closed status if past deadline', () => {
    (isEventPastDeadline as jest.Mock).mockReturnValue(true);
    render(<EventCard event={{ event_id: '1', event_name: 'Test', status: 'active' }} />);
    expect(screen.getByText('Đã đóng')).toBeInTheDocument();
  });

  it('renders default date if event_date is missing', () => {
    render(<EventCard event={{ event_id: '1', event_name: 'Test' }} />);
    expect(screen.getByText('Hôm nay')).toBeInTheDocument();
  });

  it('renders time range if start and end time provided', () => {
    render(<EventCard event={{ event_id: '1', event_name: 'Test', start_time: '08:00:00', end_time: '10:00:00' }} />);
    expect(screen.getByText('08:00 - 10:00')).toBeInTheDocument();
  });

  it('renders start time only if end time missing', () => {
    render(<EventCard event={{ event_id: '1', event_name: 'Test', start_time: '08:00:00' }} />);
    expect(screen.getByText('08:00')).toBeInTheDocument();
  });

  it('renders created_by if provided', () => {
    render(<EventCard event={{ event_id: '1', event_name: 'Test', created_by: 'Club A' }} />);
    expect(screen.getByText('Club A')).toBeInTheDocument();
  });

  it('renders details text if checkin_count is undefined', () => {
    render(<EventCard event={{ event_id: '1', event_name: 'Test' }} />);
    expect(screen.getByText('Chi tiết →')).toBeInTheDocument();
  });
  
  it('renders card without click handler properly', () => {
    render(<EventCard event={{ event_id: '1', event_name: 'Test' }} />);
    const card = screen.getByText('Test').closest('div')?.parentElement?.parentElement;
    expect(card).not.toHaveClass('clickable');
    expect(card).not.toHaveAttribute('role', 'button');
    expect(card).not.toHaveAttribute('tabIndex', '0');
  });
});
