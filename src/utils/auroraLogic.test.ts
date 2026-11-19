import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  THEME_REGISTRY,
  AURORA_DECK_THEME,
  getThemeById,
  saveThemeId,
  loadSavedThemeId,
} from '../themes/themeRegistry';
import {
  AURORA_PALETTE,
  AURORA_TRACK_CHANGE_TIMELINE_MS,
  AURORA_TIME_SHEAR_MS,
  auroraHexToRgba,
  extractTwoAuroraAccentsFromRgbSamples,
  generateAuroraDiscRings,
  computeAuroraParallaxTilt,
  generateAuroraParticles,
  stepAuroraParticles,
  calculateAuroraShardDragTilt,
  getAuroraTrackChangePhase,
  getAuroraWordRevealTokens,
  computeAuroraBeamBend,
  computeAuroraColumnDragValue,
  computePixelDancerBeatState,
} from './auroraLogic';

describe('Aurora Deck Theme & Pure Logic Suite', () => {
  it('registers Aurora Deck in THEME_REGISTRY with exact holographic palette tokens and persistence', () => {
    const ids = THEME_REGISTRY.map((t) => t.id);
    assert.ok(ids.includes('aurora-deck'));
    assert.equal(THEME_REGISTRY.length, 9);

    const theme = getThemeById('aurora-deck');
    assert.equal(theme.name, 'Aurora Deck');
    assert.equal(AURORA_DECK_THEME.swatch.primaryHex, '#4DE1FF');
    assert.equal(AURORA_DECK_THEME.swatch.secondaryHex, '#06070C');
    assert.equal(AURORA_DECK_THEME.swatch.cabinetHex, '#9D7CFF');
    assert.equal(AURORA_DECK_THEME.swatch.accentHex, '#FFB24D');

    assert.equal(AURORA_PALETTE.voidBg, '#06070C');
    assert.equal(AURORA_PALETTE.cyan, '#4DE1FF');
    assert.equal(AURORA_PALETTE.violet, '#9D7CFF');
    assert.equal(AURORA_PALETTE.warmAlert, '#FFB24D');
    assert.equal(AURORA_PALETTE.textPrimary, '#EAF2FF');
    assert.equal(AURORA_PALETTE.textDim, '#8E9AB8');
    assert.deepEqual(AURORA_PALETTE.washLoopColors, ['#7C4DFF', '#00E5FF', '#FF4D9D']);
    assert.equal(AURORA_PALETTE.washOpacity, 0.06);
    assert.equal(AURORA_PALETTE.washLoopSec, 30);
    assert.equal(AURORA_PALETTE.ringCount, 9);
    assert.equal(AURORA_PALETTE.maxParticles, 24);
    assert.equal(AURORA_PALETTE.pausedDiscDimOpacity, 0.6);
    assert.equal(AURORA_PALETTE.parallaxMaxDeg, 6);
    assert.equal(AURORA_PALETTE.idleShardSwayDeg, 2);
    assert.equal(AURORA_PALETTE.wordMaterializeMs, 120);

    const mem = new Map<string, string>();
    const storageMock: Storage = {
      length: 0,
      clear: () => mem.clear(),
      getItem: (k: string) => mem.get(k) ?? null,
      key: () => null,
      removeItem: (k: string) => {
        mem.delete(k);
      },
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    assert.equal(saveThemeId('aurora-deck', storageMock), 'aurora-deck');
    assert.equal(loadSavedThemeId(storageMock), 'aurora-deck');
  });

  it('extracts two distinct dominant art accents and provides holographic cyan/violet standby fallback', () => {
    const standby = extractTwoAuroraAccentsFromRgbSamples([], 'standby-empty');
    assert.equal(standby.primaryHex, AURORA_PALETTE.cyan);
    assert.equal(standby.secondaryHex, AURORA_PALETTE.violet);

    const samples: Array<[number, number, number]> = [
      [255, 65, 54],
      [255, 65, 54],
      [255, 65, 54],
      [40, 210, 245],
      [40, 210, 245],
    ];
    const dual = extractTwoAuroraAccentsFromRgbSamples(samples, 'track-dual');
    assert.notEqual(dual.primaryHex, dual.secondaryHex);
    assert.ok(dual.primaryGlowRgba.startsWith('rgba('));
    assert.ok(dual.secondaryGlowRgba.startsWith('rgba('));
    assert.equal(auroraHexToRgba('#4DE1FF', 0.35), 'rgba(77, 225, 255, 0.35)');
  });

  it('generates 9 alternating concentric disc rings where inner rings are brighter and spin faster', () => {
    const rings = generateAuroraDiscRings('#4DE1FF', '#9D7CFF');
    assert.equal(rings.length, 9);

    for (let i = 0; i < rings.length; i++) {
      const expectedColor = i % 2 === 0 ? '#4DE1FF' : '#9D7CFF';
      assert.equal(rings[i].colorHex, expectedColor);
      if (i > 0) {
        assert.ok(rings[i].diameterPct > rings[i - 1].diameterPct);
        assert.ok(rings[i].opacity < rings[i - 1].opacity); // inner brighter
        assert.ok(rings[i].spinDurationSec > rings[i - 1].spinDurationSec); // inner faster
      }
    }
  });

  it('clamps holo-disc 3D parallax tilt strictly to +-6 degrees', () => {
    assert.deepEqual(computeAuroraParallaxTilt(0, 0), { rotateXDeg: 0, rotateYDeg: 0 });
    assert.deepEqual(computeAuroraParallaxTilt(3, -3), { rotateXDeg: 6, rotateYDeg: 6 });
    assert.deepEqual(computeAuroraParallaxTilt(-5, 5), { rotateXDeg: -6, rotateYDeg: -6 });
  });

  it('caps needle particles at <= 24, recycles when playing, and freezes state when paused/hidden', () => {
    const particles = generateAuroraParticles(999);
    assert.equal(particles.length, 24);

    const frozen = stepAuroraParticles(particles, 0.05, false);
    assert.strictEqual(frozen, particles);

    const stepped = stepAuroraParticles(particles, 0.05, true);
    assert.equal(stepped.length, 24);
    assert.notDeepEqual(stepped, particles);

    // Trigger wrap-around recycling on near-end-of-life particle
    const almostExpired = [{ ...particles[0], life01: 0.99 }];
    const recycled = stepAuroraParticles(almostExpired, 0.05, true);
    assert.ok(recycled[0].life01 < 0.2);
  });

  it('models <= 1.5s track-change collapse -> split -> bloom choreography and Time-Shear window', () => {
    assert.ok(AURORA_TRACK_CHANGE_TIMELINE_MS.totalMs <= 1500);
    assert.equal(AURORA_TIME_SHEAR_MS, 440);
    assert.equal(getAuroraTrackChangePhase(-1), 'idle');
    assert.equal(getAuroraTrackChangePhase(120), 'collapse');
    assert.equal(getAuroraTrackChangePhase(550), 'split');
    assert.equal(getAuroraTrackChangePhase(1050), 'bloom');
    assert.equal(getAuroraTrackChangePhase(1450), 'idle');
  });

  it('splits lyrics into 120ms/word reveal tokens and flattens delays under reduced motion', () => {
    const normalTokens = getAuroraWordRevealTokens('Music as pure light', false);
    assert.deepEqual(normalTokens, [
      { word: 'Music', index: 0, delayMs: 0 },
      { word: 'as', index: 1, delayMs: 120 },
      { word: 'pure', index: 2, delayMs: 240 },
      { word: 'light', index: 3, delayMs: 360 },
    ]);

    const reducedTokens = getAuroraWordRevealTokens('Music as pure light', true);
    assert.ok(reducedTokens.every((t) => t.delayMs === 0));
  });

  it('computes seek beam scrub bend, vertical column drag values, and shard drag magnetic tilt', () => {
    assert.deepEqual(computeAuroraBeamBend(0.5, 40, true), { percent: 50, bendDyPx: 8 });
    assert.deepEqual(computeAuroraBeamBend(0.25, -40, true), { percent: 25, bendDyPx: -8 });
    assert.deepEqual(computeAuroraBeamBend(0.25, 40, false), { percent: 25, bendDyPx: 0 });

    assert.equal(computeAuroraColumnDragValue(0, -16, 16, 1), 16);
    assert.equal(computeAuroraColumnDragValue(1, -16, 16, 1), -16);
    assert.equal(computeAuroraColumnDragValue(0.5, 0, 1, 0.05), 0.5);

    assert.equal(calculateAuroraShardDragTilt(10, 0, false), 2);
    assert.ok(Math.abs(calculateAuroraShardDragTilt(40, 0, true)) <= 9);
  });

  it('computes beat-synchronized Pixel Neon Dancer frames and album-art interaction poses', () => {
    const paused = computePixelDancerBeatState(1500, 120, 0.8, false);
    assert.equal(paused.pose, 'idle-float');
    assert.equal(paused.bounceYPx, 0);

    const dancing = computePixelDancerBeatState(1250, 128, 0.85, true, false);
    assert.notEqual(dancing.pose, 'idle-float');
    assert.ok(dancing.frameIndex >= 0 && dancing.frameIndex < 8);
    assert.ok(dancing.glowAlpha > 0.7);

    const highFive = computePixelDancerBeatState(2100, 128, 0.9, true, true);
    assert.equal(highFive.pose, 'art-highfive');
    assert.ok(highFive.artReachXPx < -5);
  });

  it('keeps Aurora Deck CSS transform/opacity-only, pauses on data-aurora-active="false", and omits brand names', () => {
    const rootDir = process.cwd();
    const cssContent = fs.readFileSync(path.join(rootDir, 'src/themes/auroraDeck.css'), 'utf8');
    const deckContent = fs.readFileSync(path.join(rootDir, 'src/components/AuroraDeck.tsx'), 'utf8');

    assert.ok(cssContent.includes('[data-aurora-active="false"]'));
    assert.ok(cssContent.includes('prefers-reduced-motion: reduce'));
    assert.ok(cssContent.includes('animation-play-state: paused !important'));

    for (const content of [cssContent.toLowerCase(), deckContent.toLowerCase()]) {
      const sanitized = content.replace(/\/api\/spotify\/track-artwork/g, '');
      assert.equal(sanitized.includes('spotify'), false);
      assert.equal(sanitized.includes('1db954'), false);
      assert.equal(sanitized.includes('1ed760'), false);
      assert.equal(sanitized.includes('apple'), false);
      assert.equal(sanitized.includes('sony'), false);
      assert.equal(sanitized.includes('winamp'), false);
    }
  });
});
