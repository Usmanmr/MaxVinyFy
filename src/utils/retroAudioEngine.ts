import type { TrackItem } from './playerLogic';

type SynthPreset = 'midnight-synth' | 'velvet-soul' | 'pacific-yacht' | 'cyber-electro' | 'classic-funk';

interface PresetConfig {
  progression: number[][];
  bassNotes: number[];
  leadNotes: number[];
  waveType: OscillatorType;
  leadWave: OscillatorType;
  filterCutoff: number;
}

const PRESETS: Record<SynthPreset, PresetConfig> = {
  'midnight-synth': {
    progression: [
      [220.0, 261.63, 329.63, 392.0],
      [174.61, 220.0, 261.63, 349.23],
      [130.81, 164.81, 196.0, 261.63],
      [196.0, 246.94, 293.66, 392.0],
    ],
    bassNotes: [110.0, 110.0, 87.31, 87.31, 65.41, 65.41, 98.0, 98.0],
    leadNotes: [440.0, 523.25, 659.25, 587.33, 523.25, 392.0, 440.0, 329.63],
    waveType: 'sawtooth',
    leadWave: 'triangle',
    filterCutoff: 1900,
  },
  'velvet-soul': {
    progression: [
      [196.0, 233.08, 293.66, 349.23],
      [130.81, 155.56, 196.0, 233.08],
      [174.61, 207.65, 261.63, 311.13],
      [146.83, 185.0, 220.0, 261.63],
    ],
    bassNotes: [98.0, 98.0, 65.41, 65.41, 87.31, 87.31, 73.42, 73.42],
    leadNotes: [392.0, 466.16, 587.33, 523.25, 466.16, 392.0, 349.23, 293.66],
    waveType: 'triangle',
    leadWave: 'sine',
    filterCutoff: 1400,
  },
  'pacific-yacht': {
    progression: [
      [261.63, 329.63, 392.0, 493.88],
      [220.0, 261.63, 329.63, 392.0],
      [146.83, 174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66, 349.23],
    ],
    bassNotes: [130.81, 130.81, 110.0, 110.0, 73.42, 73.42, 98.0, 98.0],
    leadNotes: [523.25, 659.25, 587.33, 493.88, 523.25, 392.0, 329.63, 293.66],
    waveType: 'sine',
    leadWave: 'triangle',
    filterCutoff: 1650,
  },
  'cyber-electro': {
    progression: [
      [164.81, 196.0, 246.94, 293.66],
      [130.81, 164.81, 196.0, 246.94],
      [146.83, 185.0, 220.0, 293.66],
      [123.47, 146.83, 185.0, 220.0],
    ],
    bassNotes: [82.41, 82.41, 65.41, 65.41, 73.42, 73.42, 61.74, 61.74],
    leadNotes: [329.63, 392.0, 493.88, 587.33, 493.88, 392.0, 369.99, 329.63],
    waveType: 'sawtooth',
    leadWave: 'square',
    filterCutoff: 2400,
  },
  'classic-funk': {
    progression: [
      [146.83, 174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66, 349.23],
      [146.83, 174.61, 220.0, 261.63],
      [164.81, 207.65, 246.94, 293.66],
    ],
    bassNotes: [73.42, 73.42, 98.0, 98.0, 73.42, 87.31, 82.41, 98.0],
    leadNotes: [293.66, 349.23, 440.0, 523.25, 440.0, 392.0, 349.23, 293.66],
    waveType: 'sawtooth',
    leadWave: 'sawtooth',
    filterCutoff: 2100,
  },
};

export class RetroAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private synthGain: GainNode | null = null;
  private crackleGain: GainNode | null = null;
  private crackleSource: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqBuffer: Uint8Array<ArrayBuffer> | null = null;
  private timeBuffer: Uint8Array<ArrayBuffer> | null = null;

  // Dual HTML5 Audio + Web Audio GainNode decks for true linearRampToValueAtTime crossfading
  private audioEl: HTMLAudioElement | null = null;
  private audioElDeckB: HTMLAudioElement | null = null;
  private deckAGain: GainNode | null = null;
  private deckBGain: GainNode | null = null;
  private mediaSourceConnectedA = false;
  private mediaSourceConnectedB = false;
  private crossfadeCleanupTimer: number | null = null;

  private activePreviewUrl: string | null = null;
  private activeTrackId: string = '';
  private lastLoadedTrackId: string = '';
  private fallbackPreviewUrl: string | null = null;
  private isUsingRealAudio = false;
  private currentRequestToken = 0;

  private isPlaying = false;
  private isDocumentHidden = false;
  private isMuted = false;
  private volume = 0.8;
  private playbackRate = 1.0;
  private crackleLevel = 0.25;
  private needleDropCrackle = true;
  private soundTheme: string = 'retro-turntable';
  private preset: SynthPreset = 'midnight-synth';
  private bpm = 110;
  private stepIndex = 0;
  private stepTimer: number | null = null;
  private levelPhase = 0;
  private lastSeekCrackMs = 0;
  private trackChangeTimerIds: number[] = [];

  private ensureContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.72;
      this.freqBuffer = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeBuffer = new Uint8Array(this.analyser.fftSize);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      this.synthGain = this.ctx.createGain();
      this.synthGain.gain.value = 1.0;
      this.synthGain.connect(this.masterGain);

      this.deckAGain = this.ctx.createGain();
      this.deckAGain.gain.value = 1.0;
      this.deckAGain.connect(this.masterGain);

      this.deckBGain = this.ctx.createGain();
      this.deckBGain.gain.value = 0.0;
      this.deckBGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private createDeckAudioElement(isPrimary: boolean): HTMLAudioElement {
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.loop = false;
    el.volume = this.volume;

    this.ensureContext();
    if (this.ctx && this.deckAGain && this.deckBGain) {
      try {
        const source = this.ctx.createMediaElementSource(el);
        source.connect(isPrimary ? this.deckAGain : this.deckBGain);
        if (isPrimary) {
          this.mediaSourceConnectedA = true;
        } else {
          this.mediaSourceConnectedB = true;
        }
        el.volume = 1.0;
      } catch {
        // Fallback if browser restricts MediaElementSource
      }
    }
    return el;
  }

  private ensureAudioElement(): HTMLAudioElement {
    if (!this.audioEl) {
      this.audioEl = this.createDeckAudioElement(true);
      this.audioEl.addEventListener('error', () => {
        if (!this.isPlaying) return;
        const fallback = this.fallbackPreviewUrl;
        if (fallback && this.activePreviewUrl !== fallback && this.audioEl) {
          this.activePreviewUrl = fallback;
          this.audioEl.src = fallback;
          this.audioEl.play().catch(() => {
            this.isUsingRealAudio = false;
            this.scheduleStepLoop();
          });
          return;
        }
        if (this.isUsingRealAudio) {
          this.isUsingRealAudio = false;
          this.scheduleStepLoop();
        }
      });
    }
    return this.audioEl;
  }

  private ensureSecondaryAudioElement(): HTMLAudioElement {
    if (!this.audioElDeckB) {
      this.audioElDeckB = this.createDeckAudioElement(false);
    }
    return this.audioElDeckB;
  }

  private clearCrossfadeTimer() {
    if (this.crossfadeCleanupTimer !== null) {
      window.clearTimeout(this.crossfadeCleanupTimer);
      this.crossfadeCleanupTimer = null;
    }
  }

  public setDocumentHidden(hidden: boolean) {
    this.isDocumentHidden = hidden;
  }

  public setNeedleDropCrackle(enabled: boolean) {
    this.needleDropCrackle = enabled;
  }

  public getNeedleDropCrackle(): boolean {
    return this.needleDropCrackle;
  }

  public cancelPendingThemeEffects() {
    this.clearTrackChangeTimers();
    if (this.audioEl && this.isUsingRealAudio) {
      this.audioEl.playbackRate = this.playbackRate;
    }
  }

  public setSoundTheme(themeId: string) {
    const nextTheme = themeId || 'retro-turntable';
    if (this.soundTheme !== nextTheme) {
      this.cancelPendingThemeEffects();
    }
    this.soundTheme = nextTheme;
    if (
      this.soundTheme === 'reel-to-reel' ||
      this.soundTheme === 'cassette-deck' ||
      this.soundTheme === 'cd-hifi' ||
      this.soundTheme === 'click-wheel' ||
      this.soundTheme === 'squircle-pmp' ||
      this.soundTheme === 'desktop-98' ||
      this.soundTheme === 'streamline' ||
      this.soundTheme === 'aurora-deck' ||
      this.soundTheme === 'pc-winamp'
    ) {
      this.stopCrackleNode();
    } else if (this.isPlaying && this.crackleLevel > 0) {
      this.startCrackleNode();
    }
  }

  public getSoundTheme(): string {
    return this.soundTheme;
  }

  private clearTrackChangeTimers() {
    this.trackChangeTimerIds.forEach((id) => window.clearTimeout(id));
    this.trackChangeTimerIds = [];
  }

  /**
   * Plays a crisp mechanical tape-transport engage click-clunk (ducked well under music).
   */
  public triggerReelStartCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // 1. Solenoid click
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'square';
    clickOsc.frequency.setValueAtTime(1180, now);
    clickOsc.frequency.exponentialRampToValueAtTime(240, now + 0.032);
    clickGain.gain.setValueAtTime(0.001, now);
    clickGain.gain.linearRampToValueAtTime(0.075, now + 0.004);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
    clickOsc.connect(clickGain);
    clickGain.connect(this.masterGain);
    clickOsc.start(now);
    clickOsc.stop(now + 0.045);

    // 2. Pinch-roller rubber clunk
    const clunkOsc = this.ctx.createOscillator();
    const clunkGain = this.ctx.createGain();
    clunkOsc.type = 'triangle';
    clunkOsc.frequency.setValueAtTime(128, now + 0.015);
    clunkOsc.frequency.exponentialRampToValueAtTime(48, now + 0.11);
    clunkGain.gain.setValueAtTime(0.001, now + 0.015);
    clunkGain.gain.linearRampToValueAtTime(0.11, now + 0.025);
    clunkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    clunkOsc.connect(clunkGain);
    clunkGain.connect(this.masterGain);
    clunkOsc.start(now + 0.015);
    clunkOsc.stop(now + 0.14);

    // 3. Subtle capstan motor spin-up hum (quiet)
    const humOsc = this.ctx.createOscillator();
    const humGain = this.ctx.createGain();
    humOsc.type = 'sine';
    humOsc.frequency.setValueAtTime(62, now + 0.02);
    humOsc.frequency.exponentialRampToValueAtTime(112, now + 0.24);
    humGain.gain.setValueAtTime(0.001, now + 0.02);
    humGain.gain.linearRampToValueAtTime(0.045, now + 0.07);
    humGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    humOsc.connect(humGain);
    humGain.connect(this.masterGain);
    humOsc.start(now + 0.02);
    humOsc.stop(now + 0.29);
  }

  /**
   * Plays a heavy mechanical relay disengage clunk on Stop (ducked well under music).
   */
  public triggerReelStopCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const clunkOsc = this.ctx.createOscillator();
    const clunkGain = this.ctx.createGain();
    clunkOsc.type = 'triangle';
    clunkOsc.frequency.setValueAtTime(165, now);
    clunkOsc.frequency.exponentialRampToValueAtTime(42, now + 0.12);
    clunkGain.gain.setValueAtTime(0.001, now);
    clunkGain.gain.linearRampToValueAtTime(0.11, now + 0.008);
    clunkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    clunkOsc.connect(clunkGain);
    clunkGain.connect(this.masterGain);
    clunkOsc.start(now);
    clunkOsc.stop(now + 0.15);
  }

  /**
   * Plays Reel-to-Reel track change SFX (< 2s):
   * 1) Motor spin-down hum
   * 2) Brief fast-rewind tape squeal/chatter
   * 3) Click-clunk engage sound
   */
  public triggerReelTrackChangeCue(engageDelayMs = 1380) {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    this.clearTrackChangeTimers();
    const now = this.ctx.currentTime;

    // Stage 1: Motor spin-down hum
    const downOsc = this.ctx.createOscillator();
    const downGain = this.ctx.createGain();
    downOsc.type = 'sine';
    downOsc.frequency.setValueAtTime(155, now);
    downOsc.frequency.exponentialRampToValueAtTime(52, now + 0.34);
    downGain.gain.setValueAtTime(0.001, now);
    downGain.gain.linearRampToValueAtTime(0.065, now + 0.04);
    downGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    downOsc.connect(downGain);
    downGain.connect(this.masterGain);
    downOsc.start(now);
    downOsc.stop(now + 0.37);

    // Stage 2: Brief fast-rewind tape squeal (0.34s -> 1.04s)
    const t1 = window.setTimeout(() => {
      if (!this.ctx || !this.masterGain || this.isMuted) return;
      const t = this.ctx.currentTime;
      const squealOsc = this.ctx.createOscillator();
      const squealFilter = this.ctx.createBiquadFilter();
      const squealGain = this.ctx.createGain();
      squealOsc.type = 'sawtooth';
      squealOsc.frequency.setValueAtTime(1150, t);
      squealOsc.frequency.exponentialRampToValueAtTime(2650, t + 0.32);
      squealOsc.frequency.exponentialRampToValueAtTime(980, t + 0.64);
      squealFilter.type = 'bandpass';
      squealFilter.frequency.setValueAtTime(2100, t);
      squealFilter.Q.setValueAtTime(4.5, t);
      squealGain.gain.setValueAtTime(0.001, t);
      squealGain.gain.linearRampToValueAtTime(0.048, t + 0.08);
      squealGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
      squealOsc.connect(squealFilter);
      squealFilter.connect(squealGain);
      squealGain.connect(this.masterGain);
      squealOsc.start(t);
      squealOsc.stop(t + 0.68);
    }, 340);

    // Stage 3: Click-clunk engage sound before playback resumes
    const clampedDelay = Math.max(400, Math.min(1800, engageDelayMs));
    const t2 = window.setTimeout(() => {
      this.triggerReelStartCue();
    }, clampedDelay);

    this.trackChangeTimerIds.push(t1, t2);
  }

  /**
   * Brief tape-capstan nudge / flutter effect (scratch equivalent for Reel-to-Reel).
   */
  public triggerReelTapeNudge(intensity: 'light' | 'classic' | 'backspin' = 'classic') {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const duration = intensity === 'backspin' ? 0.45 : intensity === 'light' ? 0.18 : 0.28;

    if (this.audioEl && this.isUsingRealAudio && !this.audioEl.paused) {
      const baseRate = this.playbackRate;
      this.audioEl.playbackRate = intensity === 'backspin' ? 0.65 : 1.28;
      window.setTimeout(() => {
        if (this.audioEl) {
          this.audioEl.playbackRate = baseRate;
        }
      }, duration * 780);
    }

    if (this.isMuted || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const flutterOsc = this.ctx.createOscillator();
    const flutterFilter = this.ctx.createBiquadFilter();
    const flutterGain = this.ctx.createGain();
    flutterOsc.type = 'triangle';
    flutterOsc.frequency.setValueAtTime(320, now);
    flutterOsc.frequency.exponentialRampToValueAtTime(140, now + duration * 0.5);
    flutterOsc.frequency.exponentialRampToValueAtTime(260, now + duration);
    flutterFilter.type = 'bandpass';
    flutterFilter.frequency.setValueAtTime(680, now);
    flutterFilter.Q.setValueAtTime(2.2, now);
    flutterGain.gain.setValueAtTime(0.001, now);
    flutterGain.gain.linearRampToValueAtTime(0.085, now + 0.02);
    flutterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    flutterOsc.connect(flutterFilter);
    flutterFilter.connect(flutterGain);
    flutterGain.connect(this.masterGain);
    flutterOsc.start(now);
    flutterOsc.stop(now + duration + 0.02);
  }

  /**
   * Plays Cassette Deck Play mechanical transport clunk + brief capstan motor-engage hiss (ducked well under music).
   */
  public triggerCassetteStartCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // 1. Crisp piano-key latch click
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'square';
    clickOsc.frequency.setValueAtTime(1420, now);
    clickOsc.frequency.exponentialRampToValueAtTime(320, now + 0.026);
    clickGain.gain.setValueAtTime(0.001, now);
    clickGain.gain.linearRampToValueAtTime(0.08, now + 0.003);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
    clickOsc.connect(clickGain);
    clickGain.connect(this.masterGain);
    clickOsc.start(now);
    clickOsc.stop(now + 0.036);

    // 2. Cassette head-bridge engagement clunk
    const clunkOsc = this.ctx.createOscillator();
    const clunkGain = this.ctx.createGain();
    clunkOsc.type = 'triangle';
    clunkOsc.frequency.setValueAtTime(175, now + 0.012);
    clunkOsc.frequency.exponentialRampToValueAtTime(58, now + 0.095);
    clunkGain.gain.setValueAtTime(0.001, now + 0.012);
    clunkGain.gain.linearRampToValueAtTime(0.095, now + 0.02);
    clunkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    clunkOsc.connect(clunkGain);
    clunkGain.connect(this.masterGain);
    clunkOsc.start(now + 0.012);
    clunkOsc.stop(now + 0.12);

    // 3. Brief subtle tape bias / motor-engage hiss (0.28s)
    const hissDur = 0.28;
    const bufferSize = Math.floor(this.ctx.sampleRate * hissDur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * 0.12 * env;
    }
    const hissSrc = this.ctx.createBufferSource();
    hissSrc.buffer = buffer;
    const hissFilter = this.ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.setValueAtTime(4200, now + 0.02);
    hissFilter.Q.setValueAtTime(1.2, now + 0.02);
    const hissGain = this.ctx.createGain();
    hissGain.gain.setValueAtTime(0.06, now + 0.02);
    hissSrc.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(this.masterGain);
    hissSrc.start(now + 0.02);
    hissSrc.stop(now + 0.02 + hissDur);
  }

  /**
   * Plays Cassette Deck mechanical piano-key latch click (press or release spring snap).
   */
  public triggerCassetteLatchClick(isRelease = false) {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isRelease ? 'triangle' : 'square';
    osc.frequency.setValueAtTime(isRelease ? 980 : 1240, now);
    osc.frequency.exponentialRampToValueAtTime(isRelease ? 290 : 340, now + 0.028);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.036);
  }

  /**
   * Plays a soft damped helical spring boing when the bottom-hinged door pops open.
   */
  public triggerCassetteDoorSpringBoing() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const boingOsc = this.ctx.createOscillator();
    const boingGain = this.ctx.createGain();
    boingOsc.type = 'sine';
    boingOsc.frequency.setValueAtTime(195, now);
    boingOsc.frequency.exponentialRampToValueAtTime(118, now + 0.06);
    boingOsc.frequency.exponentialRampToValueAtTime(162, now + 0.13);
    boingOsc.frequency.exponentialRampToValueAtTime(92, now + 0.22);

    boingGain.gain.setValueAtTime(0.001, now);
    boingGain.gain.linearRampToValueAtTime(0.065, now + 0.012);
    boingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    boingOsc.connect(boingGain);
    boingGain.connect(this.masterGain);
    boingOsc.start(now);
    boingOsc.stop(now + 0.25);
  }

  /**
   * Plays Cassette Deck piano-key release clack + upward latch spring sound on Stop.
   */
  public triggerCassetteStopCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // 1. Stop plunger clack
    const latchOsc = this.ctx.createOscillator();
    const latchGain = this.ctx.createGain();
    latchOsc.type = 'triangle';
    latchOsc.frequency.setValueAtTime(240, now);
    latchOsc.frequency.exponentialRampToValueAtTime(64, now + 0.085);
    latchGain.gain.setValueAtTime(0.001, now);
    latchGain.gain.linearRampToValueAtTime(0.085, now + 0.006);
    latchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);
    latchOsc.connect(latchGain);
    latchGain.connect(this.masterGain);
    latchOsc.start(now);
    latchOsc.stop(now + 0.1);

    // 2. Released latched-key spring snap
    const springOsc = this.ctx.createOscillator();
    const springGain = this.ctx.createGain();
    springOsc.type = 'sine';
    springOsc.frequency.setValueAtTime(340, now + 0.014);
    springOsc.frequency.exponentialRampToValueAtTime(210, now + 0.11);
    springGain.gain.setValueAtTime(0.001, now + 0.014);
    springGain.gain.linearRampToValueAtTime(0.045, now + 0.022);
    springGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    springOsc.connect(springGain);
    springGain.connect(this.masterGain);
    springOsc.start(now + 0.014);
    springOsc.stop(now + 0.13);
  }

  /**
   * Plays full Cassette Deck track-change SFX (<= 2.1s):
   * 1) Key unlatch click -> bottom-hinged door spring boing
   * 2) Norelco polycarbonate case lid & shell clatter during organizer swap
   * 3) Firm door compression clunk -> Play latch click -> capstan motor-engage hiss
   */
  public triggerCassetteTrackChangeCue(closeDelayMs = 1680) {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    this.clearTrackChangeTimers();

    // 0ms: Latched PLAY key pops up
    this.triggerCassetteLatchClick(true);

    // 170ms: Bottom-hinged smoked door springs open
    const tDoorOpen = window.setTimeout(() => {
      this.triggerCassetteDoorSpringBoing();
    }, 170);

    // 520ms: Norelco polycarbonate case lid & cassette plastic clatter in organizer rack
    const tClatter = window.setTimeout(() => {
      if (!this.ctx || !this.masterGain || this.isMuted) return;
      const t = this.ctx.currentTime;
      [0, 0.095, 0.24, 0.36].forEach((offset, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const clickOsc = this.ctx.createOscillator();
        const clickFilter = this.ctx.createBiquadFilter();
        const clickGain = this.ctx.createGain();
        clickOsc.type = 'square';
        clickOsc.frequency.setValueAtTime(idx % 2 === 1 ? 740 : 540, t + offset);
        clickOsc.frequency.exponentialRampToValueAtTime(210, t + offset + 0.045);
        clickFilter.type = 'bandpass';
        clickFilter.frequency.setValueAtTime(1750, t + offset);
        clickFilter.Q.setValueAtTime(2.3, t + offset);
        clickGain.gain.setValueAtTime(0.001, t + offset);
        clickGain.gain.linearRampToValueAtTime(0.048, t + offset + 0.004);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.052);
        clickOsc.connect(clickFilter);
        clickFilter.connect(clickGain);
        clickGain.connect(this.masterGain);
        clickOsc.start(t + offset);
        clickOsc.stop(t + offset + 0.06);
      });
    }, 520);

    // ~1680ms: Firm door clunk + Play key latch + motor-engage hiss
    const clampedDelay = Math.max(850, Math.min(2000, closeDelayMs));
    const tDoorClose = window.setTimeout(() => {
      this.triggerCassetteStartCue();
    }, clampedDelay);

    this.trackChangeTimerIds.push(tDoorOpen, tClatter, tDoorClose);
  }

  /**
   * Cassette scratch equivalent ("Tape Chew"):
   * Brief wow/flutter pitch wobble + muffled lowpass warble, then cleanly resumes.
   */
  public triggerCassetteTapeChew(intensity: 'light' | 'classic' | 'backspin' = 'classic') {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    const totalMs = intensity === 'backspin' ? 520 : intensity === 'light' ? 280 : 400;
    if (this.audioEl && this.isUsingRealAudio && !this.audioEl.paused) {
      const baseRate = this.playbackRate;
      this.audioEl.playbackRate = 0.72;
      const w1 = window.setTimeout(() => {
        if (this.audioEl && this.isPlaying) this.audioEl.playbackRate = 1.18;
      }, Math.round(totalMs * 0.28));
      const w2 = window.setTimeout(() => {
        if (this.audioEl && this.isPlaying) this.audioEl.playbackRate = 0.78;
      }, Math.round(totalMs * 0.56));
      const w3 = window.setTimeout(() => {
        if (this.audioEl) this.audioEl.playbackRate = baseRate;
      }, totalMs);
      this.trackChangeTimerIds.push(w1, w2, w3);
    }

    if (this.isMuted || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const durSec = totalMs / 1000;

    // Muffled wow/flutter tape warble synth cue
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const lpFilter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(195, now);
    osc.frequency.linearRampToValueAtTime(115, now + durSec * 0.48);
    osc.frequency.linearRampToValueAtTime(180, now + durSec);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(13, now);
    lfoGain.gain.setValueAtTime(36, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    lpFilter.type = 'lowpass';
    lpFilter.frequency.setValueAtTime(480, now);
    lpFilter.Q.setValueAtTime(2.8, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.085, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

    osc.connect(lpFilter);
    lpFilter.connect(gain);
    gain.connect(this.masterGain);

    lfo.start(now);
    osc.start(now);
    lfo.stop(now + durSec + 0.02);
    osc.stop(now + durSec + 0.02);
  }

  /**
   * Generation-aware Click Wheel tick for every 15deg scroll detent or button press:
   * - plastic-clack (Gen 1 mechanical wheel): dry polycarbonate detent snap
   * - electronic-tick (Gen 2 Mono Touch): crisp subtle piezo pulse
   * - soft-tick (Gen 3 Color Video): current soft electrostatic click
   */
  public triggerClickWheelTick(
    accent = false,
    soundProfile: 'plastic-clack' | 'electronic-tick' | 'soft-tick' = 'soft-tick'
  ) {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    if (soundProfile === 'plastic-clack') {
      // Dry mechanical polycarbonate clack detent
      const dur = 0.022;
      const bufSize = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.22));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(accent ? 1650 : 1320, now);
      bp.Q.setValueAtTime(2.6, now);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(accent ? 0.085 : 0.062, now);
      nGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      noise.connect(bp);
      bp.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + dur);

      const bodyOsc = this.ctx.createOscillator();
      const bodyGain = this.ctx.createGain();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(accent ? 1350 : 1080, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(340, now + 0.016);
      bodyGain.gain.setValueAtTime(accent ? 0.065 : 0.048, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
      bodyOsc.connect(bodyGain);
      bodyGain.connect(this.masterGain);
      bodyOsc.start(now);
      bodyOsc.stop(now + 0.02);
      return;
    }

    if (soundProfile === 'electronic-tick') {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(accent ? 2150 : 1780, now);
      osc.frequency.exponentialRampToValueAtTime(accent ? 980 : 820, now + 0.011);

      filter.type = 'highpass';
      filter.frequency.setValueAtTime(600, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(accent ? 0.055 : 0.038, now + 0.0015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.013);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.015);
      return;
    }

    // Default Gen 3 soft electrostatic tick
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 2900 : 2400, now);
    osc.frequency.exponentialRampToValueAtTime(accent ? 1100 : 860, now + 0.014);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, now);
    filter.Q.setValueAtTime(1.8, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(accent ? 0.07 : 0.048, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.016);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.02);
  }

  /**
   * Soft rubberized cradle drop thunk + subtle connect chime when docking player onto the white speaker dock.
   */
  public triggerClickWheelDockCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Cushioned rubber dock seat thud (volume-ducked)
    const thudOsc = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(112, now);
    thudOsc.frequency.exponentialRampToValueAtTime(42, now + 0.09);
    thudGain.gain.setValueAtTime(0.001, now);
    thudGain.gain.linearRampToValueAtTime(0.055, now + 0.008);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.105);
    thudOsc.connect(thudGain);
    thudGain.connect(this.masterGain);
    thudOsc.start(now);
    thudOsc.stop(now + 0.115);

    // Gentle 2-note dock pin connect chime
    [
      { freq: 587.33, offset: 0.075, dur: 0.11 },
      { freq: 880, offset: 0.14, dur: 0.14 },
    ].forEach((note) => {
      if (!this.ctx || !this.masterGain) return;
      const chimeOsc = this.ctx.createOscillator();
      const chimeGain = this.ctx.createGain();
      chimeOsc.type = 'sine';
      chimeOsc.frequency.setValueAtTime(note.freq, now + note.offset);
      chimeGain.gain.setValueAtTime(0.001, now + note.offset);
      chimeGain.gain.linearRampToValueAtTime(0.028, now + note.offset + 0.012);
      chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + note.offset + note.dur);
      chimeOsc.connect(chimeGain);
      chimeGain.connect(this.masterGain);
      chimeOsc.start(now + note.offset);
      chimeOsc.stop(now + note.offset + note.dur + 0.015);
    });
  }

  /**
   * Quiet micro-drive spin-up whisper + gentle digital beep on Click Wheel load.
   */
  public triggerClickWheelLoadingCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Gentle micro-drive spin-up hum
    const spinOsc = this.ctx.createOscillator();
    const spinGain = this.ctx.createGain();
    spinOsc.type = 'sine';
    spinOsc.frequency.setValueAtTime(210, now);
    spinOsc.frequency.exponentialRampToValueAtTime(520, now + 0.24);
    spinGain.gain.setValueAtTime(0.001, now);
    spinGain.gain.linearRampToValueAtTime(0.032, now + 0.05);
    spinGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    spinOsc.connect(spinGain);
    spinGain.connect(this.masterGain);
    spinOsc.start(now);
    spinOsc.stop(now + 0.3);

    // Quiet confirmation chime
    const beepOsc = this.ctx.createOscillator();
    const beepGain = this.ctx.createGain();
    beepOsc.type = 'sine';
    beepOsc.frequency.setValueAtTime(1560, now + 0.14);
    beepGain.gain.setValueAtTime(0.001, now + 0.14);
    beepGain.gain.linearRampToValueAtTime(0.035, now + 0.155);
    beepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    beepOsc.connect(beepGain);
    beepGain.connect(this.masterGain);
    beepOsc.start(now + 0.14);
    beepOsc.stop(now + 0.25);
  }

  public triggerClickWheelStartCue(
    soundProfile: 'plastic-clack' | 'electronic-tick' | 'soft-tick' = 'soft-tick'
  ) {
    this.triggerClickWheelTick(true, soundProfile);
  }

  public triggerClickWheelStopCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    this.triggerClickWheelTick(false);
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(720, now + 0.02);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.11);
    gain.gain.setValueAtTime(0.001, now + 0.02);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.032);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now + 0.02);
    osc.stop(now + 0.13);
  }

  /**
   * Track change cue (< 1s): soft click + quick clean airy UI slide whoosh.
   */
  public triggerClickWheelTrackChangeCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    this.triggerClickWheelTick(true);

    const now = this.ctx.currentTime;
    const whooshDur = 0.28;
    const bufferSize = Math.floor(this.ctx.sampleRate * whooshDur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * 0.14 * env;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now + 0.01);
    filter.frequency.exponentialRampToValueAtTime(3400, now + 0.14);
    filter.frequency.exponentialRampToValueAtTime(1100, now + whooshDur);
    filter.Q.setValueAtTime(1.5, now + 0.01);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.055, now + 0.01);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now + 0.01);
    src.stop(now + 0.01 + whooshDur);
  }

  /**
   * Double-press center button equivalent ("Skip-Stutter"):
   * brief repeating buffer micro-slices cleanly tucked under playback.
   */
  public triggerClickWheelSkipStutter(intensity: 'light' | 'classic' | 'backspin' = 'classic') {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    const totalMs = intensity === 'backspin' ? 420 : intensity === 'light' ? 240 : 320;
    if (this.audioEl && this.isUsingRealAudio && !this.audioEl.paused) {
      const baseRate = this.playbackRate;
      const baseTime = this.audioEl.currentTime;
      this.audioEl.playbackRate = 1.24;
      const s1 = window.setTimeout(() => {
        if (this.audioEl && this.isPlaying) {
          try {
            this.audioEl.currentTime = Math.max(0, baseTime + 0.04);
          } catch {
            // ignore
          }
          this.audioEl.playbackRate = 0.85;
        }
      }, 95);
      const s2 = window.setTimeout(() => {
        if (this.audioEl) {
          this.audioEl.playbackRate = baseRate;
        }
      }, totalMs);
      this.trackChangeTimerIds.push(s1, s2);
    }

    if (this.isMuted || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    [0, 0.085, 0.17].forEach((offset, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(980 + idx * 180, now + offset);
      osc.frequency.exponentialRampToValueAtTime(520, now + offset + 0.045);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.055, now + offset + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.055);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.06);
    });
  }

  /**
   * Soft deep matte "thip" tactile click for Squircle PMP D-pad and soft-touch buttons.
   */
  public triggerSquircleThip(accent = false) {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(accent ? 280 : 210, now);
    osc.frequency.exponentialRampToValueAtTime(accent ? 76 : 62, now + 0.038);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(920, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(accent ? 0.095 : 0.068, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.044);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Quiet warm solid-state load chime on Squircle PMP mount.
   */
  public triggerSquircleLoadCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.16);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.042, now + 0.024);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public triggerSquircleStartCue() {
    this.triggerSquircleThip(true);
  }

  public triggerSquircleStopCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.09);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.07, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /**
   * Track change cue (< 1s): soft deep "thip" followed by short smooth twist-UI whoosh.
   */
  public triggerSquircleTrackChangeCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    this.triggerSquircleThip(true);

    const now = this.ctx.currentTime;
    const whooshDur = 0.26;
    const bufferSize = Math.floor(this.ctx.sampleRate * whooshDur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * 0.12 * env;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(480, now + 0.02);
    filter.frequency.exponentialRampToValueAtTime(1450, now + 0.15);
    filter.frequency.exponentialRampToValueAtTime(420, now + whooshDur);
    filter.Q.setValueAtTime(1.2, now + 0.02);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.055, now + 0.02);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now + 0.02);
    src.stop(now + 0.02 + whooshDur);
  }

  /**
   * Long-press D-pad Left equivalent ("Stutter-Rewind"):
   * brief backward-stepping micro-slices tucked smoothly under playback.
   */
  public triggerSquircleStutterRewind(intensity: 'light' | 'classic' | 'backspin' = 'backspin') {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    const totalMs = intensity === 'backspin' ? 420 : intensity === 'light' ? 240 : 320;
    if (this.audioEl && this.isUsingRealAudio && !this.audioEl.paused) {
      const baseRate = this.playbackRate;
      const baseTime = this.audioEl.currentTime;
      this.audioEl.playbackRate = 0.72;
      const r1 = window.setTimeout(() => {
        if (this.audioEl && this.isPlaying) {
          try {
            this.audioEl.currentTime = Math.max(0, baseTime - 0.18);
          } catch {
            // ignore
          }
          this.audioEl.playbackRate = 0.88;
        }
      }, 110);
      const r2 = window.setTimeout(() => {
        if (this.audioEl) {
          this.audioEl.playbackRate = baseRate;
        }
      }, totalMs);
      this.trackChangeTimerIds.push(r1, r2);
    }

    if (this.isMuted || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    [0, 0.095, 0.19].forEach((offset, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(420 - idx * 80, now + offset);
      osc.frequency.exponentialRampToValueAtTime(140, now + offset + 0.065);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(780, now + offset);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.068, now + offset + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.07);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.075);
    });
  }

  /**
   * Short beveled 3D button click for '98 Desktop Player controls (ducked under music).
   */
  public triggerDesktop98Click(accent = false) {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(accent ? 1580 : 1240, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.018);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(accent ? 0.068 : 0.048, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.025);
  }

  /**
   * Soft hard-drive tick-tick + short click for '98 Desktop Player loading & track changes.
   */
  public triggerDesktop98LoadCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Soft IDE hard-drive actuator tick-tick
    [0, 0.055, 0.12].forEach((offset, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const tickOsc = this.ctx.createOscillator();
      const tickFilter = this.ctx.createBiquadFilter();
      const tickGain = this.ctx.createGain();

      tickOsc.type = 'triangle';
      tickOsc.frequency.setValueAtTime(idx === 2 ? 920 : 680 + idx * 90, now + offset);
      tickOsc.frequency.exponentialRampToValueAtTime(180, now + offset + 0.022);

      tickFilter.type = 'bandpass';
      tickFilter.frequency.setValueAtTime(1450, now + offset);
      tickFilter.Q.setValueAtTime(2.5, now + offset);

      tickGain.gain.setValueAtTime(0.001, now + offset);
      tickGain.gain.linearRampToValueAtTime(0.052, now + offset + 0.003);
      tickGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.026);

      tickOsc.connect(tickFilter);
      tickFilter.connect(tickGain);
      tickGain.connect(this.masterGain);
      tickOsc.start(now + offset);
      tickOsc.stop(now + offset + 0.03);
    });
  }

  public triggerDesktop98StartCue() {
    this.triggerDesktop98Click(true);
  }

  public triggerDesktop98StopCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.045);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.058);
  }

  public triggerDesktop98TrackChangeCue() {
    this.triggerDesktop98LoadCue();
  }

  /**
   * '98 Desktop Player scratch equivalent: stutters playback with a brief vinyl-crackle burst.
   */
  public triggerDesktop98ScratchBurst(intensity: 'light' | 'classic' | 'backspin' = 'classic') {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    const totalMs = intensity === 'backspin' ? 380 : intensity === 'light' ? 220 : 300;
    if (this.audioEl && this.isUsingRealAudio && !this.audioEl.paused) {
      const baseRate = this.playbackRate;
      const baseTime = this.audioEl.currentTime;
      this.audioEl.playbackRate = 0.78;
      const s1 = window.setTimeout(() => {
        if (this.audioEl && this.isPlaying) {
          try {
            this.audioEl.currentTime = Math.max(0, baseTime - 0.08);
          } catch {
            // ignore
          }
          this.audioEl.playbackRate = 1.18;
        }
      }, 90);
      const s2 = window.setTimeout(() => {
        if (this.audioEl) {
          this.audioEl.playbackRate = baseRate;
        }
      }, totalMs);
      this.trackChangeTimerIds.push(s1, s2);
    }

    if (this.isMuted || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const burstDur = totalMs / 1000;

    // Brief vinyl-crackle burst + stutter click
    const bufferSize = Math.floor(this.ctx.sampleRate * burstDur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      const r = Math.random();
      if (r > 0.96) {
        data[i] = (Math.random() * 2 - 1) * 0.65 * env;
      } else {
        data[i] = (Math.random() * 2 - 1) * 0.08 * env;
      }
    }

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, now);
    filter.Q.setValueAtTime(1.5, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + burstDur);

    noiseSrc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noiseSrc.start(now);
    noiseSrc.stop(now + burstDur + 0.01);
  }

  /**
   * Near-silent ultra-soft tick for the 2015–now Streamline era.
   */
  public triggerStreamlineSoftTick() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1120, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.012);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.024, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.014);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.018);
  }

  /**
   * Streamline scratch equivalent ("DJ-Brake"): smoothly slows playback speed down
   * and gently spins back up without harsh analog noise.
   */
  public triggerStreamlineDjBrake(intensity: 'light' | 'classic' | 'backspin' = 'classic') {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    const totalMs = intensity === 'backspin' ? 480 : intensity === 'light' ? 280 : 380;
    if (this.audioEl && this.isUsingRealAudio && !this.audioEl.paused) {
      const baseRate = this.playbackRate;
      this.audioEl.playbackRate = Math.max(0.5, baseRate * 0.68);
      const t1 = window.setTimeout(() => {
        if (this.audioEl && this.isPlaying) {
          this.audioEl.playbackRate = Math.max(0.5, baseRate * 0.5);
        }
      }, Math.round(totalMs * 0.3));
      const t2 = window.setTimeout(() => {
        if (this.audioEl && this.isPlaying) {
          this.audioEl.playbackRate = Math.max(0.5, baseRate * 0.78);
        }
      }, Math.round(totalMs * 0.68));
      const t3 = window.setTimeout(() => {
        if (this.audioEl) {
          this.audioEl.playbackRate = baseRate;
        }
      }, totalMs);
      this.trackChangeTimerIds.push(t1, t2, t3);
    }

    if (this.isMuted || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const durSec = totalMs / 1000;
    const osc = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(72, now + durSec * 0.62);
    osc.frequency.exponentialRampToValueAtTime(170, now + durSec);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);
    osc.connect(lp);
    lp.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + durSec + 0.02);
  }

  /**
   * Aurora Deck load cue: ethereal crystalline harmonic shimmer + soft sub touch (volume-ducked).
   */
  public triggerAuroraLoadCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    [528, 792, 1056].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);
      gain.gain.setValueAtTime(0.001, now + idx * 0.045);
      gain.gain.linearRampToValueAtTime(0.028, now + idx * 0.045 + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.045 + 0.34);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.36);
    });
  }

  /**
   * Aurora Deck start cue: gentle glassy shimmer pulse + sub-bass bloom.
   */
  public triggerAuroraStartCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Gentle sub-bass bloom
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(92, now);
    subOsc.frequency.exponentialRampToValueAtTime(54, now + 0.28);
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.075, now + 0.045);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.34);

    // Glassy harmonic shimmer
    const chimeOsc = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();
    chimeOsc.type = 'triangle';
    chimeOsc.frequency.setValueAtTime(660, now);
    chimeOsc.frequency.exponentialRampToValueAtTime(990, now + 0.22);
    chimeGain.gain.setValueAtTime(0.001, now);
    chimeGain.gain.linearRampToValueAtTime(0.032, now + 0.02);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    chimeOsc.connect(chimeGain);
    chimeGain.connect(this.masterGain);
    chimeOsc.start(now);
    chimeOsc.stop(now + 0.28);
  }

  /**
   * Aurora Deck stop cue: downward harmonic dissolve.
   */
  public triggerAuroraStopCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.3);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, now);
    lp.frequency.exponentialRampToValueAtTime(220, now + 0.3);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.connect(lp);
    lp.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  /**
   * Aurora Deck track-change SFX (<= 1.5s): soft synth riser + gentle sub-bass bloom.
   */
  public triggerAuroraTrackChangeCue(bloomDelayMs = 740) {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    this.clearTrackChangeTimers();
    const now = this.ctx.currentTime;

    // 1. Soft filtered synth riser (0 -> 0.72s)
    const riserOsc = this.ctx.createOscillator();
    const riserFilter = this.ctx.createBiquadFilter();
    const riserGain = this.ctx.createGain();
    riserOsc.type = 'triangle';
    riserOsc.frequency.setValueAtTime(220, now);
    riserOsc.frequency.exponentialRampToValueAtTime(660, now + 0.72);
    riserFilter.type = 'bandpass';
    riserFilter.frequency.setValueAtTime(480, now);
    riserFilter.frequency.exponentialRampToValueAtTime(1800, now + 0.72);
    riserFilter.Q.setValueAtTime(2.0, now);
    riserGain.gain.setValueAtTime(0.001, now);
    riserGain.gain.linearRampToValueAtTime(0.042, now + 0.25);
    riserGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.76);
    riserOsc.connect(riserFilter);
    riserFilter.connect(riserGain);
    riserGain.connect(this.masterGain);
    riserOsc.start(now);
    riserOsc.stop(now + 0.78);

    // 2. Gentle sub-bass bloom as new track rings expand
    const tBloom = window.setTimeout(() => {
      this.triggerAuroraStartCue();
    }, Math.max(300, Math.min(1000, bloomDelayMs)));
    this.trackChangeTimerIds.push(tBloom);
  }

  /**
   * Aurora Deck "Time-Shear" effect (scratch equivalent): counter-rotation visual pair + gentle audio stutter.
   */
  public triggerAuroraTimeShear(intensity: 'light' | 'classic' | 'backspin' = 'classic') {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    const totalMs = intensity === 'backspin' ? 440 : intensity === 'light' ? 280 : 380;
    if (this.audioEl && this.isUsingRealAudio && !this.audioEl.paused) {
      const baseRate = this.playbackRate;
      const baseTime = this.audioEl.currentTime;
      this.audioEl.playbackRate = Math.max(0.5, baseRate * 0.74);
      const t1 = window.setTimeout(() => {
        if (this.audioEl && this.isPlaying) {
          try {
            this.audioEl.currentTime = Math.max(0, baseTime - 0.09);
          } catch {
            // ignore seek bounds
          }
          this.audioEl.playbackRate = Math.min(1.6, baseRate * 1.15);
        }
      }, Math.round(totalMs * 0.34));
      const t2 = window.setTimeout(() => {
        if (this.audioEl) {
          this.audioEl.playbackRate = baseRate;
        }
      }, totalMs);
      this.trackChangeTimerIds.push(t1, t2);
    }

    if (this.isMuted || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    [0, 0.09, 0.18].forEach((offset, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(780 - idx * 140, now + offset);
      osc.frequency.exponentialRampToValueAtTime(320, now + offset + 0.065);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.045, now + offset + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.072);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.08);
    });
  }

  /**
   * Plays an authentic short vinyl needle-drop thump + static crackle burst on play or seek.
   */
  public triggerNeedleDrop(isSeek = false) {
    if (this.soundTheme === 'aurora-deck') {
      if (!isSeek) {
        this.triggerAuroraStartCue();
      }
      return;
    }
    if (this.soundTheme === 'streamline') {
      if (!isSeek) {
        this.triggerStreamlineSoftTick();
      }
      return;
    }
    if (this.soundTheme === 'reel-to-reel') {
      if (!isSeek) {
        this.triggerReelStartCue();
      }
      return;
    }
    if (this.soundTheme === 'cassette-deck') {
      if (!isSeek) {
        this.triggerCassetteStartCue();
      }
      return;
    }
    if (this.soundTheme === 'click-wheel') {
      if (!isSeek) {
        this.triggerClickWheelStartCue();
      }
      return;
    }
    if (this.soundTheme === 'squircle-pmp') {
      if (!isSeek) {
        this.triggerSquircleStartCue();
      }
      return;
    }
    if (this.soundTheme === 'desktop-98') {
      if (!isSeek) {
        this.triggerDesktop98StartCue();
      }
      return;
    }
    if (this.soundTheme === 'cd-hifi') {
      if (!isSeek) {
        this.triggerCdLaserSpinUpSound();
      }
      return;
    }
    if (!this.needleDropCrackle) return;
    const nowMs = performance.now();
    if (isSeek && nowMs - this.lastSeekCrackMs < 180) return;
    this.lastSeekCrackMs = nowMs;

    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    const thumpOsc = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(isSeek ? 90 : 72, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(28, now + 0.09);

    thumpGain.gain.setValueAtTime(0.001, now);
    thumpGain.gain.linearRampToValueAtTime(isSeek ? 0.12 : 0.2, now + 0.012);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(this.masterGain);
    thumpOsc.start(now);
    thumpOsc.stop(now + 0.12);

    const durationSec = isSeek ? 0.16 : 0.26;
    const bufferSize = Math.floor(this.ctx.sampleRate * durationSec);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const r = Math.random();
      if (r > 0.985) {
        data[i] = (Math.random() * 2 - 1) * 0.55;
      } else if (r > 0.94) {
        data[i] = (Math.random() * 2 - 1) * 0.14;
      } else {
        data[i] = (Math.random() * 2 - 1) * 0.015;
      }
    }

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.Q.setValueAtTime(1.4, now);

    const crackleBurstGain = this.ctx.createGain();
    crackleBurstGain.gain.setValueAtTime(0.001, now);
    crackleBurstGain.gain.linearRampToValueAtTime(isSeek ? 0.16 : 0.24, now + 0.02);
    crackleBurstGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    noiseSrc.connect(filter);
    filter.connect(crackleBurstGain);
    crackleBurstGain.connect(this.masterGain);
    noiseSrc.start(now);
    noiseSrc.stop(now + durationSec + 0.01);
  }

  /**
   * Plays a brief vinyl-handling sound effect during track-change transitions:
   * 1) Immediate light stylus-lift scratch + warm paper-sleeve surface static
   * 2) Needle-drop thump + groove crackle scheduled when the tonearm lowers onto the new record
   */
  public triggerTrackChangeHandlingCue(needleLowerDelayMs = 1260) {
    if (this.soundTheme === 'aurora-deck') {
      this.triggerAuroraTrackChangeCue(740);
      return;
    }
    if (this.soundTheme === 'streamline') {
      this.triggerStreamlineSoftTick();
      return;
    }
    if (this.soundTheme === 'reel-to-reel') {
      this.triggerReelTrackChangeCue(needleLowerDelayMs);
      return;
    }
    if (this.soundTheme === 'cassette-deck') {
      this.triggerCassetteTrackChangeCue(needleLowerDelayMs);
      return;
    }
    if (this.soundTheme === 'click-wheel') {
      this.triggerClickWheelTrackChangeCue();
      return;
    }
    if (this.soundTheme === 'squircle-pmp') {
      this.triggerSquircleTrackChangeCue();
      return;
    }
    if (this.soundTheme === 'desktop-98') {
      this.triggerDesktop98TrackChangeCue();
      return;
    }
    if (this.soundTheme === 'cd-hifi') {
      this.triggerCdTrackChangeCue();
      return;
    }
    if (!this.needleDropCrackle) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    // 1. Brief stylus-lift chirp
    const liftOsc = this.ctx.createOscillator();
    const liftFilter = this.ctx.createBiquadFilter();
    const liftGain = this.ctx.createGain();
    liftOsc.type = 'triangle';
    liftOsc.frequency.setValueAtTime(190, now);
    liftOsc.frequency.exponentialRampToValueAtTime(420, now + 0.08);
    liftFilter.type = 'bandpass';
    liftFilter.frequency.setValueAtTime(1350, now);
    liftFilter.Q.setValueAtTime(3.0, now);
    liftGain.gain.setValueAtTime(0.001, now);
    liftGain.gain.linearRampToValueAtTime(0.11, now + 0.018);
    liftGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    liftOsc.connect(liftFilter);
    liftFilter.connect(liftGain);
    liftGain.connect(this.masterGain);
    liftOsc.start(now);
    liftOsc.stop(now + 0.12);

    // 2. Soft vinyl-sleeve handling static rustle (0.45s)
    const sleeveDur = 0.45;
    const bufferSize = Math.floor(this.ctx.sampleRate * sleeveDur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * 0.08 * env;
    }
    const sleeveNoise = this.ctx.createBufferSource();
    sleeveNoise.buffer = buffer;
    const sleeveFilter = this.ctx.createBiquadFilter();
    sleeveFilter.type = 'bandpass';
    sleeveFilter.frequency.setValueAtTime(1600, now);
    sleeveFilter.Q.setValueAtTime(1.1, now);
    const sleeveGain = this.ctx.createGain();
    sleeveGain.gain.setValueAtTime(0.14, now);
    sleeveNoise.connect(sleeveFilter);
    sleeveFilter.connect(sleeveGain);
    sleeveGain.connect(this.masterGain);
    sleeveNoise.start(now + 0.05);
    sleeveNoise.stop(now + 0.05 + sleeveDur);

    // 3. Needle-drop thump when tonearm lowers onto the new record
    window.setTimeout(() => {
      if (this.isPlaying) {
        this.triggerNeedleDrop(false);
      }
    }, Math.max(120, Math.min(1800, needleLowerDelayMs)));
  }

  public getActiveTrackId(): string {
    return this.activeTrackId;
  }

  public startPlayback(track: TrackItem, rate = 1.0, startTimeSec = 0) {
    this.ensureContext();
    const wasPlaying = this.isPlaying;
    this.activeTrackId = track.id;
    this.preset = track.synthPreset || 'midnight-synth';
    this.bpm = track.bpm || 110;
    this.playbackRate = rate;
    this.isPlaying = true;
    if (
      this.soundTheme !== 'reel-to-reel' &&
      this.soundTheme !== 'cassette-deck' &&
      this.soundTheme !== 'cd-hifi' &&
      this.soundTheme !== 'click-wheel' &&
      this.soundTheme !== 'squircle-pmp' &&
      this.soundTheme !== 'desktop-98' &&
      this.soundTheme !== 'streamline' &&
      this.soundTheme !== 'aurora-deck'
    ) {
      this.startCrackleNode();
    }

    if (!wasPlaying) {
      this.triggerNeedleDrop(false);
    }

    this.loadAndPlayTrackAudio(
      track.id,
      track.previewAudioUrl,
      track.title,
      track.artist,
      false,
      startTimeSec
    );
  }

  /**
   * Crossfades from the currently playing track into the next track over crossfadeSec (1-5s)
   * using Web Audio GainNode.gain.linearRampToValueAtTime — zero per-frame JS loops.
   * Disabled automatically in Low Power Mode.
   */
  public crossfadeToTrack(
    nextTrack: TrackItem,
    rate: number,
    crossfadeSec: number,
    lowPowerMode: boolean
  ) {
    const fadeSec = Math.max(1, Math.min(5, Math.round(crossfadeSec || 3)));
    if (lowPowerMode || !this.isPlaying) {
      this.startPlayback(nextTrack, rate, 0);
      return;
    }

    this.ensureContext();
    this.clearCrossfadeTimer();

    if (!this.ctx || !this.deckAGain || !this.deckBGain || !this.synthGain) {
      this.startPlayback(nextTrack, rate, 0);
      return;
    }

    const now = this.ctx.currentTime;

    if (this.isUsingRealAudio && this.audioEl) {
      const outgoingEl = this.audioEl;
      const incomingEl = this.ensureSecondaryAudioElement();
      const outgoingGain = this.deckAGain;
      const incomingGain = this.deckBGain;

      outgoingGain.gain.cancelScheduledValues(now);
      outgoingGain.gain.setValueAtTime(1.0, now);
      outgoingGain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);

      incomingGain.gain.cancelScheduledValues(now);
      incomingGain.gain.setValueAtTime(0.0001, now);
      incomingGain.gain.linearRampToValueAtTime(1.0, now + fadeSec);

      this.audioEl = incomingEl;
      this.audioElDeckB = outgoingEl;
      this.deckAGain = incomingGain;
      this.deckBGain = outgoingGain;
      const tmpConn = this.mediaSourceConnectedA;
      this.mediaSourceConnectedA = this.mediaSourceConnectedB;
      this.mediaSourceConnectedB = tmpConn;

      this.activeTrackId = nextTrack.id;
      this.preset = nextTrack.synthPreset || 'midnight-synth';
      this.bpm = nextTrack.bpm || 110;
      this.playbackRate = rate;
      this.stepIndex = 0;

      this.loadAndPlayTrackAudio(
        nextTrack.id,
        nextTrack.previewAudioUrl,
        nextTrack.title,
        nextTrack.artist,
        true,
        0
      );

      this.crossfadeCleanupTimer = window.setTimeout(() => {
        try {
          outgoingEl.pause();
          outgoingEl.currentTime = 0;
        } catch {
          // ignore
        }
        this.crossfadeCleanupTimer = null;
      }, fadeSec * 1000 + 80);
    } else {
      const halfFade = fadeSec * 0.5;
      this.synthGain.gain.cancelScheduledValues(now);
      this.synthGain.gain.setValueAtTime(1.0, now);
      this.synthGain.gain.linearRampToValueAtTime(0.18, now + halfFade);
      this.synthGain.gain.linearRampToValueAtTime(1.0, now + fadeSec);

      this.activeTrackId = nextTrack.id;
      this.preset = nextTrack.synthPreset || 'midnight-synth';
      this.bpm = nextTrack.bpm || 110;
      this.playbackRate = rate;
      this.stepIndex = 0;

      this.loadAndPlayTrackAudio(
        nextTrack.id,
        nextTrack.previewAudioUrl,
        nextTrack.title,
        nextTrack.artist,
        true,
        0
      );
    }
  }

  public pausePlayback() {
    this.isPlaying = false;
    this.currentRequestToken++;
    this.clearCrossfadeTimer();
    if (this.stepTimer !== null) {
      window.clearTimeout(this.stepTimer);
      this.stepTimer = null;
    }
    if (this.audioEl) {
      this.audioEl.pause();
    }
    if (this.audioElDeckB) {
      this.audioElDeckB.pause();
    }
    this.stopCrackleNode();
  }

  public seekTo(seconds: number) {
    if (this.audioEl && this.isUsingRealAudio && Number.isFinite(seconds)) {
      try {
        const maxDur = Number.isFinite(this.audioEl.duration)
          ? this.audioEl.duration
          : seconds + 1;
        this.audioEl.currentTime = Math.max(0, Math.min(maxDur, seconds));
      } catch {
        // Ignore seek errors if audio stream isn't buffered yet
      }
    }
    if (this.isPlaying) {
      this.triggerNeedleDrop(true);
    }
  }

  public getCurrentAudioTime(): number | null {
    if (this.audioEl && this.isUsingRealAudio && !this.audioEl.paused) {
      return Number.isFinite(this.audioEl.currentTime) ? this.audioEl.currentTime : null;
    }
    return null;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getVolume(): number {
    return this.volume;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = Boolean(muted);
    const effectiveVol = this.isMuted ? 0 : this.volume;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(effectiveVol, this.ctx.currentTime, 0.015);
    }
    if (this.audioEl) {
      this.audioEl.muted = this.isMuted;
      if (!this.mediaSourceConnectedA) {
        this.audioEl.volume = effectiveVol;
      }
    }
    if (this.audioElDeckB) {
      this.audioElDeckB.muted = this.isMuted;
      if (!this.mediaSourceConnectedB) {
        this.audioElDeckB.volume = effectiveVol;
      }
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    const effectiveVol = this.isMuted ? 0 : this.volume;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(effectiveVol, this.ctx.currentTime, 0.02);
    }
    if (this.audioEl && !this.mediaSourceConnectedA) {
      this.audioEl.volume = effectiveVol;
    }
  }

  public setPlaybackRate(rate: number) {
    this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
    if (this.audioEl) {
      this.audioEl.playbackRate = this.playbackRate;
    }
  }

  public setCrackleLevel(level: number) {
    this.crackleLevel = Math.max(0, Math.min(1, level));
    if (this.crackleGain && this.ctx) {
      this.crackleGain.gain.setTargetAtTime(this.crackleLevel * 0.09, this.ctx.currentTime, 0.04);
    }
  }

  public triggerVinylScratch(intensity: 'light' | 'classic' | 'backspin' = 'classic') {
    if (this.soundTheme === 'aurora-deck') {
      this.triggerAuroraTimeShear(intensity);
      return;
    }
    if (this.soundTheme === 'streamline') {
      this.triggerStreamlineDjBrake(intensity);
      return;
    }
    if (this.soundTheme === 'reel-to-reel') {
      this.triggerReelTapeNudge(intensity);
      return;
    }
    if (this.soundTheme === 'cassette-deck') {
      this.triggerCassetteTapeChew(intensity);
      return;
    }
    if (this.soundTheme === 'click-wheel') {
      this.triggerClickWheelSkipStutter(intensity);
      return;
    }
    if (this.soundTheme === 'squircle-pmp') {
      this.triggerSquircleStutterRewind(intensity);
      return;
    }
    if (this.soundTheme === 'desktop-98') {
      this.triggerDesktop98ScratchBurst(intensity);
      return;
    }
    if (this.soundTheme === 'cd-hifi') {
      this.triggerCdOpticalStutter(intensity);
      return;
    }
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const duration = intensity === 'backspin' ? 0.55 : intensity === 'classic' ? 0.34 : 0.2;

    if (this.audioEl && this.isUsingRealAudio && !this.audioEl.paused) {
      const baseRate = this.playbackRate;
      this.audioEl.playbackRate = intensity === 'backspin' ? 0.5 : 1.45;
      window.setTimeout(() => {
        if (this.audioEl) {
          this.audioEl.playbackRate = baseRate;
        }
      }, duration * 800);
    }

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(
      intensity === 'backspin' ? 880 : 620,
      now + duration * 0.42
    );
    osc.frequency.exponentialRampToValueAtTime(110, now + duration);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(4.2, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public getVuLevels(): { left: number; right: number } {
    if (!this.isPlaying || this.isDocumentHidden) {
      return { left: 0.06, right: 0.06 };
    }
    this.levelPhase += 0.24 * this.playbackRate;
    const beatPulse = Math.abs(Math.sin(this.levelPhase));
    const secondary = Math.abs(Math.cos(this.levelPhase * 1.35));

    const left = Math.min(0.98, (0.35 + beatPulse * 0.52) * this.volume);
    const right = Math.min(0.98, (0.32 + secondary * 0.55) * this.volume);

    return { left, right };
  }

  public getSpectrumBands(barCount = 19, eqGains01?: number[]): number[] {
    const out = new Array<number>(barCount).fill(0);
    if (!this.isPlaying || this.isDocumentHidden) {
      return out;
    }

    let hasLiveFftEnergy = false;
    if (this.analyser && this.freqBuffer) {
      this.analyser.getByteFrequencyData(this.freqBuffer);
      let energySum = 0;
      const maxUsefulBin = Math.min(this.freqBuffer.length, Math.max(barCount * 2, 42));
      for (let i = 0; i < maxUsefulBin; i++) {
        energySum += this.freqBuffer[i];
      }
      if (energySum > 18) {
        hasLiveFftEnergy = true;
        for (let b = 0; b < barCount; b++) {
          const binStart = Math.floor((b / barCount) * (maxUsefulBin * 0.88));
          const binEnd = Math.max(binStart + 1, Math.floor(((b + 1) / barCount) * (maxUsefulBin * 0.88)));
          let peak = 0;
          for (let k = binStart; k < binEnd && k < this.freqBuffer.length; k++) {
            if (this.freqBuffer[k] > peak) peak = this.freqBuffer[k];
          }
          let norm = peak / 255;
          if (eqGains01 && eqGains01.length > 0) {
            const eqIdx = Math.min(eqGains01.length - 1, Math.floor((b / barCount) * eqGains01.length));
            const eqMult = 0.55 + eqGains01[eqIdx] * 0.9;
            norm = Math.min(1, norm * eqMult);
          }
          out[b] = Math.max(0.04, Math.min(1, norm * (0.7 + this.volume * 0.45)));
        }
      }
    }

    if (!hasLiveFftEnergy) {
      this.levelPhase += 0.22 * this.playbackRate;
      const t = this.levelPhase;
      for (let b = 0; b < barCount; b++) {
        const freqWeight = 1 - (b / Math.max(1, barCount - 1)) * 0.38;
        const bassPulse = b < 5 ? Math.abs(Math.sin(t * 1.15 - b * 0.22)) * 0.56 : 0;
        const midWave =
          Math.abs(Math.sin(t * (1.4 + b * 0.13) + b * 0.72)) * 0.45 +
          Math.abs(Math.cos(t * 0.85 - b * 0.48)) * 0.34;
        let norm = (0.12 + bassPulse + midWave) * freqWeight;
        if (eqGains01 && eqGains01.length > 0) {
          const eqIdx = Math.min(eqGains01.length - 1, Math.floor((b / barCount) * eqGains01.length));
          norm *= 0.55 + eqGains01[eqIdx] * 0.9;
        }
        out[b] = Math.max(0.05, Math.min(1, norm * Math.max(0.35, this.volume)));
      }
    }

    return out;
  }

  public getWaveformSamples(sampleCount = 38): number[] {
    const out = new Array<number>(sampleCount).fill(0);
    if (!this.isPlaying || this.isDocumentHidden) {
      return out;
    }

    let hasLiveSignal = false;
    if (this.analyser && this.timeBuffer) {
      this.analyser.getByteTimeDomainData(this.timeBuffer);
      let maxDev = 0;
      for (let i = 0; i < this.timeBuffer.length; i++) {
        const dev = Math.abs(this.timeBuffer[i] - 128);
        if (dev > maxDev) maxDev = dev;
      }
      if (maxDev > 2) {
        hasLiveSignal = true;
        for (let i = 0; i < sampleCount; i++) {
          const idx = Math.min(
            this.timeBuffer.length - 1,
            Math.floor((i / sampleCount) * this.timeBuffer.length)
          );
          out[i] = Math.max(-1, Math.min(1, ((this.timeBuffer[idx] - 128) / 128) * 1.65));
        }
      }
    }

    if (!hasLiveSignal) {
      this.levelPhase += 0.18 * this.playbackRate;
      for (let i = 0; i < sampleCount; i++) {
        const x = (i / sampleCount) * Math.PI * 4 + this.levelPhase * 2.2;
        out[i] =
          (Math.sin(x) * 0.55 + Math.sin(x * 2.1 + 0.8) * 0.28 + Math.cos(x * 0.5) * 0.17) *
          Math.max(0.35, this.volume);
      }
    }

    return out;
  }

  /**
   * Plays authentic 1998 3.5" floppy drive latch clunk + stepper seek chatter.
   */
  public triggerFloppySeekCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    [0, 0.09, 0.17, 0.26].forEach((offset, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(idx === 0 ? 220 : 480 + idx * 95, now + offset);
      osc.frequency.exponentialRampToValueAtTime(idx === 0 ? 75 : 190, now + offset + 0.045);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(idx === 0 ? 0.075 : 0.032, now + offset + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.055);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.06);
    });
  }

  private async resolveFullAudioUrl(
    trackId: string,
    previewAudioUrl?: string,
    trackTitle?: string,
    trackArtist?: string
  ): Promise<string | null> {
    if (trackTitle && trackId !== 'standby-empty') {
      try {
        const params = new URLSearchParams({
          trackId,
          title: trackTitle,
          artist: trackArtist || '',
        });
        const res = await fetch(`/api/audio/full-track?${params.toString()}`);
        if (res.ok) {
          const data = (await res.json()) as { streamUrl?: string | null };
          if (data.streamUrl) {
            return data.streamUrl;
          }
        }
      } catch {
        // Fallback below
      }
    }

    if (previewAudioUrl) {
      return previewAudioUrl;
    }

    return null;
  }

  private async loadAndPlayTrackAudio(
    trackId: string,
    previewAudioUrl?: string,
    trackTitle?: string,
    trackArtist?: string,
    preserveDeckGainSchedule = false,
    startTimeSec = 0
  ) {
    const requestToken = ++this.currentRequestToken;
    this.fallbackPreviewUrl = previewAudioUrl || null;
    const resolvedUrl = await this.resolveFullAudioUrl(
      trackId,
      previewAudioUrl,
      trackTitle,
      trackArtist
    );

    if (requestToken !== this.currentRequestToken || !this.isPlaying || this.activeTrackId !== trackId) {
      return;
    }

    if (resolvedUrl) {
      const audio = this.ensureAudioElement();
      if (!preserveDeckGainSchedule && this.ctx && this.deckAGain) {
        const now = this.ctx.currentTime;
        this.deckAGain.gain.cancelScheduledValues(now);
        this.deckAGain.gain.setValueAtTime(1.0, now);
      }

      const switchedTrack = this.lastLoadedTrackId !== trackId;
      this.lastLoadedTrackId = trackId;

      if (this.activePreviewUrl !== resolvedUrl) {
        this.activePreviewUrl = resolvedUrl;
        audio.src = resolvedUrl;
        try {
          audio.currentTime = Math.max(0, startTimeSec);
        } catch {
          // ignore
        }
      } else if (switchedTrack || startTimeSec > 0) {
        try {
          audio.currentTime = Math.max(0, startTimeSec);
        } catch {
          // ignore
        }
      }

      audio.muted = this.isMuted;
      audio.volume = this.mediaSourceConnectedA ? 1.0 : this.isMuted ? 0 : this.volume;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, this.playbackRate));

      if (this.stepTimer !== null) {
        window.clearTimeout(this.stepTimer);
        this.stepTimer = null;
      }

      audio
        .play()
        .then(() => {
          if (requestToken === this.currentRequestToken && this.activeTrackId === trackId) {
            this.isUsingRealAudio = true;
          }
        })
        .catch(() => {
          if (requestToken !== this.currentRequestToken || this.activeTrackId !== trackId) return;
          if (previewAudioUrl && resolvedUrl !== previewAudioUrl) {
            this.activePreviewUrl = previewAudioUrl;
            audio.src = previewAudioUrl;
            audio
              .play()
              .then(() => {
                if (requestToken === this.currentRequestToken && this.activeTrackId === trackId) {
                  this.isUsingRealAudio = true;
                }
              })
              .catch(() => {
                if (requestToken === this.currentRequestToken) {
                  this.isUsingRealAudio = false;
                  if (this.isPlaying) {
                    this.scheduleStepLoop();
                  }
                }
              });
            return;
          }
          this.isUsingRealAudio = false;
          if (this.isPlaying) {
            this.scheduleStepLoop();
          }
        });
    } else {
      if (this.audioEl) {
        this.audioEl.pause();
      }
      this.activePreviewUrl = null;
      this.isUsingRealAudio = false;
      this.scheduleStepLoop();
    }
  }

  private scheduleStepLoop() {
    if (this.stepTimer !== null) {
      window.clearTimeout(this.stepTimer);
      this.stepTimer = null;
    }

    const tick = () => {
      if (!this.isPlaying || this.isUsingRealAudio) return;
      this.playSequencerStep(this.stepIndex);
      this.stepIndex = (this.stepIndex + 1) % 8;

      const effectiveBpm = Math.max(50, this.bpm * this.playbackRate);
      const eighthNoteMs = (60 / effectiveBpm / 2) * 1000;
      this.stepTimer = window.setTimeout(tick, eighthNoteMs);
    };

    tick();
  }

  private playSequencerStep(step: number) {
    if (!this.ctx || !this.masterGain) return;
    const targetOut = this.synthGain || this.masterGain;
    const now = this.ctx.currentTime;
    const cfg = PRESETS[this.preset] || PRESETS['midnight-synth'];
    const stepDuration = 60 / Math.max(50, this.bpm * this.playbackRate) / 2;

    if (step % 2 === 0) {
      this.triggerKick(now, targetOut);
    } else {
      this.triggerSnare(now, targetOut);
    }

    this.triggerHiHat(now, step % 2 === 1, targetOut);

    const bassFreq = cfg.bassNotes[step % cfg.bassNotes.length] * this.playbackRate;
    this.triggerBass(now, bassFreq, stepDuration * 0.85, targetOut);

    if (step % 2 === 0) {
      const chordIndex = Math.floor(step / 2) % cfg.progression.length;
      const chord = cfg.progression[chordIndex];
      this.triggerChord(now, chord, cfg.waveType, cfg.filterCutoff, stepDuration * 1.85, targetOut);
    }

    const leadFreq = cfg.leadNotes[step % cfg.leadNotes.length] * this.playbackRate;
    this.triggerLead(now, leadFreq, cfg.leadWave, stepDuration * 0.72, targetOut);
  }

  private triggerKick(now: number, targetOut: AudioNode) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(targetOut);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  private triggerSnare(now: number, targetOut: AudioNode) {
    if (!this.ctx) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.14);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(850, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(targetOut);
    noise.start(now);
  }

  private triggerHiHat(now: number, open: boolean, targetOut: AudioNode) {
    if (!this.ctx) return;
    const length = open ? 0.09 : 0.04;
    const bufferSize = Math.floor(this.ctx.sampleRate * length);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(5500, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(open ? 0.08 : 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + length);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(targetOut);
    noise.start(now);
  }

  private triggerBass(now: number, freq: number, duration: number, targetOut: AudioNode) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, now);
    filter.Q.setValueAtTime(2.5, now);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(targetOut);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private triggerChord(
    now: number,
    freqs: number[],
    wave: OscillatorType,
    cutoff: number,
    duration: number,
    targetOut: AudioNode
  ) {
    if (!this.ctx) return;
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    filter.connect(gain);
    gain.connect(targetOut);

    freqs.forEach((f) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(f * this.playbackRate, now);
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    });
  }

  private triggerLead(
    now: number,
    freq: number,
    wave: OscillatorType,
    duration: number,
    targetOut: AudioNode
  ) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = wave;
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(targetOut);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /**
   * Motorized 3-Disc Changer tray gear servo whir + limit switch click.
   */
  public triggerCdTrayServoSound(opening = true) {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Servo DC gear motor hum
    const servoOsc = this.ctx.createOscillator();
    const servoFilter = this.ctx.createBiquadFilter();
    const servoGain = this.ctx.createGain();
    servoOsc.type = 'sawtooth';
    servoOsc.frequency.setValueAtTime(opening ? 145 : 195, now);
    servoOsc.frequency.linearRampToValueAtTime(opening ? 205 : 138, now + 0.36);

    servoFilter.type = 'bandpass';
    servoFilter.frequency.setValueAtTime(520, now);
    servoFilter.Q.setValueAtTime(2.4, now);

    servoGain.gain.setValueAtTime(0.001, now);
    servoGain.gain.linearRampToValueAtTime(0.055, now + 0.04);
    servoGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    servoOsc.connect(servoFilter);
    servoFilter.connect(servoGain);
    servoGain.connect(this.masterGain);
    servoOsc.start(now);
    servoOsc.stop(now + 0.44);

    // End-of-travel mechanical limit switch click
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(opening ? 920 : 680, now + 0.36);
    clickOsc.frequency.exponentialRampToValueAtTime(180, now + 0.41);
    clickGain.gain.setValueAtTime(0.001, now + 0.36);
    clickGain.gain.linearRampToValueAtTime(0.075, now + 0.368);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    clickOsc.connect(clickGain);
    clickGain.connect(this.masterGain);
    clickOsc.start(now + 0.36);
    clickOsc.stop(now + 0.43);
  }

  /**
   * Magnetic spindle clamper drop + optical laser focus chirp + high-RPM spin-up whoosh.
   */
  public triggerCdLaserSpinUpSound() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // 1. Magnetic clamper lock thud
    const clampOsc = this.ctx.createOscillator();
    const clampGain = this.ctx.createGain();
    clampOsc.type = 'sine';
    clampOsc.frequency.setValueAtTime(135, now);
    clampOsc.frequency.exponentialRampToValueAtTime(48, now + 0.065);
    clampGain.gain.setValueAtTime(0.001, now);
    clampGain.gain.linearRampToValueAtTime(0.07, now + 0.006);
    clampGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
    clampOsc.connect(clampGain);
    clampGain.connect(this.masterGain);
    clampOsc.start(now);
    clampOsc.stop(now + 0.08);

    // 2. Optical pickup red laser diode focus chirp
    const chirpOsc = this.ctx.createOscillator();
    const chirpGain = this.ctx.createGain();
    chirpOsc.type = 'sine';
    chirpOsc.frequency.setValueAtTime(1850, now + 0.05);
    chirpOsc.frequency.exponentialRampToValueAtTime(2950, now + 0.11);
    chirpOsc.frequency.exponentialRampToValueAtTime(2100, now + 0.16);
    chirpGain.gain.setValueAtTime(0.001, now + 0.05);
    chirpGain.gain.linearRampToValueAtTime(0.032, now + 0.07);
    chirpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
    chirpOsc.connect(chirpGain);
    chirpGain.connect(this.masterGain);
    chirpOsc.start(now + 0.05);
    chirpOsc.stop(now + 0.18);

    // 3. High-RPM spindle spin-up whisper
    const spinOsc = this.ctx.createOscillator();
    const spinGain = this.ctx.createGain();
    spinOsc.type = 'triangle';
    spinOsc.frequency.setValueAtTime(180, now + 0.08);
    spinOsc.frequency.exponentialRampToValueAtTime(640, now + 0.34);
    spinGain.gain.setValueAtTime(0.001, now + 0.08);
    spinGain.gain.linearRampToValueAtTime(0.035, now + 0.16);
    spinGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    spinOsc.connect(spinGain);
    spinGain.connect(this.masterGain);
    spinOsc.start(now + 0.08);
    spinOsc.stop(now + 0.4);
  }

  /**
   * Full 3-stage CD changer track-load audio sequence:
   * tray eject servo -> jewel case disc seat click -> tray retract + laser TOC spin-up.
   */
  public triggerCdTrackChangeCue() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    this.clearTrackChangeTimers();

    this.triggerCdTrayServoSound(true);
    const tClose = window.setTimeout(() => {
      this.triggerCdTrayServoSound(false);
    }, 980);
    const tSpin = window.setTimeout(() => {
      this.triggerCdLaserSpinUpSound();
    }, 1480);
    this.trackChangeTimerIds.push(tClose, tSpin);
  }

  /**
   * Soft rubberized tactile button click + IR blaster pulse for Sony RMT-TX102U remote.
   */
  public triggerRemoteButtonClick(accent = false) {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 1680 : 1320, now);
    osc.frequency.exponentialRampToValueAtTime(accent ? 540 : 410, now + 0.018);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(accent ? 0.055 : 0.042, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.025);
  }

  /**
   * CD Hi-Fi optical buffer skip-stutter ("D-BASS / Optical Loop") on scratch trigger.
   */
  public triggerCdOpticalStutter(intensity: 'light' | 'classic' | 'backspin' = 'classic') {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const totalMs = intensity === 'backspin' ? 400 : intensity === 'light' ? 220 : 310;
    if (this.audioEl && this.isUsingRealAudio && !this.audioEl.paused) {
      const baseRate = this.playbackRate;
      const baseTime = this.audioEl.currentTime;
      this.audioEl.playbackRate = 1.18;
      const s1 = window.setTimeout(() => {
        if (this.audioEl && this.isPlaying) {
          try {
            this.audioEl.currentTime = Math.max(0, baseTime - 0.06);
          } catch {
            // ignore
          }
          this.audioEl.playbackRate = 0.88;
        }
      }, 95);
      const s2 = window.setTimeout(() => {
        if (this.audioEl) {
          this.audioEl.playbackRate = baseRate;
        }
      }, totalMs);
      this.trackChangeTimerIds.push(s1, s2);
    }

    if (this.isMuted || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    [0, 0.075, 0.15].forEach((offset, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1420 + idx * 240, now + offset);
      osc.frequency.exponentialRampToValueAtTime(680, now + offset + 0.042);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.048, now + offset + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.05);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.055);
    });
  }

  private startCrackleNode() {
    if (
      this.soundTheme === 'reel-to-reel' ||
      this.soundTheme === 'cassette-deck' ||
      this.soundTheme === 'cd-hifi' ||
      this.soundTheme === 'click-wheel' ||
      this.soundTheme === 'squircle-pmp' ||
      this.soundTheme === 'desktop-98' ||
      this.soundTheme === 'streamline' ||
      this.soundTheme === 'aurora-deck' ||
      this.soundTheme === 'pc-winamp'
    ) {
      return;
    }
    if (!this.ctx || !this.masterGain || this.crackleSource) return;

    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      if (Math.random() > 0.996) {
        output[i] = (Math.random() * 2 - 1) * 0.65;
      } else {
        output[i] = (Math.random() * 2 - 1) * 0.03;
      }
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;
    whiteNoise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1850;

    this.crackleGain = this.ctx.createGain();
    this.crackleGain.gain.value = this.crackleLevel * 0.09;

    whiteNoise.connect(filter);
    filter.connect(this.crackleGain);
    this.crackleGain.connect(this.masterGain);

    whiteNoise.start(0);
    this.crackleSource = whiteNoise;
  }

  /**
   * Warm descending 4-note Windows 98 shutdown chime synthesized via Web Audio API.
   */
  public triggerWin98ShutdownChime() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const notes = [
      { freq: 587.33, offset: 0.0, dur: 0.34 }, // D5
      { freq: 440.0, offset: 0.22, dur: 0.34 }, // A4
      { freq: 392.0, offset: 0.44, dur: 0.36 }, // G4
      { freq: 293.66, offset: 0.68, dur: 0.78 }, // D4
    ];

    notes.forEach((n) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const subOsc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.freq, now + n.offset);
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(n.freq * 2, now + n.offset);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, now + n.offset);

      gain.gain.setValueAtTime(0.001, now + n.offset);
      gain.gain.linearRampToValueAtTime(0.085, now + n.offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.offset + n.dur);

      osc.connect(filter);
      subOsc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + n.offset);
      subOsc.start(now + n.offset);
      osc.stop(now + n.offset + n.dur + 0.03);
      subOsc.stop(now + n.offset + n.dur + 0.03);
    });
  }

  /**
   * Classic Windows 98 critical error chord (CHORD.WAV style) synthesized cleanly via Web Audio API:
   * rich layered electric-piano/organ minor-seventh chord burst with ~180ms decay.
   */
  public triggerWin98CriticalErrorChord() {
    if (this.isMuted || this.volume <= 0.01) return;
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Classic minor-7th chime cluster (F4, Ab4, C5, Eb5)
    const freqs = [349.23, 415.3, 523.25, 622.25];
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, now);

    const chordGain = this.ctx.createGain();
    chordGain.gain.setValueAtTime(0.001, now);
    chordGain.gain.linearRampToValueAtTime(0.14, now + 0.012);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    filter.connect(chordGain);
    chordGain.connect(this.masterGain);

    freqs.forEach((f, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(f, now);
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + 0.26);
    });
  }

  private stopCrackleNode() {
    if (this.crackleSource) {
      try {
        this.crackleSource.stop();
        this.crackleSource.disconnect();
      } catch {
        // ignore already stopped
      }
      this.crackleSource = null;
    }
  }
}

export const retroAudio = new RetroAudioEngine();

