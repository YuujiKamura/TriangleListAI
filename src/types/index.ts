export interface Point {
  id: string;
  x: number;
  y: number;
  label?: string;
}

export interface RenderedTriangle {
  id: string;
  name: string;
  p1: Point;
  p2: Point;
  p3: Point;
  color: string;
  area: number;
  paramId: string;
  edgeLabels: [string, string, string];
}

export interface TriangleDef {
  id: string;
  name: string;
  color: string;
  isRoot: boolean;
  sideA?: number;
  sideB?: number;
  sideC?: number;
  originP1?: Point;
  originP2?: Point;
  attachedToTriangleId?: string;
  attachedEdgeIndex?: 0 | 1 | 2;
  sideLeft?: number;
  sideRight?: number;
  flip?: boolean;
}

export interface GeometryData {
  points: Point[];
  triangles: RenderedTriangle[];
}

export enum ToolMode {
  VIEW = 'VIEW',
  ADD_TRIANGLE = 'ADD_TRIANGLE',
  DELETE = 'DELETE'
}

export interface StandaloneEdge {
  id: string;
  p1: Point;
  p2: Point;
  length: number;
}

export type EdgeSelection =
  | { type: 'triangleEdge'; triangleId: string; edgeIndex: 0 | 1 | 2 }
  | { type: 'standaloneEdge'; edgeId: string };

export function getEdgePoints(
  selection: EdgeSelection,
  triangles: RenderedTriangle[],
  standaloneEdges: StandaloneEdge[]
): { p1: Point; p2: Point } | null {
  if (selection.type === 'triangleEdge') {
    const triangle = triangles.find(t => t.id === selection.triangleId);
    if (!triangle) return null;
    switch (selection.edgeIndex) {
      case 0: return { p1: triangle.p1, p2: triangle.p2 };
      case 1: return { p1: triangle.p2, p2: triangle.p3 };
      case 2: return { p1: triangle.p3, p2: triangle.p1 };
    }
  } else {
    const edge = standaloneEdges.find(e => e.id === selection.edgeId);
    if (!edge) return null;
    return { p1: edge.p1, p2: edge.p2 };
  }
}

// Interaction states for gesture handling
export type InteractionState =
  | { type: 'IDLE' }
  | { type: 'PAN_READY'; startX: number; startY: number }
  | { type: 'PANNING'; lastX: number; lastY: number }
  | { type: 'SELECT_RECT'; startWorld: Point; currentWorld: Point }
  | { type: 'EDGE_READY'; tId: string; index: 0 | 1 | 2; p1: Point; p2: Point; startX: number; startY: number }
  | { type: 'PHANTOM_PLACING'; tId: string; index: 0 | 1 | 2; p1: Point; p2: Point; currentMouse: Point }
  | { type: 'VERTEX_RESHAPING'; tId: string; p1: Point; p2: Point; currentMouse: Point }
  | { type: 'DRAWING_EDGE'; startPoint: Point; currentMouse: Point }
  | { type: 'STANDALONE_EDGE_PLACING'; edgeId: string; p1: Point; p2: Point; currentMouse: Point }
  | { type: 'EXTENDING_EDGE'; fromEdgeId: string; fromPoint: Point; currentMouse: Point }
  | { type: 'ROOT_PLACING_ORIGIN'; sideA: number; sideB: number; sideC: number; currentMouse: Point }
  | { type: 'ROOT_PLACING_ANGLE'; sideA: number; sideB: number; sideC: number; origin: Point; currentMouse: Point }
  | { type: 'MOVING_SELECTION'; startWorld: Point; currentWorld: Point; targetIds: Set<string> };
