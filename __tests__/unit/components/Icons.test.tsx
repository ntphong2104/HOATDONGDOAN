import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  LogoutIcon,
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  UserIcon,
  UsersIcon,
  QrCodeIcon,
  CameraFlipIcon,
  ScanCameraIcon,
  CheckIcon,
  CheckCircleIcon,
  CloseIcon,
  AlertTriangleIcon,
  LockIcon,
  ShieldCheckIcon,
  DownloadIcon,
  UploadCloudIcon,
  FileExcelIcon,
  FileTextIcon,
  SearchIcon,
  YouthUnionIcon,
  BadgeMedalIcon,
  CalendarIcon,
  ClockIcon,
  HistoryIcon,
  SettingsIcon,
  RefreshIcon,
  SpinnerIcon,
} from '@/components/icons';

describe('Unit Tests: Standard Icon Library (src/components/icons)', () => {
  test('renders icon with custom size and custom color', () => {
    const { container } = render(
      <QrCodeIcon size={36} color="#2563eb" className="custom-qr-icon" />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '36');
    expect(svg).toHaveAttribute('height', '36');
    expect(svg).toHaveAttribute('stroke', '#2563eb');
    expect(svg).toHaveClass('custom-qr-icon');
  });

  test('renders accessible title and img role when title prop is supplied', () => {
    render(<LogoutIcon title="Đăng xuất khỏi hệ thống" />);
    expect(screen.getByTitle('Đăng xuất khỏi hệ thống')).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  test('renders all standard icons without runtime errors', () => {
    const iconList = [
      LogoutIcon,
      ArrowLeftIcon,
      ChevronDownIcon,
      ChevronRightIcon,
      UserIcon,
      UsersIcon,
      QrCodeIcon,
      CameraFlipIcon,
      ScanCameraIcon,
      CheckIcon,
      CheckCircleIcon,
      CloseIcon,
      AlertTriangleIcon,
      LockIcon,
      ShieldCheckIcon,
      DownloadIcon,
      UploadCloudIcon,
      FileExcelIcon,
      FileTextIcon,
      SearchIcon,
      YouthUnionIcon,
      BadgeMedalIcon,
      CalendarIcon,
      ClockIcon,
      HistoryIcon,
      SettingsIcon,
      RefreshIcon,
      SpinnerIcon,
    ];

    iconList.forEach((IconComponent) => {
      const { container } = render(<IconComponent size={24} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
    });
  });
});
