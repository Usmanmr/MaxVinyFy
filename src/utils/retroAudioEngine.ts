import type { TrackItem } from './playerLogic';

class RetroAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private crackleNode: AudioNode | null = null;
  private crackleGain: GainNode | null = null;
  private stepTimer: number | null = null;
  private audioEl: HTMLAudioElement | null = null;

  private isPlaying = false;
  private activeTrackId = '';
  private currentPreset: TrackItem['synthPreset'] = 'midnight-synth';
  private bpm = 110;
  private playbackRate = 1.0;
  private volume = 0.8;
  private crackleAmount = 0.22;
  private stepCounter = 0;
  private lastPeakL = 0.08;
  private lastPeakR = 0.08;
  private fullStreamCache = new Map<string, string>();

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.setupVinylCrackle();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private setupVinylCrackle() {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const r = Math.random();
      if (r > 0.9985) {
        output[i] = (Math.random() * 2 - 1) * 0.65;
      } else {
        output[i] = (Math.random() * 2 - 1) * 0.015;
      }
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;
    whiteNoise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1850;
    filter.Q.value = 0.9;

    this.crackleGain = this.ctx.createGain();
    this.crackleGain.gain.value = 0;

    whiteNoise.connect(filter);
    filter.connect(this.crackleGain);
    this.crackleGain.connect(this.masterGain);
    whiteNoise.start(0);
    this.crackleNode = whiteNoise;
  }

  private ensureAudioElement(): HTMLAudioElement {
    if (!this.audioEl) {
      this.audioEl = new Audio();
      this.audioEl.preload = 'auto';
      // Never loop a short preview clip — play the full song from start to end
      this.audioEl.loop = false;
    }
    return this.audioEl;
  }

  private async resolveFullSongUrl(track: TrackItem): Promise<string | null> {
    if (this.fullStreamCache.has(track.id)) {
      return this.fullStreamCache.get(track.id)!;
    }
    try {
      const params = new URLSearchParams({
        title: track.title,
        artist: track.artist,
      });
      const res = await fetch(`/api/audio/full-track?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { streamUrl?: string };
        if (data.streamUrl) {
          this.fullStreamCache.set(track.id, data.streamUrl);
          return data.streamUrl;
        }
      }
    } catch {
      // ignore
    }
    return track.previewAudioUrl || null;
  }

  public startPlayback(track: TrackItem, rate = 1.0, seekTimeSec?: number) {
    if (!track || track.id === 'standby-empty' || track.durationSec <= 0) {
      return;
    }

    const isSameTrack = this.activeTrackId === track.id;
    this.activeTrackId = track.id;
    this.currentPreset = track.synthPreset;
    this.bpm = track.bpm || 110;
    this.playbackRate = rate;
    this.isPlaying = true;

    const ctx = this.ensureContext();
    if (ctx && this.crackleGain) {
      this.crackleGain.gain.setTargetAtTime(this.crackleAmount * 0.25, ctx.currentTime, 0.08);
    }

    const audio = this.ensureAudioElement();
    audio.loop = false;
    audio.playbackRate = Math.max(0.5, Math.min(2.0, this.playbackRate));
    audio.volume = this.volume;

    // If same track is already loaded in audioEl, resume or seek immediately
    if (isSameTrack && audio.src) {
      this.stopStepLoop();
      if (typeof seekTimeSec === 'number' && Number.isFinite(seekTimeSec)) {
        try {
          audio.currentTime = Math.max(0, seekTimeSec);
        } catch {
          // ignore if metadata not yet ready
        }
      }
      audio.play().catch(() => {
        this.startStepLoop();
      });
      return;
    }

    // Resolve full-length song stream so the entire track plays out without looping a 30s preview
    const requestTrackId = track.id;
    this.resolveFullSongUrl(track).then((streamUrl) => {
      if (!this.isPlaying || this.activeTrackId !== requestTrackId) return;
      if (streamUrl) {
        this.stopStepLoop();
        if (audio.src !== streamUrl) {
          audio.src = streamUrl;
        }
        audio.loop = false;
        audio.playbackRate = Math.max(0.5, Math.min(2.0, this.playbackRate));
        audio.volume = this.volume;

        const applyInitialSeek = () => {
          if (typeof seekTimeSec === 'number' && seekTimeSec > 0 && audio.duration > seekTimeSec) {
            try {
              audio.currentTime = seekTimeSec;
            } catch {
              // ignore
            }
          }
        };

        if (audio.readyState >= 1) {
          applyInitialSeek();
        } else {
          audio.addEventListener('loadedmetadata', applyInitialSeek, { once: true });
        }

        audio.play().catch(() => {
          this.startStepLoop();
        });
      } else {
        audio.pause();
        this.startStepLoop();
      }
    });
  }

  public seekTo(targetSec: number) {
    if (!Number.isFinite(targetSec) || targetSec < 0) return;
    if (this.audioEl && this.audioEl.src) {
      try {
        if (!Number.isFinite(this.audioEl.duration) || targetSec <= this.audioEl.duration) {
          this.audioEl.currentTime = targetSec;
        }
      } catch {
        // ignore
      }
    }
  }

  public getCurrentAudioTime(): number | null {
    if (this.audioEl && this.audioEl.src && !this.audioEl.paused && Number.isFinite(this.audioEl.currentTime)) {
      return this.audioEl.currentTime;
    }
    return null;
  }

  public pausePlayback() {
    this.isPlaying = false;
    this.stopStepLoop();
    if (this.audioEl) {
      this.audioEl.pause();
    }
    if (this.ctx && this.crackleGain) {
      this.crackleGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
    this.lastPeakL = 0.05;
    this.lastPeakR = 0.05;
  }

  public setPlaybackRate(rate: number) {
    this.playbackRate = rate;
    if (this.audioEl) {
      this.audioEl.playbackRate = Math.max(0.5, Math.min(2.0, rate));
    }
    if (this.isPlaying && (!this.audioEl || this.audioEl.paused)) {
      this.restartStepTimerInterval();
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
    }
    if (this.audioEl) {
      this.audioEl.volume = this.volume;
    }
  }

  public setCrackleLevel(level: number) {
    this.crackleAmount = Math.max(0, Math.min(1, level));
    if (this.ctx && this.crackleGain && this.isPlaying) {
      this.crackleGain.gain.setTargetAtTime(this.crackleAmount * 0.25, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Plays an authentic analog vinyl record scratch sound effect ("wicka-wicka" / backspin chirp).
   */
  public triggerVinylScratch(intensity: 'light' | 'classic' | 'backspin' = 'classic') {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const duration = intensity === 'backspin' ? 0.52 : intensity === 'classic' ? 0.34 : 0.18;

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const bandpass = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(950, now);
    bandpass.Q.value = 3.2;

    if (intensity === 'backspin') {
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.14);
      osc.frequency.exponentialRampToValueAtTime(210, now + 0.28);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.42);
      osc.frequency.exponentialRampToValueAtTime(130, now + duration);
    } else if (intensity === 'classic') {
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.22);
      osc.frequency.exponentialRampToValueAtTime(520, now + duration);
    } else {
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(580, now + duration * 0.6);
      osc.frequency.exponentialRampToValueAtTime(180, now + duration);
    }

    oscGain.gain.setValueAtTime(0.01, now);
    oscGain.gain.linearRampToValueAtTime(0.32, now + 0.03);
    oscGain.gain.exponentialRampToValueAtTime(0.008, now + duration);

    osc.connect(bandpass);
    bandpass.connect(oscGain);
    oscGain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration);

    const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / data.length) * Math.PI);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1200, now);
    noiseFilter.frequency.linearRampToValueAtTime(2600, now + duration * 0.5);
    noiseFilter.frequency.linearRampToValueAtTime(900, now + duration);
    noiseFilter.Q.value = 1.8;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.26, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);

    this.lastPeakL = 0.96;
    this.lastPeakR = 0.92;
  }

  public getVuLevels(): { left: number; right: number } {
    if (!this.isPlaying) {
      this.lastPeakL = Math.max(0.04, this.lastPeakL * 0.85);
      this.lastPeakR = Math.max(0.04, this.lastPeakR * 0.85);
      return { left: this.lastPeakL, right: this.lastPeakR };
    }
    const jitterL = (Math.random() - 0.48) * 0.14;
    const jitterR = (Math.random() - 0.48) * 0.14;
    this.lastPeakL = Math.max(0.22, Math.min(0.95, this.lastPeakL * 0.88 + 0.12 * 0.68 + jitterL));
    this.lastPeakR = Math.max(0.22, Math.min(0.95, this.lastPeakR * 0.88 + 0.12 * 0.65 + jitterR));
    return { left: this.lastPeakL, right: this.lastPeakR };
  }

  private startStepLoop() {
    this.stopStepLoop();
    const stepMs = Math.max(85, Math.floor((60000 / (this.bpm * this.playbackRate)) / 2));
    this.TriggerSynthStep(this.stepCounter++);
    this.stepTimer = window.setInterval(() => {
      if (!this.isPlaying) return;
      this.TriggerSynthStep(this.stepCounter++);
    }, stepMs);
  }

  private restartStepTimerInterval() {
    if (this.isPlaying && !this.audioEl?.src) {
      this.startStepLoop();
    }
  }

  private stopStepLoop() {
    if (this.stepTimer !== null) {
      clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
  }

  private TriggerSynthStep(step: number) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const stepInBar = step % 8;

    const bassNotes: Record<TrackItem['synthPreset'], number[]> = {
      'midnight-synth': [110, 110, 130.81, 130.81, 146.83, 146.83, 130.81, 98.0],
      'velvet-soul': [98.0, 110.0, 123.47, 146.83, 130.81, 123.47, 110.0, 98.0],
      'pacific-yacht': [130.81, 164.81, 146.83, 196.0, 174.61, 146.83, 164.81, 130.81],
      'cyber-electro': [82.41, 82.41, 110.0, 98.0, 123.47, 110.0, 82.41, 164.81],
      'classic-funk': [110.0, 138.59, 146.83, 164.81, 110.0, 196.0, 164.81, 146.83],
    };

    const chordNotes: Record<TrackItem['synthPreset'], number[]> = {
      'midnight-synth': [220, 261.63, 329.63, 392.0],
      'velvet-soul': [196, 246.94, 293.66, 369.99],
      'pacific-yacht': [261.63, 329.63, 392.0, 493.88],
      'cyber-electro': [164.81, 220.0, 246.94, 329.63],
      'classic-funk': [220.0, 277.18, 329.63, 392.0],
    };

    if (stepInBar === 0 || stepInBar === 4) {
      const kickOsc = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kickOsc.frequency.setValueAtTime(125, now);
      kickOsc.frequency.exponentialRampToValueAtTime(42, now + 0.14);
      kickGain.gain.setValueAtTime(0.28, now);
      kickGain.gain.exponentialRampToValueAtTime(0.005, now + 0.16);
      kickOsc.connect(kickGain);
      kickGain.connect(this.masterGain);
      kickOsc.start(now);
      kickOsc.stop(now + 0.17);
      this.lastPeakL = Math.min(0.95, this.lastPeakL + 0.18);
    }

    const bassFreq = (bassNotes[this.currentPreset]?.[stepInBar] || 110) * this.playbackRate;
    const bassOsc = ctx.createOscillator();
    const bassFilter = ctx.createBiquadFilter();
    const bassGain = ctx.createGain();

    bassOsc.type = this.currentPreset === 'velvet-soul' ? 'triangle' : 'sawtooth';
    bassOsc.frequency.setValueAtTime(bassFreq, now);
    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(620, now);
    bassFilter.frequency.exponentialRampToValueAtTime(220, now + 0.22);

    bassGain.gain.setValueAtTime(0.14, now);
    bassGain.gain.exponentialRampToValueAtTime(0.006, now + 0.24);

    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(this.masterGain);
    bassOsc.start(now);
    bassOsc.stop(now + 0.25);

    if (stepInBar === 2 || stepInBar === 6) {
      const notes = chordNotes[this.currentPreset] || chordNotes['midnight-synth'];
      notes.forEach((n, idx) => {
        const chordOsc = ctx.createOscillator();
        const chordGain = ctx.createGain();
        chordOsc.type = 'sine';
        chordOsc.frequency.setValueAtTime(n * this.playbackRate, now + idx * 0.012);
        chordGain.gain.setValueAtTime(0.045, now);
        chordGain.gain.exponentialRampToValueAtTime(0.002, now + 0.35);
        chordOsc.connect(chordGain);
        chordGain.connect(this.masterGain!);
        chordOsc.start(now + idx * 0.012);
        chordOsc.stop(now + 0.36);
      });
      this.lastPeakR = Math.min(0.95, this.lastPeakR + 0.16);
    }
  }
}

export const retroAudio = new RetroAudioEngine();
