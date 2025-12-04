import { useRef, useCallback } from 'react';
import Konva from 'konva';

// Gesture detection constants
export const GESTURE_CONSTANTS = {
  LONG_PRESS_DURATION: 300,   // ms
  DOUBLE_TAP_INTERVAL: 300,   // ms
  DOUBLE_TAP_DISTANCE: 30,    // px
  MOVE_THRESHOLD: 5,          // px to cancel long press / start drag
  MIN_PINCH_DISTANCE: 10,     // px minimum distance for pinch
};

export interface PointerInfo {
  id: number;
  clientX: number;
  clientY: number;
  startX: number;
  startY: number;
  startTime: number;
  pointerType: 'mouse' | 'touch' | 'pen';
}

export interface GestureCallbacks {
  // isDoubleTap: true if this pointerDown is the second tap of a double-tap
  onPointerDown?: (pointer: PointerInfo, target: Konva.Node, evt: PointerEvent, isDoubleTap?: boolean) => void;
  onPointerMove?: (pointer: PointerInfo, evt: PointerEvent) => void;
  onPointerUp?: (pointer: PointerInfo, evt: PointerEvent) => void;
  onLongPress?: (clientX: number, clientY: number, target: Konva.Node) => void;
  // onDoubleTap is called for double-tap on background ONLY when not in creation mode
  // During creation mode, onPointerDown receives isDoubleTap=true instead
  onDoubleTap?: (clientX: number, clientY: number, target: Konva.Node, evt: PointerEvent) => void;
  onPinchStart?: (centerX: number, centerY: number, distance: number) => void;
  onPinchMove?: (centerX: number, centerY: number, scale: number, distance: number) => void;
  onPinchEnd?: () => void;
  // Indicates whether we're in a creation mode (PHANTOM_PLACING, DRAWING_EDGE, etc.)
  // When true, double-tap on background will be passed to onPointerDown with isDoubleTap=true
  isInCreationMode?: () => boolean;
}

export function usePointer(callbacks: GestureCallbacks) {
  // Track active pointers
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());

  // Long press timer
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTargetRef = useRef<Konva.Node | null>(null);

  // Double tap tracking
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  // Pinch state
  const pinchStartDistanceRef = useRef<number | null>(null);
  const isPinchingRef = useRef(false);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressTargetRef.current = null;
  }, []);

  const startLongPress = useCallback((x: number, y: number, target: Konva.Node) => {
    cancelLongPress();
    longPressTargetRef.current = target;
    longPressTimerRef.current = window.setTimeout(() => {
      if (callbacks.onLongPress) {
        callbacks.onLongPress(x, y, target);
      }
      longPressTimerRef.current = null;
    }, GESTURE_CONSTANTS.LONG_PRESS_DURATION);
  }, [callbacks, cancelLongPress]);

  const checkDoubleTap = useCallback((x: number, y: number, target: Konva.Node, evt: PointerEvent): boolean => {
    const now = Date.now();
    const last = lastTapRef.current;
    const targetName = target.name();
    const isBackground = targetName === 'background-rect' || !targetName;
    const inCreationMode = callbacks.isInCreationMode?.() || false;

    // In creation mode: detect double-tap anywhere on background for confirmation
    // Not in creation mode: only detect double-tap on background to start new edge
    if (!isBackground && !inCreationMode) {
      // Reset tap tracking when tapping on non-background elements (except in creation mode)
      lastTapRef.current = null;
      return false;
    }

    if (last) {
      const timeDiff = now - last.time;
      const dx = x - last.x;
      const dy = y - last.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (timeDiff < GESTURE_CONSTANTS.DOUBLE_TAP_INTERVAL &&
          dist < GESTURE_CONSTANTS.DOUBLE_TAP_DISTANCE) {
        lastTapRef.current = null;

        // In creation mode: don't call onDoubleTap, let onPointerDown handle it
        // Not in creation mode: call onDoubleTap to start new edge drawing
        if (!inCreationMode && callbacks.onDoubleTap) {
          callbacks.onDoubleTap(x, y, target, evt);
        }
        return true;
      }
    }

    lastTapRef.current = { time: now, x, y };
    return false;
  }, [callbacks]);

  const getPinchInfo = useCallback(() => {
    const pointers = Array.from(pointersRef.current.values());
    if (pointers.length !== 2) return null;

    const [p1, p2] = pointers;
    const dx = p1.clientX - p2.clientX;
    const dy = p1.clientY - p2.clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const centerX = (p1.clientX + p2.clientX) / 2;
    const centerY = (p1.clientY + p2.clientY) / 2;

    return { centerX, centerY, distance };
  }, []);

  const handlePointerDown = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    const evt = e.evt;
    const { pointerId, clientX, clientY, pointerType } = evt;

    // Store pointer
    const pointer: PointerInfo = {
      id: pointerId,
      clientX,
      clientY,
      startX: clientX,
      startY: clientY,
      startTime: Date.now(),
      pointerType: pointerType as 'mouse' | 'touch' | 'pen',
    };
    pointersRef.current.set(pointerId, pointer);

    const pointerCount = pointersRef.current.size;

    // Multi-touch: start pinch
    if (pointerCount === 2) {
      cancelLongPress();
      const pinchInfo = getPinchInfo();
      if (pinchInfo && pinchInfo.distance > GESTURE_CONSTANTS.MIN_PINCH_DISTANCE) {
        pinchStartDistanceRef.current = pinchInfo.distance;
        isPinchingRef.current = true;
        if (callbacks.onPinchStart) {
          callbacks.onPinchStart(pinchInfo.centerX, pinchInfo.centerY, pinchInfo.distance);
        }
      }
      return;
    }

    // Single pointer
    if (pointerCount === 1) {
      // Check for double tap
      const isDoubleTap = checkDoubleTap(clientX, clientY, e.target, evt);
      if (isDoubleTap) {
        cancelLongPress();
        // For mouse: don't return early - allow normal pointer tracking
        // The double-tap callback already fired, but mouse users need
        // subsequent move/up events to continue their workflow
        // (e.g., double-click to start drawing, then move, then click to confirm)
        if (pointerType === 'touch') {
          // Touch users hold finger down after double-tap, so skip onPointerDown
          return;
        }
        // For mouse: fall through to call onPointerDown as well
        // This allows the interaction state set by onDoubleTap to receive events
      }

      // Start long press detection (skip if this was a double-tap)
      if (!isDoubleTap) {
        startLongPress(clientX, clientY, e.target);
      }

      // Notify callback (pass isDoubleTap flag so caller knows this is the double-click trigger)
      if (callbacks.onPointerDown) {
        callbacks.onPointerDown(pointer, e.target, evt, isDoubleTap);
      }
    }
  }, [callbacks, cancelLongPress, checkDoubleTap, getPinchInfo, startLongPress]);

  const handlePointerMove = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    const evt = e.evt;
    const { pointerId, clientX, clientY, pointerType } = evt;

    const pointer = pointersRef.current.get(pointerId);

    // For mouse: allow move events even without active pointer (button not pressed)
    // This is needed for mouse workflows like: double-click to start, move, click to confirm
    if (!pointer) {
      if (pointerType === 'mouse') {
        // Create a temporary pointer info for the callback
        const tempPointer: PointerInfo = {
          id: pointerId,
          clientX,
          clientY,
          startX: clientX,
          startY: clientY,
          startTime: Date.now(),
          pointerType: 'mouse',
        };
        if (callbacks.onPointerMove) {
          callbacks.onPointerMove(tempPointer, evt);
        }
      }
      return;
    }

    // Update pointer position
    pointer.clientX = clientX;
    pointer.clientY = clientY;

    // Handle pinch zoom
    if (isPinchingRef.current && pointersRef.current.size === 2) {
      const pinchInfo = getPinchInfo();
      if (pinchInfo && pinchStartDistanceRef.current) {
        const scale = pinchInfo.distance / pinchStartDistanceRef.current;
        if (callbacks.onPinchMove) {
          callbacks.onPinchMove(pinchInfo.centerX, pinchInfo.centerY, scale, pinchInfo.distance);
        }
      }
      return;
    }

    // Check if moved enough to cancel long press
    const dx = clientX - pointer.startX;
    const dy = clientY - pointer.startY;
    if (Math.sqrt(dx * dx + dy * dy) > GESTURE_CONSTANTS.MOVE_THRESHOLD) {
      cancelLongPress();
    }

    // Notify callback
    if (callbacks.onPointerMove) {
      callbacks.onPointerMove(pointer, evt);
    }
  }, [callbacks, cancelLongPress, getPinchInfo]);

  const handlePointerUp = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    const evt = e.evt;
    const { pointerId } = evt;

    const pointer = pointersRef.current.get(pointerId);
    pointersRef.current.delete(pointerId);
    cancelLongPress();

    // End pinch if we were pinching and now have less than 2 pointers
    if (isPinchingRef.current && pointersRef.current.size < 2) {
      isPinchingRef.current = false;
      pinchStartDistanceRef.current = null;
      if (callbacks.onPinchEnd) {
        callbacks.onPinchEnd();
      }
      return;
    }

    // Notify callback
    if (pointer && callbacks.onPointerUp) {
      callbacks.onPointerUp(pointer, evt);
    }
  }, [callbacks, cancelLongPress]);

  const handlePointerCancel = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    handlePointerUp(e);
  }, [handlePointerUp]);

  const handlePointerLeave = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    // Only handle pointer leave for mouse (not for touch)
    if (e.evt.pointerType === 'mouse') {
      handlePointerUp(e);
    }
  }, [handlePointerUp]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    cancelLongPress,
    isPinching: () => isPinchingRef.current,
    getActivePointers: () => pointersRef.current,
  };
}
