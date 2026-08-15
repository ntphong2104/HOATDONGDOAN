import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaintenanceToggle from '@/components/MaintenanceToggle';

describe('MaintenanceToggle', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as jest.Mock;
    window.confirm = jest.fn();
    window.alert = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches initial state if props are missing', async () => {
    const mockData = { success: true, data: { maintenance_mode: true, maintenance_message: 'API message' } };
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockData)
    });

    render(<MaintenanceToggle />);
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('API message')).toBeInTheDocument();
    });
  });

  it('toggles state using default fetch behavior', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({}) });
    (window.confirm as jest.Mock).mockReturnValue(true);

    render(<MaintenanceToggle isEnabled={false} message="Initial" />);
    
    const switchBtn = screen.getByRole('switch');
    await userEvent.click(switchBtn);
    
    expect(window.confirm).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/maintenance', expect.objectContaining({ method: 'PATCH' }));
  });

  it('toggles off does not ask for confirmation', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({}) });

    render(<MaintenanceToggle isEnabled={true} message="Initial" />);
    
    const switchBtn = screen.getByRole('switch');
    await userEvent.click(switchBtn);
    
    expect(window.confirm).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/maintenance', expect.objectContaining({ method: 'PATCH' }));
  });

  it('cancels toggle on confirmation dialog', async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);

    render(<MaintenanceToggle isEnabled={false} />);
    const switchBtn = screen.getByRole('switch');
    await userEvent.click(switchBtn);
    
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows alert on toggle failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false }); // will throw
    (window.confirm as jest.Mock).mockReturnValue(true);

    render(<MaintenanceToggle isEnabled={false} />);
    const switchBtn = screen.getByRole('switch');
    await userEvent.click(switchBtn);
    
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Đã xảy ra lỗi khi cập nhật chế độ bảo trì');
    });
  });

  it('saves message using default fetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    render(<MaintenanceToggle isEnabled={true} message="Msg 1" />);
    
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'New Msg');
    
    const saveBtn = screen.getByText('Lưu lời nhắn');
    await userEvent.click(saveBtn);
    
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/maintenance', expect.objectContaining({
      body: JSON.stringify({ enabled: true, message: 'New Msg' })
    }));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Đã lưu lời nhắn bảo trì');
    });
  });

  it('shows alert on save message failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    render(<MaintenanceToggle isEnabled={true} message="Old" />);
    
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'X');
    
    const saveBtn = screen.getByText('Lưu lời nhắn');
    await userEvent.click(saveBtn);
    
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Đã xảy ra lỗi khi lưu lời nhắn');
    });
  });
});
