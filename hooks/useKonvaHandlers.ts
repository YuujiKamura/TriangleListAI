import { useMemo } from 'react';
import Konva from 'konva';

type KonvaEventObject<T = Event> = Konva.KonvaEventObject<T>;
type KonvaMouseEvent = KonvaEventObject<MouseEvent>;
type KonvaTouchEvent = KonvaEventObject<TouchEvent>;
type KonvaPointerEvent = KonvaEventObject<PointerEvent>;

// Union type for click/tap events
type ClickTapEvent = KonvaMouseEvent | KonvaTouchEvent;

/**
 * Creates unified event handlers for Konva elements that work with both mouse and touch.
 * This ensures parity between onClick/onTap and onDblClick/onDblTap handlers.
 *
 * @example
 * // Single click/tap only
 * <Line {...useClickHandlers(handleSelect)} />
 *
 * @example
 * // Single and double click/tap
 * <Line {...useClickHandlers(handleSelect, handleDoubleClick)} />
 *
 * @example
 * // With additional props
 * <Line {...useClickHandlers(handleSelect)} stroke="red" />
 */
export function useClickHandlers(
  onSingle?: (e: ClickTapEvent) => void,
  onDouble?: (e: ClickTapEvent) => void
) {
  return useMemo(() => ({
    onClick: onSingle,
    onTap: onSingle,
    onDblClick: onDouble,
    onDblTap: onDouble,
  }), [onSingle, onDouble]);
}

/**
 * Creates unified pointer event handlers for Konva elements.
 * Use this for drag operations or when you need pointer tracking.
 *
 * @example
 * <Rect {...usePointerHandlers(handleDown, handleMove, handleUp)} />
 */
export function usePointerHandlers(
  onDown?: (e: KonvaPointerEvent) => void,
  onMove?: (e: KonvaPointerEvent) => void,
  onUp?: (e: KonvaPointerEvent) => void
) {
  return useMemo(() => ({
    onPointerDown: onDown,
    onPointerMove: onMove,
    onPointerUp: onUp,
  }), [onDown, onMove, onUp]);
}

/**
 * Creates unified mouse/touch event handlers for long press detection.
 * Combines onMouseDown/onTouchStart and onMouseUp/onMouseLeave/onTouchEnd.
 *
 * @example
 * <Shape {...useLongPressHandlers(handleStart, handleEnd)} />
 */
export function useLongPressHandlers(
  onStart?: (e: KonvaMouseEvent | KonvaTouchEvent) => void,
  onEnd?: (e: KonvaMouseEvent | KonvaTouchEvent) => void
) {
  return useMemo(() => ({
    onMouseDown: onStart,
    onTouchStart: onStart,
    onMouseUp: onEnd,
    onMouseLeave: onEnd,
    onTouchEnd: onEnd,
  }), [onStart, onEnd]);
}

/**
 * Combines click handlers with long press handlers.
 * Use this for elements that need both click/tap selection and long press actions.
 *
 * @example
 * <Shape {...useInteractiveHandlers({
 *   onSingle: handleSelect,
 *   onDouble: handleEdit,
 *   onLongPressStart: handleContextMenuStart,
 *   onLongPressEnd: handleContextMenuEnd,
 * })} />
 */
export function useInteractiveHandlers(options: {
  onSingle?: (e: ClickTapEvent) => void;
  onDouble?: (e: ClickTapEvent) => void;
  onLongPressStart?: (e: KonvaMouseEvent | KonvaTouchEvent) => void;
  onLongPressEnd?: (e: KonvaMouseEvent | KonvaTouchEvent) => void;
}) {
  const { onSingle, onDouble, onLongPressStart, onLongPressEnd } = options;

  return useMemo(() => ({
    // Click/Tap handlers
    onClick: onSingle,
    onTap: onSingle,
    onDblClick: onDouble,
    onDblTap: onDouble,
    // Long press handlers
    onMouseDown: onLongPressStart,
    onTouchStart: onLongPressStart,
    onMouseUp: onLongPressEnd,
    onMouseLeave: onLongPressEnd,
    onTouchEnd: onLongPressEnd,
  }), [onSingle, onDouble, onLongPressStart, onLongPressEnd]);
}

/**
 * Pure function version of useClickHandlers for use in render functions
 * where React hooks cannot be called.
 *
 * @example
 * // In a render function (not a component)
 * <Line {...clickHandlers(handleSelect, handleDoubleClick)} />
 */
export function clickHandlers(
  onSingle?: (e: ClickTapEvent) => void,
  onDouble?: (e: ClickTapEvent) => void
) {
  return {
    onClick: onSingle,
    onTap: onSingle,
    onDblClick: onDouble,
    onDblTap: onDouble,
  };
}

/**
 * Pure function version of useLongPressHandlers for use in render functions.
 */
export function longPressHandlers(
  onStart?: (e: KonvaMouseEvent | KonvaTouchEvent) => void,
  onEnd?: (e: KonvaMouseEvent | KonvaTouchEvent) => void
) {
  return {
    onMouseDown: onStart,
    onTouchStart: onStart,
    onMouseUp: onEnd,
    onMouseLeave: onEnd,
    onTouchEnd: onEnd,
  };
}

/**
 * Pure function version of useInteractiveHandlers for use in render functions.
 */
export function interactiveHandlers(options: {
  onSingle?: (e: ClickTapEvent) => void;
  onDouble?: (e: ClickTapEvent) => void;
  onLongPressStart?: (e: KonvaMouseEvent | KonvaTouchEvent) => void;
  onLongPressEnd?: (e: KonvaMouseEvent | KonvaTouchEvent) => void;
}) {
  const { onSingle, onDouble, onLongPressStart, onLongPressEnd } = options;
  return {
    onClick: onSingle,
    onTap: onSingle,
    onDblClick: onDouble,
    onDblTap: onDouble,
    onMouseDown: onLongPressStart,
    onTouchStart: onLongPressStart,
    onMouseUp: onLongPressEnd,
    onMouseLeave: onLongPressEnd,
    onTouchEnd: onLongPressEnd,
  };
}

// Re-export types for convenience
export type { ClickTapEvent, KonvaMouseEvent, KonvaTouchEvent, KonvaPointerEvent };
