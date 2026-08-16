import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DualLogos from '@/components/DualLogos';

describe('DualLogos', () => {
  it('renders small size', () => {
    render(<DualLogos size="sm" />);
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('width', '28');
  });

  it('renders large size', () => {
    render(<DualLogos size="lg" />);
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('width', '52');
  });

  it('shows text', () => {
    render(<DualLogos showText={true} />);
    expect(screen.getByText('HỌC VIỆN CÔNG NGHỆ BƯU CHÍNH VIỄN THÔNG')).toBeInTheDocument();
  });

  it('renders alt texts properly for accessibility', () => {
    render(<DualLogos />);
    expect(screen.getByAltText(/Logo Học viện Công nghệ Bưu chính Viễn thông/i)).toBeInTheDocument();
    expect(screen.getByAltText(/Logo Đoàn TNCS Hồ Chí Minh/i)).toBeInTheDocument();
  });
});
