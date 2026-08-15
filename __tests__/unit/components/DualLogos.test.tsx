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

  it('handles image fallback onError for PTIT logo', () => {
    render(<DualLogos />);
    const ptitImage = screen.getByAltText('Logo PTIT');
    
    // Simulate error
    fireEvent.error(ptitImage, { currentTarget: ptitImage });
    
    expect(ptitImage).toHaveAttribute('src', '/logos/logo-ptit.svg');
  });

  it('handles image fallback onError for Doan logo', () => {
    render(<DualLogos />);
    const doanImage = screen.getByAltText('Logo Đoàn TNCS Hồ Chí Minh');
    
    // Simulate error
    fireEvent.error(doanImage, { currentTarget: doanImage });
    
    expect(doanImage).toHaveAttribute('src', '/logos/logo-doan.svg');
  });

  it('does not fallback if not .png', () => {
    render(<DualLogos />);
    const doanImage = screen.getByAltText('Logo Đoàn TNCS Hồ Chí Minh');
    
    // Initially .png, let's set it to .svg manually to test the condition
    (doanImage as HTMLImageElement).src = '/logos/logo-doan.svg';
    
    // Simulate error
    fireEvent.error(doanImage, { currentTarget: doanImage });
    
    // should remain .svg (it doesn't replace it if not endsWith .png)
    expect(doanImage.getAttribute('src')).toBe('/logos/logo-doan.svg');
  });
});
