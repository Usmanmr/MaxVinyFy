import React from 'react';
import {
  Disc3,
  FileText,
  Minus,
  Plus,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import {
  APPLE_AQUA_ACTIVE_BLUE_HEX,
  CLICK_WHEEL_GENERATIONS,
  CLICK_WHEEL_GENERATION_ORDER,
  DOCK_SIDE_SLIT_HEIGHT_RATIO,
  DOCK_UNIFORM_BUTTON_HEIGHT_PX,
  IPOD_NANO_7_COLORS,
  type ClickWheelGen3Finish,
  type ClickWheelGenerationId,
  type ClickWheelPaneId,
  type IpodScaleMode,
  type NanoColorwayId,
} from '../../utils/clickWheelLogic';

export interface ClickWheelHifiDockProps {
  dockW: number;
  dockH: number;
  dockScale: number;
  adapterCollarWidthPx: number;
  isMobilePortrait: boolean;
  isPlaying: boolean;
  activeLoopsEnabled: boolean;
  isStandby: boolean;
  prefersReducedMotion: boolean;
  generation: ClickWheelGenerationId;
  gen3Finish: ClickWheelGen3Finish;
  nanoColor: NanoColorwayId;
  activePane: ClickWheelPaneId;
  volumePct: number;
  ipodScaleMode?: IpodScaleMode;
  unitEjecting: boolean;
  grilleRef: React.RefObject<HTMLDivElement | null>;
  onSelectGeneration: (gen: ClickWheelGenerationId) => void;
  onSelectFinish: (finish: ClickWheelGen3Finish) => void;
  onSelectNanoColor: (colorId: NanoColorwayId) => void;
  onSelectUtilityPane: (pane: ClickWheelPaneId) => void;
  onStepVolume: (delta: number) => void;
  onToggleScaleMode?: () => void;
}

const DOCK_UTILITY_BUTTONS: Array<{
  id: ClickWheelPaneId;
  label: string;
  Icon: typeof FileText;
}> = [
  { id: 'lyrics', label: 'Lyrics', Icon: FileText },
  { id: 'settings', label: 'Settings', Icon: SlidersHorizontal },
];

const UNIFORM_DOCK_BTN_STYLE: React.CSSProperties = {
  height: `${DOCK_UNIFORM_BUTTON_HEIGHT_PX}px`,
  minHeight: `${DOCK_UNIFORM_BUTTON_HEIGHT_PX}px`,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export const ClickWheelHifiDock: React.FC<ClickWheelHifiDockProps> = React.memo(
  ({
    dockW,
    dockH,
    dockScale,
    adapterCollarWidthPx,
    isMobilePortrait,
    isPlaying,
    activeLoopsEnabled,
    isStandby,
    generation,
    gen3Finish,
    nanoColor,
    activePane,
    volumePct,
    grilleRef,
    onSelectGeneration,
    onSelectFinish,
    onSelectNanoColor,
    onSelectUtilityPane,
    onStepVolume,
  }) => {
    // PART 2.3: Desktop/Landscape Hi-Fi dock is completely hidden/unmounted on mobile portrait
    if (isMobilePortrait) {
      return null;
    }

    const supportsFinish = CLICK_WHEEL_GENERATIONS[generation].supportsFinishToggle;
    const isNano = generation === 'nano';
    const ledColor =
      isPlaying && !isStandby ? '#22C55E' : isStandby ? '#94A3B8' : APPLE_AQUA_ACTIVE_BLUE_HEX;

    return (
      <div
        id="cw-speaker-dock-frame"
        style={{
          width: `${Math.round(dockW * dockScale)}px`,
          height: `${dockH}px`,
          zIndex: 22,
        }}
        className="relative flex items-end justify-center shrink-0"
      >
        <div
          id="cw-speaker-dock-console"
          data-dock-fixed-width={dockW}
          data-dock-scale={dockScale}
          data-dock-collar-width={adapterCollarWidthPx}
          data-connector-free="true"
          style={{
            width: `${dockW}px`,
            height: `${Math.round(dockH / dockScale)}px`,
            transform: dockScale < 1 ? `scale(${dockScale})` : undefined,
            transformOrigin: 'bottom center',
          }}
          className="cw-speaker-dock relative rounded-[28px] flex flex-col items-center justify-between px-4 pt-2 pb-2.5 shrink-0 overflow-hidden"
        >
          {/* Left & Right Molded Recessed Carrying Handles on Hi-Fi Cabinet Shoulders */}
          <div
            aria-hidden="true"
            data-handle-height-ratio={DOCK_SIDE_SLIT_HEIGHT_RATIO}
            className="cw-dock-handle-well pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-[42%] w-[10px] rounded-full"
          />
          <div
            aria-hidden="true"
            data-handle-height-ratio={DOCK_SIDE_SLIT_HEIGHT_RATIO}
            className="cw-dock-handle-well pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-[42%] w-[10px] rounded-full"
          />

          {/* CLEAN SEAMLESS TOP EDGE SPECULAR SHEEN (Volume controls relocated beside speaker box) */}
          <div
            id="cw-dock-seamless-top-deck"
            className="relative z-20 w-full h-[8px] flex items-center justify-center shrink-0"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none w-[72%] h-[4px] rounded-full bg-gradient-to-r from-transparent via-white/95 to-transparent"
            />
          </div>

          {/* 3-ZONE SYMMETRICAL LOWER DOCK BODY:
              LEFT CLUSTER (Models + Ordered White/Silver/Space Grey or Nano 7 Colors) |
              CENTER ENLARGED ACOUSTIC GRILLE + RIGHT-FLANKED VERTICAL VOLUME COLUMN |
              RIGHT CLUSTER (Lyrics + Settings + Nano 7 Colors if Nano) */}
          <div className="relative z-10 w-full flex-1 min-h-0 flex items-stretch justify-between gap-2.5 px-3">
            {/* LEFT UI CLUSTER: 4 MODEL BUTTONS + ORDERED FINISH ROW [1. White, 2. Silver, 3. Space Grey] */}
            <div
              id="cw-dock-left-cluster"
              role="group"
              aria-label="Generation and Colorway Controls"
              className="w-[216px] shrink-0 flex flex-col justify-center gap-2"
            >
              <div className="grid grid-cols-2 gap-1.5">
                {CLICK_WHEEL_GENERATION_ORDER.map((genId) => {
                  const spec = CLICK_WHEEL_GENERATIONS[genId];
                  const active = generation === genId;
                  return (
                    <button
                      key={genId}
                      id={`btn-cw-gen-${genId}`}
                      type="button"
                      data-cw-gen-btn={genId}
                      data-active={active ? 'true' : 'false'}
                      aria-pressed={active}
                      onClick={() => onSelectGeneration(genId)}
                      style={UNIFORM_DOCK_BTN_STYLE}
                      className="cw-dock-recessed-btn px-2.5 rounded-full justify-between gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <Disc3 className="w-3 h-3 text-[#1D1D1F]/80 shrink-0" />
                        <span className="text-[11px] font-medium text-[#1D1D1F] tracking-tight leading-none">
                          {spec.dockButtonLabel}
                        </span>
                      </div>
                      <span
                        aria-hidden="true"
                        style={{
                          backgroundColor: active ? APPLE_AQUA_ACTIVE_BLUE_HEX : '#CBD5E1',
                          boxShadow: active ? '0 0 7px rgba(0,122,255,0.95)' : 'none',
                        }}
                        className="w-[5.5px] h-[5.5px] rounded-full shrink-0"
                      />
                    </button>
                  );
                })}
              </div>

              {/* PART 2.1: Strict Bottom Finish Order: 1. White, 2. Silver, 3. Space Grey (or Nano 7-Color Row when Nano active) */}
              {!isNano ? (
                <div
                  id="cw-dock-finish-ordered-row"
                  className="grid grid-cols-3 gap-1.5"
                >
                  <button
                    id="btn-cw-finish-official-white"
                    type="button"
                    data-active={
                      supportsFinish && gen3Finish === 'official-white' ? 'true' : 'false'
                    }
                    aria-pressed={supportsFinish && gen3Finish === 'official-white'}
                    onClick={() => onSelectFinish('official-white')}
                    aria-label="White Finish"
                    style={UNIFORM_DOCK_BTN_STYLE}
                    className="cw-dock-recessed-btn px-1.5 rounded-full gap-1 text-[9.5px] font-semibold text-[#1D1D1F] cursor-pointer whitespace-nowrap min-w-0"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FFFFFF] border border-[#CBD5E1] shadow-[0_0_0_1px_rgba(255,255,255,0.9)] shrink-0" />
                    <span className="truncate">White</span>
                  </button>

                  <button
                    id="btn-cw-finish-white"
                    type="button"
                    data-active={supportsFinish && gen3Finish === 'white' ? 'true' : 'false'}
                    aria-pressed={supportsFinish && gen3Finish === 'white'}
                    onClick={() => onSelectFinish('white')}
                    aria-label="Silver Aluminum Finish"
                    style={UNIFORM_DOCK_BTN_STYLE}
                    className="cw-dock-recessed-btn px-1.5 rounded-full gap-1 text-[9.5px] font-semibold text-[#1D1D1F] cursor-pointer whitespace-nowrap min-w-0"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-[#E5E7EB] border border-[#9CA3AF] shrink-0" />
                    <span className="truncate">Silver</span>
                  </button>

                  <button
                    id="btn-cw-finish-black"
                    type="button"
                    data-active={supportsFinish && gen3Finish === 'black' ? 'true' : 'false'}
                    aria-pressed={supportsFinish && gen3Finish === 'black'}
                    onClick={() => onSelectFinish('black')}
                    aria-label="Space Grey Anodized Finish"
                    style={UNIFORM_DOCK_BTN_STYLE}
                    className="cw-dock-recessed-btn px-1.5 rounded-full gap-1 text-[9.5px] font-semibold text-[#1D1D1F] cursor-pointer whitespace-nowrap min-w-0"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-[#33363E] border border-black/50 shrink-0" />
                    <span className="truncate">Grey</span>
                  </button>
                </div>
              ) : (
                <div
                  id="cw-nano-color-selector"
                  data-testid="cw-nano-color-selector"
                  role="group"
                  aria-label="iPod Nano 7-Color Palette"
                  className="h-[36px] px-2 rounded-full bg-white/85 border border-[#C8CDD5] shadow-inner flex items-center justify-between gap-1"
                >
                  {IPOD_NANO_7_COLORS.map((swatch) => {
                    const active = nanoColor === swatch.id;
                    return (
                      <button
                        key={swatch.id}
                        id={`btn-cw-nano-color-${swatch.id}`}
                        data-nano-color={swatch.id}
                        data-active={active ? 'true' : 'false'}
                        type="button"
                        aria-label={`Nano ${swatch.label}`}
                        title={swatch.label}
                        aria-pressed={active}
                        onClick={() => onSelectNanoColor(swatch.id)}
                        style={{
                          backgroundColor: swatch.swatchHex,
                          boxShadow: active
                            ? `0 0 0 2px #FFFFFF, 0 0 0 3.5px ${APPLE_AQUA_ACTIVE_BLUE_HEX}`
                            : 'inset 0 1px 1px rgba(255,255,255,0.45), 0 1px 2px rgba(0,0,0,0.2)',
                        }}
                        className="w-[21px] h-[21px] rounded-full border border-black/25 cursor-pointer transition-transform hover:scale-110 shrink-0"
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* CENTER ENLARGED ACOUSTIC GRILLE (Clean Unobstructed Symmetry) */}
            <div className="flex-1 min-w-0 flex items-stretch">
              <div
                ref={grilleRef}
                id="cw-dock-grille-box"
                className="cw-dock-grille relative flex-1 min-w-0 rounded-[16px] px-4 py-2 flex flex-col justify-between overflow-hidden"
              >
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 left-1.5 w-[5px] h-[5px] rounded-full bg-[#3A4048] border border-black/80 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.3)]"
                />
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 w-[5px] h-[5px] rounded-full bg-[#3A4048] border border-black/80 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.3)]"
                />
                <span
                  aria-hidden="true"
                  className="absolute bottom-1.5 left-1.5 w-[5px] h-[5px] rounded-full bg-[#3A4048] border border-black/80 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.3)]"
                />
                <span
                  aria-hidden="true"
                  className="absolute bottom-1.5 right-1.5 w-[5px] h-[5px] rounded-full bg-[#3A4048] border border-black/80 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.3)]"
                />

                <div className="relative flex-1 min-h-0 flex items-center justify-around px-1">
                  <div
                    className={`cw-woofer-cone w-[72px] h-[72px] rounded-full bg-[radial-gradient(circle_at_50%_44%,#2B3138_0%,#15191D_62%,#0B0D10_100%)] border border-white/10 shadow-[inset_0_2px_7px_rgba(0,0,0,0.88)] flex items-center justify-center ${
                      activeLoopsEnabled ? 'opacity-95' : 'opacity-80'
                    }`}
                  >
                    <div className="w-[28px] h-[28px] rounded-full bg-[radial-gradient(circle_at_45%_40%,#384049_0%,#14171B_75%)] border border-white/10" />
                  </div>

                  <div
                    className={`cw-subwoofer-cone w-[108px] h-[108px] rounded-full bg-[radial-gradient(circle_at_50%_45%,#282D34_0%,#14181C_64%,#080A0C_100%)] border-2 border-white/10 shadow-[inset_0_3px_12px_rgba(0,0,0,0.92)] flex items-center justify-center ${
                      activeLoopsEnabled ? 'opacity-95' : 'opacity-82'
                    }`}
                  >
                    <div className="w-[42px] h-[42px] rounded-full bg-[radial-gradient(circle_at_40%_35%,#404752_0%,#13161A_78%)] border border-white/15 shadow-inner" />
                  </div>

                  <div
                    className={`cw-woofer-cone w-[72px] h-[72px] rounded-full bg-[radial-gradient(circle_at_50%_44%,#2B3138_0%,#15191D_62%,#0B0D10_100%)] border border-white/10 shadow-[inset_0_2px_7px_rgba(0,0,0,0.88)] flex items-center justify-center ${
                      activeLoopsEnabled ? 'opacity-95' : 'opacity-80'
                    }`}
                  >
                    <div className="w-[28px] h-[28px] rounded-full bg-[radial-gradient(circle_at_45%_40%,#384049_0%,#14171B_75%)] border border-white/10" />
                  </div>
                </div>

                <div className="relative h-[18px] flex items-center justify-between px-8 shrink-0">
                  <span aria-hidden="true" className="cw-bass-reflex-port w-[15px] h-[15px] rounded-full" />
                  <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-black/55 border border-white/10">
                    <span
                      aria-hidden="true"
                      title="IR Remote Sensor"
                      className="w-[8px] h-[5px] rounded-[2px] bg-[#160B18] border border-white/15"
                    />
                    <span
                      id="cw-dock-status-led"
                      aria-hidden="true"
                      style={{
                        backgroundColor: ledColor,
                        boxShadow: `0 0 6px ${ledColor}`,
                      }}
                      className="w-[5px] h-[5px] rounded-full"
                    />
                  </div>
                  <span aria-hidden="true" className="cw-bass-reflex-port w-[15px] h-[15px] rounded-full" />
                </div>
              </div>
            </div>

            {/* RIGHT UI CLUSTER: HORIZONTAL VOLUME ROCKER ON TOP + LYRICS + SETTINGS */}
            <div
              id="cw-dock-right-cluster"
              role="group"
              aria-label="Volume and App Utility Controls"
              className="w-[162px] shrink-0 flex flex-col justify-center gap-1.5"
            >
              {/* PART 1.2: Sleek Horizontal Pill/Capsule Volume Rocker Directly Above Lyrics */}
              <div
                id="cw-dock-horizontal-volume-rocker"
                data-testid="cw-dock-horizontal-volume-rocker"
                role="group"
                aria-label="Speaker Volume Rocker"
                style={UNIFORM_DOCK_BTN_STYLE}
                className="cw-vol-rocker-bar w-full rounded-full overflow-hidden flex items-stretch justify-between select-none"
              >
                <button
                  id="btn-cw-vol-down"
                  type="button"
                  aria-label="Decrease Speaker Volume"
                  onClick={() => onStepVolume(-0.08)}
                  className="cw-vol-rocker-end cw-vol-rocker-left flex-1 h-full px-2.5 flex items-center justify-start gap-1 text-[#1D1D1F] cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5 stroke-[2.4]" />
                </button>

                <div className="flex items-center justify-center gap-1 px-1.5 pointer-events-none shrink-0 border-x border-[#D4D9E2]/80">
                  <Volume2 className="w-3 h-3 text-[#007AFF]" />
                  <span
                    id="cw-dock-volume-readout"
                    className="font-mono text-[9.5px] font-bold text-[#1D1D1F] tabular-nums"
                  >
                    {volumePct}%
                  </span>
                </div>

                <button
                  id="btn-cw-vol-up"
                  type="button"
                  aria-label="Increase Speaker Volume"
                  onClick={() => onStepVolume(0.08)}
                  className="cw-vol-rocker-end cw-vol-rocker-right flex-1 h-full px-2.5 flex items-center justify-end gap-1 text-[#1D1D1F] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.4]" />
                </button>
              </div>

              {DOCK_UTILITY_BUTTONS.map(({ id, label, Icon }) => {
                const active = activePane === id;
                return (
                  <button
                    key={id}
                    id={`btn-cw-tab-${id}`}
                    type="button"
                    data-active={active ? 'true' : 'false'}
                    aria-pressed={active}
                    onClick={() => onSelectUtilityPane(id)}
                    style={UNIFORM_DOCK_BTN_STYLE}
                    className="cw-dock-recessed-btn w-full px-3 rounded-full justify-between gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon className="w-3.5 h-3.5 text-[#1D1D1F] shrink-0" />
                      <span className="text-[11px] font-semibold text-[#1D1D1F] tracking-tight leading-none">
                        {label}
                      </span>
                    </div>
                    <span
                      aria-hidden="true"
                      style={{
                        backgroundColor: active ? APPLE_AQUA_ACTIVE_BLUE_HEX : '#CBD5E1',
                        boxShadow: active ? '0 0 7px rgba(0,122,255,0.95)' : 'none',
                      }}
                      className="w-[5.5px] h-[5.5px] rounded-full shrink-0"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ClickWheelHifiDock.displayName = 'ClickWheelHifiDock';
