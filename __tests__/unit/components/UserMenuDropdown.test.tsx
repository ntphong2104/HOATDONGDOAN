import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserMenuDropdown from '@/components/UserMenuDropdown';
import { fetchMeCached, invalidateClientMeCache } from '@/lib/client/me-cache';
import { useRouter } from 'next/navigation';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signOut: jest.fn().mockResolvedValue(true),
    },
  })),
}));

describe('UserMenuDropdown', () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
    });
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({ success: true, data: { email: 'mock@example.com', full_name: 'Mock', tier: 'user' } })
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders default user and fetches data if no rich propUser provided', async () => {
    const mockData = { success: true, data: { email: 'test@example.com', full_name: 'Fetched User', tier: 'user' } };
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockData)
    });

    render(<UserMenuDropdown userName="Prop User" />);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/me');
    });
    
    // open dropdown
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    expect(screen.getAllByText('Fetched User').length).toBeGreaterThan(0);
  });

  it('uses propUser directly if rich user provided', async () => {
    const richUser = { tier: 'event_admin', full_name: 'Rich Admin', email: 'rich@example.com' };
    
    render(<UserMenuDropdown user={richUser as any} />);
    
    expect(global.fetch).not.toHaveBeenCalled();
    
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    expect(screen.getAllByText('Rich Admin').length).toBeGreaterThan(0);
    expect(screen.getByText('Admin Sự Kiện (LCĐ / CLB)')).toBeInTheDocument();
  });

  it('renders pure approver links (youth_union)', async () => {
    const user = { tier: 'youth_union', full_name: 'Approver', email: 'a@ex.com' };
    render(<UserMenuDropdown user={user as any} />);
    
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    expect(screen.getByText('Bàn Phê Duyệt Kế Hoạch')).toBeInTheDocument();
    expect(screen.queryByText('Trang Tổng Quan & Mã QR')).not.toBeInTheDocument();
  });

  it('renders super_admin links', async () => {
    const user = { tier: 'super_admin', full_name: 'Super', email: 's@ex.com' };
    render(<UserMenuDropdown user={user as any} />);
    
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    expect(screen.getByText('Bảng Quản Trị Toàn Trường')).toBeInTheDocument();
  });

  it('renders checker links', async () => {
    const user = { tier: 'checker', full_name: 'Checker', email: 'c@ex.com' };
    render(<UserMenuDropdown user={user as any} />);
    
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    expect(screen.getByText('Máy Quét Điểm Danh (Camera)')).toBeInTheDocument();
    expect(screen.getByText('Cổng Sinh Viên & Mã QR Cá Nhân')).toBeInTheDocument();
  });

  it('handles click outside', async () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <UserMenuDropdown userName="Test User" />
      </div>
    );
    
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    // Check if open by finding a text that only appears in dropdown
    expect(screen.getByText('Đăng Xuất Khỏi Hệ Thống')).toBeInTheDocument();
    
    const outside = screen.getByTestId('outside');
    await userEvent.click(outside);
    
    expect(screen.queryByText('Đăng Xuất Khỏi Hệ Thống')).not.toBeInTheDocument();
  });

  it('handles escape key', async () => {
    render(<UserMenuDropdown userName="Test User" />);
    
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    expect(screen.getByText('Đăng Xuất Khỏi Hệ Thống')).toBeInTheDocument();
    
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Đăng Xuất Khỏi Hệ Thống')).not.toBeInTheDocument();
  });

  it('handles logout with onLogout prop', async () => {
    const onLogout = jest.fn();
    render(<UserMenuDropdown userName="Test" onLogout={onLogout} />);
    
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    const logoutBtn = screen.getByText('Đăng Xuất Khỏi Hệ Thống');
    await userEvent.click(logoutBtn);
    
    expect(onLogout).toHaveBeenCalled();
  });

  it('handles default logout logic', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({})
    });

    render(<UserMenuDropdown userName="Test" />);
    
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    const logoutBtn = screen.getByText('Đăng Xuất Khỏi Hệ Thống');
    await userEvent.click(logoutBtn);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', expect.any(Object));
    });
  });

  it('renders badges correctly', async () => {
    const user = { tier: 'ctsv', full_name: 'CTSV User', email: 'c@ex.com', mssv: 'CTSV123' };
    render(<UserMenuDropdown user={user as any} />);
    
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    expect(screen.getByText('Phòng CTSV (Phê Duyệt)')).toBeInTheDocument();
    expect(screen.getByText('CTSV123')).toBeInTheDocument();
  });

  it('renders badges correctly for facility', async () => {
    const user = { tier: 'facility', full_name: 'Facility User', email: 'f@ex.com', mssv: 'PHONG-CSVC' };
    render(<UserMenuDropdown user={user as any} />);
    
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    expect(screen.getByText('Phòng. TC-HC-QT (Phê Duyệt)')).toBeInTheDocument();
    expect(screen.queryByText('PHONG-CSVC')).not.toBeInTheDocument(); // excluded
  });

  it('closes dropdown when clicking on navigation links', async () => {
    const user = { tier: 'super_admin', full_name: 'Admin Link', email: 'a@a.com' };
    render(<UserMenuDropdown user={user as any} />);
    
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    // click a link
    const link = screen.getByText('Bảng Quản Trị Toàn Trường');
    await userEvent.click(link);
    
    // dropdown should close
    expect(screen.queryByText('Đăng Xuất Khỏi Hệ Thống')).not.toBeInTheDocument();
  });

  it('renders Google avatar with referrerPolicy="no-referrer" and falls back to initial on image error', async () => {
    const avatarUrl = 'https://lh3.googleusercontent.com/a/test-photo=s96-c';
    const user = {
      tier: 'super_admin',
      full_name: 'NGUYỄN THANH PHONG',
      email: 'n22dccn158@student.ptithcm.edu.vn',
      avatar_url: avatarUrl,
    };

    render(<UserMenuDropdown user={user as any} />);

    // Trigger avatar <img> renders with referrerPolicy="no-referrer"
    const triggerImgs = screen.getAllByAltText('NGUYỄN THANH PHONG');
    expect(triggerImgs).toHaveLength(1);
    expect(triggerImgs[0]).toHaveAttribute('src', avatarUrl);
    expect(triggerImgs[0]).toHaveAttribute('referrerpolicy', 'no-referrer');

    // Opening dropdown renders large profile card <img> with referrerPolicy="no-referrer"
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);

    const allAvatarImgs = screen.getAllByAltText('NGUYỄN THANH PHONG');
    expect(allAvatarImgs).toHaveLength(2);
    for (const img of allAvatarImgs) {
      expect(img).toHaveAttribute('src', avatarUrl);
      expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    }

    // Failing to load Google avatar falls back to initial letter "N"
    fireEvent.error(allAvatarImgs[0]);
    expect(screen.queryAllByAltText('NGUYỄN THANH PHONG')).toHaveLength(0);
    expect(screen.getAllByText('N').length).toBeGreaterThanOrEqual(2);
  });

  it('does not poison global fetchMeCached cache when rendered with partial SSR propUser', async () => {
    invalidateClientMeCache();
    const partialSsrUser = {
      mssv: 'TO-BAOVE',
      tier: 'super_admin',
      full_name: 'Tổ Bảo Vệ (Quản Lý Chìa Khóa)',
      email: 'n22dccn158@student.ptithcm.edu.vn',
      managed_events: [],
    };
    const fullApiUser = {
      mssv: 'N22DCCN158',
      tier: 'super_admin',
      full_name: 'NGUYỄN THANH PHONG',
      email: 'n22dccn158@student.ptithcm.edu.vn',
      managed_events: [{ event_id: 'ev1', event_name: 'Sự kiện Live', status: 'active' }],
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ success: true, data: fullApiUser }),
    });

    render(<UserMenuDropdown user={partialSsrUser as any} />);
    expect(screen.getByText('Tổ Bảo Vệ (Quản Lý Chìa Khóa)')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    const cachedResult = await fetchMeCached();
    expect(global.fetch).toHaveBeenCalledWith('/api/me');
    expect(cachedResult.json.data).toEqual(fullApiUser);
  });
});
