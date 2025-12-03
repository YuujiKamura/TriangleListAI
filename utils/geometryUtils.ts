
import { Point, TriangleDef, RenderedTriangle } from '../types';

export const generateId = (): string => Math.random().toString(36).substring(2, 9);

export const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

// Calculate coordinates of P3 given P1, P2 and lengths L13 (p1-p3), L23 (p2-p3)
// This uses circle intersection logic
export const calculateThirdPoint = (
  p1: Point,
  p2: Point,
  L13: number,
  L23: number,
  flip: boolean
): Point | null => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const d = Math.sqrt(dx * dx + dy * dy);

  // Triangle inequality check
  if (d > L13 + L23 || d < Math.abs(L13 - L23) || d === 0) {
    return null; // Impossible to form a triangle
  }

  // Calculate the point along the line P1-P2 where the altitude hits
  const a = (L13 * L13 - L23 * L23 + d * d) / (2 * d);
  
  // Calculate the height of the triangle
  const h = Math.sqrt(Math.max(0, L13 * L13 - a * a));

  // Calculate coordinates
  // (x2, y2) is the base point on the line
  const x2 = p1.x + (dx * a) / d;
  const y2 = p1.y + (dy * a) / d;

  // Offset by height in the perpendicular direction
  // If flip is true, we subtract, otherwise add (or vice versa depending on system)
  // SVG coordinates: y increases downwards. 
  // Perpendicular vector to (dx, dy) is (-dy, dx) or (dy, -dx)
  
  const sign = flip ? -1 : 1;
  const rx = x2 + sign * (h * -dy) / d;
  const ry = y2 + sign * (h * dx) / d;

  return {
    id: generateId(),
    x: rx,
    y: ry,
    label: ''
  };
};

export const calculateHeronArea = (a: number, b: number, c: number): number => {
    const s = (a + b + c) / 2;
    return Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
};

// Helper to calculate a single attached triangle
export const calculateAttachedTriangle = (
    parent: RenderedTriangle,
    def: Partial<TriangleDef> & { sideLeft: number, sideRight: number, attachedEdgeIndex: 0 | 1 | 2 }
): RenderedTriangle | null => {
    let baseP1: Point, baseP2: Point;
    
    // Determine base edge
    if (def.attachedEdgeIndex === 0) { baseP1 = parent.p1; baseP2 = parent.p2; }
    else if (def.attachedEdgeIndex === 1) { baseP1 = parent.p2; baseP2 = parent.p3; }
    else { baseP1 = parent.p3; baseP2 = parent.p1; }

    const pNew = calculateThirdPoint(baseP1, baseP2, def.sideLeft, def.sideRight, !!def.flip);
    
    if (pNew) {
        pNew.id = `p_${def.id || 'phantom'}_3`;
        const baseLen = distance(baseP1, baseP2);
        const area = calculateHeronArea(baseLen, def.sideLeft, def.sideRight);
        
        return {
            id: def.id || 'phantom',
            name: def.name || 'Phantom',
            p1: baseP1,
            p2: baseP2,
            p3: pNew,
            color: def.color || '#e2e8f0',
            area,
            paramId: def.id || 'phantom',
            edgeLabels: ['Ref', 'C', 'B']
        };
    }
    return null;
};

// Re-computes the entire geometry based on the definitions
export const recalculateGeometry = (defs: TriangleDef[]): { points: Point[], triangles: RenderedTriangle[] } => {
    let points: Point[] = [];
    let triangles: RenderedTriangle[] = [];

    // Map to quickly find triangle coordinates by ID
    const triangleMap = new Map<string, RenderedTriangle>();

    // Sort defs to ensure parents are processed before children
    for (const def of defs) {
        if (def.isRoot) {
            // Place first triangle at origin (0, 0)
            const sa = def.sideA || 10;
            const sb = def.sideB || 10;
            const sc = def.sideC || 10;

            const p1: Point = { id: `p_${def.id}_1`, x: 0, y: 0, label: 'Start' };
            // Place p2 along the X axis
            const p2: Point = { id: `p_${def.id}_2`, x: sa, y: 0, label: '' };
            
            // CONFIGURATION: A=Bottom, B=Left, C=Right
            // Note: In SVG, Y increases downwards. Default calculateThirdPoint (flip=false) results in Positive Y (Down).
            // User requests "Upward Convex" (vertex at top), which requires Negative Y.
            // We pass !def.flip so that default (false) becomes true -> sign -1 -> Negative Y (Up).
            const p3 = calculateThirdPoint(p1, p2, sb, sc, !def.flip);

            if (p3) {
                p3.id = `p_${def.id}_3`;
                const area = calculateHeronArea(sa, sb, sc);
                const t: RenderedTriangle = {
                    id: def.id,
                    name: def.name,
                    p1, p2, p3,
                    color: def.color,
                    area,
                    paramId: def.id,
                    edgeLabels: ['A', 'C', 'B'] 
                };
                triangles.push(t);
                triangleMap.set(def.id, t);
                points.push(p1, p2, p3);
            }
        } else {
            // Attached triangle
            const parent = triangleMap.get(def.attachedToTriangleId || '');
            if (parent && def.sideLeft && def.sideRight && def.attachedEdgeIndex !== undefined) {
                const t = calculateAttachedTriangle(parent, def as any);
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

export const getCentroid = (t: RenderedTriangle): Point => {
    return {
        id: 'centroid',
        x: (t.p1.x + t.p2.x + t.p3.x) / 3,
        y: (t.p1.y + t.p2.y + t.p3.y) / 3
    };
};

// Validate triangle inequality for root triangle
export const isValidRootTriangle = (sideA: number, sideB: number, sideC: number): boolean => {
    if (sideA <= 0 || sideB <= 0 || sideC <= 0) return false;
    return (sideA + sideB > sideC) && (sideB + sideC > sideA) && (sideC + sideA > sideB);
};

// Validate triangle inequality for attached triangle
export const isValidAttachedTriangle = (refEdge: number, sideLeft: number, sideRight: number): boolean => {
    if (refEdge <= 0 || sideLeft <= 0 || sideRight <= 0) return false;
    return (refEdge < sideLeft + sideRight) && (sideLeft < refEdge + sideRight) && (sideRight < refEdge + sideLeft);
};
