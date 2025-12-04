
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const GRID_SIZE = 5; // Default grid size in meters

export const PALETTE = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
];

export const INITIAL_INSTRUCTION = `
1. Create a Base Triangle by specifying 3 side lengths (meters).
2. Click any edge on the canvas to attach a new triangle.
3. Use the list to manage your shapes.
`;

// Canvas interaction settings
export const CANVAS_CONFIG = {
  // Long press duration in milliseconds for delete action
  LONG_PRESS_DURATION: 600,
  // Snap threshold in world units
  SNAP_THRESHOLD: 0.5,
  // Zoom sensitivity for mouse wheel
  ZOOM_SENSITIVITY: 0.002,
  // Min and max zoom scale
  ZOOM_MIN: 0.1,
  ZOOM_MAX: 5,
  // Virtual canvas size (internal coordinate system)
  VIRTUAL_WIDTH: 1000,
  VIRTUAL_HEIGHT: 800,
  // World bounds (coordinate space for geometry)
  // Model space: Y increases upward. minY=0, height=40 means Y ranges from 0 to 40.
  // This places the origin at bottom-left and extends to top-right.
  WORLD_BOUNDS: { x: 0, y: 0, w: 50, h: 40 },
} as const;

// Default triangle values
export const DEFAULT_TRIANGLE = {
  SIDE_LENGTH: 5,
} as const;

// LocalStorage keys
export const STORAGE_KEYS = {
  TRIANGLE_DEFS: 'geosolver_triangle_defs',
} as const;
