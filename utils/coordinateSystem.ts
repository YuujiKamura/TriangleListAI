/**
 * Coordinate System Framework
 *
 * This module provides a clean separation between different coordinate spaces:
 *
 * 1. MODEL SPACE (World coordinates)
 *    - Mathematical coordinate system for geometry calculations
 *    - X increases to the right
 *    - Y increases UPWARD (standard math convention)
 *    - Origin can be anywhere, but typically (0,0) is at bottom-left of content
 *    - All triangle calculations happen here
 *    - Units: real-world units (meters, etc.)
 *
 * 2. VIEW SPACE (Normalized device coordinates)
 *    - Intermediate space for viewport transformations
 *    - Range: [0,1] x [0,1]
 *    - Used for pan/zoom calculations
 *
 * 3. SCREEN SPACE (Pixel coordinates)
 *    - Canvas/Konva rendering coordinates
 *    - X increases to the right
 *    - Y increases DOWNWARD (screen convention)
 *    - Origin at top-left of canvas
 *    - Units: pixels
 *
 * Key principle:
 *    The Y-axis flip happens ONLY in the view transformation (modelToScreen).
 *    All geometry logic uses MODEL SPACE with Y-up convention.
 */

import { Point } from '../types';
import { CANVAS_CONFIG } from '../constants';

const { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, WORLD_BOUNDS } = CANVAS_CONFIG;

// ============================================================================
// Types
// ============================================================================

/** A point in model space (Y-up, mathematical coordinates) */
export interface ModelPoint {
  x: number;
  y: number;
}

/** A point in screen space (Y-down, pixel coordinates) */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** Viewport configuration */
export interface Viewport {
  // Model space bounds that map to the screen
  modelBounds: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  // Screen dimensions
  screenWidth: number;
  screenHeight: number;
}

// ============================================================================
// Default Viewport
// ============================================================================

/**
 * Create default viewport based on config.
 * WORLD_BOUNDS = { x: 0, y: -40, w: 50, h: 40 }
 * This means model Y ranges from -40 to 0, which in Y-up convention means
 * the visible area is from y=0 (bottom) to y=40 (top) when rendered.
 */
export const createDefaultViewport = (): Viewport => ({
  modelBounds: {
    minX: WORLD_BOUNDS.x,
    minY: WORLD_BOUNDS.y,
    width: WORLD_BOUNDS.w,
    height: WORLD_BOUNDS.h,
  },
  screenWidth: VIRTUAL_WIDTH,
  screenHeight: VIRTUAL_HEIGHT,
});

// ============================================================================
// Coordinate Transformations
// ============================================================================

/**
 * Convert model coordinates to screen coordinates.
 * This is where the Y-axis flip happens.
 *
 * Model: Y increases upward
 * Screen: Y increases downward
 */
export const modelToScreen = (
  model: ModelPoint,
  viewport: Viewport = createDefaultViewport()
): ScreenPoint => {
  const { modelBounds, screenWidth, screenHeight } = viewport;

  // Normalize to [0, 1]
  const normalizedX = (model.x - modelBounds.minX) / modelBounds.width;
  const normalizedY = (model.y - modelBounds.minY) / modelBounds.height;

  // Map to screen, flipping Y axis
  // normalizedY = 0 (model bottom) -> screen bottom (screenHeight)
  // normalizedY = 1 (model top) -> screen top (0)
  return {
    x: normalizedX * screenWidth,
    y: (1 - normalizedY) * screenHeight,
  };
};

/**
 * Convert screen coordinates to model coordinates.
 * Inverse of modelToScreen.
 */
export const screenToModel = (
  screen: ScreenPoint,
  viewport: Viewport = createDefaultViewport()
): ModelPoint => {
  const { modelBounds, screenWidth, screenHeight } = viewport;

  // Normalize from screen
  const normalizedX = screen.x / screenWidth;
  const normalizedY = screen.y / screenHeight;

  // Map to model, flipping Y axis back
  return {
    x: modelBounds.minX + normalizedX * modelBounds.width,
    y: modelBounds.minY + (1 - normalizedY) * modelBounds.height,
  };
};

// ============================================================================
// Geometry Utilities (Model Space)
// ============================================================================

/**
 * Calculate distance between two points in model space.
 */
export const modelDistance = (p1: ModelPoint, p2: ModelPoint): number => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Determine which side of a directed edge (p1 -> p2) a point lies on.
 * Uses cross product in model space (Y-up convention).
 *
 * Returns:
 *   > 0: point is on the LEFT side (counterclockwise from edge)
 *   < 0: point is on the RIGHT side (clockwise from edge)
 *   = 0: point is on the edge
 *
 * In Y-up coordinates with edge going left-to-right:
 *   - LEFT side = ABOVE the edge (positive Y direction)
 *   - RIGHT side = BELOW the edge (negative Y direction)
 */
export const crossProduct2D = (p1: ModelPoint, p2: ModelPoint, point: ModelPoint): number => {
  return (p2.x - p1.x) * (point.y - p1.y) - (p2.y - p1.y) * (point.x - p1.x);
};

/**
 * Check if a point is on the left side of directed edge (p1 -> p2).
 * In Y-up model space, "left" means counterclockwise / above for horizontal edges.
 */
export const isLeftSide = (p1: ModelPoint, p2: ModelPoint, point: ModelPoint): boolean => {
  return crossProduct2D(p1, p2, point) > 0;
};

/**
 * Calculate the third point of a triangle given:
 * - Base edge from p1 to p2
 * - Distance from p1 to new point (leftDist)
 * - Distance from p2 to new point (rightDist)
 * - Which side to place the point (left = counterclockwise from edge)
 *
 * This uses the standard circle intersection algorithm.
 * The "side" parameter determines which of the two possible solutions to return.
 */
export const calculateThirdVertex = (
  p1: ModelPoint,
  p2: ModelPoint,
  leftDist: number,
  rightDist: number,
  placeOnLeftSide: boolean
): ModelPoint | null => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const d = Math.sqrt(dx * dx + dy * dy);

  // Triangle inequality check
  if (d > leftDist + rightDist || d < Math.abs(leftDist - rightDist) || d === 0) {
    return null;
  }

  // Find the point on the base edge where the altitude from p3 meets
  const a = (leftDist * leftDist - rightDist * rightDist + d * d) / (2 * d);

  // Height of the triangle (distance from base to p3)
  const h = Math.sqrt(Math.max(0, leftDist * leftDist - a * a));

  // Point on the base edge
  const baseX = p1.x + (dx * a) / d;
  const baseY = p1.y + (dy * a) / d;

  // Perpendicular vector (rotated 90 degrees counterclockwise)
  // For edge (dx, dy), perpendicular left is (-dy, dx)
  const perpX = -dy / d;
  const perpY = dx / d;

  // Choose side: left (counterclockwise) or right (clockwise)
  const sign = placeOnLeftSide ? 1 : -1;

  return {
    x: baseX + sign * h * perpX,
    y: baseY + sign * h * perpY,
  };
};

/**
 * Calculate angle of a vector in degrees, normalized for readable text display.
 * Adjusts angle so text is never upside-down (stays within -90 to 90 degrees).
 */
export const calculateTextAngle = (dx: number, dy: number): number => {
  // Note: We use model-space dy here, but the result will be used in screen space
  // where Y is flipped, so we negate dy for the calculation
  let angle = Math.atan2(-dy, dx) * 180 / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return angle;
};

// ============================================================================
// Conversion Helpers for Legacy Point Type
// ============================================================================

/**
 * Convert legacy Point to ModelPoint
 */
export const pointToModel = (p: Point): ModelPoint => ({
  x: p.x,
  y: p.y,
});

/**
 * Convert ModelPoint to legacy Point (with generated ID)
 */
export const modelToPoint = (m: ModelPoint, id?: string): Point => ({
  id: id || Math.random().toString(36).substring(2, 9),
  x: m.x,
  y: m.y,
});
