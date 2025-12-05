import { Point, TriangleDef, RenderedTriangle } from '../types';

export const generateId = (): string => Math.random().toString(36).substring(2, 9);

export const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

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

  if (d > L13 + L23 || d < Math.abs(L13 - L23) || d === 0) {
    return null;
  }

  const a = (L13 * L13 - L23 * L23 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L13 * L13 - a * a));

  const x2 = p1.x + (dx * a) / d;
  const y2 = p1.y + (dy * a) / d;

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

export const calculateAttachedTriangle = (
  parent: RenderedTriangle,
  def: Partial<TriangleDef> & { sideLeft: number; sideRight: number; attachedEdgeIndex: 0 | 1 | 2 }
): RenderedTriangle | null => {
  let baseP1: Point, baseP2: Point;

  if (def.attachedEdgeIndex === 0) { baseP1 = parent.p1; baseP2 = parent.p2; }
  else if (def.attachedEdgeIndex === 1) { baseP1 = parent.p2; baseP2 = parent.p3; }
  else { baseP1 = parent.p3; baseP2 = parent.p1; }

  const pNew = calculateThirdPoint(baseP1, baseP2, def.sideLeft, def.sideRight, !!def.flip);

  if (pNew) {
    pNew.id = `p_${def.id || 'phantom'}_3`;
    const baseLen = distance(baseP1, baseP2);
    const area = calculateHeronArea(baseLen, def.sideLeft, def.sideRight);
    const edgeLabels: [string, string, string] = ['Ref', 'R', 'L'];

    return {
      id: def.id || 'phantom',
      name: def.name || 'Phantom',
      p1: baseP1,
      p2: baseP2,
      p3: pNew,
      color: def.color || '#e2e8f0',
      area,
      paramId: def.id || 'phantom',
      edgeLabels
    };
  }
  return null;
};

export const recalculateGeometry = (defs: TriangleDef[]): { points: Point[]; triangles: RenderedTriangle[] } => {
  const points: Point[] = [];
  const triangles: RenderedTriangle[] = [];
  const triangleMap = new Map<string, RenderedTriangle>();

  for (const def of defs) {
    if (def.isRoot) {
      const sa = def.sideA || 10;
      const sb = def.sideB || 10;
      const sc = def.sideC || 10;

      let p1: Point, p2: Point;

      if (def.originP1 && def.originP2) {
        p1 = { id: `p_${def.id}_1`, x: def.originP1.x, y: def.originP1.y, label: 'Start' };
        p2 = { id: `p_${def.id}_2`, x: def.originP2.x, y: def.originP2.y, label: '' };
      } else {
        p1 = { id: `p_${def.id}_1`, x: 0, y: 0, label: 'Start' };
        p2 = { id: `p_${def.id}_2`, x: sa, y: 0, label: '' };
      }

      const p3 = calculateThirdPoint(p1, p2, sb, sc, !def.flip);

      if (p3) {
        p3.id = `p_${def.id}_3`;
        const area = calculateHeronArea(sa, sb, sc);
        const edgeLabels: [string, string, string] = ['A', 'C', 'B'];

        const t: RenderedTriangle = {
          id: def.id,
          name: def.name,
          p1, p2, p3,
          color: def.color,
          area,
          paramId: def.id,
          edgeLabels
        };
        triangles.push(t);
        triangleMap.set(def.id, t);
        points.push(p1, p2, p3);
      }
    } else {
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

export const isValidRootTriangle = (sideA: number, sideB: number, sideC: number): boolean => {
  if (sideA <= 0 || sideB <= 0 || sideC <= 0) return false;
  return (sideA + sideB > sideC) && (sideB + sideC > sideA) && (sideC + sideA > sideB);
};

export const isValidAttachedTriangle = (refEdge: number, sideLeft: number, sideRight: number): boolean => {
  if (refEdge <= 0 || sideLeft <= 0 || sideRight <= 0) return false;
  return (refEdge < sideLeft + sideRight) && (sideLeft < refEdge + sideRight) && (sideRight < refEdge + sideLeft);
};
