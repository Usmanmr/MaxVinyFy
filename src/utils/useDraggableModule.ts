import React, { useState, useEffect, useRef } from 'react';

export function useDraggableModule(resetKey: number) {
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOriginRef = useRef<{ startX: number; startY: number; origX: number; origY: number }>({
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  useEffect(() => {
    setOffset({ x: 0, y: 0 });
  }, [resetKey]);

  const onDragHandlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // Do not start module drag if clicking an interactive control inside header
    const target = e.target as HTMLElement;
    if (target.closest('button, select, input, a')) return;

    dragOriginRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragHandlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragOriginRef.current.startX;
    const dy = e.clientY - dragOriginRef.current.startY;
    setOffset({
      x: dragOriginRef.current.origX + dx,
      y: dragOriginRef.current.origY + dy,
    });
  };

  const onDragHandlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return {
    offset,
    isDragging,
    style: {
      transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
      zIndex: isDragging ? 40 : 10,
    } satisfies React.CSSProperties,
    dragHandleProps: {
      onPointerDown: onDragHandlePointerDown,
      onPointerMove: onDragHandlePointerMove,
      onPointerUp: onDragHandlePointerUp,
    },
  };
}
