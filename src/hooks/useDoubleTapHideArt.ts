import { useCallback, useMemo, useRef } from 'react';
import type React from 'react';

export interface DoubleTapHideArtOptions {
  enabled?: boolean;
  onHide?: () => void;
}

export interface DoubleTapHideArtBindings {
  onDoubleClick: (e: React.MouseEvent<HTMLElement>) => void;
  onPointerDownCapture: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUpCapture: (e: React.PointerEvent<HTMLElement>) => void;
}

/**
 * Provides unified double-click (desktop) and <=300ms double-tap (touch/pen)
 * gesture handlers for standalone Album Art containers, cases, floppies, and
 * Winamp art panels across all themes.
 *
 * - Ignores pointer drags >= 8px so dragging a sleeve/case never hides it.
 * - Calls e.stopPropagation() so double-tapping never leaks to parent fullscreen/skip handlers.
 * - Cooldown-deduplicates touch + synthetic dblclick within 450ms.
 */
export function useDoubleTapHideArt(
  optionsOrOnHide?: DoubleTapHideArtOptions | (() => void)
) {
  const { enabled = true, onHide } =
    typeof optionsOrOnHide === 'function'
      ? { enabled: true, onHide: optionsOrOnHide }
      : optionsOrOnHide ?? {};
  const downPosRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const lastTapMsRef = useRef<number>(0);
  const lastFiredMsRef = useRef<number>(0);

  const fireOnce = useCallback(() => {
    if (!enabled || !onHide) return;
    const now = Date.now();
    if (now - lastFiredMsRef.current < 450) return;
    lastFiredMsRef.current = now;
    lastTapMsRef.current = 0;
    onHide();
  }, [enabled, onHide]);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!enabled || !onHide) return;
      e.stopPropagation();
      e.preventDefault();
      fireOnce();
    },
    [enabled, onHide, fireOnce]
  );

  const onPointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      downPosRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    },
    [enabled]
  );

  const onPointerUpCapture = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled || !onHide) return;
      const down = downPosRef.current;
      downPosRef.current = null;
      if (e.pointerType === 'mouse') return;
      if (down && down.pointerId === e.pointerId) {
        const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        if (dist >= 8) {
          lastTapMsRef.current = 0;
          return;
        }
      }
      const now = Date.now();
      if (now - lastTapMsRef.current <= 300) {
        e.stopPropagation();
        fireOnce();
      } else {
        lastTapMsRef.current = now;
      }
    },
    [enabled, onHide, fireOnce]
  );

  const doubleTapHideArtBind = useMemo<DoubleTapHideArtBindings>(
    () => ({
      onDoubleClick,
      onPointerDownCapture,
      onPointerUpCapture,
    }),
    [onDoubleClick, onPointerDownCapture, onPointerUpCapture]
  );

  return {
    onDoubleClick,
    onPointerDownCapture,
    onPointerUpCapture,
    doubleTapHideArtBind,
  };
}
