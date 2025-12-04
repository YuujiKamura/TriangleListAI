/**
 * Geometry Utilities
 *
 * All calculations are performed in MODEL SPACE (Y-up convention).
 * See coordinateSystem.ts for coordinate space definitions.
 *
 * Key conventions:
 * - "Left side" of edge (p1 -> p2) means counterclockwise / positive cross product
 * - For a horizontal edge going left-to-right, "left side" is ABOVE
 * - The `placeOnLeft` parameter consistently means "place vertex on left side of directed edge"
 */

import { Point, TriangleDef, RenderedTriangle, isAttachedTriangle } from '../types';
import { PALETTE } from '../constants';
import { calculateThirdVertex, modelDistance, isLeftSide, ModelPoint } from './coordinateSystem';

// ============================================================================
// ID Generation
// ============================================================================

export const generateId = (): string => Math.random().toString(36).substring(2, 9);

// ============================================================================
// Distance (Legacy wrapper)
// ============================================================================

export const distance = (p1: Point, p2: Point): number => {
  return modelDistance(p1, p2);
};

// ============================================================================
// Angle Calculation for Text Display
// ============================================================================

/**
 * Calculate angle for text display along an edge.
 * The angle is normalized so text is always readable (not upside-down).
 *
 * Note: This returns the angle for SCREEN SPACE rendering,
 * so it accounts for the Y-flip in the transformation.
 */
export const calculateNormalizedAngle = (dx: number, dy: number): number => {
  // In screen space, Y is flipped, so we negate dy
  let angle = Math.atan2(-dy, dx) * 180 / Math.PI;
  // Keep text readable (within -90 to 90 degrees)
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return angle;
};

// ============================================================================
// Validation
// ============================================================================

export const isValidLength = (value: number): boolean => !isNaN(value) && value > 0;

export const isValidTriangleSides = (a: number, b: number, c: number): boolean => {
  return isValidLength(a) && isValidLength(b) && isValidLength(c)
    && a + b > c && a + c > b && b + c > a;
};

// ============================================================================
// Triangle Definition Factories
// ============================================================================

export const createRootTriangleDef = (
  defs: TriangleDef[],
  sideA: number,
  sideB: number,
  sideC: number,
  options?: { originP1?: Point; originP2?: Point }
): TriangleDef => ({
  id: generateId(),
  name: `T${defs.length + 1}`,
  color: PALETTE[defs.length % PALETTE.length],
  isRoot: true,
  sideA,
  sideB,
  sideC,
  ...(options?.originP1 && { originP1: options.originP1 }),
  ...(options?.originP2 && { originP2: options.originP2 }),
});

/**
 * Create an attached triangle definition.
 *
 * @param placeOnLeft - If true, place the new vertex on the LEFT side of the parent edge
 *                      (counterclockwise from the edge direction).
 *                      This replaces the confusing "flip" parameter.
 */
export const createAttachedTriangleDef = (
  defs: TriangleDef[],
  attachedToTriangleId: string,
  attachedEdgeIndex: 0 | 1 | 2,
  sideLeft: number,
  sideRight: number,
  placeOnLeft: boolean = true
): TriangleDef => ({
  id: generateId(),
  name: `T${defs.length + 1}`,
  color: PALETTE[defs.length % PALETTE.length],
  isRoot: false,
  attachedToTriangleId,
  attachedEdgeIndex,
  sideLeft,
  sideRight,
  flip: !placeOnLeft, // Internal storage: flip=true means place on RIGHT side
});

// ============================================================================
// Third Point Calculation (Legacy wrapper)
// ============================================================================

/**
 * Calculate the third point of a triangle.
 *
 * @deprecated Use calculateThirdVertex from coordinateSystem.ts directly
 *
 * @param p1 - First point of base edge
 * @param p2 - Second point of base edge
 * @param L13 - Distance from p1 to new point
 * @param L23 - Distance from p2 to new point
 * @param flip - If true, place on RIGHT side of edge; if false, place on LEFT side
 *               (This is the OPPOSITE of placeOnLeft for backwards compatibility)
 */
export const calculateThirdPoint = (
  p1: Point,
  p2: Point,
  L13: number,
  L23: number,
  flip: boolean
): Point | null => {
  // flip=false means place on LEFT side (placeOnLeft=true)
  // flip=true means place on RIGHT side (placeOnLeft=false)
  const result = calculateThirdVertex(p1, p2, L13, L23, !flip);

  if (!result) return null;

  return {
    id: generateId(),
    x: result.x,
    y: result.y,
    label: ''
  };
};

// ============================================================================
// Area Calculation
// ============================================================================

export const calculateHeronArea = (a: number, b: number, c: number): number => {
  const s = (a + b + c) / 2;
  return Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
};

// ============================================================================
// Edge Utilities
// ============================================================================

/**
 * Get the two points defining an edge of a triangle.
 * Edge indices: 0 = p1->p2, 1 = p2->p3, 2 = p3->p1
 */
export const getEdgePoints = (
  triangle: RenderedTriangle,
  edgeIndex: 0 | 1 | 2
): { p1: Point; p2: Point } => {
  switch (edgeIndex) {
    case 0: return { p1: triangle.p1, p2: triangle.p2 };
    case 1: return { p1: triangle.p2, p2: triangle.p3 };
    case 2: return { p1: triangle.p3, p2: triangle.p1 };
  }
};

/**
 * Determine if a point should be placed on the left side of an edge.
 * Used when the user drags/clicks to create a new triangle vertex.
 *
 * @returns true if the point is on the LEFT (counterclockwise) side of the edge
 */
export const shouldPlaceOnLeft = (edgeP1: Point, edgeP2: Point, targetPoint: Point): boolean => {
  return isLeftSide(edgeP1, edgeP2, targetPoint);
};

// ============================================================================
// Attached Triangle Calculation
// ============================================================================

/** Input type for calculateAttachedTriangle */
type AttachedTriangleInput = {
  id?: string;
  name?: string;
  color?: string;
  sideLeft: number;
  sideRight: number;
  attachedEdgeIndex: 0 | 1 | 2;
  flip?: boolean;
};

/**
 * Calculate geometry for an attached triangle.
 */
export const calculateAttachedTriangle = (
  parent: RenderedTriangle,
  def: AttachedTriangleInput
): RenderedTriangle | null => {
  const { p1: baseP1, p2: baseP2 } = getEdgePoints(parent, def.attachedEdgeIndex);

  // def.flip=false means place on LEFT, def.flip=true means place on RIGHT
  const placeOnLeft = !def.flip;
  const pNew = calculateThirdVertex(baseP1, baseP2, def.sideLeft, def.sideRight, placeOnLeft);

  if (!pNew) return null;

  const newPoint: Point = {
    id: `p_${def.id || 'phantom'}_3`,
    x: pNew.x,
    y: pNew.y,
    label: ''
  };

  const baseLen = distance(baseP1, baseP2);
  const area = calculateHeronArea(baseLen, def.sideLeft, def.sideRight);

  return {
    id: def.id || 'phantom',
    name: def.name || 'Phantom',
    p1: baseP1,
    p2: baseP2,
    p3: newPoint,
    color: def.color || '#e2e8f0',
    area,
    paramId: def.id || 'phantom',
    edgeLabels: ['Ref', 'R', 'L']
  };
};

// ============================================================================
// Full Geometry Recalculation
// ============================================================================

/**
 * Recompute all triangle geometry from definitions.
 *
 * Root triangles are placed with:
 * - p1 at origin (0, 0)
 * - p2 along positive X axis at (sideA, 0)
 * - p3 on the LEFT side of the p1->p2 edge (positive Y in model space)
 *
 * This means root triangles have their apex pointing "up" in model space,
 * which renders as "up" on screen after the Y-flip transformation.
 */
export const recalculateGeometry = (
  defs: TriangleDef[]
): { points: Point[]; triangles: RenderedTriangle[] } => {
  const points: Point[] = [];
  const triangles: RenderedTriangle[] = [];
  const triangleMap = new Map<string, RenderedTriangle>();

  for (const def of defs) {
    if (def.isRoot) {
      const sa = def.sideA!;
      const sb = def.sideB!;
      const sc = def.sideC!;

      // Use originP1/originP2 if provided, otherwise default to origin
      const p1: Point = def.originP1
        ? { id: `p_${def.id}_1`, x: def.originP1.x, y: def.originP1.y, label: 'Start' }
        : { id: `p_${def.id}_1`, x: 0, y: 0, label: 'Start' };
      const p2: Point = def.originP2
        ? { id: `p_${def.id}_2`, x: def.originP2.x, y: def.originP2.y, label: '' }
        : { id: `p_${def.id}_2`, x: sa, y: 0, label: '' };

      // Place p3 on the LEFT side of edge p1->p2 (which is "up" in model space)
      // For root triangles, we always place on left unless explicitly flipped
      const placeOnLeft = true; // Root triangles always point "up"
      const p3Result = calculateThirdVertex(p1, p2, sb, sc, placeOnLeft);

      if (p3Result) {
        const p3: Point = {
          id: `p_${def.id}_3`,
          x: p3Result.x,
          y: p3Result.y,
          label: ''
        };

        const area = calculateHeronArea(sa, sb, sc);
        const t: RenderedTriangle = {
          id: def.id,
          name: def.name,
          p1,
          p2,
          p3,
          color: def.color,
          area,
          paramId: def.id,
          edgeLabels: ['A', 'C', 'B']
        };

        triangles.push(t);
        triangleMap.set(def.id, t);
        points.push(p1, p2, p3);
      }
    } else if (isAttachedTriangle(def)) {
      // Attached triangle - type guard ensures all required fields exist
      const parent = triangleMap.get(def.attachedToTriangleId);
      if (parent) {
        const t = calculateAttachedTriangle(parent, {
          id: def.id,
          name: def.name,
          color: def.color,
          sideLeft: def.sideLeft,
          sideRight: def.sideRight,
          attachedEdgeIndex: def.attachedEdgeIndex,
          flip: def.flip
        });
        if (t) {
          triangles.push(t);
          triangleMap.set(def.id, t);
          points.push(t.p3);
        }
      }
    }
  }

  return { points, triangles };
};

// ============================================================================
// Centroid
// ============================================================================

export const getCentroid = (t: RenderedTriangle): Point => ({
  id: 'centroid',
  x: (t.p1.x + t.p2.x + t.p3.x) / 3,
  y: (t.p1.y + t.p2.y + t.p3.y) / 3
});
