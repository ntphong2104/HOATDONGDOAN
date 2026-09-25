import React from 'react';
import { render, screen, act } from '@testing-library/react';
import EventDetailPage from '@/app/admin/events/[id]/page';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'b75b8973-f5b0-4a86-aa89-e0af8e009cf2' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/events/b75b8973-f5b0-4a86-aa89-e0af8e009cf2',
}));

jest.mock('next/link', () => {
  return ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>;
});

describe('EventDetailPage render test', () => {
  it('renders without crashing during initial load', async () => {
    // Mock global.fetch
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              email: 'superadmin@student.ptithcm.edu.vn',
              full_name: 'Super Admin',
              tier: 'super_admin',
              isSuperAdmin: true,
            },
          }),
        });
      }
      if (url.includes('/sessions')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: { sessions: [] } }),
        });
      }
      if (url.includes('/checkins') || url.includes('/roles') || url.includes('/ratings')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: [] }),
        });
      }
      if (url.includes('/register')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: { allRegistrations: [] } }),
        });
      }
      // /api/events/[id]
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            event_id: 'b75b8973-f5b0-4a86-aa89-e0af8e009cf2',
            event_name: 'Trăng Hồng 2026',
            event_date: '2026-09-24',
            start_time: '07:30',
            end_time: '22:00',
            status: 'active',
            is_active: true,
            departments: [],
          },
        }),
      });
    }) as any;

    let rendered: any;
    await act(async () => {
      rendered = render(<EventDetailPage params={Promise.resolve({ id: 'b75b8973-f5b0-4a86-aa89-e0af8e009cf2' })} />);
    });

    expect(rendered.container).toBeTruthy();
    expect(screen.getByText(/Trăng Hồng 2026/i)).toBeInTheDocument();
  });

  it('renders without crashing when params is a plain object', async () => {
    let rendered: any;
    await act(async () => {
      rendered = render(<EventDetailPage params={{ id: 'b75b8973-f5b0-4a86-aa89-e0af8e009cf2' } as any} />);
    });

    expect(rendered.container).toBeTruthy();
    expect(screen.getByText(/Trăng Hồng 2026/i)).toBeInTheDocument();
  });

  it('opens bulk import modal when import button is clicked', async () => {
    let rendered: any;
    await act(async () => {
      rendered = render(<EventDetailPage params={{ id: 'b75b8973-f5b0-4a86-aa89-e0af8e009cf2' } as any} />);
    });

    const importBtn = screen.getByText(/Nạp danh sách MSSV/i);
    expect(importBtn).toBeInTheDocument();

    await act(async () => {
      importBtn.click();
    });

    expect(screen.getByText(/Nạp danh sách MSSV sự kiện/i)).toBeInTheDocument();
  });
});
