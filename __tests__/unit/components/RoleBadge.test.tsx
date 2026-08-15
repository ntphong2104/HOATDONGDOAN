import React from 'react';
import { render, screen } from '@testing-library/react';
import RoleBadge from '@/components/RoleBadge';

describe('Unit Tests: RoleBadge Component', () => {
  test('renders label for participant role', () => {
    render(<RoleBadge role="participant" />);
    expect(screen.getByText('Người tham gia')).toBeInTheDocument();
  });

  test('renders label for volunteer role', () => {
    render(<RoleBadge role="volunteer" />);
    expect(screen.getByText('Cộng tác viên')).toBeInTheDocument();
  });

  test('renders label for organizer role', () => {
    render(<RoleBadge role="organizer" />);
    expect(screen.getByText('Ban tổ chức')).toBeInTheDocument();
  });
});
