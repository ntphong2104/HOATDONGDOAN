import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatCard from '@/components/StatCard';

describe('StatCard branches', () => {
  it('handles keyboard enter and space for onClick', async () => {
    const onClick = jest.fn();
    render(<StatCard title="Test" value="100" onClick={onClick} />);
    
    const card = screen.getByRole('button');
    card.focus();
    
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
    
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not trigger onClick if loading', async () => {
    const onClick = jest.fn();
    render(<StatCard title="Test" value="100" onClick={onClick} loading={true} subtitle="Sub" />);
    
    // No role='button' when loading
    const card = screen.getByText('Test').closest('div')?.parentElement;
    
    if (card) {
      await userEvent.click(card);
    }
    expect(onClick).not.toHaveBeenCalled();
    // Skeleton renders
    expect(screen.queryByText('100')).not.toBeInTheDocument();
  });

  it('renders active state and specific type', () => {
    render(<StatCard title="Test" value="100" type="success" isActive={true} subtitle="Sub text" icon={<span>Icon</span>} />);
    
    const card = screen.getByText('Test').closest('div')?.parentElement;
    expect(card).toHaveClass('active');
    expect(card).toHaveClass('success');
    expect(screen.getByText('Sub text')).toBeInTheDocument();
    expect(screen.getByText('Icon')).toBeInTheDocument();
  });
});
