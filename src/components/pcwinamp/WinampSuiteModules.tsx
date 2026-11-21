import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  FolderPlus,
  Disc3,
  Search,
  X,
} from 'lucide-react';
import type { TrackItem } from '../../utils/playerLogic';
import type { DoubleTapHideArtBindings } from '../../hooks/useDoubleTapHideArt';
import {
  WINAMP_EQ_BAND_LABELS,
  WINAMP_EQ_PRESETS,
  dbToNormalized01,
  normalized01ToDb,
  computeWinampEqSplinePath,
  formatWinampTrackDuration,
  formatWinampLcdTime,
  buildWinampMarqueeText,
  sumPlaylistDurationSec,
} from '../../utils/pcWinampLogic';

/* ============================================================================
   Top Mini Bar: THINGER (Classic Winamp Micro Utility Dock)
   ============================================================================ */

interface WinampThingerModuleProps {
  isPlaying: boolean;
  compact?: boolean;
  poweredOff?: boolean;
  eqVisible: boolean;
  playlistVisible: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleEqVisible: () => void;
  onTogglePlaylistVisible: () => void;
  onOpenSpotifyModal: () => void;
  onOpenMediaPlayer?: () => void;
}

export const WinampThingerModule: React.FC<WinampThingerModuleProps> = ({
  isPlaying,
  compact = false,
  poweredOff = false,
  eqVisible,
  playlistVisible,
  onTogglePlay,
  onStop,
  onPrevious,
  onNext,
  onToggleEqVisible,
  onTogglePlaylistVisible,
  onOpenSpotifyModal,
  onOpenMediaPlayer,
}) => (
  <section
    id="winamp-thinger-module"
    data-testid="winamp-thinger-module"
    data-no-drawer-swipe="true"
    aria-label="Winamp Thinger Bar"
    style={{ opacity: poweredOff ? 0.58 : 1 }}
    className={`pcw-winamp-chassis w-full max-w-full min-w-0 flex items-center justify-between gap-1.5 ${
      compact ? 'px-[4px] py-[2px]' : 'px-[6px] py-[3px]'
    } rounded-[2px] select-none shrink-0 transition-opacity duration-200`}
  >
    <div className="flex items-center gap-1 min-w-0 shrink-0">
      <span className="w-[5px] h-[5px] bg-[#E6C245] border border-[#0D0E17] shrink-0" />
      <span className="font-mono text-[7.5px] font-bold tracking-[0.14em] text-[#E6C245] uppercase">
        THINGER
      </span>
    </div>

    <span className="flex-1 h-[5px] pcw-winamp-ridges min-w-[12px]" />

    <div className="flex items-center gap-[2px] shrink-0">
      <button
        type="button"
        onClick={onPrevious}
        aria-label="Thinger Previous"
        title="Previous"
        className="pcw-winamp-btn w-[17px] h-[15px] flex items-center justify-center cursor-pointer"
      >
        <SkipBack className="w-2 h-2 fill-current" />
      </button>
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Thinger Pause' : 'Thinger Play'}
        title={isPlaying ? 'Pause' : 'Play'}
        className="pcw-winamp-btn w-[17px] h-[15px] flex items-center justify-center text-[#00FF00] cursor-pointer"
      >
        {isPlaying ? (
          <Pause className="w-2 h-2 fill-current" />
        ) : (
          <Play className="w-2 h-2 fill-current" />
        )}
      </button>
      <button
        type="button"
        onClick={onStop}
        aria-label="Thinger Stop"
        title="Stop"
        className="pcw-winamp-btn w-[17px] h-[15px] flex items-center justify-center cursor-pointer"
      >
        <Square className="w-2 h-2 fill-current" />
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Thinger Next"
        title="Next"
        className="pcw-winamp-btn w-[17px] h-[15px] flex items-center justify-center cursor-pointer"
      >
        <SkipForward className="w-2 h-2 fill-current" />
      </button>
      <button
        type="button"
        data-active={eqVisible ? 'true' : 'false'}
        onClick={onToggleEqVisible}
        className={`pcw-winamp-btn h-[15px] px-1 font-mono text-[7px] font-bold cursor-pointer ${
          eqVisible ? 'text-[#00FF00]' : 'text-[#8E94AB]'
        }`}
      >
        EQ
      </button>
      <button
        type="button"
        data-active={playlistVisible ? 'true' : 'false'}
        onClick={onTogglePlaylistVisible}
        className={`pcw-winamp-btn h-[15px] px-1 font-mono text-[7px] font-bold cursor-pointer ${
          playlistVisible ? 'text-[#00FF00]' : 'text-[#8E94AB]'
        }`}
      >
        ML
      </button>
      {onOpenMediaPlayer && (
        <button
          type="button"
          onClick={onOpenMediaPlayer}
          className="pcw-winamp-btn h-[15px] px-1 font-mono text-[7px] font-bold text-[#E6C245] cursor-pointer"
          title="Open Video in Media Player"
        >
          VID
        </button>
      )}
      <button
        type="button"
        onClick={onOpenSpotifyModal}
        aria-label="Add Spotify Tracks"
        title="Load Spotify Playlist"
        className="pcw-winamp-btn h-[15px] px-1 font-mono text-[7px] font-bold text-[#00FF00] cursor-pointer"
      >
        +LOAD
      </button>
    </div>
  </section>
);

/* ============================================================================
   Upper-Left Window: WINAMP Main Deck (O A I D V, 320 kbps, EQ/PL, Transport)
   ============================================================================ */

interface WinampMainDeckModuleProps {
  track: TrackItem;
  trackIndex: number;
  isPlaying: boolean;
  isStandby: boolean;
  elapsedSec: number;
  volume: number;
  repeatOne: boolean;
  shuffleEnabled: boolean;
  spectrumBars: number[];
  waveformSamples: number[];
  compact?: boolean;
  poweredOff?: boolean;
  eqVisible?: boolean;
  playlistVisible?: boolean;
  onToggleEqVisible?: () => void;
  onTogglePlaylistVisible?: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (targetSec: number) => void;
  onChangeVolume: (nextVol: number) => void;
  onToggleRepeatOne: () => void;
  onToggleShuffle: () => void;
  onOpenSpotifyModal: () => void;
}

const WINAMP_OAIDV_LETTERS = ['O', 'A', 'I', 'D', 'V'] as const;

export const WinampMainDeckModule: React.FC<WinampMainDeckModuleProps> = ({
  track,
  trackIndex,
  isPlaying,
  isStandby,
  elapsedSec,
  volume,
  repeatOne,
  shuffleEnabled,
  spectrumBars,
  waveformSamples,
  compact = false,
  poweredOff = false,
  eqVisible = true,
  playlistVisible = true,
  onToggleEqVisible,
  onTogglePlaylistVisible,
  onTogglePlay,
  onStop,
  onPrevious,
  onNext,
  onSeek,
  onChangeVolume,
  onToggleRepeatOne,
  onToggleShuffle,
  onOpenSpotifyModal,
}) => {
  const [analyzerMode, setAnalyzerMode] = useState<'spectrum' | 'oscilloscope'>('spectrum');
  const [remainingTimeMode, setRemainingTimeMode] = useState(false);
  const [balanceVal, setBalanceVal] = useState(0);
  const [oaidvActive, setOaidvActive] = useState<'O' | 'A' | 'I' | 'D' | 'V'>('A');

  const marqueeText = buildWinampMarqueeText(track, trackIndex);
  const progressPct =
    track.durationSec > 0
      ? Math.max(0, Math.min(100, (elapsedSec / track.durationSec) * 100))
      : 0;

  return (
    <section
      id="winamp-main-deck-module"
      data-testid="winamp-main-deck-module"
      data-no-drawer-swipe="true"
      aria-label="Winamp Main Player Deck"
      style={{ opacity: poweredOff ? 0.58 : 1 }}
      className={`pcw-winamp-chassis w-full max-w-full min-w-0 flex flex-col justify-between ${
        compact ? 'p-[3px]' : 'p-[5px]'
      } rounded-[2px] select-none shrink-0 transition-opacity duration-200`}
    >
      {/* Classic Winamp Titlebar with Horizontal Golden Ridges */}
      <div
        className={`flex items-center gap-1.5 ${compact ? 'h-[10px] mb-[2px]' : 'h-[12px] mb-[4px]'} shrink-0`}
      >
        <span className="w-[6px] h-[6px] bg-[#E6C245] border border-[#0D0E17] shrink-0" />
        <span className="flex-1 h-[6px] pcw-winamp-ridges" />
        <span
          className={`font-mono ${compact ? 'text-[7px]' : 'text-[8px]'} font-bold tracking-[0.14em] text-[#E6C245] uppercase shrink-0`}
        >
          WINAMP
        </span>
        <span className="flex-1 h-[6px] pcw-winamp-ridges" />
      </div>

      {/* LCD Readout Bay: O A I D V + Timer + 19-Band Spectrum | Marquee + 320 kbps + Vol/Bal + EQ/PL */}
      <div
        className={`grid grid-cols-[auto_minmax(0,1fr)] gap-1.5 ${compact ? 'mb-[2px]' : 'mb-[4px]'}`}
      >
        <div className="flex items-stretch gap-[2px]">
          {/* Vertical O A I D V Clutterbar */}
          <div
            aria-label="Winamp Clutterbar"
            className="bg-[#000000] border border-[#0D0E17] px-[2px] py-[1px] flex flex-col justify-between items-center shrink-0"
          >
            {WINAMP_OAIDV_LETTERS.map((letter) => {
              const active = oaidvActive === letter;
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => setOaidvActive(letter)}
                  className={`font-mono text-[6px] leading-none font-bold cursor-pointer ${
                    active ? 'text-[#00FF00]' : 'text-[#6C708F] hover:text-[#E6C245]'
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col justify-between gap-[2px]">
            <button
              type="button"
              onClick={() => setRemainingTimeMode((r) => !r)}
              title="Click to toggle elapsed/remaining time"
              className={`bg-[#000000] border border-[#0D0E17] ${
                compact ? 'px-1 py-[1px]' : 'px-1.5 py-[2px]'
              } flex items-center justify-between gap-1 cursor-pointer`}
            >
              <span
                style={{ color: poweredOff ? '#144214' : '#00FF00' }}
                className="font-mono text-[7.5px] leading-none"
              >
                {poweredOff ? '■' : isPlaying ? '▶' : isStandby ? '■' : '❚❚'}
              </span>
              <span
                style={{ color: poweredOff ? '#144214' : '#00FF00' }}
                className={`font-mono ${
                  compact ? 'text-[10px]' : 'text-[12px]'
                } font-bold leading-none tabular-nums tracking-wider`}
              >
                {formatWinampLcdTime(elapsedSec, remainingTimeMode, track.durationSec)}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setAnalyzerMode((m) => (m === 'spectrum' ? 'oscilloscope' : 'spectrum'))
              }
              title="Click to toggle Spectrum / Oscilloscope"
              className={`${
                compact ? 'w-[62px] h-[14px]' : 'w-[74px] h-[19px]'
              } bg-[#000000] border border-[#0D0E17] px-[2px] py-[2px] flex items-end justify-between gap-[1px] cursor-pointer overflow-hidden`}
            >
              {analyzerMode === 'spectrum' ? (
                spectrumBars.slice(0, 19).map((val, idx) => {
                  const barPct = Math.max(8, Math.round(val * 100));
                  return (
                    <span key={idx} className="relative flex-1 h-full flex items-end">
                      <span
                        style={{
                          height: `${barPct}%`,
                          background:
                            'linear-gradient(to top, #00FF00 0%, #FFFF00 55%, #FF8000 80%, #FF0000 100%)',
                        }}
                        className="w-full block relative"
                      >
                        <span className="absolute -top-[1px] left-0 right-0 h-[1px] bg-white/90" />
                      </span>
                    </span>
                  );
                })
              ) : (
                <svg viewBox="0 0 76 18" className="w-full h-full">
                  <polyline
                    fill="none"
                    stroke="#00FF00"
                    strokeWidth="1.2"
                    points={waveformSamples
                      .slice(0, 38)
                      .map((s, i) => {
                        const x = (i / 37) * 76;
                        const y = 9 - s * 7.5;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      })
                      .join(' ')}
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div
          className={`min-w-0 flex flex-col justify-between ${
            compact ? 'gap-[1.5px]' : 'gap-[3px]'
          }`}
        >
          {/* Song Title Only Scrolling Marquee */}
          <div className="bg-[#000000] border border-[#0D0E17] px-1.5 py-[2px] overflow-hidden">
            <div
              data-paused={!isPlaying || poweredOff ? 'true' : 'false'}
              style={{ color: poweredOff ? '#144214' : '#00FF00' }}
              className={`pcw-marquee-track font-mono ${
                compact ? 'text-[8px]' : 'text-[9px]'
              } font-bold leading-none`}
            >
              <span className="pr-4">{marqueeText}</span>
              <span className="pr-4" aria-hidden="true">
                {marqueeText}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-1 font-mono text-[7.5px] leading-none">
            <div className="flex items-center gap-[3px]">
              <span
                style={{ color: poweredOff ? '#144214' : '#00FF00' }}
                className="bg-[#000000] border border-[#0D0E17] px-1 py-[1px]"
              >
                320
              </span>
              <span className="text-[#9AA0BC]">kbps</span>
              <span
                style={{ color: poweredOff ? '#144214' : '#00FF00' }}
                className="bg-[#000000] border border-[#0D0E17] px-1 py-[1px]"
              >
                44
              </span>
              <span className="text-[#9AA0BC]">kHz</span>
            </div>
            <span
              style={{ color: poweredOff ? '#144214' : '#00FF00' }}
              className="font-bold uppercase text-[7px]"
            >
              STEREO
            </span>
          </div>

          <div className="flex items-center gap-1">
            <input
              type="range"
              aria-label="Docked Winamp Volume"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
              style={{
                background: 'linear-gradient(90deg, #00C83C 0%, #E6C245 65%, #D62828 100%)',
              }}
              className="flex-1 min-w-0 h-[4px] accent-[#D0D4E4] cursor-pointer"
            />
            <input
              type="range"
              aria-label="Docked Winamp Balance"
              min={-50}
              max={50}
              value={balanceVal}
              onChange={(e) => setBalanceVal(Number(e.target.value))}
              className={`${
                compact ? 'w-[24px]' : 'w-[30px]'
              } h-[4px] bg-[#0B0D12] accent-[#D0D4E4] cursor-pointer shrink-0`}
            />
            <div className="flex items-center gap-[2px] shrink-0">
              <button
                type="button"
                data-active={eqVisible ? 'true' : 'false'}
                onClick={onToggleEqVisible}
                className={`pcw-winamp-btn h-[14px] px-1 font-mono text-[6.5px] font-bold cursor-pointer ${
                  eqVisible ? 'text-[#00FF00]' : 'text-[#9EA3B8]'
                }`}
              >
                EQ
              </button>
              <button
                type="button"
                data-active={playlistVisible ? 'true' : 'false'}
                onClick={onTogglePlaylistVisible}
                className={`pcw-winamp-btn h-[14px] px-1 font-mono text-[6.5px] font-bold cursor-pointer ${
                  playlistVisible ? 'text-[#00FF00]' : 'text-[#9EA3B8]'
                }`}
              >
                PL
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Seek Scrubber Bar */}
      <div className={`${compact ? 'mb-[2px]' : 'mb-[4px]'} flex items-center`}>
        <input
          type="range"
          aria-label="Docked Winamp Seek"
          min={0}
          max={Math.max(1, track.durationSec)}
          value={Math.min(track.durationSec, Math.floor(elapsedSec))}
          disabled={isStandby || track.durationSec <= 0}
          onChange={(e) => onSeek(Number(e.target.value))}
          style={{
            background: `linear-gradient(90deg, #E6C245 ${progressPct}%, #08090D ${progressPct}%)`,
          }}
          className="w-full h-[4px] accent-[#E6C245] cursor-pointer"
        />
      </div>

      {/* Transport Buttons + SHUFFLE / REPEAT */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-[2px]">
          <button
            type="button"
            onClick={onPrevious}
            aria-label="Previous"
            className="pcw-winamp-btn w-[18px] h-[16px] flex items-center justify-center cursor-pointer"
          >
            <SkipBack className="w-2.5 h-2.5 fill-current" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label="Play"
            className="pcw-winamp-btn w-[18px] h-[16px] flex items-center justify-center text-[#00FF00] cursor-pointer"
          >
            <Play className="w-2.5 h-2.5 fill-current" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label="Pause"
            className="pcw-winamp-btn w-[18px] h-[16px] flex items-center justify-center cursor-pointer"
          >
            <Pause className="w-2.5 h-2.5 fill-current" />
          </button>
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            className="pcw-winamp-btn w-[18px] h-[16px] flex items-center justify-center cursor-pointer"
          >
            <Square className="w-2 h-2 fill-current" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next"
            className="pcw-winamp-btn w-[18px] h-[16px] flex items-center justify-center cursor-pointer"
          >
            <SkipForward className="w-2.5 h-2.5 fill-current" />
          </button>
          <button
            type="button"
            onClick={onOpenSpotifyModal}
            aria-label="Open Playlist / Eject"
            className="pcw-winamp-btn w-[18px] h-[16px] flex items-center justify-center text-[8px] font-bold cursor-pointer"
          >
            ⏏
          </button>
        </div>

        <div className="flex items-center gap-[2px]">
          <button
            type="button"
            data-active={shuffleEnabled ? 'true' : 'false'}
            onClick={onToggleShuffle}
            className={`pcw-winamp-btn h-[16px] px-1 font-mono text-[7px] font-bold cursor-pointer ${
              shuffleEnabled ? 'text-[#00FF00]' : 'text-[#9EA3B8]'
            }`}
          >
            SHUFFLE
          </button>
          <button
            type="button"
            data-active={repeatOne ? 'true' : 'false'}
            onClick={onToggleRepeatOne}
            className={`pcw-winamp-btn h-[16px] px-1 font-mono text-[7px] font-bold cursor-pointer ${
              repeatOne ? 'text-[#00FF00]' : 'text-[#9EA3B8]'
            }`}
          >
            REPEAT
          </button>
        </div>
      </div>
    </section>
  );
};

/* ============================================================================
   Middle-Left Window: WINAMP EQUALIZER (+12/0/-12 db, Golden Spline, 10 Bands)
   ============================================================================ */

interface VerticalFaderProps {
  label: string;
  dbValue: number;
  liveEnergy01: number;
  onChangeDb: (nextDb: number) => void;
  compact?: boolean;
}

const WinampEqVerticalFader: React.FC<VerticalFaderProps> = ({
  label,
  dbValue,
  liveEnergy01,
  onChangeDb,
  compact = false,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const norm = dbToNormalized01(dbValue);
  const thumbBottomPct = norm * 78;

  const updateFromClientY = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return;
    const ratioFromBottom = 1 - (clientY - rect.top) / rect.height;
    onChangeDb(normalized01ToDb(ratioFromBottom));
  };

  const trackColor = norm > 0.72 ? '#EF4444' : norm > 0.48 ? '#EAB308' : '#22C55E';

  return (
    <div className="flex flex-col items-center gap-[2px] min-w-0 flex-1 select-none">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`Winamp EQ ${label} Hz`}
        aria-valuemin={-12}
        aria-valuemax={12}
        aria-valuenow={dbValue}
        title={`${label} Hz: ${dbValue > 0 ? `+${dbValue}` : dbValue} dB (Double-click to reset)`}
        onDoubleClick={() => onChangeDb(0)}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          updateFromClientY(e.clientY);
        }}
        onPointerMove={(e) => {
          if ((e.buttons & 1) === 1 || e.pointerType === 'touch') {
            updateFromClientY(e.clientY);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            onChangeDb(Math.min(12, dbValue + 1));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onChangeDb(Math.max(-12, dbValue - 1));
          }
        }}
        className={`relative ${
          compact ? 'w-[9px] h-[26px]' : 'w-[11px] h-[44px]'
        } bg-[#0B0D12] border border-[#07080C] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.9),1px_1px_0_rgba(120,126,152,0.3)] rounded-[1px] cursor-ns-resize touch-none flex items-center justify-center`}
      >
        {/* Classic Red -> Yellow -> Green Track Slot */}
        <div
          aria-hidden="true"
          style={{
            background: 'linear-gradient(to bottom, #D62828 0%, #E6C245 48%, #00C83C 100%)',
            opacity: 0.45 + liveEnergy01 * 0.45,
          }}
          className="w-[3px] h-[88%] rounded-full"
        />

        {/* Subtle Live Audio-Reactive Center Glow */}
        <div
          aria-hidden="true"
          style={{
            height: `${Math.max(8, Math.round(liveEnergy01 * 92))}%`,
            backgroundColor: trackColor,
            opacity: liveEnergy01 > 0.05 ? 0.55 : 0,
          }}
          className="absolute bottom-[4%] w-[4px] rounded-full pointer-events-none transition-[height] duration-75"
        />

        {/* Metallic Slotted Winamp Thumb */}
        <div
          aria-hidden="true"
          style={{ bottom: `${thumbBottomPct}%` }}
          className="absolute left-1/2 -translate-x-1/2 w-[11px] h-[7px] rounded-[1px] bg-gradient-to-b from-[#A2A7BD] via-[#676B80] to-[#3B3E4D] border-t border-l border-[#CFD4E8] border-r border-b border-[#11131B] shadow-[0_1px_2px_rgba(0,0,0,0.85)] flex items-center justify-center pointer-events-none"
        >
          <span className="w-[6px] h-[1px] bg-[#00FF00]" />
        </div>
      </div>

      <span className="font-mono text-[6.5px] leading-none text-[#A3A8BD] tracking-tighter">
        {label}
      </span>
    </div>
  );
};

interface WinampEqualizerModuleProps {
  eqEnabled: boolean;
  eqAuto: boolean;
  preampDb: number;
  bandsDb: number[];
  spectrumBars: number[];
  compact?: boolean;
  poweredOff?: boolean;
  className?: string;
  onToggleEqEnabled: () => void;
  onToggleEqAuto: () => void;
  onChangePreampDb: (db: number) => void;
  onChangeBandDb: (idx: number, db: number) => void;
  onApplyPreset: (preampDb: number, bandsDb: number[]) => void;
}

export const WinampEqualizerModule: React.FC<WinampEqualizerModuleProps> = ({
  eqEnabled,
  eqAuto,
  preampDb,
  bandsDb,
  spectrumBars,
  compact = false,
  poweredOff = false,
  className = '',
  onToggleEqEnabled,
  onToggleEqAuto,
  onChangePreampDb,
  onChangeBandDb,
  onApplyPreset,
}) => {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const svgHeight = compact ? 13 : 18;
  const { linePoints, areaPoints } = computeWinampEqSplinePath(
    preampDb,
    bandsDb,
    114,
    svgHeight
  );

  return (
    <section
      id="winamp-equalizer-module"
      data-testid="winamp-equalizer-module"
      data-no-drawer-swipe="true"
      aria-label="Winamp Graphic Equalizer"
      style={{ opacity: poweredOff ? 0.58 : 1 }}
      className={`pcw-winamp-chassis relative max-w-full min-w-0 flex flex-col justify-between ${
        compact ? 'p-[3px]' : 'p-[5px]'
      } rounded-[2px] select-none transition-opacity duration-200 ${className}`}
    >
      {/* Top Winamp Titlebar with Horizontal Golden Ridges */}
      <div
        className={`flex items-center gap-1.5 ${compact ? 'h-[10px] mb-[2px]' : 'h-[12px] mb-[3px]'} shrink-0`}
      >
        <span className="w-[6px] h-[6px] bg-[#E6C245] border border-[#0D0E17] shrink-0" />
        <span className="flex-1 h-[6px] pcw-winamp-ridges" />
        <span
          className={`font-mono ${compact ? 'text-[7px]' : 'text-[8px]'} font-bold tracking-[0.14em] text-[#E6C245] uppercase shrink-0`}
        >
          WINAMP EQUALIZER
        </span>
        <span className="flex-1 h-[6px] pcw-winamp-ridges" />
      </div>

      {/* Controls Row: ON / AUTO LED Toggles + Golden EQ Curve Box + PRESETS */}
      <div
        className={`flex items-center justify-between gap-1.5 ${compact ? 'mb-[2px]' : 'mb-[3px]'} shrink-0`}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="winamp-eq-on-btn"
            data-active={eqEnabled ? 'true' : 'false'}
            onClick={onToggleEqEnabled}
            className="pcw-winamp-btn h-[16px] px-1 font-mono text-[7.5px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <span
              className={`w-[4.5px] h-[4.5px] rounded-full ${
                eqEnabled ? 'bg-[#00FF00] shadow-[0_0_5px_#00FF00]' : 'bg-[#283328]'
              }`}
            />
            <span className={eqEnabled ? 'text-[#00FF00]' : 'text-[#8C91A6]'}>ON</span>
          </button>
          <button
            type="button"
            data-active={eqAuto ? 'true' : 'false'}
            onClick={onToggleEqAuto}
            className="pcw-winamp-btn h-[16px] px-1 font-mono text-[7.5px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <span
              className={`w-[4.5px] h-[4.5px] rounded-full ${
                eqAuto ? 'bg-[#00FF00] shadow-[0_0_5px_#00FF00]' : 'bg-[#283328]'
              }`}
            />
            <span className={eqAuto ? 'text-[#00FF00]' : 'text-[#8C91A6]'}>AUTO</span>
          </button>
        </div>

        {/* Black EQ Curve Visualizer Box */}
        <div className="flex-1 min-w-[64px] max-w-[140px] bg-[#000000] border border-[#0D0E17] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.95),1px_1px_0_rgba(110,115,140,0.35)] px-1 py-[1px] flex items-center justify-center">
          <svg
            viewBox={`0 0 114 ${svgHeight}`}
            className={`w-full ${compact ? 'h-[15px]' : 'h-[18px]'}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="pcwEqSplineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FF2E2E" />
                <stop offset="48%" stopColor="#E6C245" />
                <stop offset="100%" stopColor="#00FF00" />
              </linearGradient>
              <linearGradient id="pcwEqAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(230, 194, 69, 0.25)" />
                <stop offset="100%" stopColor="rgba(0, 255, 0, 0.04)" />
              </linearGradient>
            </defs>
            <line
              x1="0"
              y1={svgHeight / 2}
              x2="114"
              y2={svgHeight / 2}
              stroke="#2C303D"
              strokeWidth="0.7"
              strokeDasharray="2 2"
            />
            <polygon points={areaPoints} fill="url(#pcwEqAreaGrad)" />
            <polyline
              points={linePoints}
              fill="none"
              stroke={eqEnabled ? 'url(#pcwEqSplineGrad)' : '#525666'}
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Presets Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setPresetsOpen((prev) => !prev)}
            className="pcw-winamp-btn h-[16px] px-1.5 font-mono text-[7.5px] font-bold tracking-wider uppercase cursor-pointer"
          >
            PRESETS
          </button>
          {presetsOpen && (
            <div className="absolute right-0 bottom-full mb-1 z-50 w-28 pcw-winamp-chassis p-1 space-y-0.5">
              {WINAMP_EQ_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onApplyPreset(preset.preampDb, [...preset.bandsDb]);
                    setPresetsOpen(false);
                  }}
                  className="w-full px-1.5 py-1 text-left font-mono text-[9.5px] text-[#00FF00] bg-[#000000] hover:bg-[#0000FF] hover:text-white cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sliders Bay: +12/0/-12 db + PREAMP + 10 Frequency Faders (60Hz .. 16KHz) */}
      <div className="flex items-end gap-1 pt-[2px]">
        <div className="flex items-end gap-1 pr-1 border-r border-[#494D61]">
          <div
            className={`hidden sm:flex flex-col justify-between ${
              compact ? 'h-[36px]' : 'h-[48px]'
            } pb-[8px] font-mono text-[6px] text-[#8F94AA] leading-none text-right`}
          >
            <span>+12</span>
            <span>0db</span>
            <span>-12</span>
          </div>
          <WinampEqVerticalFader
            label="PRE"
            dbValue={preampDb}
            liveEnergy01={spectrumBars[0] || 0}
            onChangeDb={onChangePreampDb}
            compact={compact}
          />
        </div>

        <div className="flex-1 min-w-0 flex items-end justify-between gap-[1px]">
          {WINAMP_EQ_BAND_LABELS.map((bandLabel, idx) => {
            const specIdx = Math.min(spectrumBars.length - 1, Math.floor(idx * 1.8));
            return (
              <WinampEqVerticalFader
                key={bandLabel}
                label={bandLabel}
                dbValue={bandsDb[idx] ?? 0}
                liveEnergy01={eqEnabled ? spectrumBars[specIdx] || 0 : 0}
                onChangeDb={(nextDb) => onChangeBandDb(idx, nextDb)}
                compact={compact}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
};

/* ============================================================================
   Upper-Right Window: Winamp ALBUM ART Window (Part 1 Double-Click/Tap to Hide)
   ============================================================================ */

interface WinampAlbumArtModuleProps {
  artworkUrl: string;
  trackTitle: string;
  hideBoxArt: boolean;
  prefersReducedMotion: boolean;
  compact?: boolean;
  poweredOff?: boolean;
  doubleTapHideArtBind: DoubleTapHideArtBindings;
}

export const WinampAlbumArtModule: React.FC<WinampAlbumArtModuleProps> = ({
  artworkUrl,
  trackTitle,
  hideBoxArt,
  prefersReducedMotion,
  compact = false,
  poweredOff = false,
  doubleTapHideArtBind,
}) => (
  <section
    id="album-art-holder-box"
    data-testid="winamp-album-art-module"
    data-no-drawer-swipe="true"
    aria-label="Winamp Album Art"
    aria-hidden={hideBoxArt ? 'true' : undefined}
    title="Double-click or double-tap to hide album art"
    onDoubleClick={doubleTapHideArtBind.onDoubleClick}
    onPointerDownCapture={doubleTapHideArtBind.onPointerDownCapture}
    onPointerUpCapture={doubleTapHideArtBind.onPointerUpCapture}
    style={{
      opacity: hideBoxArt ? 0 : poweredOff ? 0.58 : 1,
      transform: `scale(${hideBoxArt ? 0.94 : 1})`,
      transition: prefersReducedMotion
        ? 'none'
        : 'opacity 220ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      pointerEvents: hideBoxArt ? 'none' : 'auto',
    }}
    className={`pcw-winamp-chassis h-full w-full min-w-0 flex flex-col justify-between ${
      compact ? 'p-[3px]' : 'p-[5px]'
    } rounded-[2px] select-none cursor-pointer`}
  >
    {/* Top Titlebar */}
    <div
      className={`flex items-center gap-1 ${compact ? 'h-[10px] mb-[2px]' : 'h-[12px] mb-[4px]'} shrink-0`}
    >
      <span className="w-[5px] h-[5px] bg-[#E6C245] border border-[#0D0E17] shrink-0" />
      <span className="flex-1 h-[6px] pcw-winamp-ridges" />
      <span
        className={`font-mono ${compact ? 'text-[6.5px]' : 'text-[7.5px]'} font-bold tracking-[0.12em] text-[#E6C245] uppercase shrink-0`}
      >
        ALBUM ART
      </span>
      <span className="flex-1 h-[6px] pcw-winamp-ridges" />
    </div>

    {/* Recessed Black Viewport Holding Clean Square Cover */}
    <div className="flex-1 min-h-0 w-full bg-[#000000] border border-[#0D0E17] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.95),1px_1px_0_rgba(108,112,143,0.3)] p-[4px] flex items-center justify-center overflow-hidden">
      <div className="relative aspect-square h-full max-w-full max-h-full bg-[#11131C] border border-[#2B2F44] overflow-hidden flex items-center justify-center">
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt={trackTitle}
            draggable={false}
            className="w-full h-full object-cover select-none"
          />
        ) : (
          <Disc3 className="w-7 h-7 text-[#00FF00]/45" />
        )}
      </div>
    </div>
  </section>
);

/* ============================================================================
   Mobile Vertical Transport Bar (Thumb-Sized >= 42px Controls per Part 5.4)
   ============================================================================ */

interface WinampCompactTransportBarProps {
  isPlaying: boolean;
  isStandby: boolean;
  elapsedSec: number;
  eqEnabled: boolean;
  spectrumBars: number[];
  onTogglePlay: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleEqEnabled: () => void;
}

export const WinampCompactTransportBar: React.FC<WinampCompactTransportBarProps> = ({
  isPlaying,
  isStandby,
  elapsedSec,
  eqEnabled,
  spectrumBars,
  onTogglePlay,
  onStop,
  onPrevious,
  onNext,
  onToggleEqEnabled,
}) => (
  <section
    id="winamp-compact-transport-bar"
    data-testid="winamp-compact-transport-bar"
    data-no-drawer-swipe="true"
    aria-label="Compact Winamp Transport and Spectrum Bar"
    className="pcw-winamp-chassis w-full max-w-full min-w-0 px-[6px] py-[5px] rounded-[2px] flex items-center justify-between gap-1.5 flex-nowrap shrink-0 select-none"
  >
    {/* Left: Thumb-Sized Beveled Winamp Transport Keys (min-height: 42px; min-width: 48px) */}
    <div className="flex items-center gap-[4px] shrink-0">
      <button
        type="button"
        onClick={onPrevious}
        aria-label="Previous track"
        className="pcw-winamp-btn min-h-[42px] min-w-[48px] px-3 flex items-center justify-center cursor-pointer"
      >
        <SkipBack className="w-4 h-4 fill-current" />
      </button>
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className="pcw-winamp-btn min-h-[42px] min-w-[48px] px-3 flex items-center justify-center text-[#00FF00] cursor-pointer"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current" />
        )}
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next track"
        className="pcw-winamp-btn min-h-[42px] min-w-[48px] px-3 flex items-center justify-center cursor-pointer"
      >
        <SkipForward className="w-4 h-4 fill-current" />
      </button>
      <button
        type="button"
        onClick={onStop}
        aria-label="Stop"
        className="pcw-winamp-btn min-h-[42px] w-[36px] flex items-center justify-center cursor-pointer"
      >
        <Square className="w-3.5 h-3.5 fill-current" />
      </button>
    </div>

    {/* Right: Live Spectrum Visualizer + EQ Pill + LCD Timer */}
    <div className="flex-1 min-w-0 flex items-center gap-1.5">
      <div className="flex-1 min-w-[32px] h-[36px] bg-[#000000] border border-[#0D0F14] px-1 py-[3px] flex items-end justify-between gap-[1px] overflow-hidden">
        {spectrumBars.slice(0, 12).map((val, idx) => {
          const barPct = isPlaying && !isStandby ? Math.max(10, Math.round(val * 100)) : 8;
          return (
            <span key={idx} className="relative flex-1 h-full flex items-end">
              <span
                style={{
                  height: `${barPct}%`,
                  background:
                    'linear-gradient(to top, #00FF00 0%, #FFFF00 55%, #FF8000 82%, #FF0000 100%)',
                }}
                className="w-full block relative"
              >
                <span className="absolute -top-[1px] left-0 right-0 h-[1px] bg-white/85" />
              </span>
            </span>
          );
        })}
      </div>

      <button
        type="button"
        data-active={eqEnabled ? 'true' : 'false'}
        onClick={onToggleEqEnabled}
        aria-label="Toggle Equalizer"
        className="pcw-winamp-btn min-h-[42px] px-2 font-mono text-[8.5px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
      >
        <span
          className={`w-[5px] h-[5px] rounded-full ${
            eqEnabled ? 'bg-[#00FF00] shadow-[0_0_4px_#00FF00]' : 'bg-[#283328]'
          }`}
        />
        <span className={eqEnabled ? 'text-[#00FF00]' : 'text-[#8C91A6]'}>EQ</span>
      </button>

      <div className="bg-[#000000] border border-[#0D0E17] px-1.5 py-[3px] font-mono text-[9.5px] font-bold text-[#00FF00] tabular-nums shrink-0 leading-none">
        {formatWinampLcdTime(elapsedSec)}
      </div>
    </div>
  </section>
);

/* ============================================================================
   Bottom Full-Width Dock: WINAMP LIBRARY (Search, #0000FF Highlight, Titles Only)
   ============================================================================ */

interface WinampPlaylistModuleProps {
  tracks: TrackItem[];
  activeTrackId: string;
  isPlaying: boolean;
  elapsedSec: number;
  compact?: boolean;
  poweredOff?: boolean;
  highlightFlash?: boolean;
  onSelectTrack: (trackId: string) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onOpenSpotifyModal: () => void;
}

export const WinampPlaylistModule: React.FC<WinampPlaylistModuleProps> = ({
  tracks,
  activeTrackId,
  isPlaying,
  elapsedSec,
  compact = false,
  poweredOff = false,
  highlightFlash = false,
  onSelectTrack,
  onTogglePlay,
  onOpenSpotifyModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [cursorTrackId, setCursorTrackId] = useState<string>(activeTrackId);

  useEffect(() => {
    setCursorTrackId(activeTrackId);
  }, [activeTrackId]);

  const validTracks = useMemo(
    () => tracks.filter((t) => t.id !== 'standby-empty' && t.durationSec > 0),
    [tracks]
  );

  const filteredTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return validTracks;
    return validTracks.filter((tr) => tr.title.toLowerCase().includes(q));
  }, [validTracks, searchQuery]);

  const totalSec = sumPlaylistDurationSec(validTracks);

  const handlePlaySelected = () => {
    if (cursorTrackId && cursorTrackId !== activeTrackId) {
      onSelectTrack(cursorTrackId);
    } else if (!isPlaying) {
      onTogglePlay();
    } else if (filteredTracks[0]) {
      onSelectTrack(filteredTracks[0].id);
    }
  };

  const handlePlayAll = () => {
    if (validTracks[0]) {
      onSelectTrack(validTracks[0].id);
    } else {
      onOpenSpotifyModal();
    }
  };

  return (
    <section
      id="winamp-playlist-module"
      data-testid="winamp-playlist-module"
      data-no-drawer-swipe="true"
      aria-label="Winamp Library"
      style={{ opacity: poweredOff ? 0.58 : 1 }}
      className={`pcw-winamp-chassis h-full max-w-full min-w-0 flex-1 min-h-0 flex flex-col ${
        compact ? 'p-[4px]' : 'p-[5px]'
      } rounded-[2px] select-none transition-opacity duration-200 ${
        highlightFlash ? 'pcw-playlist-focus-flash' : ''
      }`}
    >
      {/* Ribbed Titlebar */}
      <div
        className={`flex items-center gap-1.5 ${
          compact ? 'h-[10px] mb-[2px]' : 'h-[12px] mb-[4px]'
        } shrink-0`}
      >
        <span className="w-[6px] h-[6px] bg-[#E6C245] border border-[#0D0E17] shrink-0" />
        <span className="flex-1 h-[6px] pcw-winamp-ridges" />
        <span
          className={`font-mono ${
            compact ? 'text-[7px]' : 'text-[8px]'
          } font-bold tracking-[0.14em] text-[#E6C245] uppercase shrink-0`}
        >
          WINAMP LIBRARY
        </span>
        <span className="flex-1 h-[6px] pcw-winamp-ridges" />
      </div>

      {/* Live Search Bar */}
      <div className="mb-[3px] flex items-center gap-1.5 shrink-0">
        <label
          htmlFor="winamp-library-search"
          className="font-mono text-[8.5px] font-bold text-[#D6DAEB] shrink-0 flex items-center gap-1"
        >
          <Search className="w-2.5 h-2.5 text-[#E6C245]" />
          <span>Search:</span>
        </label>
        <div className="relative flex-1 min-w-0 flex items-center bg-[#000000] border border-[#0D0E17] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.9),1px_1px_0_rgba(108,112,143,0.3)]">
          <input
            id="winamp-library-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter song titles..."
            className="w-full bg-transparent px-1.5 py-[2px] font-mono text-[10px] text-[#00FF00] placeholder:text-[#2D692D] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="pr-1 text-[#8E94AB] hover:text-white cursor-pointer"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* Black High-Contrast Monospaced Song-Titles-Only Listing (#0000FF Selection Highlight) */}
      <div className="pcw-winamp-scroll flex-1 min-h-0 bg-[#000000] border border-[#0D0E17] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.95),1px_1px_0_rgba(108,112,143,0.3)] overflow-y-auto px-1 py-1">
        {validTracks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-center px-3 py-4">
            <p className="font-mono text-[11px] text-[#00FF00]">
              [ NO TRACKS IN WINAMP LIBRARY ]
            </p>
            <button
              type="button"
              onClick={onOpenSpotifyModal}
              className="pcw-winamp-btn px-2.5 py-1 font-mono text-[10px] font-bold text-[#00FF00] cursor-pointer"
            >
              + LOAD SPOTIFY PLAYLIST / SEARCH
            </button>
          </div>
        ) : filteredTracks.length === 0 ? (
          <div className="h-full flex items-center justify-center px-3 py-4">
            <p className="font-mono text-[10px] text-[#E6C245]">
              No songs matching &quot;{searchQuery}&quot;
            </p>
          </div>
        ) : (
          <div role="listbox" aria-label="Playlist Tracks" className="space-y-[1px]">
            {filteredTracks.map((tr) => {
              const originalIndex = validTracks.findIndex((t) => t.id === tr.id);
              const displayIdx = originalIndex >= 0 ? originalIndex : 0;
              const isSelected = tr.id === activeTrackId || tr.id === cursorTrackId;
              return (
                <button
                  key={tr.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`pcw-playlist-row-${displayIdx}`}
                  onClick={() => {
                    setCursorTrackId(tr.id);
                    onSelectTrack(tr.id);
                  }}
                  style={{
                    backgroundColor: isSelected ? '#0000FF' : 'transparent',
                    color: isSelected ? '#FFFFFF' : '#00FF00',
                  }}
                  className="w-full px-1.5 py-[2.5px] flex items-center justify-between gap-2 text-left font-mono text-[10.5px] leading-[1.3] hover:bg-[#101838] cursor-pointer"
                >
                  <span className="truncate">
                    {displayIdx + 1}. {tr.title}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatWinampTrackDuration(tr.durationSec)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Action Footer: Play, Enqueue, Play all, Enqueue all + Timer */}
      <div className="mt-[4px] flex flex-wrap items-center justify-between gap-1 shrink-0">
        <div className="flex items-center gap-[3px] flex-wrap">
          <button
            type="button"
            onClick={handlePlaySelected}
            className="pcw-winamp-btn h-[19px] px-2 font-mono text-[8px] font-bold text-[#00FF00] cursor-pointer"
          >
            Play
          </button>
          <button
            type="button"
            onClick={onOpenSpotifyModal}
            className="pcw-winamp-btn h-[19px] px-2 font-mono text-[8px] font-bold cursor-pointer"
          >
            Enqueue
          </button>
          <button
            type="button"
            onClick={handlePlayAll}
            className="pcw-winamp-btn h-[19px] px-2 font-mono text-[8px] font-bold cursor-pointer"
          >
            Play all
          </button>
          <button
            type="button"
            onClick={onOpenSpotifyModal}
            className="hidden sm:inline-flex items-center pcw-winamp-btn h-[19px] px-2 font-mono text-[8px] font-bold cursor-pointer"
          >
            Enqueue all
          </button>
          <button
            type="button"
            data-testid="winamp-add-file-btn"
            onClick={onOpenSpotifyModal}
            className="pcw-winamp-btn h-[19px] px-1.5 font-mono text-[8px] font-bold text-[#E6C245] inline-flex items-center gap-1 cursor-pointer"
            title="Load Spotify playlist or search tracks"
          >
            <FolderPlus className="w-2.5 h-2.5" />
            <span>+ ADD</span>
          </button>
        </div>

        {/* Track / Total Playlist Time Box */}
        <div className="bg-[#000000] border border-[#0D0E17] px-1.5 py-[2px] font-mono text-[9px] text-[#00FF00] tabular-nums shrink-0">
          {formatWinampLcdTime(elapsedSec)} / {formatWinampLcdTime(totalSec)}
        </div>
      </div>
    </section>
  );
};
