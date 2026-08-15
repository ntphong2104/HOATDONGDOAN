// Mock AudioContext for jsdom
const mockOscillator = {
  type: '',
  connect: jest.fn(),
  frequency: {
    setValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
  },
  start: jest.fn(),
  stop: jest.fn(),
};

const mockGainNode = {
  connect: jest.fn(),
  gain: {
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
  },
};

const mockAudioContext = {
  state: 'running',
  currentTime: 0,
  destination: {},
  resume: jest.fn(),
  createOscillator: jest.fn().mockReturnValue(mockOscillator),
  createGain: jest.fn().mockReturnValue(mockGainNode),
};

// Mock window.AudioContext
Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: jest.fn().mockImplementation(() => mockAudioContext),
});

import { audioService } from '@/lib/utils/audio';

describe('AudioService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAudioContext.state = 'running';
  });

  test('playSuccess creates oscillator with sine wave at 880Hz', () => {
    audioService.playSuccess();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockOscillator.type).toBe('sine');
    expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(880, 0);
    expect(mockOscillator.start).toHaveBeenCalled();
    expect(mockOscillator.stop).toHaveBeenCalled();
  });

  test('playError creates oscillator with sawtooth wave at 220Hz', () => {
    audioService.playError();
    expect(mockOscillator.type).toBe('sawtooth');
    expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(220, 0);
    expect(mockOscillator.frequency.exponentialRampToValueAtTime).toHaveBeenCalled();
  });

  test('playDuplicate creates oscillator with triangle wave at 440Hz', () => {
    audioService.playDuplicate();
    expect(mockOscillator.type).toBe('triangle');
    expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
  });

  test('resumes AudioContext when suspended', () => {
    // Reset the audio service internal state by creating a new context scenario
    mockAudioContext.state = 'suspended';
    audioService.playSuccess();
    expect(mockAudioContext.resume).toHaveBeenCalled();
  });

  test('handles error gracefully when AudioContext fails', () => {
    mockAudioContext.createOscillator.mockImplementationOnce(() => {
      throw new Error('Audio failed');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    // Should not throw
    expect(() => audioService.playSuccess()).not.toThrow();
    consoleSpy.mockRestore();
  });

  test('handles error in playError gracefully', () => {
    mockAudioContext.createOscillator.mockImplementationOnce(() => {
      throw new Error('Audio failed');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    expect(() => audioService.playError()).not.toThrow();
    consoleSpy.mockRestore();
  });

  test('handles error in playDuplicate gracefully', () => {
    mockAudioContext.createOscillator.mockImplementationOnce(() => {
      throw new Error('Audio failed');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    expect(() => audioService.playDuplicate()).not.toThrow();
    consoleSpy.mockRestore();
  });
});
