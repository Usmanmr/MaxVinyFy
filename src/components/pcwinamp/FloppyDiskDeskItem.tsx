import React from 'react';
import { Disc3 } from 'lucide-react';
import type { ScatteredFloppyItem } from '../../utils/pcWinampLogic';
import type { DoubleTapHideArtBindings } from '../../hooks/useDoubleTapHideArt';

interface FloppyDiskDeskItemProps {
  item: ScatteredFloppyItem;
  isInserting: boolean;
  isEjecting?: boolean;
  compact?: boolean;
  sizeVariant?: 'desktop' | 'compact' | 'mobile-shelf';
  onSelect: (trackId: string) => void;
  doubleTapHideArtBind?: DoubleTapHideArtBindings;
}

export const FloppyDiskDeskItem: React.FC<FloppyDiskDeskItemProps> = React.memo(
  ({
    item,
    isInserting,
    isEjecting = false,
    compact = false,
    sizeVariant,
    onSelect,
    doubleTapHideArtBind,
  }) => {
    const { track, shellHex, rotationDeg, offsetY, zIndex, inkHex, isActive } = item;
    const isLightShell = shellHex.toUpperCase() === '#D5CFC0';
    const stampTextColor = isLightShell ? '#5D584D' : 'rgba(255,255,255,0.42)';

    const resolvedVariant = sizeVariant ?? (compact ? 'compact' : 'desktop');
    const isMobileShelf = resolvedVariant === 'mobile-shelf';
    const baseWidth = isMobileShelf ? 60 : resolvedVariant === 'compact' ? 70 : 86;

    return (
      <button
        type="button"
        data-testid={`pcw-floppy-${track.id}`}
        data-active-floppy={isActive ? 'true' : 'false'}
        onClick={() => onSelect(track.id)}
        onDoubleClick={doubleTapHideArtBind?.onDoubleClick}
        onPointerDownCapture={doubleTapHideArtBind?.onPointerDownCapture}
        onPointerUpCapture={doubleTapHideArtBind?.onPointerUpCapture}
        title={`Insert & Play: ${track.title} (double-click to hide artwork)`}
        style={{
          width: `${baseWidth}px`,
          height: isMobileShelf ? '58px' : undefined,
          transform: isMobileShelf
            ? `translateY(${isActive ? -3 : 0}px) rotate(${Math.max(-6, Math.min(6, rotationDeg))}deg)`
            : `translateY(${isActive ? -6 : offsetY}px) rotate(${rotationDeg}deg)`,
          zIndex,
          background: `linear-gradient(155deg, ${shellHex} 0%, ${shellHex} 72%, rgba(0,0,0,0.4) 100%)`,
          filter: isActive
            ? 'drop-shadow(0 0 8px rgba(0, 255, 0, 0.52)) drop-shadow(0 8px 12px rgba(0,0,0,0.65))'
            : 'drop-shadow(0 5px 8px rgba(0,0,0,0.52))',
        }}
        className={`pcw-floppy-card ${
          isInserting ? 'pcw-floppy-inserting' : isEjecting ? 'pcw-floppy-ejecting' : ''
        } relative shrink-0 select-none cursor-pointer border border-black/45 p-0 text-left focus:outline-none`}
      >
        {/* Top Beveled Rim Highlight */}
        <span
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none border-t border-l border-white/25"
        />

        {/* Top Sliding Brushed-Steel Shutter */}
        <div
          aria-hidden="true"
          className="pcw-floppy-shutter absolute top-0 left-[22%] w-[52%] h-[30%] border-x border-b border-[#5B6068] rounded-b-[2px] flex items-center justify-end pr-[12%]"
        >
          {/* Rectangular Read/Write Aperture */}
          <span className="w-[30%] h-[76%] bg-[#181A1E] border border-[#4D525B] rounded-[1px]" />
        </div>

        {/* Top-Left Directional Arrow & HD Mark */}
        <span
          aria-hidden="true"
          style={{ color: stampTextColor }}
          className="absolute top-[5%] left-[6%] font-sans text-[7px] font-extrabold leading-none tracking-tight"
        >
          ▲
        </span>
        <span
          aria-hidden="true"
          style={{ color: stampTextColor }}
          className="absolute top-[11%] right-[13%] font-mono text-[7px] font-bold leading-none"
        >
          HD
        </span>

        {/* Recessed Paper Label (#F4F2EA) covering lower ~63% */}
        <div className="absolute left-[11%] right-[11%] bottom-[6%] h-[63%] bg-[#F4F2EA] rounded-[2px] border border-black/35 shadow-[inset_0_1px_2px_rgba(0,0,0,0.22)] flex flex-col overflow-hidden">
          {/* Upper Album Art Block */}
          <div className="relative w-full h-[58%] bg-[#21252D] overflow-hidden border-b border-[#9EA5B5]/70 flex items-center justify-center shrink-0">
            {track.artworkUrl ? (
              <img
                src={track.artworkUrl}
                alt={track.title}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <Disc3 className="w-4 h-4 text-white/55" />
            )}
            <span className="absolute inset-0 bg-gradient-to-tr from-black/15 via-transparent to-white/15 pointer-events-none" />
          </div>

          {/* Lower Ruled Paper Write-On Area — Song Title Only */}
          <div className="pcw-floppy-label-lines relative flex-1 min-h-0 px-1 py-[2px] flex flex-col justify-center overflow-hidden">
            <p
              style={{
                fontFamily: "'Caveat', 'Permanent Marker', cursive",
                color: inkHex,
                transform: 'rotate(-1deg)',
              }}
              className="text-[11px] font-bold leading-[1.05] truncate"
            >
              {track.title}
            </p>
          </div>
        </div>

        {/* Bottom-Left Write-Protect Notch & Bottom-Right HD Square Hole */}
        <span
          aria-hidden="true"
          className="absolute left-[4%] bottom-[7%] w-[6%] h-[7%] bg-[#111215] border border-white/15"
        />
        <span
          aria-hidden="true"
          className="absolute right-[4%] bottom-[7%] w-[6%] h-[7%] bg-[#111215] border border-white/15"
        />
      </button>
    );
  }
);
