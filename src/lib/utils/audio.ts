class AudioService {
  private ctx: AudioContext | null = null;

  private getAudioContextCtor(): typeof AudioContext | null {
    if (typeof window === 'undefined') return null;
    return window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null;
  }

  private initCtx() {
    const AudioCtx = this.getAudioContextCtor();
    if (!AudioCtx) return;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      Promise.resolve(this.ctx.resume()).catch(() => {});
    }
  }

  unlock() {
    try {
      this.initCtx();
    } catch {}
  }

  playSuccess() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      osc.type = 'sine';
      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.setValueAtTime(1760, this.ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.22);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.22);
    } catch (e) {
      console.error('Failed to play success sound', e);
    }
  }

  playError() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(130, this.ctx.currentTime + 0.35);
      gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.35);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);
    } catch (e) {
      console.error('Failed to play error sound', e);
    }
  }

  playDuplicate() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      osc.type = 'triangle';
      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.setValueAtTime(330, this.ctx.currentTime + 0.15);
      gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch (e) {
      console.error('Failed to play duplicate sound', e);
    }
  }
}

export const audioService = new AudioService();
