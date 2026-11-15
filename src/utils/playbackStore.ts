import { useSyncExternalStore } from 'react';
import { quantizeTvFrameTime } from './playerLogic';

type Listener = () => void;

class PlaybackClockStore {
  private currentTimeSec = 0;
  private durationSec = 0;
  private currentSecond = 0;
  private cueSection = 0;
  private tvBucketSec = 0;

  private secondListeners = new Set<Listener>();
  private cueListeners = new Set<Listener>();
  private tvBucketListeners = new Set<Listener>();

  public getCurrentTimeSec = (): number => this.currentTimeSec;
  public getCurrentSecond = (): number => this.currentSecond;
  public getDurationSec = (): number => this.durationSec;
  public getCueSection = (): number => this.cueSection;
  public getTvBucketSec = (): number => this.tvBucketSec;

  public setTrackDuration(durationSec: number) {
    this.durationSec = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
    this.recomputeBuckets(true);
  }

  public setTime(nextTimeSec: number, forceNotify = false) {
    const clamped =
      this.durationSec > 0
        ? Math.max(0, Math.min(this.durationSec, nextTimeSec))
        : Math.max(0, nextTimeSec);
    this.currentTimeSec = clamped;
    this.recomputeBuckets(forceNotify);
  }

  private recomputeBuckets(forceNotify: boolean) {
    const nextSec = Math.floor(this.currentTimeSec);
    const ratio = this.durationSec > 0 ? Math.min(1, Math.max(0, this.currentTimeSec / this.durationSec)) : 0;
    const nextCue = ratio >= 0.75 ? 3 : ratio >= 0.5 ? 2 : ratio >= 0.25 ? 1 : 0;
    const nextTvBucket = quantizeTvFrameTime(this.currentTimeSec, 5);

    if (forceNotify || nextSec !== this.currentSecond) {
      this.currentSecond = nextSec;
      this.secondListeners.forEach((l) => l());
    }
    if (forceNotify || nextCue !== this.cueSection) {
      this.cueSection = nextCue;
      this.cueListeners.forEach((l) => l());
    }
    if (forceNotify || nextTvBucket !== this.tvBucketSec) {
      this.tvBucketSec = nextTvBucket;
      this.tvBucketListeners.forEach((l) => l());
    }
  }

  public subscribeSecond = (listener: Listener): (() => void) => {
    this.secondListeners.add(listener);
    return () => {
      this.secondListeners.delete(listener);
    };
  };

  public subscribeCueSection = (listener: Listener): (() => void) => {
    this.cueListeners.add(listener);
    return () => {
      this.cueListeners.delete(listener);
    };
  };

  public subscribeTvBucket = (listener: Listener): (() => void) => {
    this.tvBucketListeners.add(listener);
    return () => {
      this.tvBucketListeners.delete(listener);
    };
  };
}

export const playbackClockStore = new PlaybackClockStore();

export function usePlaybackSecond(): number {
  return useSyncExternalStore(
    playbackClockStore.subscribeSecond,
    playbackClockStore.getCurrentSecond,
    playbackClockStore.getCurrentSecond
  );
}

export function usePlaybackCueSection(): number {
  return useSyncExternalStore(
    playbackClockStore.subscribeCueSection,
    playbackClockStore.getCueSection,
    playbackClockStore.getCueSection
  );
}

export function usePlaybackTvBucket(): number {
  return useSyncExternalStore(
    playbackClockStore.subscribeTvBucket,
    playbackClockStore.getTvBucketSec,
    playbackClockStore.getTvBucketSec
  );
}
