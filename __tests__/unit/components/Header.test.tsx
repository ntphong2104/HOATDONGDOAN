import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePathname, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/client';
import type { SessionUser } from '@/lib/types';

const mockBack = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signOut: jest.fn().mockResolvedValue(true),
    },
  })),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    back: mockBack,
  })),
  usePathname: jest.fn(() => '/'),
}));

describe('Header component branches', () => {
  beforeEach(() => {
    try {
      sessionStorage.clear();
    } catch {}
    window.history.replaceState({}, '', '/');
    (usePathname as jest.Mock).mockReturnValue('/');
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      back: mockBack,
    });
    mockBack.mockClear();
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({}),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders with sidebar toggle and back button', async () => {
    const onToggle = jest.fn();
    render(<Header showSidebarToggle={true} onToggleSidebar={onToggle} isSidebarOpen={true} showBack={true} backHref="/home" title="Custom Title" />);
    
    const menuBtn = screen.getByTitle('Ẩn Menu Quản Trị');
    await userEvent.click(menuBtn);
    expect(onToggle).toHaveBeenCalled();
    
    expect(screen.getByLabelText('Quay lại')).toHaveAttribute('href', '/home');
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });

  it('renders sidebar toggle when sidebar is closed', () => {
    render(<Header showSidebarToggle={true} isSidebarOpen={false} />);
    expect(screen.getByTitle('Hiện Menu Quản Trị')).toBeInTheDocument();
  });

  it('handles default logout', async () => {
    render(<Header />);
    
    // UserMenuDropdown is mocked or rendered. We need to trigger handleLogout
    // Instead of clicking UserMenuDropdown, we can test it if UserMenuDropdown calls the onLogout prop
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    const logoutBtn = screen.getByText('Đăng Xuất Khỏi Hệ Thống');
    await userEvent.click(logoutBtn);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', expect.any(Object));
    });
  });

  it('handles onLogout prop if provided', async () => {
    const onLogout = jest.fn();
    render(<Header onLogout={onLogout} />);
    
    const trigger = screen.getByTitle('Bấm để mở danh mục chức năng cá nhân');
    await userEvent.click(trigger);
    
    const logoutBtn = screen.getByText('Đăng Xuất Khỏi Hệ Thống');
    await userEvent.click(logoutBtn);
    
    expect(onLogout).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalledWith('/api/auth/logout', expect.any(Object));
  });

  it('renders default title when title prop is missing', () => {
    render(<Header />);
    expect(screen.getByText('HOẠT ĐỘNG ĐOÀN')).toBeInTheDocument();
  });

  it('Super Admin logo links to default overview tab, invokes callback, and shows back button on sub-tabs', async () => {
    const superAdminUser: SessionUser = {
      mssv: 'N22DCCN158',
      full_name: 'Nguyễn Thanh Phong',
      class_id: 'D22CQCN01-N',
      email: 'n22dccn158@student.ptithcm.edu.vn',
      tier: 'super_admin',
      isSuperAdmin: true,
      managed_events: [],
    };
    const onSelectTab = jest.fn();
    (usePathname as jest.Mock).mockReturnValue('/super-admin');
    window.history.replaceState({}, '', '/super-admin?tab=officers');

    render(
      <Header
        user={superAdminUser}
        activeSuperAdminTab="officers"
        onSelectSuperAdminTab={onSelectTab}
      />
    );

    const logoLink = screen.getByTitle('Về trang mặc định');
    expect(logoLink).toHaveAttribute('href', '/super-admin?tab=overview');
    await userEvent.click(logoLink);
    expect(onSelectTab).toHaveBeenCalledWith('overview');

    expect(screen.getByLabelText('Quay lại')).toBeInTheDocument();
  });

  it('auto-shows back button on subpages and calls router.back() when in-app history exists', async () => {
    const superAdminUser: SessionUser = {
      mssv: 'N22DCCN158',
      full_name: 'Nguyễn Thanh Phong',
      class_id: 'D22CQCN01-N',
      email: 'n22dccn158@student.ptithcm.edu.vn',
      tier: 'super_admin',
      isSuperAdmin: true,
      managed_events: [],
    };
    sessionStorage.setItem('hdd_nav_stack', JSON.stringify(['/super-admin?tab=overview', '/office/admin']));
    (usePathname as jest.Mock).mockReturnValue('/office/admin');
    window.history.replaceState({}, '', '/office/admin');

    render(<Header user={superAdminUser} />);

    const backBtn = screen.getByLabelText('Quay lại');
    expect(backBtn).toHaveAttribute('href', '/super-admin?tab=overview');
    await userEvent.click(backBtn);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('hides back button on default home page unless showBack={true}', () => {
    const studentUser: SessionUser = {
      mssv: 'N22DCCN001',
      full_name: 'Sinh Viên A',
      class_id: 'D22CQCN01-N',
      email: 'n22dccn001@student.ptithcm.edu.vn',
      tier: 'user',
      managed_events: [],
    };
    (usePathname as jest.Mock).mockReturnValue('/');
    window.history.replaceState({}, '', '/');

    const { unmount } = render(<Header user={studentUser} activeStudentTab="overview" />);
    expect(screen.queryByLabelText('Quay lại')).not.toBeInTheDocument();
    unmount();

    render(<Header showBack={true} backHref="/home" />);
    expect(screen.getByLabelText('Quay lại')).toHaveAttribute('href', '/home');
  });

  it('renders BCH Chi Đoàn link in sidebar when isClassDelegate is true and hides it otherwise', () => {
    (usePathname as jest.Mock).mockReturnValue('/');
    window.history.replaceState({}, '', '/');

    const delegateUser: SessionUser = {
      mssv: 'N22DCCN158',
      full_name: 'NGUYỄN THANH PHONG',
      class_id: 'D22CQCN02-N',
      email: 'n22dccn158@student.ptithcm.edu.vn',
      tier: 'user',
      isClassDelegate: true,
      delegate_class_id: 'D22CQCN02-N',
      delegate_days_left: 157,
      managed_events: [],
    };

    const { unmount } = render(<Header user={delegateUser} activeStudentTab="overview" />);
    const delegateLink = screen.getByRole('link', { name: /BCH Chi Đoàn \(D22CQCN02-N\)/i });
    expect(delegateLink).toHaveAttribute('href', '/?view=student&tab=delegate');
    unmount();

    render(
      <Header
        user={{ ...delegateUser, isClassDelegate: false, delegate_class_id: undefined }}
        activeStudentTab="overview"
      />
    );
    expect(screen.queryByRole('link', { name: /BCH Chi Đoàn/i })).not.toBeInTheDocument();
  });
});
