import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GripHorizontal, Minimize2, Maximize2 } from 'lucide-react';
import { clampRemoteDragPosition } from '../utils/cdHifiLogic';
import { retroAudio } from '../utils/retroAudioEngine';
import { triggerButtonHaptic } from '../utils/playerLogic';

export interface SonyBraviaRemoteProps {
  tvPoweredOn: boolean;
  picOffMode: boolean;
  isMuted: boolean;
  volume: number;
  isPlaying: boolean;
  lowPowerMode?: boolean;
  totalTracks: number;
  externalOpenRequestNonce?: number;
  onToggleTvPower: () => void;
  onCycleTvInput: () => void;
  onCycleTvChannel: (delta: 1 | -1) => void;
  onJumpChannel: () => void;
  onTogglePicOff: () => void;
  onCycleDisplayMode: () => void;
  onTriggerNetflixMode: () => void;
  onChangeVolume: (nextVol: number) => void;
  onToggleMute: () => void;
  onSelectTrackIndex: (index: number) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeekDelta: (deltaSec: number) => void;
  onTriggerColorShortcut?: (color: 'YELLOW' | 'BLUE' | 'RED' | 'GREEN') => void;
}

const REMOTE_WIDTH = 186;
const REMOTE_HEIGHT = 496;

export const SonyBraviaRemote = React.memo<SonyBraviaRemoteProps>(
  ({
    tvPoweredOn,
    picOffMode,
    isMuted,
    volume,
    isPlaying,
    lowPowerMode = false,
    totalTracks,
    externalOpenRequestNonce = 0,
    onToggleTvPower,
    onCycleTvInput,
    onCycleTvChannel,
    onJumpChannel,
    onTogglePicOff,
    onCycleDisplayMode,
    onTriggerNetflixMode,
    onChangeVolume,
    onToggleMute,
    onSelectTrackIndex,
    onTogglePlay,
    onStop,
    onPrevious,
    onNext,
    onSeekDelta,
    onTriggerColorShortcut,
  }) => {
    const getDefaultPosition = useCallback(() => {
      if (typeof window === 'undefined') return { x: 24, y: 84 };
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Default to resting cleanly in the gap between Bravia TV and 3D CD Tower Rack on the left column
      const defaultX = vw >= 1024 ? 20 : Math.max(10, vw - REMOTE_WIDTH - 12);
      const defaultY = vw >= 1024 ? Math.round(vh * 0.388) : Math.max(48, vh - REMOTE_HEIGHT - 16);
      return clampRemoteDragPosition(defaultX, defaultY, vw, vh, REMOTE_WIDTH, REMOTE_HEIGHT);
    }, []);

    const [position, setPosition] = useState<{ x: number; y: number }>(getDefaultPosition);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [isMinimized, setIsMinimized] = useState<boolean>(true);
    const [irActive, setIrActive] = useState<boolean>(false);
    const [lastPressedKey, setLastPressedKey] = useState<string>('READY');

    const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
    const irTimerRef = useRef<number | null>(null);

    useEffect(() => {
      if (externalOpenRequestNonce > 0) {
        setIsMinimized(false);
      }
    }, [externalOpenRequestNonce]);

    useEffect(() => {
      const handleResize = () => {
        setPosition((prev) =>
          clampRemoteDragPosition(
            prev.x,
            prev.y,
            window.innerWidth,
            window.innerHeight,
            REMOTE_WIDTH,
            isMinimized ? 48 : REMOTE_HEIGHT
          )
        );
      };
      window.addEventListener('resize', handleResize, { passive: true });
      return () => window.removeEventListener('resize', handleResize);
    }, [isMinimized]);

    useEffect(() => {
      return () => {
        if (irTimerRef.current !== null) {
          window.clearTimeout(irTimerRef.current);
        }
      };
    }, []);

    const pulseIrBlaster = useCallback(
      (keyLabel: string, accent = false) => {
        triggerButtonHaptic(lowPowerMode);
        retroAudio.triggerRemoteButtonClick(accent);
        setLastPressedKey(keyLabel);
        setIrActive(true);
        if (irTimerRef.current !== null) {
          window.clearTimeout(irTimerRef.current);
        }
        irTimerRef.current = window.setTimeout(() => {
          setIrActive(false);
          irTimerRef.current = null;
        }, 220);
      },
      [lowPowerMode]
    );

    const handlePointerDownDragHandle = (e: React.PointerEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragOffsetRef.current = {
        dx: e.clientX - position.x,
        dy: e.clientY - position.y,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const handlePointerMoveDragHandle = (e: React.PointerEvent<HTMLElement>) => {
      if (!isDragging) return;
      const nextX = e.clientX - dragOffsetRef.current.dx;
      const nextY = e.clientY - dragOffsetRef.current.dy;
      setPosition(
        clampRemoteDragPosition(
          nextX,
          nextY,
          window.innerWidth,
          window.innerHeight,
          REMOTE_WIDTH,
          isMinimized ? 48 : REMOTE_HEIGHT
        )
      );
    };

    const handlePointerUpDragHandle = (e: React.PointerEvent<HTMLElement>) => {
      if (!isDragging) return;
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const handleNumericDigit = (digit: number) => {
      pulseIrBlaster(`NUM ${digit}`, true);
      if (totalTracks <= 0) return;
      const idx = digit === 0 ? Math.min(totalTracks - 1, 9) : Math.min(totalTracks - 1, digit - 1);
      onSelectTrackIndex(idx);
    };

    if (isMinimized) {
      return (
        <div
          id="sony-rmt-tx102u-remote"
          data-remote-minimized="true"
          data-last-ir-key={lastPressedKey}
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          }}
          className="fixed left-0 top-0 z-[85] select-none"
        >
          <div
            onPointerDown={handlePointerDownDragHandle}
            onPointerMove={handlePointerMoveDragHandle}
            onPointerUp={handlePointerUpDragHandle}
            className="rmt-tx102u-body rounded-full px-3 py-1.5 border border-[#454B57] flex items-center gap-2 cursor-grab active:cursor-grabbing"
          >
            <span
              id="rmt-ir-blaster-led"
              data-ir-active={irActive ? 'true' : 'false'}
              className={`w-2 h-2 rounded-full transition-all ${
                irActive
                  ? 'bg-[#FF2A38] shadow-[0_0_10px_#FF2A38]'
                  : 'bg-[#4C151B]'
              }`}
            />
            <span className="font-mono text-[10px] font-bold tracking-wider text-[#E2E8F0]">
              SONY RMT-TX102U
            </span>
            <button
              id="rmt-expand-btn"
              type="button"
              onClick={() => setIsMinimized(false)}
              aria-label="Expand Sony RMT-TX102U TV Remote"
              title="Expand Sony Bravia Remote"
              className="w-5 h-5 rounded-full bg-[#2E333D] hover:bg-[#3E4552] text-white flex items-center justify-center cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <aside
        id="sony-rmt-tx102u-remote"
        aria-label="Draggable Sony RMT-TX102U TV Remote Control"
        data-remote-minimized="false"
        data-remote-dragging={isDragging ? 'true' : 'false'}
        data-last-ir-key={lastPressedKey}
        data-remote-x={position.x}
        data-remote-y={position.y}
        style={{
          width: `${REMOTE_WIDTH}px`,
          transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${isDragging ? 1.02 : 1})`,
          transition: isDragging ? 'none' : 'transform 140ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className="fixed left-0 top-0 z-[85] select-none"
      >
        <div className="rmt-tx102u-body relative w-full rounded-[22px] border border-[#3E434F] px-2.5 pt-2 pb-2.5 flex flex-col gap-1.5 text-white">
          {/* Top Infrared (IR) Blaster Window & Drag Grip Bar */}
          <div
            id="rmt-drag-handle"
            onPointerDown={handlePointerDownDragHandle}
            onPointerMove={handlePointerMoveDragHandle}
            onPointerUp={handlePointerUpDragHandle}
            onDoubleClick={() => setPosition(getDefaultPosition())}
            title="Drag to move Sony RMT-TX102U Remote · Double-click to reset position"
            className="w-full flex items-center justify-between gap-1 pb-1 border-b border-white/10 cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center gap-1.5">
              <span
                id="rmt-ir-blaster-led"
                data-ir-active={irActive ? 'true' : 'false'}
                aria-label={irActive ? 'Infrared Signal Transmitting' : 'Infrared Emitter Idle'}
                className={`w-3 h-1.5 rounded-full border border-black/80 transition-all duration-100 ${
                  irActive
                    ? 'bg-[#FF2436] shadow-[0_0_12px_#FF2436,0_0_4px_#FFFFFF]'
                    : 'bg-[#3B1016]'
                }`}
              />
              <span className="font-mono text-[7.5px] uppercase tracking-[0.14em] text-[#94A3B8]">
                IR · {lastPressedKey}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <GripHorizontal className="w-3.5 h-3.5 text-[#94A3B8]" />
              <button
                id="rmt-minimize-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(true);
                }}
                aria-label="Minimize Sony RMT-TX102U Remote"
                title="Minimize Remote"
                className="w-4 h-4 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-[#CBD5E1] cursor-pointer"
              >
                <Minimize2 className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          {/* Row 1: Top-Left INPUT + Top-Right Green POWER Button */}
          <div className="flex items-center justify-between px-0.5">
            <button
              id="rmt-btn-input"
              type="button"
              onClick={() => {
                pulseIrBlaster('INPUT', true);
                onCycleTvInput();
              }}
              aria-label="Remote TV Input Select"
              className="rmt-rubber-key h-[20px] px-2.5 rounded-full text-[7.5px] font-sans font-extrabold uppercase tracking-wider text-[#E2E8F0] cursor-pointer"
            >
              INPUT
            </button>

            <button
              id="rmt-btn-power"
              type="button"
              aria-pressed={tvPoweredOn}
              onClick={() => {
                pulseIrBlaster('POWER', true);
                onToggleTvPower();
              }}
              aria-label={`Remote TV Power (${tvPoweredOn ? 'On' : 'Off'})`}
              className={`h-[22px] px-2.5 rounded-full border text-[7.5px] font-sans font-extrabold uppercase tracking-wider flex items-center gap-1 cursor-pointer shadow-[0_2px_4px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.35)] active:translate-y-[1px] ${
                tvPoweredOn
                  ? 'bg-gradient-to-b from-[#16A34A] to-[#15803D] border-[#22C55E] text-white'
                  : 'bg-gradient-to-b from-[#1E5E36] to-[#133C23] border-[#166534] text-emerald-200'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#86EFAC]" />
              <span>POWER</span>
            </button>
          </div>

          {/* Row 2: Bravia Sync Utility Row (SYNC MENU | DIGITAL/ANALOG | EXIT) */}
          <div className="grid grid-cols-3 gap-1">
            <button
              id="rmt-btn-sync-menu"
              type="button"
              onClick={() => {
                pulseIrBlaster('SYNC MENU');
                onCycleDisplayMode();
              }}
              className="rmt-rubber-key h-[17px] rounded-[3px] text-[6.5px] font-sans font-bold uppercase tracking-tight text-[#CBD5E1] cursor-pointer"
            >
              SYNC MENU
            </button>
            <button
              id="rmt-btn-dig-ana"
              type="button"
              onClick={() => {
                pulseIrBlaster('DIG/ANA');
                onCycleTvInput();
              }}
              className="rmt-rubber-key h-[17px] rounded-[3px] text-[6.5px] font-sans font-bold uppercase tracking-tight text-[#CBD5E1] cursor-pointer"
            >
              DIG/ANA
            </button>
            <button
              id="rmt-btn-exit"
              type="button"
              onClick={() => {
                pulseIrBlaster('EXIT');
                if (picOffMode) onTogglePicOff();
              }}
              className="rmt-rubber-key h-[17px] rounded-[3px] text-[6.5px] font-sans font-bold uppercase tracking-tight text-[#CBD5E1] cursor-pointer"
            >
              EXIT
            </button>
          </div>

          {/* Row 3: Tactile 0-9 Numeric Keypad + '.' + PIC OFF */}
          <div
            role="group"
            aria-label="Remote Numeric Track Keypad"
            className="grid grid-cols-3 gap-1 pt-0.5"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                id={`rmt-key-${num}`}
                type="button"
                onClick={() => handleNumericDigit(num)}
                aria-label={`Remote Number ${num} (Load Track ${num})`}
                className="rmt-rubber-key relative h-[21px] rounded-[4px] text-[10px] font-sans font-extrabold text-[#F8FAFC] flex items-center justify-center cursor-pointer"
              >
                <span>{num}</span>
                {num === 5 && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/55"
                  />
                )}
              </button>
            ))}

            <button
              id="rmt-btn-dot"
              type="button"
              onClick={() => {
                pulseIrBlaster('DOT');
                onCycleTvChannel(1);
              }}
              aria-label="Remote Sub-Channel Dot"
              className="rmt-rubber-key h-[21px] rounded-[4px] text-[11px] font-sans font-black text-[#E2E8F0] flex items-center justify-center cursor-pointer"
            >
              ·
            </button>

            <button
              id="rmt-key-0"
              type="button"
              onClick={() => handleNumericDigit(0)}
              aria-label="Remote Number 0 (Load Track 10)"
              className="rmt-rubber-key h-[21px] rounded-[4px] text-[10px] font-sans font-extrabold text-[#F8FAFC] flex items-center justify-center cursor-pointer"
            >
              0
            </button>

            <button
              id="rmt-btn-pic-off"
              type="button"
              aria-pressed={picOffMode}
              onClick={() => {
                pulseIrBlaster('PIC OFF', true);
                onTogglePicOff();
              }}
              aria-label={`Remote Picture Off Toggle (${picOffMode ? 'Active' : 'Off'})`}
              className={`rmt-rubber-key h-[21px] rounded-[4px] text-[6.5px] font-sans font-extrabold uppercase tracking-tight flex items-center justify-center cursor-pointer ${
                picOffMode ? '!border-emerald-400 text-emerald-300' : 'text-[#E2E8F0]'
              }`}
            >
              PIC OFF
            </button>
          </div>

          {/* Row 4: Four Colored Teletext / Shortcut Pills (YELLOW, BLUE, RED, GREEN) */}
          <div className="grid grid-cols-4 gap-1 pt-0.5">
            {(
              [
                { id: 'YELLOW', bg: 'from-[#FACC15] to-[#CA8A04]', border: 'border-[#FEF08A]' },
                { id: 'BLUE', bg: 'from-[#3B82F6] to-[#1D4ED8]', border: 'border-[#93C5FD]' },
                { id: 'RED', bg: 'from-[#EF4444] to-[#B91C1C]', border: 'border-[#FCA5A5]' },
                { id: 'GREEN', bg: 'from-[#22C55E] to-[#15803D]', border: 'border-[#86EFAC]' },
              ] as const
            ).map((pill) => (
              <button
                key={pill.id}
                id={`rmt-color-${pill.id.toLowerCase()}`}
                type="button"
                aria-label={`Remote ${pill.id} Shortcut Button`}
                onClick={() => {
                  pulseIrBlaster(pill.id);
                  if (onTriggerColorShortcut) {
                    onTriggerColorShortcut(pill.id);
                  } else {
                    onCycleDisplayMode();
                  }
                }}
                className={`h-[10px] rounded-full bg-gradient-to-b ${pill.bg} border ${pill.border}/60 shadow-[0_1px_2px_rgba(0,0,0,0.8)] cursor-pointer active:translate-y-[1px]`}
              />
            ))}
          </div>

          {/* Row 5: Prominent White NETFLIX Pill Button + 24P / WIDE Keys */}
          <div className="grid grid-cols-4 gap-1 items-center pt-0.5">
            <button
              id="rmt-btn-wide"
              type="button"
              onClick={() => {
                pulseIrBlaster('WIDE');
                onCycleDisplayMode();
              }}
              className="rmt-rubber-key h-[20px] rounded-[4px] text-[6.5px] font-sans font-extrabold uppercase text-[#CBD5E1] cursor-pointer"
            >
              WIDE
            </button>

            <button
              id="rmt-btn-netflix"
              type="button"
              onClick={() => {
                pulseIrBlaster('NETFLIX', true);
                onTriggerNetflixMode();
              }}
              aria-label="Remote Netflix Cinema Visualizer Mode"
              className="col-span-2 h-[21px] rounded-full bg-gradient-to-b from-[#FFFFFF] via-[#F1F5F9] to-[#CBD5E1] border border-white text-[#DC2626] font-sans text-[8.5px] font-black tracking-[0.08em] uppercase shadow-[0_2px_4px_rgba(0,0,0,0.8)] flex items-center justify-center cursor-pointer active:translate-y-[1px]"
            >
              NETFLIX
            </button>

            <button
              id="rmt-btn-cc"
              type="button"
              onClick={() => {
                pulseIrBlaster('SUBTITLE');
                onCycleDisplayMode();
              }}
              className="rmt-rubber-key h-[20px] rounded-[4px] text-[6.5px] font-sans font-extrabold uppercase text-[#CBD5E1] cursor-pointer"
            >
              CC
            </button>
          </div>

          {/* Row 6: D-Pad Navigation Ring Surrounded by DISPLAY, HOME (Light Blue), RETURN, OPTIONS */}
          <div className="relative py-1 flex flex-col items-center">
            {/* Top satellites: DISPLAY (left) & HOME (right, light-blue) */}
            <div className="w-full flex items-center justify-between px-1 mb-1">
              <button
                id="rmt-btn-display"
                type="button"
                onClick={() => {
                  pulseIrBlaster('DISPLAY', true);
                  onCycleDisplayMode();
                }}
                aria-label="Remote Display OSD Info Toggle"
                className="rmt-rubber-key h-[18px] px-2 rounded-full text-[6.5px] font-sans font-extrabold uppercase text-[#E2E8F0] cursor-pointer"
              >
                DISPLAY
              </button>

              <button
                id="rmt-btn-home"
                type="button"
                onClick={() => {
                  pulseIrBlaster('HOME', true);
                  onCycleDisplayMode();
                }}
                aria-label="Remote Sony Bravia Home Menu"
                className="h-[18px] px-2.5 rounded-full bg-gradient-to-b from-[#38BDF8] to-[#0284C7] border border-[#7DD3FC] text-white text-[6.5px] font-sans font-extrabold uppercase tracking-wider shadow-[0_1.5px_3px_rgba(0,0,0,0.8)] cursor-pointer active:translate-y-[1px]"
              >
                HOME
              </button>
            </div>

            {/* Circular D-Pad Ring */}
            <div className="relative w-[84px] h-[84px] rounded-full bg-gradient-to-b from-[#2F343E] to-[#1B1E25] border-2 border-[#101217] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_3px_8px_rgba(0,0,0,0.85)] flex items-center justify-center">
              <button
                id="rmt-dpad-up"
                type="button"
                onClick={() => {
                  pulseIrBlaster('UP');
                  onCycleTvChannel(1);
                }}
                aria-label="Remote D-Pad Up"
                className="absolute top-1 left-1/2 -translate-x-1/2 w-6 h-5 flex items-center justify-center text-[9px] text-[#E2E8F0] hover:text-[#38BDF8] cursor-pointer"
              >
                ▲
              </button>
              <button
                id="rmt-dpad-down"
                type="button"
                onClick={() => {
                  pulseIrBlaster('DOWN');
                  onCycleTvChannel(-1);
                }}
                aria-label="Remote D-Pad Down"
                className="absolute bottom-1 left-1/2 -translate-x-1/2 w-6 h-5 flex items-center justify-center text-[9px] text-[#E2E8F0] hover:text-[#38BDF8] cursor-pointer"
              >
                ▼
              </button>
              <button
                id="rmt-dpad-left"
                type="button"
                onClick={() => {
                  pulseIrBlaster('LEFT');
                  onPrevious();
                }}
                aria-label="Remote D-Pad Left (Previous)"
                className="absolute left-1 top-1/2 -translate-y-1/2 w-5 h-6 flex items-center justify-center text-[9px] text-[#E2E8F0] hover:text-[#38BDF8] cursor-pointer"
              >
                ◀
              </button>
              <button
                id="rmt-dpad-right"
                type="button"
                onClick={() => {
                  pulseIrBlaster('RIGHT');
                  onNext();
                }}
                aria-label="Remote D-Pad Right (Next)"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-6 flex items-center justify-center text-[9px] text-[#E2E8F0] hover:text-[#38BDF8] cursor-pointer"
              >
                ▶
              </button>

              {/* Center Select (+) Button */}
              <button
                id="rmt-dpad-select"
                type="button"
                onClick={() => {
                  pulseIrBlaster('SELECT', true);
                  onTogglePlay();
                }}
                aria-label="Remote Center Select Play/Pause"
                className="w-[34px] h-[34px] rounded-full bg-gradient-to-b from-[#3E4452] to-[#232730] border border-[#525A6B] shadow-[0_2px_4px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.28)] flex items-center justify-center text-[9px] font-bold text-white cursor-pointer active:scale-95"
              >
                ⊕
              </button>
            </div>

            {/* Bottom satellites: RETURN (left) & OPTIONS (right) */}
            <div className="w-full flex items-center justify-between px-1 mt-1">
              <button
                id="rmt-btn-return"
                type="button"
                onClick={() => {
                  pulseIrBlaster('RETURN');
                  onJumpChannel();
                }}
                className="rmt-rubber-key h-[18px] px-2 rounded-full text-[6.5px] font-sans font-extrabold uppercase text-[#E2E8F0] cursor-pointer"
              >
                RETURN
              </button>
              <button
                id="rmt-btn-options"
                type="button"
                onClick={() => {
                  pulseIrBlaster('OPTIONS');
                  onCycleDisplayMode();
                }}
                className="rmt-rubber-key h-[18px] px-2 rounded-full text-[6.5px] font-sans font-extrabold uppercase text-[#E2E8F0] cursor-pointer"
              >
                OPTIONS
              </button>
            </div>
          </div>

          {/* Row 7: Dual Vertical Rocker Bars for VOL +/- and CH +/- flanking JUMP & MUTING */}
          <div className="grid grid-cols-3 gap-1.5 items-stretch px-1">
            {/* Left Vertical Rocker: VOL + / - */}
            <div className="rounded-[8px] bg-[#161920] border border-[#353A46] p-0.5 flex flex-col items-center justify-between shadow-inner">
              <button
                id="rmt-vol-up"
                type="button"
                onClick={() => {
                  pulseIrBlaster('VOL +', true);
                  onChangeVolume(Math.min(1, Number((volume + 0.06).toFixed(2))));
                }}
                aria-label="Remote Volume Up"
                className="rmt-rubber-key w-full h-[22px] rounded-t-[6px] text-[10px] font-extrabold text-white flex items-center justify-center cursor-pointer"
              >
                +
              </button>
              <span className="font-sans text-[7px] font-extrabold tracking-wider text-[#94A3B8] py-0.5">
                VOL
              </span>
              <button
                id="rmt-vol-down"
                type="button"
                onClick={() => {
                  pulseIrBlaster('VOL -', true);
                  onChangeVolume(Math.max(0, Number((volume - 0.06).toFixed(2))));
                }}
                aria-label="Remote Volume Down"
                className="rmt-rubber-key w-full h-[22px] rounded-b-[6px] text-[10px] font-extrabold text-white flex items-center justify-center cursor-pointer"
              >
                −
              </button>
            </div>

            {/* Center Column: JUMP & MUTING */}
            <div className="flex flex-col items-center justify-between py-0.5 gap-1">
              <button
                id="rmt-btn-jump"
                type="button"
                onClick={() => {
                  pulseIrBlaster('JUMP');
                  onJumpChannel();
                }}
                aria-label="Remote Jump Channel"
                className="rmt-rubber-key w-full h-[24px] rounded-[5px] text-[6.5px] font-sans font-extrabold uppercase text-[#E2E8F0] cursor-pointer"
              >
                JUMP
              </button>
              <button
                id="rmt-btn-muting"
                type="button"
                aria-pressed={isMuted}
                onClick={() => {
                  pulseIrBlaster('MUTING', true);
                  onToggleMute();
                }}
                aria-label={`Remote Audio Muting (${isMuted ? 'Muted' : 'Unmuted'})`}
                className={`rmt-rubber-key w-full h-[24px] rounded-[5px] text-[6.5px] font-sans font-extrabold uppercase cursor-pointer ${
                  isMuted ? '!border-amber-400 text-amber-300' : 'text-[#E2E8F0]'
                }`}
              >
                MUTING
              </button>
            </div>

            {/* Right Vertical Rocker: CH + / - */}
            <div className="rounded-[8px] bg-[#161920] border border-[#353A46] p-0.5 flex flex-col items-center justify-between shadow-inner">
              <button
                id="rmt-ch-up"
                type="button"
                onClick={() => {
                  pulseIrBlaster('CH +', true);
                  onCycleTvChannel(1);
                }}
                aria-label="Remote Channel Up"
                className="rmt-rubber-key w-full h-[22px] rounded-t-[6px] text-[10px] font-extrabold text-white flex items-center justify-center cursor-pointer"
              >
                +
              </button>
              <span className="font-sans text-[7px] font-extrabold tracking-wider text-[#94A3B8] py-0.5">
                CH
              </span>
              <button
                id="rmt-ch-down"
                type="button"
                onClick={() => {
                  pulseIrBlaster('CH -', true);
                  onCycleTvChannel(-1);
                }}
                aria-label="Remote Channel Down"
                className="rmt-rubber-key w-full h-[22px] rounded-b-[6px] text-[10px] font-extrabold text-white flex items-center justify-center cursor-pointer"
              >
                −
              </button>
            </div>
          </div>

          {/* Row 8: Bottom Media Transport Cluster (REW, PLAY, FF, PREV, PAUSE, STOP, NEXT) */}
          <div
            role="group"
            aria-label="Remote Media Transport Keys"
            className="grid grid-cols-4 gap-1 pt-0.5"
          >
            <button
              id="rmt-transport-rew"
              type="button"
              onClick={() => {
                pulseIrBlaster('REW');
                onSeekDelta(-10);
              }}
              aria-label="Remote Rewind 10 Seconds"
              className="rmt-rubber-key h-[19px] rounded-[3px] text-[7.5px] font-bold text-[#E2E8F0] cursor-pointer"
            >
              ◀◀
            </button>
            <button
              id="rmt-transport-play"
              type="button"
              onClick={() => {
                pulseIrBlaster('PLAY', true);
                if (!isPlaying) onTogglePlay();
              }}
              aria-label="Remote Play Disc"
              className="rmt-rubber-key col-span-2 h-[19px] rounded-[3px] text-[8px] font-extrabold text-[#38BDF8] cursor-pointer"
            >
              ▶ PLAY
            </button>
            <button
              id="rmt-transport-ff"
              type="button"
              onClick={() => {
                pulseIrBlaster('FF');
                onSeekDelta(10);
              }}
              aria-label="Remote Fast Forward 10 Seconds"
              className="rmt-rubber-key h-[19px] rounded-[3px] text-[7.5px] font-bold text-[#E2E8F0] cursor-pointer"
            >
              ▶▶
            </button>

            <button
              id="rmt-transport-prev"
              type="button"
              onClick={() => {
                pulseIrBlaster('PREV');
                onPrevious();
              }}
              aria-label="Remote Previous Track"
              className="rmt-rubber-key h-[19px] rounded-[3px] text-[7.5px] font-bold text-[#E2E8F0] cursor-pointer"
            >
              I◀◀
            </button>
            <button
              id="rmt-transport-pause"
              type="button"
              onClick={() => {
                pulseIrBlaster('PAUSE');
                if (isPlaying) onTogglePlay();
              }}
              aria-label="Remote Pause Disc"
              className="rmt-rubber-key h-[19px] rounded-[3px] text-[7.5px] font-bold text-[#FBBF24] cursor-pointer"
            >
              ⏸
            </button>
            <button
              id="rmt-transport-stop"
              type="button"
              onClick={() => {
                pulseIrBlaster('STOP');
                onStop();
              }}
              aria-label="Remote Stop Disc"
              className="rmt-rubber-key h-[19px] rounded-[3px] text-[7.5px] font-bold text-[#E2E8F0] cursor-pointer"
            >
              ■
            </button>
            <button
              id="rmt-transport-next"
              type="button"
              onClick={() => {
                pulseIrBlaster('NEXT');
                onNext();
              }}
              aria-label="Remote Next Track"
              className="rmt-rubber-key h-[19px] rounded-[3px] text-[7.5px] font-bold text-[#E2E8F0] cursor-pointer"
            >
              ▶▶I
            </button>
          </div>

          {/* Bottom Sony Branding & RMT-TX102U Model Silkscreen */}
          <div className="pt-0.5 flex flex-col items-center justify-center leading-none">
            <span className="font-serif text-[10px] font-bold tracking-[0.22em] text-[#E2E8F0]">
              SONY
            </span>
            <span className="font-mono text-[6.5px] tracking-[0.16em] text-[#94A3B8] mt-0.5">
              TV · RMT-TX102U
            </span>
          </div>
        </div>
      </aside>
    );
  }
);
