import { Point } from '../types';

/**
 * View transform state for coordinate conversion
 *
 * Coordinate system:
 * - World: CAD-like, Y-up (positive Y goes up)
 * - Screen: Standard mobile, Y-down (positive Y goes down)
 *
 * The transform maps world coordinates to screen coordinates:
 *   screenX = worldX * scale + offsetX
 *   screenY = -worldY * scale + offsetY  (Y is flipped)
 */
export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Convert screen coordinates to world coordinates
 * Handles Y-axis flip (screen Y-down → world Y-up)
 */
export const screenToWorld = (
  screenX: number,
  screenY: number,
  transform: ViewTransform
): Point => ({
  id: '',
  x: (screenX - transform.offsetX) / transform.scale,
  y: -(screenY - transform.offsetY) / transform.scale,
});

/**
 * Convert world coordinates to screen coordinates
 * Handles Y-axis flip (world Y-up → screen Y-down)
 */
export const worldToScreen = (
  worldX: number,
  worldY: number,
  transform: ViewTransform
): { x: number; y: number } => ({
  x: worldX * transform.scale + transform.offsetX,
  y: -worldY * transform.scale + transform.offsetY,
});

/**
 * Calculate new transform after pinch zoom
 * Zooms towards the focal point (pinch center)
 */
export const applyPinchZoom = (
  baseTransform: ViewTransform,
  scaleMultiplier: number,
  focalX: number,
  focalY: number,
  minScale: number = 10,
  maxScale: number = 150
): ViewTransform => {
  const newScale = Math.max(minScale, Math.min(maxScale, baseTransform.scale * scaleMultiplier));
  const scaleRatio = newScale / baseTransform.scale;

  return {
    scale: newScale,
    offsetX: focalX - (focalX - baseTransform.offsetX) * scaleRatio,
    offsetY: focalY - (focalY - baseTransform.offsetY) * scaleRatio,
  };
};

/**
 * Calculate new transform after pan
 */
export const applyPan = (
  baseTransform: ViewTransform,
  deltaX: number,
  deltaY: number
): ViewTransform => ({
  ...baseTransform,
  offsetX: baseTransform.offsetX + deltaX,
  offsetY: baseTransform.offsetY + deltaY,
});

/**
 * Calculate transform to fit content bounds in viewport
 */
export const fitToBounds = (
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  padding: number = 50,
  maxScale: number = 100
): ViewTransform => {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;

  // Calculate scale to fit content with padding
  const scaleX = (viewportWidth - padding * 2) / contentWidth;
  const scaleY = (viewportHeight - padding * 2) / contentHeight;
  const scale = Math.min(scaleX, scaleY, maxScale);

  // Center the content
  const centerWorldX = (bounds.minX + bounds.maxX) / 2;
  const centerWorldY = (bounds.minY + bounds.maxY) / 2;

  // Calculate offset so world center maps to viewport center
  // screenX = worldX * scale + offsetX → offsetX = screenX - worldX * scale
  // screenY = -worldY * scale + offsetY → offsetY = screenY + worldY * scale
  const offsetX = viewportWidth / 2 - centerWorldX * scale;
  const offsetY = viewportHeight / 2 + centerWorldY * scale;  // Note: + because of Y flip

  return { scale, offsetX, offsetY };
};

/**
 * Get default initial transform for a viewport
 */
export const getInitialTransform = (
  viewportWidth: number,
  viewportHeight: number,
  initialScale: number = 30
): ViewTransform => ({
  scale: initialScale,
  offsetX: 50,  // Small offset from left edge
  offsetY: viewportHeight - 100,  // Origin near bottom
});
