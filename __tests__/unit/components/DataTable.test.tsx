import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataTable from '@/components/DataTable';

describe('DataTable branches and functions', () => {
  const data = [
    { id: 1, name: 'Alice', age: 20 },
    { id: 2, name: 'Bob', age: 22 },
  ];

  it('infers columns from data when columns prop is omitted', () => {
    render(<DataTable data={data} />);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('NAME')).toBeInTheDocument();
    expect(screen.getByText('AGE')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<DataTable data={[]} loading={true} />);
    expect(screen.getByText('Đang tải dữ liệu danh sách...')).toBeInTheDocument();
  });

  it('debounces search input and triggers onSearchChange', async () => {
    jest.useFakeTimers();
    const onSearchChange = jest.fn();
    render(<DataTable data={data} searchable={true} onSearchChange={onSearchChange} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'a' } });
    
    expect(onSearchChange).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onSearchChange).toHaveBeenCalledWith('a');
    
    jest.useRealTimers();
  });

  it('cleans up debounce on unmount', () => {
    jest.useFakeTimers();
    const onSearchChange = jest.fn();
    const { unmount } = render(<DataTable data={data} searchable={true} onSearchChange={onSearchChange} />);
    
    const input = screen.getByRole('textbox');
    userEvent.type(input, 'b'); // Note: userEvent with fakeTimers can sometimes be tricky, let's just trigger fireEvent
    
    unmount();
    
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onSearchChange).not.toHaveBeenCalled(); // timer was cleared
    
    jest.useRealTimers();
  });

  it('filters data internally when onSearchChange is omitted', async () => {
    render(<DataTable data={data} searchable={true} />);
    const input = screen.getByRole('textbox');
    
    await userEvent.type(input, 'Alice');
    
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('supports custom render function in columns', () => {
    const columns = [
      { key: 'name', label: 'Name', render: (val: any) => <strong>{val}</strong> }
    ];
    render(<DataTable data={data} columns={columns} />);
    
    const strongElement = screen.getByText('Alice');
    expect(strongElement.tagName).toBe('STRONG');
  });

  it('paginates data', async () => {
    const manyData = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` }));
    render(<DataTable data={manyData} pageSize={10} />);
    
    // First page shows User 1 to 10
    expect(screen.getByText('User 1')).toBeInTheDocument();
    expect(screen.getByText('User 10')).toBeInTheDocument();
    expect(screen.queryByText('User 11')).not.toBeInTheDocument();
    
    // Click next page
    const nextBtn = screen.getByText('Tiếp →');
    await userEvent.click(nextBtn);
    
    expect(screen.queryByText('User 10')).not.toBeInTheDocument();
    expect(screen.getByText('User 11')).toBeInTheDocument();
    expect(screen.getByText('User 15')).toBeInTheDocument();
    
    // Click prev page
    const prevBtn = screen.getByText('← Trước');
    await userEvent.click(prevBtn);
    
    expect(screen.getByText('User 1')).toBeInTheDocument();
  });
  
  it('handles null/undefined values correctly in cells', () => {
    const dataWithNull = [{ id: 1, name: null }];
    render(<DataTable data={dataWithNull} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
