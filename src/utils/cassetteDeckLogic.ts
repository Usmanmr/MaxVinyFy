export type CassetteTrackChangePhase =
  | 'idle'
  | 'stage1-door-open'
  | 'stage2-spring-pop'
  | 'stage2-extract-up'
  | 'stage3-insert-down'
  | 'stage3-bottom-impact'
  | 'stage4-door-close'
  | 'ejected-empty'
  // Legacy phase aliases preserved for backward compatibility
  | 'key-unlatch'
  | 'door-opening'
  | 'cassette-ejecting'
  | 'organizer-swap'
  | 'cassette-inserting'
  | 'door-closing';

export interface CassetteTrackChangeTimeline {
  stage1DoorOpenEndMs: number;
  stage2SpringPopEndMs: number;
  stage2ExtractUpEndMs: number;
  stage3InsertDownEndMs: number;
  stage3BottomImpactEndMs: number;
  stage4DoorCloseEndMs: number;
  // Legacy milestone aliases mapped to the 1,350ms 4-stage choreography
  keyUnlatchEndMs: number;
  doorOpenEndMs: number;
  ejectEndMs: number;
  organizerSwapEndMs: number;
  insertEndMs: number;
  doorCloseEndMs: number;
}

/**
 * 4-Stage Choreographed Mechanical Ejection, Vertical Loading & Door Latching Sequence (~1,350ms total):
 * - Stage 1 (0ms – 300ms): Eject key depresses (translateY(4px) scaleY(0.96)), magnetic head & pinch roller
 *   retract downward (translateY(8px)), bottom-hinged acrylic door swings open to rotateX(-32deg).
 * - Stage 2 (250ms – 650ms): Outgoing cassette vertical ejection (strictly vertical Y-axis, translateX(0px)):
 *   - 250ms – 380ms: Initial spring pop upward inside door guide rails (translateY(-18px))
 *   - 380ms – 650ms: Upward extraction slide out of top slot (translateY(-140%), opacity 1 -> 0)
 * - Stage 3 (600ms – 1,000ms): Incoming cassette vertical insertion from translateY(-140%) -> translateY(0px)
 *   - 600ms – 950ms: Guided slot slide-down (opacity 0 -> 1)
 *   - 950ms – 1,000ms: Bottom stopper micro-impact (translateY(2px) -> translateY(0px))
 * - Stage 4 (980ms – 1,350ms): Acrylic door swings shut to rotateX(0deg) with 1px compression flash,
 *   6-tooth reel hubs execute 12-degree rotational alignment snap, head & pinch roller engage (translateY(0px)),
 *   and Play (▶) key depresses (translateY(4px)).
 */
export const CASSETTE_TRACK_CHANGE_TIMELINE_MS: CassetteTrackChangeTimeline = {
  stage1DoorOpenEndMs: 250,
  stage2SpringPopEndMs: 380,
  stage2ExtractUpEndMs: 600,
  stage3InsertDownEndMs: 950,
  stage3BottomImpactEndMs: 980,
  stage4DoorCloseEndMs: 1350,
  keyUnlatchEndMs: 250,
  doorOpenEndMs: 380,
  ejectEndMs: 600,
  organizerSwapEndMs: 950,
  insertEndMs: 980,
  doorCloseEndMs: 1350,
};

export interface CassetteTrackChangeStagePose {
  doorTransform: string;
   doorEasing: string;
  cassetteTransform: string;
  cassetteEasing: string;
  cassetteOpacity: number;
  doorLatchEngaged: boolean;
  showFreshTapeState: boolean;
  organizerSwapActive: boolean;
  doorAngleDeg: number;
  doorCompressionPx: number;
  headRetractY: number;
  hubSnapDeg: number;
  wellZIndex: number;
  cassetteZIndex: number;
  doorZIndex: number;
}

/**
 * Computes exact stage transforms, easing curves, head retraction, hub alignment snap,
 * and strict Z-index slot layering (rear tape well z-index: 10, cassette z-index: 20, front door z-index: 30).
 * Horizontal cassette movement is strictly locked to translateX(0px) across all phases.
 */
export function getCassetteTrackChangeStagePose(
  phase: CassetteTrackChangePhase
): CassetteTrackChangeStagePose {
  const baseZ = {
    wellZIndex: 10,
    cassetteZIndex: 20,
    doorZIndex: 30,
  };

  switch (phase) {
    case 'key-unlatch':
    case 'stage1-door-open':
    case 'door-opening':
      return {
        ...baseZ,
        doorTransform: 'perspective(800px) rotateX(-32deg)',
        doorEasing: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
        cassetteTransform: 'translate3d(0px, 0px, 0px)',
        cassetteEasing: 'cubic-bezier(0.2, 0.9, 0.3, 1.0)',
        cassetteOpacity: 1,
        doorLatchEngaged: false,
        showFreshTapeState: false,
        organizerSwapActive: false,
        doorAngleDeg: -32,
        doorCompressionPx: 0,
        headRetractY: 8,
        hubSnapDeg: 0,
      };
    case 'stage2-spring-pop':
      return {
        ...baseZ,
        doorTransform: 'perspective(800px) rotateX(-32deg)',
        doorEasing: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
        cassetteTransform: 'translate3d(0px, -18px, 0px)',
        cassetteEasing: 'cubic-bezier(0.18, 0.89, 0.32, 1.28)',
        cassetteOpacity: 1,
        doorLatchEngaged: false,
        showFreshTapeState: false,
        organizerSwapActive: false,
        doorAngleDeg: -32,
        doorCompressionPx: 0,
        headRetractY: 8,
        hubSnapDeg: 0,
      };
    case 'stage2-extract-up':
    case 'cassette-ejecting':
      return {
        ...baseZ,
        doorTransform: 'perspective(800px) rotateX(-32deg)',
        doorEasing: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        cassetteTransform: 'translate3d(0px, -140%, 0px)',
        cassetteEasing: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        cassetteOpacity: 0,
        doorLatchEngaged: false,
        showFreshTapeState: false,
        organizerSwapActive: true,
        doorAngleDeg: -32,
        doorCompressionPx: 0,
        headRetractY: 8,
        hubSnapDeg: 0,
      };
    case 'ejected-empty':
      return {
        ...baseZ,
        doorTransform: 'perspective(800px) rotateX(-32deg)',
        doorEasing: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
        cassetteTransform: 'translate3d(0px, -140%, 0px)',
        cassetteEasing: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        cassetteOpacity: 0,
        doorLatchEngaged: false,
        showFreshTapeState: false,
        organizerSwapActive: true,
        doorAngleDeg: -32,
        doorCompressionPx: 0,
        headRetractY: 8,
        hubSnapDeg: 0,
      };
    case 'organizer-swap':
    case 'stage3-insert-down':
    case 'cassette-inserting':
      return {
        ...baseZ,
        doorTransform: 'perspective(800px) rotateX(-32deg)',
        doorEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        cassetteTransform: 'translate3d(0px, 0px, 0px)',
        cassetteEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        cassetteOpacity: 1,
        doorLatchEngaged: false,
        showFreshTapeState: true,
        organizerSwapActive: false,
        doorAngleDeg: -32,
        doorCompressionPx: 0,
        headRetractY: 8,
        hubSnapDeg: 0,
      };
    case 'stage3-bottom-impact':
      return {
        ...baseZ,
        doorTransform: 'perspective(800px) rotateX(-32deg)',
        doorEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        cassetteTransform: 'translate3d(0px, 2px, 0px)',
        cassetteEasing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
        cassetteOpacity: 1,
        doorLatchEngaged: false,
        showFreshTapeState: true,
        organizerSwapActive: false,
        doorAngleDeg: -32,
        doorCompressionPx: 0,
        headRetractY: 8,
        hubSnapDeg: 0,
      };
    case 'stage4-door-close':
    case 'door-closing':
      return {
        ...baseZ,
        doorTransform: 'perspective(800px) rotateX(0deg) translate3d(0px, 1px, 0px)',
        doorEasing: 'cubic-bezier(0.4, 0.0, 0.6, 1)',
        cassetteTransform: 'translate3d(0px, 0px, 0px)',
        cassetteEasing: 'cubic-bezier(0.4, 0.0, 0.6, 1)',
        cassetteOpacity: 1,
        doorLatchEngaged: true,
        showFreshTapeState: true,
        organizerSwapActive: false,
        doorAngleDeg: 0,
        doorCompressionPx: 1,
        headRetractY: 0,
        hubSnapDeg: 12,
      };
    case 'idle':
    default:
      return {
        ...baseZ,
        doorTransform: 'perspective(800px) rotateX(0deg) translate3d(0px, 0px, 0px)',
        doorEasing: 'cubic-bezier(0.4, 0.0, 0.6, 1)',
        cassetteTransform: 'translate3d(0px, 0px, 0px)',
        cassetteEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        cassetteOpacity: 1,
        doorLatchEngaged: true,
        showFreshTapeState: true,
        organizerSwapActive: false,
        doorAngleDeg: 0,
        doorCompressionPx: 0,
        headRetractY: 0,
        hubSnapDeg: 0,
      };
  }
}

export type CassetteKeyDepth = 'up' | 'half' | 'full';

export interface CassetteTransportKeyState {
  latched: boolean;
  depth: CassetteKeyDepth;
  travelPx: number;
  scaleY: number;
}

export interface CassetteTransportKeysSnapshot {
  record: CassetteTransportKeyState;
  rew: CassetteTransportKeyState;
  play: CassetteTransportKeyState;
  ff: CassetteTransportKeyState;
  stop: CassetteTransportKeyState;
  eject: CassetteTransportKeyState;
  // Preserved for legacy callers/tests
  pause: CassetteTransportKeyState;
  chew: CassetteTransportKeyState;
}

export interface CassetteTransportInput {
  isPlaying: boolean;
  isStandby: boolean;
  currentSecond: number;
  trackChangePhase: CassetteTrackChangePhase;
  isRecordingLatched?: boolean;
  isChewActive?: boolean;
  activeMomentaryKey?: 'record' | 'rew' | 'ff' | 'stop' | 'eject' | null;
}

/**
 * Resolves exact mechanical travel (4px depression + scaleY(0.96) on Eject) & latching state
 * for the 6 bottom piano keys (Record, Rewind, Play, Fast Forward, Stop, Eject):
 * - When Eject / door-open is active, Eject depresses (translateY(4px) scaleY(0.96)) and all other keys pop up to 0px.
 * - While playing with door closed, Play latches downward (4px travel).
 */
export function resolveCassetteTransportKeyStates({
  isPlaying,
  isStandby,
  currentSecond,
  trackChangePhase,
  isRecordingLatched = false,
  isChewActive = false,
  activeMomentaryKey = null,
}: CassetteTransportInput): CassetteTransportKeysSnapshot {
  const safeSecond = Number.isFinite(currentSecond) ? Math.max(0, currentSecond) : 0;
  const doorOpenOrUnlatched =
    trackChangePhase !== 'idle' &&
    trackChangePhase !== 'stage4-door-close' &&
    trackChangePhase !== 'door-closing';

  const ejectEngaged =
    activeMomentaryKey === 'eject' ||
    trackChangePhase === 'stage1-door-open' ||
    trackChangePhase === 'door-opening' ||
    trackChangePhase === 'stage2-spring-pop' ||
    trackChangePhase === 'stage2-extract-up' ||
    trackChangePhase === 'cassette-ejecting' ||
    trackChangePhase === 'ejected-empty';

  const playLatched = Boolean(isPlaying && !isStandby && !doorOpenOrUnlatched && !ejectEngaged);
  const pauseLatched = Boolean(
    !isPlaying && !isStandby && safeSecond > 0 && !doorOpenOrUnlatched && !ejectEngaged
  );
  const recordLatched = Boolean(
    (isRecordingLatched || activeMomentaryKey === 'record') && !doorOpenOrUnlatched && !ejectEngaged
  );

  const stopMomentary = activeMomentaryKey === 'stop';
  const rewMomentary = activeMomentaryKey === 'rew' && !ejectEngaged;
  const ffMomentary = activeMomentaryKey === 'ff' && !ejectEngaged;

  return {
    record: {
      latched: recordLatched,
      depth: recordLatched ? 'full' : 'up',
      travelPx: recordLatched ? 4 : 0,
      scaleY: recordLatched ? 0.97 : 1,
    },
    rew: {
      latched: false,
      depth: rewMomentary ? 'full' : 'up',
      travelPx: rewMomentary ? 4 : 0,
      scaleY: rewMomentary ? 0.97 : 1,
    },
    play: {
      latched: playLatched,
      depth: playLatched ? 'full' : 'up',
      travelPx: playLatched ? 4 : 0,
      scaleY: playLatched ? 0.97 : 1,
    },
    ff: {
      latched: false,
      depth: ffMomentary ? 'full' : 'up',
      travelPx: ffMomentary ? 4 : 0,
      scaleY: ffMomentary ? 0.97 : 1,
    },
    stop: {
      latched: false,
      depth: stopMomentary ? 'full' : 'up',
      travelPx: stopMomentary ? 4 : 0,
      scaleY: stopMomentary ? 0.97 : 1,
    },
    eject: {
      latched: ejectEngaged,
      depth: ejectEngaged ? 'full' : 'up',
      travelPx: ejectEngaged ? 4 : 0,
      scaleY: ejectEngaged ? 0.96 : 1,
    },
    pause: {
      latched: pauseLatched,
      depth: pauseLatched ? 'half' : 'up',
      travelPx: pauseLatched ? 2.5 : 0,
      scaleY: pauseLatched ? 0.98 : 1,
    },
    chew: {
      latched: false,
      depth: isChewActive ? 'full' : 'up',
      travelPx: isChewActive ? 4 : 0,
      scaleY: isChewActive ? 0.97 : 1,
    },
  };
}

export interface BoomboxProportionalGeometry {
  cassetteDoorWidthPx: number;
  cassetteDoorHeightPx: number;
  cassetteTapeWidthPx: number;
  cassetteTapeHeightPx: number;
  speakerDiameterPx: number;
  cassetteAspectRatio: number;
  speakerToCassetteRatio: number;
  mobileSpeakerGapPx: number;
}

/**
 * Enforces the Strict Geometric Proportion Rule across all viewports (Desktop, Mobile Horizontal, Mobile Vertical):
 * - Cassette Tape / Window Aspect Ratio: strictly ~1.58 : 1 (matching 100mm x 63mm physical cassette).
 * - Circular Woofer Speaker Diameter: strictly 1:1 circular aspect ratio with diameter equal to 1.15x – 1.25x
 *   (target 1.20x) the width of the central cassette door frame.
 */
export function computeBoomboxProportionalGeometry(
  containerWidthPx: number,
  containerHeightPx: number,
  isMobilePortrait: boolean,
  isCompactLandscape = false
): BoomboxProportionalGeometry {
  const safeW = Number.isFinite(containerWidthPx) && containerWidthPx > 120 ? containerWidthPx : 640;
  const safeH = Number.isFinite(containerHeightPx) && containerHeightPx > 120 ? containerHeightPx : 320;
  const targetAspect = 1.58;
  const targetSpeakerRatio = 1.2;

  if (isMobilePortrait) {
    // Stacked vertical layout: Row 2 has Cassette Door + side sub-panels; Row 3 has two side-by-side speakers with 14px gap
    const mobileSpeakerGapPx = 14;
    const maxDualSpeakerRowW = Math.max(210, safeW - 28);
    const maxSingleSpeakerByWidth = Math.floor((maxDualSpeakerRowW - mobileSpeakerGapPx) / 2);
    const maxSpeakerByHeight = Math.max(106, Math.floor(safeH * 0.29));
    const maxDoorByWidth = Math.floor(maxSingleSpeakerByWidth / targetSpeakerRatio);
    const maxDoorByHeight = Math.floor(maxSpeakerByHeight / targetSpeakerRatio);
    const maxDoorByCenterRow = Math.max(92, safeW - 96);

    const cassetteDoorWidthPx = Math.max(
      92,
      Math.min(114, maxDoorByWidth, maxDoorByHeight, maxDoorByCenterRow)
    );
    const cassetteDoorHeightPx = Math.max(58, Math.round(cassetteDoorWidthPx / targetAspect));
    const speakerDiameterPx = Math.round(cassetteDoorWidthPx * targetSpeakerRatio);
    const clampedSpeakerPx = Math.min(
      Math.round(cassetteDoorWidthPx * 1.25),
      Math.max(Math.round(cassetteDoorWidthPx * 1.15), speakerDiameterPx)
    );

    const cassetteTapeWidthPx = Math.max(78, cassetteDoorWidthPx - 14);
    const cassetteTapeHeightPx = Math.max(49, Math.round(cassetteTapeWidthPx / targetAspect));

    return {
      cassetteDoorWidthPx,
      cassetteDoorHeightPx,
      cassetteTapeWidthPx,
      cassetteTapeHeightPx,
      speakerDiameterPx: clampedSpeakerPx,
      cassetteAspectRatio: Number((cassetteDoorWidthPx / cassetteDoorHeightPx).toFixed(2)),
      speakerToCassetteRatio: Number((clampedSpeakerPx / cassetteDoorWidthPx).toFixed(2)),
      mobileSpeakerGapPx,
    };
  }

  // Three-Column Classic Layout (35% Left Speaker | 30% Center Column | 35% Right Speaker)
  const speakerColWidth = safeW * 0.35;
  const centerColWidth = safeW * 0.30;
  // Reserve 52px inside center column for Left & Right Auxiliary Sub-Panels flanking the cassette door
  const maxDoorByCenterCol = Math.max(96, centerColWidth - (isCompactLandscape ? 38 : 52));
  const maxDoorBySpeakerCol = Math.max(96, (speakerColWidth - 20) / targetSpeakerRatio);

  // Vertical budget in lower tier:
  // On Desktop, Center Column holds Taller 5-Band EQ (~54px) + Finger-pull lip (8px) + Door + Piano keys & trim (~36px).
  // In Mobile Landscape (isCompactLandscape), the 5-Band Graphic Equalizer is hidden to guarantee 100% single-screen fit.
  const verticalChromeReserve = isCompactLandscape ? 56 : 108;
  const maxDoorHeightByStage = Math.max(58, safeH - verticalChromeReserve);
  const maxDoorByStageHeight = maxDoorHeightByStage * targetAspect;
  const maxDoorBySpeakerHeight = Math.max(
    88,
    (safeH - (isCompactLandscape ? 38 : 54)) / targetSpeakerRatio
  );

  const rawDoorW = Math.min(
    isCompactLandscape ? 168 : 220,
    maxDoorByCenterCol,
    maxDoorBySpeakerCol,
    maxDoorByStageHeight,
    maxDoorBySpeakerHeight
  );
  const cassetteDoorWidthPx = Math.max(88, Math.round(rawDoorW));
  const cassetteDoorHeightPx = Math.max(56, Math.round(cassetteDoorWidthPx / targetAspect));
  const speakerDiameterPx = Math.round(cassetteDoorWidthPx * targetSpeakerRatio);

  const cassetteTapeWidthPx = Math.max(74, cassetteDoorWidthPx - 14);
  const cassetteTapeHeightPx = Math.max(47, Math.round(cassetteTapeWidthPx / targetAspect));

  return {
    cassetteDoorWidthPx,
    cassetteDoorHeightPx,
    cassetteTapeWidthPx,
    cassetteTapeHeightPx,
    speakerDiameterPx,
    cassetteAspectRatio: Number((cassetteDoorWidthPx / cassetteDoorHeightPx).toFixed(2)),
    speakerToCassetteRatio: Number((speakerDiameterPx / cassetteDoorWidthPx).toFixed(2)),
    mobileSpeakerGapPx: 14,
  };
}

/**
 * Returns whether the 5-Band Graphic Equalizer should be rendered:
 * Hidden in mobile horizontal landscape (`max-height: 500px` and `orientation: landscape`)
 * to guarantee 100% single-screen boombox fit with zero vertical clipping or scrolling.
 */
export function shouldShowCassetteGraphicEq(
  _isMobilePortrait: boolean,
  isCompactLandscape: boolean
): boolean {
  return !isCompactLandscape;
}

export interface ExpandedBoomboxStageLayout {
  leftColumnPct: number;
  centerColumnPct: number;
  rightColumnPct: number;
  cassetteDoorWidthPx: number;
  cassetteDoorHeightPx: number;
  cassetteTapeWidthPx: number;
  cassetteTapeHeightPx: number;
  cassetteMarginAllSidesPx: number;
  speakerDiameterPx: number;
  speakerBottomPaddingPx: number;
  cassetteAspectRatio: number;
  auxPanelWidthPx: number;
}

/**
 * Computes boombox layout geometry:
 * - Lowers circular main woofers toward the bottom edge with 50px bottom padding (Desktop & Mobile Portrait),
 *   sized so the 2 upper auxiliary speakers (outer larger + inner 50% diameter) always fit above them.
 * - Enforces strict +10px clearance margin on all 4 sides around #oversized-cassette-shell
 *   inside #cassette-compartment-well (door interior = tape + 20px width & height).
 */
export function computeExpandedBoomboxStageLayout(
  containerWidthPx: number,
  containerHeightPx: number,
  isMobilePortrait: boolean,
  isCompactLandscape = false
): ExpandedBoomboxStageLayout {
  const safeW = Number.isFinite(containerWidthPx) && containerWidthPx > 120 ? containerWidthPx : 640;
  const safeH = Number.isFinite(containerHeightPx) && containerHeightPx > 120 ? containerHeightPx : 320;
  const targetAspect = 1.58;
  const marginAllSidesPx = 10;
  const speakerBottomPaddingPx = isCompactLandscape ? 16 : 50;
  const baseline = computeBoomboxProportionalGeometry(
    safeW,
    safeH,
    isMobilePortrait,
    isCompactLandscape
  );

  if (isMobilePortrait) {
    const speakerColW = Math.floor((safeW - 14) / 2);
    // Reserve horizontal clearance for Left & Right Band 2 flanking Small Aux Speakers (~28px each)
    const band2SideAuxReservePx = 68;
    const availWooferH = Math.max(60, Math.floor(safeH * 0.30) - 6);
    const basePortraitWoofer = Math.min(
      speakerColW - 12,
      availWooferH,
      Math.round(baseline.speakerDiameterPx * 1.48)
    );
    const speakerDiameterPx = Math.max(60, Math.min(98, Math.round(basePortraitWoofer * 0.78)));

    const auxPanelWidthPx = 16;
    const maxDoorByWidth = Math.max(185, safeW - auxPanelWidthPx * 2 - band2SideAuxReservePx - 12);
    const maxDoorHeight = Math.max(105, Math.floor(safeH * 0.42));
    const maxDoorByHeight = Math.round(maxDoorHeight * targetAspect);
    const rawTapeW = Math.min(maxDoorByWidth, maxDoorByHeight) - marginAllSidesPx * 2;
    const cassetteTapeWidthPx = Math.min(250, Math.max(155, rawTapeW));
    const cassetteTapeHeightPx = Math.max(96, Math.round(cassetteTapeWidthPx / targetAspect));
    const cassetteDoorWidthPx = cassetteTapeWidthPx + marginAllSidesPx * 2;
    const cassetteDoorHeightPx = cassetteTapeHeightPx + marginAllSidesPx * 2;

    return {
      leftColumnPct: 50,
      centerColumnPct: 100,
      rightColumnPct: 50,
      cassetteDoorWidthPx,
      cassetteDoorHeightPx,
      cassetteTapeWidthPx,
      cassetteTapeHeightPx,
      cassetteMarginAllSidesPx: marginAllSidesPx,
      speakerDiameterPx,
      speakerBottomPaddingPx,
      cassetteAspectRatio: Number((cassetteTapeWidthPx / cassetteTapeHeightPx).toFixed(2)),
      auxPanelWidthPx,
    };
  }

  // Wide three-column boombox split: 28% Left Speaker | 44% Center Cassette Column | 28% Right Speaker
  const leftColumnPct = 28;
  const centerColumnPct = 44;
  const rightColumnPct = 28;
  const auxPanelWidthPx = isCompactLandscape ? 18 : 22;

  const speakerBayW = Math.floor(safeW * (leftColumnPct / 100)) - 14;
  // Reserve enough headroom above the lowered woofer for the stacked MirroredDualRoundUpperSpeakers in compact landscape too
  const speakerBayH = Math.max(66, safeH - speakerBottomPaddingPx - (isCompactLandscape ? 50 : 68));
  const targetSpeakerPx = Math.round(baseline.speakerDiameterPx * (isCompactLandscape ? 1.32 : 1.55));
  const speakerDiameterPx = Math.max(
    66,
    Math.min(speakerBayW, speakerBayH, targetSpeakerPx)
  );

  const centerColW = Math.floor(safeW * (centerColumnPct / 100)) - 12;
  const verticalReserve = isCompactLandscape ? 66 : 136;
  const maxDoorHeight = Math.max(66, safeH - verticalReserve);
  const maxDoorByCenterWidth = Math.max(120, centerColW - auxPanelWidthPx * 2 - 14);
  const maxDoorByStageHeight = Math.round(maxDoorHeight * targetAspect);

  const candidateDoorW = Math.max(
    baseline.cassetteDoorWidthPx,
    Math.min(maxDoorByCenterWidth, maxDoorByStageHeight)
  );
  const cassetteTapeWidthPx = Math.max(92, candidateDoorW - marginAllSidesPx * 2);
  const cassetteTapeHeightPx = Math.max(56, Math.round(cassetteTapeWidthPx / targetAspect));
  const cassetteDoorWidthPx = cassetteTapeWidthPx + marginAllSidesPx * 2;
  const cassetteDoorHeightPx = cassetteTapeHeightPx + marginAllSidesPx * 2;

  return {
    leftColumnPct,
    centerColumnPct,
    rightColumnPct,
    cassetteDoorWidthPx,
    cassetteDoorHeightPx,
    cassetteTapeWidthPx,
    cassetteTapeHeightPx,
    cassetteMarginAllSidesPx: marginAllSidesPx,
    speakerDiameterPx,
    speakerBottomPaddingPx,
    cassetteAspectRatio: Number((cassetteTapeWidthPx / cassetteTapeHeightPx).toFixed(2)),
    auxPanelWidthPx,
  };
}

export interface CassetteTapePancakeSizes {
  leftPancakePct: number;
  rightPancakePct: number;
}

/**
 * Area-conserving cassette tape pancake model:
 * Left supply tape pack shrinks cleanly while right take-up tape pack grows across track progress.
 */
export function calculateCassetteTapePancakes(
  progressRatio: number,
  minPct = 44,
  maxPct = 92
): CassetteTapePancakeSizes {
  const p = Number.isFinite(progressRatio) ? Math.max(0, Math.min(1, progressRatio)) : 0;
  const rMinSq = minPct * minPct;
  const rMaxSq = maxPct * maxPct;
  const deltaSq = rMaxSq - rMinSq;

  const left = Math.sqrt(rMaxSq - p * deltaSq);
  const right = Math.sqrt(rMinSq + p * deltaSq);

  return {
    leftPancakePct: Math.round(left * 10) / 10,
    rightPancakePct: Math.round(right * 10) / 10,
  };
}

export interface CassetteHubSpeedTiming {
  supplyDurationSec: number;
  takeupDurationSec: number;
  timingFunction: string;
}

/**
 * Computes sprocket hub rotation durations proportional to playback pitch and speed.
 */
export function calculateCassetteHubSpeeds(
  rpm: 33 | 45,
  pitchPercent: number,
  lowPowerMode = false
): CassetteHubSpeedTiming {
  const safePitch = Number.isFinite(pitchPercent) ? Math.max(-12, Math.min(12, pitchPercent)) : 0;
  const speedScale = (rpm === 45 ? 1.35 : 1.0) * (1 + safePitch / 100);
  const clampedScale = Math.max(0.65, Math.min(1.65, speedScale));

  const supplyDurationSec = Number((2.9 / clampedScale).toFixed(3));
  const takeupDurationSec = Number((supplyDurationSec / 1.16).toFixed(3));

  return {
    supplyDurationSec,
    takeupDurationSec,
    timingFunction: lowPowerMode ? 'steps(20, end)' : 'linear',
  };
}

/**
 * Preserved pure helper for legacy test compatibility (note: mechanical 0000 counter is removed from faceplate DOM).
 */
export function formatTapeCounterDigits(progressRatio: number): string {
  const safe = Number.isFinite(progressRatio) ? Math.max(0, Math.min(1, progressRatio)) : 0;
  const count = Math.max(0, Math.min(9999, Math.round(safe * 9999)));
  return String(count).padStart(4, '0');
}

/**
 * Maps a normalized audio level [0..1] into discrete 12-segment LED lit count [0..12].
 * Returns 0 when idle/paused/document-hidden.
 */
export function levelTo12SegmentCount(level01: number, isActive: boolean): number {
  if (!isActive || !Number.isFinite(level01)) return 0;
  const clamped = Math.max(0, Math.min(1, level01));
  if (clamped <= 0.04) return 0;
  return Math.max(1, Math.min(12, Math.round(clamped * 12)));
}

/**
 * Maps a normalized audio level [0..1] into 0..4 lit red peak LEDs for the Right Auxiliary Sub-Panel.
 */
export function levelTo4RedPeakDots(level01: number, isActive: boolean): number {
  if (!isActive || !Number.isFinite(level01)) return 0;
  const clamped = Math.max(0, Math.min(1, level01));
  if (clamped <= 0.05) return 1;
  return Math.max(1, Math.min(4, Math.ceil(clamped * 4)));
}

export type CassetteLedZone = 'green' | 'amber' | 'red';

export interface CassetteLedSegmentSpec {
  index: number;
  zone: CassetteLedZone;
  litHex: string;
  dimHex: string;
  glowRgba: string;
}

export function getCassetteLedSegmentSpec(segmentIndex: number): CassetteLedSegmentSpec {
  const idx = Math.max(0, Math.min(11, Math.floor(segmentIndex)));
  if (idx >= 10) {
    return {
      index: idx,
      zone: 'red',
      litHex: '#D64541',
      dimHex: '#381312',
      glowRgba: 'rgba(214, 69, 65, 0.85)',
    };
  }
  if (idx >= 7) {
    return {
      index: idx,
      zone: 'amber',
      litHex: '#FFB020',
      dimHex: '#37290f',
      glowRgba: 'rgba(255, 176, 32, 0.8)',
    };
  }
  return {
    index: idx,
    zone: 'green',
    litHex: '#3E8E5A',
    dimHex: '#102e1d',
    glowRgba: 'rgba(62, 142, 90, 0.8)',
  };
}

export const CASSETTE_SPINE_STRIPE_COLORS = [
  '#D64541',
  '#3E6FB0',
  '#3E8E5A',
  '#C98A2B',
  '#5A626A',
  '#8B4A7E',
] as const;

export function getCassetteSpineStripeColor(index: number): string {
  const safeIdx = Math.abs(Math.trunc(Number.isFinite(index) ? index : 0));
  return CASSETTE_SPINE_STRIPE_COLORS[safeIdx % CASSETTE_SPINE_STRIPE_COLORS.length];
}

export interface CassetteSpinePalette {
  baseHex: string;
  inkHex: string;
  subInkHex: string;
  borderHex: string;
  isDarkSurface: boolean;
  isFallbackCream: boolean;
}

export const DEFAULT_CASSETTE_SPINE_PALETTE: CassetteSpinePalette = {
  baseHex: '#E9E6DA',
  inkHex: '#141516',
  subInkHex: '#4E5158',
  borderHex: '#B8B3A4',
  isDarkSurface: false,
  isFallbackCream: true,
};

function channelToLinear(c255: number): number {
  const s = c255 / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function computeRelativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * channelToLinear(Math.max(0, Math.min(255, r))) +
    0.7152 * channelToLinear(Math.max(0, Math.min(255, g))) +
    0.0722 * channelToLinear(Math.max(0, Math.min(255, b)))
  );
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function extractCassetteSpinePaletteFromPixels(
  pixels?: Uint8ClampedArray | number[] | null
): CassetteSpinePalette {
  if (!pixels || pixels.length < 4) {
    return DEFAULT_CASSETTE_SPINE_PALETTE;
  }

  let totalWeight = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  let rawCount = 0;
  let rawR = 0;
  let rawG = 0;
  let rawB = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 40) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    rawCount += 1;
    rawR += r;
    rawG += g;
    rawB += b;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const midWeight = lum > 0.08 && lum < 0.94 ? 1 : 0.35;
    const w = (0.15 + sat * 2.2) * midWeight;

    totalWeight += w;
    sumR += r * w;
    sumG += g * w;
    sumB += b * w;
  }

  if (rawCount === 0 || totalWeight <= 0) {
    return DEFAULT_CASSETTE_SPINE_PALETTE;
  }

  const chosenR = totalWeight > 0 ? sumR / totalWeight : rawR / rawCount;
  const chosenG = totalWeight > 0 ? sumG / totalWeight : rawG / rawCount;
  const chosenB = totalWeight > 0 ? sumB / totalWeight : rawB / rawCount;

  const baseHex = rgbToHex(chosenR, chosenG, chosenB);
  const relLum = computeRelativeLuminance(chosenR, chosenG, chosenB);
  const isDarkSurface = relLum < 0.36;

  return {
    baseHex,
    inkHex: isDarkSurface ? '#F7F5EE' : '#141516',
    subInkHex: isDarkSurface ? 'rgba(247, 245, 238, 0.78)' : 'rgba(20, 21, 22, 0.72)',
    borderHex: isDarkSurface
      ? rgbToHex(Math.min(255, chosenR + 34), Math.min(255, chosenG + 34), Math.min(255, chosenB + 34))
      : rgbToHex(Math.max(0, chosenR - 36), Math.max(0, chosenG - 36), Math.max(0, chosenB - 36)),
    isDarkSurface,
    isFallbackCream: false,
  };
}

export interface OrganizerColumnEntry<T> {
  item: T;
  trackIndex: number;
}

export function splitPlaylistIntoOrganizerColumns<T>(tracks: readonly T[]): {
  leftColumn: OrganizerColumnEntry<T>[];
  rightColumn: OrganizerColumnEntry<T>[];
} {
  const safeTracks = Array.isArray(tracks) ? tracks : [];
  const midpoint = Math.ceil(safeTracks.length / 2);
  const leftColumn: OrganizerColumnEntry<T>[] = [];
  const rightColumn: OrganizerColumnEntry<T>[] = [];

  for (let i = 0; i < safeTracks.length; i += 1) {
    const entry = { item: safeTracks[i], trackIndex: i };
    if (i < midpoint) {
      leftColumn.push(entry);
    } else {
      rightColumn.push(entry);
    }
  }

  return { leftColumn, rightColumn };
}

export function tunerDialRatioToSeekSec(ratio01: number, durationSec: number): number {
  const safeDur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  if (safeDur <= 0) return 0;
  const clamped = Number.isFinite(ratio01) ? Math.max(0, Math.min(1, ratio01)) : 0;
  return Math.round(clamped * safeDur);
}

export function stepSeekSecFromTuningKnobDelta(
  currentSec: number,
  durationSec: number,
  deltaDeg: number
): number {
  const safeDur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  if (safeDur <= 0 || !Number.isFinite(deltaDeg)) return 0;
  const safeCur = Number.isFinite(currentSec) ? Math.max(0, Math.min(safeDur, currentSec)) : 0;
  const deltaSec = (deltaDeg / 300) * safeDur;
  return Math.max(0, Math.min(safeDur, Math.round(safeCur + deltaSec)));
}

export interface CassetteBoxDimensions {
  width: number;
  height: number;
  depthPx: number;
  paddingPx: number;
  widthDiffPx: number;
  heightDiffPx: number;
}

export function computeCassetteBoxDimensions(
  cassetteWidth: number,
  cassetteHeight: number
): CassetteBoxDimensions {
  const safeW = Number.isFinite(cassetteWidth) && cassetteWidth > 0 ? Math.round(cassetteWidth) : 140;
  const safeH = Number.isFinite(cassetteHeight) && cassetteHeight > 0 ? Math.round(cassetteHeight) : 90;
  return {
    width: safeW + 50,
    height: safeH + 50,
    depthPx: 50,
    paddingPx: 50,
    widthDiffPx: 50,
    heightDiffPx: 50,
  };
}

export function horizontalPointerRatioToPitch(ratioFromLeft: number): number {
  const clamped = Number.isFinite(ratioFromLeft) ? Math.max(0, Math.min(1, ratioFromLeft)) : 0.5;
  const raw = Math.round((clamped - 0.5) * 24);
  if (raw === 0) return 0;
  return Math.max(-12, Math.min(12, raw));
}

export function calculatePitchThumbLeftPercent(pitchPercent: number): number {
  const clamped = Number.isFinite(pitchPercent) ? Math.max(-12, Math.min(12, pitchPercent)) : 0;
  return Number((50 + (clamped / 12) * 42).toFixed(2));
}

export function horizontalPointerRatioToVolume(ratioFromLeft: number): number {
  const clamped = Number.isFinite(ratioFromLeft) ? Math.max(0, Math.min(1, ratioFromLeft)) : 0.8;
  return Number(clamped.toFixed(2));
}

export function calculateVolumeThumbLeftPercent(volume: number): number {
  const clamped = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.8;
  return Number((8 + clamped * 84).toFixed(2));
}

export const BOOMBOX_FM_DIAL_MARKERS = ['88', '90', '92', '96', '100', '104', '108'] as const;
export const BOOMBOX_AM_DIAL_MARKERS = [
  '530',
  '600',
  '700',
  '800',
  '1000',
  '1200',
  '1400',
  '1600',
] as const;
export const BOOMBOX_DEFAULT_TUNER_FM_MHZ = 101.5;

/**
 * Computes the crimson-red tuning needle horizontal percentage for a given FM frequency (88..108 MHz).
 * At 101.5 MHz, returns 67.5%.
 */
export function fmFrequencyToNeedlePercent(freqMhz: number): number {
  const clamped = Number.isFinite(freqMhz) ? Math.max(88, Math.min(108, freqMhz)) : BOOMBOX_DEFAULT_TUNER_FM_MHZ;
  return Number((((clamped - 88) / (108 - 88)) * 100).toFixed(2));
}

export interface WtbRadioBandSpec {
  id: 'FM' | 'AM' | 'SW1' | 'SW2';
  code: string;
  modulationLabel: string;
  rangeLabel: string;
  unit: 'MHz' | 'KHz';
  ticks: readonly string[];
}

export const WTB_732_RADIO_BANDS: readonly WtbRadioBandSpec[] = [
  {
    id: 'FM',
    code: 'FM',
    modulationLabel: 'FREQUENCY MODULATION',
    rangeLabel: '88---108',
    unit: 'MHz',
    ticks: BOOMBOX_FM_DIAL_MARKERS,
  },
  {
    id: 'AM',
    code: 'AM',
    modulationLabel: 'AMPLITUDE MODULATION',
    rangeLabel: '530---1600',
    unit: 'KHz',
    ticks: BOOMBOX_AM_DIAL_MARKERS,
  },
  {
    id: 'SW1',
    code: 'SW1',
    modulationLabel: 'SHORT WAVE 1',
    rangeLabel: '2.8---10.0',
    unit: 'MHz',
    ticks: ['2.8', '3.3', '4.7', '6.3', '7.7', '9.2', '10.0'],
  },
  {
    id: 'SW2',
    code: 'SW2',
    modulationLabel: 'SHORT WAVE 2',
    rangeLabel: '10.0---22.2',
    unit: 'MHz',
    ticks: ['10.0', '11.1', '12.6', '14.8', '16.7', '18.7', '20.6', '22.2'],
  },
] as const;

export const WTB_732_MONOCHROME_PALETTE = {
  silverFaceHex: '#E6E8EA',
  silverTrackHex: '#D0D3D6',
  charcoalCavityHex: '#18191B',
  blackInkHex: '#141516',
  tunerNeedleRedHex: '#E61919',
  hasGreenAmberOrYellow: false,
} as const;

export interface BoomboxAuxSpeakerSpec {
  id: 'outer-aux' | 'inner-aux';
  role: 'mid-range-driver' | 'piezo-tweeter';
  position: 'outer' | 'inner';
  label: string;
  diameterPxDesktop: number;
  diameterPxMobile: number;
  diameterRatioToOuter: number;
}

/**
 * Returns the strictly mirrored pair of circular upper auxiliary speakers mounted directly ABOVE
 * each lowered main woofer grille (Desktop & Mobile Portrait):
 * - Outer-Edge Auxiliary Speaker (larger, aligned flush with outer bezel edge of main woofer below)
 * - Inner-Edge Auxiliary Speaker (adjacent to cassette bay, exact 50% diameter of outer speaker)
 * - Left Bay:  `[Outer Larger] [Inner 50%]`
 * - Right Bay: `[Inner 50%] [Outer Larger]`
 */
export function getMirroredUpperAuxiliarySpeakers(
  side: 'left' | 'right'
): readonly [BoomboxAuxSpeakerSpec, BoomboxAuxSpeakerSpec] {
  const outerLarger: BoomboxAuxSpeakerSpec = {
    id: 'outer-aux',
    role: 'mid-range-driver',
    position: 'outer',
    label: 'UPPER MID',
    diameterPxDesktop: 52,
    diameterPxMobile: 40,
    diameterRatioToOuter: 1,
  };
  const innerHalf: BoomboxAuxSpeakerSpec = {
    id: 'inner-aux',
    role: 'piezo-tweeter',
    position: 'inner',
    label: 'HF TWEETER',
    diameterPxDesktop: 26,
    diameterPxMobile: 20,
    diameterRatioToOuter: 0.5,
  };
  return side === 'left' ? [outerLarger, innerHalf] : [innerHalf, outerLarger];
}

export interface UpperDualRoundSpeakerPairMetrics {
  outerDiameterPx: number;
  innerDiameterPx: number;
  innerToOuterRatio: number;
}

/**
 * Computes the outer larger auxiliary speaker diameter and the inner auxiliary speaker diameter
 * at an exact 50% (0.5) ratio directly above the lowered circular main woofer.
 */
export function computeUpperDualRoundSpeakerPairMetrics(
  mainWooferSizePx: number,
  isMobilePortrait = false
): UpperDualRoundSpeakerPairMetrics {
  const safeWoofer = Number.isFinite(mainWooferSizePx) && mainWooferSizePx > 50 ? mainWooferSizePx : 120;
  const rawOuter = isMobilePortrait
    ? Math.max(22, Math.min(34, Math.round(safeWoofer * 0.34)))
    : Math.max(32, Math.min(56, Math.round(safeWoofer * 0.38)));
  // Ensure even pixel width so innerDiameterPx === outerDiameterPx * 0.5 exactly
  const outerDiameterPx = rawOuter % 2 === 0 ? rawOuter : rawOuter + 1;
  const innerDiameterPx = outerDiameterPx * 0.5;
  return {
    outerDiameterPx,
    innerDiameterPx,
    innerToOuterRatio: 0.5,
  };
}

export const CASSETTE_EQ_DB_TICKS = ['+12dB', '+6dB', '0dB', '-6dB', '-12dB'] as const;

export const WTB_732_RACK_PALETTE = {
  satinSilverGradient:
    'linear-gradient(180deg, #E6E8EA 0%, #D0D3D6 45%, #B8BCC0 85%, #9EA3A8 100%)',
  slotCharcoalHex: '#18191B',
  cornerScrewsCount: 4,
  cassetteShellScrewsCount: 5,
} as const;


export interface CassetteEqBandSpec {
  id: string;
  freqLabel: string;
  roleLabel: string;
  defaultLevel01: number;
}

export const CASSETTE_5BAND_EQ_SPECS: readonly CassetteEqBandSpec[] = [
  { id: 'eq-60hz', freqLabel: '60Hz', roleLabel: 'Sub-Bass', defaultLevel01: 0.74 },
  { id: 'eq-250hz', freqLabel: '250Hz', roleLabel: 'Bass', defaultLevel01: 0.64 },
  { id: 'eq-1khz', freqLabel: '1kHz', roleLabel: 'Midrange', defaultLevel01: 0.52 },
  { id: 'eq-4khz', freqLabel: '4kHz', roleLabel: 'Presence', defaultLevel01: 0.68 },
  { id: 'eq-12khz', freqLabel: '12kHz', roleLabel: 'Treble', defaultLevel01: 0.78 },
] as const;

export interface BassSpeakerPulseMetrics {
  coneScale: number;
  dustCapScale: number;
  gasketGlowAlpha: number;
  excursionPx: number;
  bassEnergy01: number;
}

/**
 * Computes real-time bass-reactive speaker cone & convex mirror-chrome dust cap scale (1.00 -> 1.08)
 * driven by low-frequency audio energy (20Hz-120Hz), the Bass rotary knob, and 60Hz/250Hz graphic EQ faders.
 */
export function computeBassSpeakerPulseScale(
  leftLevel01: number,
  rightLevel01: number,
  bassTone01: number,
  eq60Hz01: number,
  eq250Hz01: number,
  isActive: boolean
): BassSpeakerPulseMetrics {
  if (!isActive) {
    return {
      coneScale: 1,
      dustCapScale: 1,
      gasketGlowAlpha: 0,
      excursionPx: 0,
      bassEnergy01: 0,
    };
  }
  const safeL = Number.isFinite(leftLevel01) ? Math.max(0, Math.min(1, leftLevel01)) : 0;
  const safeR = Number.isFinite(rightLevel01) ? Math.max(0, Math.min(1, rightLevel01)) : 0;
  const safeBassTone = Number.isFinite(bassTone01) ? Math.max(0, Math.min(1, bassTone01)) : 0.55;
  const safeEq60 = Number.isFinite(eq60Hz01) ? Math.max(0, Math.min(1, eq60Hz01)) : 0.7;
  const safeEq250 = Number.isFinite(eq250Hz01) ? Math.max(0, Math.min(1, eq250Hz01)) : 0.6;

  const rawAudio = safeL * 0.55 + safeR * 0.45;
  const lowShelfBoost = 0.65 + safeBassTone * 0.35 + (safeEq60 * 0.6 + safeEq250 * 0.4) * 0.35;
  const bassEnergy01 = Math.max(0, Math.min(1, Number((rawAudio * lowShelfBoost).toFixed(3))));
  const coneScale = Number((1 + bassEnergy01 * 0.08).toFixed(4));
  const dustCapScale = Number((1 + bassEnergy01 * 0.08).toFixed(4));
  const excursionPx = Number((bassEnergy01 * 4.2).toFixed(2));
  const gasketGlowAlpha = Number((bassEnergy01 * 0.55).toFixed(3));

  return {
    coneScale,
    dustCapScale,
    gasketGlowAlpha,
    excursionPx,
    bassEnergy01,
  };
}

/**
 * Computes 5 dynamic black-on-silver peak-meter levels (0..1) corresponding to
 * 60Hz, 250Hz, 1kHz, 4kHz, and 12kHz bands when audio is playing.
 */
export function computeEqBandPeakLevels(
  leftLevel01: number,
  rightLevel01: number,
  eqBands01: readonly number[],
  timeSec: number,
  isActive: boolean
): number[] {
  if (!isActive) {
    return [0, 0, 0, 0, 0];
  }
  const safeL = Number.isFinite(leftLevel01) ? Math.max(0, Math.min(1, leftLevel01)) : 0;
  const safeR = Number.isFinite(rightLevel01) ? Math.max(0, Math.min(1, rightLevel01)) : 0;
  const avg = (safeL + safeR) * 0.5;
  const t = Number.isFinite(timeSec) ? timeSec : 0;

  const phaseMultipliers = [1.3, 1.85, 2.6, 3.4, 4.3];
  return CASSETTE_5BAND_EQ_SPECS.map((spec, idx) => {
    const fader01 = Number.isFinite(eqBands01[idx])
      ? Math.max(0.08, Math.min(1, eqBands01[idx]))
      : spec.defaultLevel01;
    const harmonic = 0.5 + 0.5 * Math.sin(t * phaseMultipliers[idx] + idx * 1.1);
    const channelBias = idx < 2 ? safeL : idx > 2 ? safeR : avg;
    const level = Math.max(
      0.06,
      Math.min(1, (channelBias * 0.68 + harmonic * 0.32) * (0.45 + fader01 * 0.65))
    );
    return Number(level.toFixed(3));
  });
}
