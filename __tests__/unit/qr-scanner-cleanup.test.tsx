import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import QRScanner from '@/components/QRScanner';

const mockStop = jest.fn(async () => {});
const mockClear = jest.fn();
let mockStartImpl: (
  elementId: string
) => Promise<void>;

jest.mock('html5-qrcode', () => ({
  Html5Qrcode: jest.fn().mockImplementation((elementId: string) => ({
    isScanning: true,
    start: jest.fn(() => mockStartImpl(elementId)),
    stop: mockStop,
    clear: mockClear,
    scanFile: jest.fn(),
  })),
}));

function createMockStream() {
  const stop = jest.fn();
  const track: any = {
    enabled: true,
    stop,
    getCapabilities: () => ({}),
    applyConstraints: jest.fn(async () => {}),
  };
  const stream: any = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    removeTrack: jest.fn(),
  };
  return { stream, track, stop };
}

describe('Unit Tests: QRScanner hardware camera cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('stops tracks and clears video.srcObject + load() immediately on unmount', async () => {
    const { stream, track, stop } = createMockStream();
    let attachedVideo: HTMLVideoElement | null = null;
    const pauseSpy = jest.fn();
    const loadSpy = jest.fn();

    mockStartImpl = async (elementId: string) => {
      const container = document.getElementById(elementId)!;
      const video = document.createElement('video');
      Object.defineProperty(video, 'srcObject', {
        writable: true,
        configurable: true,
        value: stream,
      });
      video.pause = pauseSpy;
      video.load = loadSpy;
      container.appendChild(video);
      attachedVideo = video;
    };

    const { unmount } = render(<QRScanner onScanSuccess={jest.fn()} />);

    await waitFor(() => {
      expect(attachedVideo).not.toBeNull();
    });

    unmount();

    await waitFor(() => {
      expect(stop).toHaveBeenCalled();
      expect(track.enabled).toBe(false);
      expect(pauseSpy).toHaveBeenCalled();
      expect(loadSpy).toHaveBeenCalled();
      expect((attachedVideo as any).srcObject).toBeNull();
      expect(mockStop).toHaveBeenCalled();
    });
  });

  test('stops mid-flight getUserMedia MediaStream even if it resolves after unmount', async () => {
    const { stream, stop } = createMockStream();
    let resolveGUM!: (s: MediaStream) => void;
    const gumPromise = new Promise<MediaStream>((resolve) => {
      resolveGUM = resolve;
    });

    const mockGetUserMedia = jest.fn(() => gumPromise);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      writable: true,
      value: { getUserMedia: mockGetUserMedia },
    });

    mockStartImpl = async () => {
      await navigator.mediaDevices.getUserMedia({ video: true });
    };

    const { unmount } = render(<QRScanner onScanSuccess={jest.fn()} />);

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalled();
    });

    // User navigates away BEFORE getUserMedia finishes opening the webcam
    unmount();
    expect(stop).not.toHaveBeenCalled();

    // Now the browser resolves getUserMedia late
    await act(async () => {
      resolveGUM(stream);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(stop).toHaveBeenCalled();
    });
  });
});
