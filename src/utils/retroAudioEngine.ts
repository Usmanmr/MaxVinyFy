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
  private fallbackPreviewUrl: string | null = null;
  private isUsingRealAudio = false;
  private currentRequestToken = 0;

  private isPlaying = false;
  private isDocumentHidden = false;
  private volume = 0.8;
  private playbackRate = 1.0;
  private crackleLevel = 0.25;
  private needleDropCrackle = true;
  private preset: SynthPreset = 'midnight-synth';
  private bpm = 110;
  private stepIndex = 0;
  private stepTimer: number | null = null;
  private levelPhase = 0;
  private lastSeekCrackMs = 0;

  private ensureContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);

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

  /**
   * Plays an authentic short vinyl needle-drop thump + static crackle burst on play or seek.
   */
  public triggerNeedleDrop(isSeek = false) {
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
    this.startCrackleNode();

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

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
    if (this.audioEl && !this.mediaSourceConnectedA) {
      this.audioEl.volume = this.volume;
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

      if (this.activePreviewUrl !== resolvedUrl) {
        this.activePreviewUrl = resolvedUrl;
        audio.src = resolvedUrl;
        try {
          audio.currentTime = Math.max(0, startTimeSec);
        } catch {
          // ignore
        }
      } else if (startTimeSec > 0) {
        try {
          audio.currentTime = startTimeSec;
        } catch {
          // ignore
        }
      }

      audio.volume = this.mediaSourceConnectedA ? 1.0 : this.volume;
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

  private startCrackleNode() {
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
