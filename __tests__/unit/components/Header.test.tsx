import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/client';

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
  })),
}));

describe('Header component branches', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({})
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
});
