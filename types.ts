
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
  paramId: string; // Link back to the definition
  edgeLabels: [string, string, string]; // Labels for p1-p2, p2-p3, p3-p1
}

// The source of truth
export interface TriangleDef {
  id: string;
  name: string;
  color: string;

  // For the very first triangle (Root)
  isRoot: boolean;
  sideA?: number; // Base
  sideB?: number; // Left
  sideC?: number; // Right

  // Origin offset for root triangle (if created from standalone edge)
  originP1?: Point; // Start point of base edge
  originP2?: Point; // End point of base edge

  // For attached triangles
  attachedToTriangleId?: string;
  attachedEdgeIndex?: 0 | 1 | 2; // 0=p1-p2, 1=p2-p3, 2=p3-p1
  sideLeft?: number;  // Distance from edge start
  sideRight?: number; // Distance from edge end
  flip?: boolean;     // Flip across the base edge
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

// Standalone edge (not part of a triangle yet)
export interface StandaloneEdge {
  id: string;
  p1: Point;
  p2: Point;
  length: number;
}

// Unified edge selection - works for both triangle edges and standalone edges
export type EdgeSelection =
  | { type: 'triangleEdge'; triangleId: string; edgeIndex: 0 | 1 | 2 }
  | { type: 'standaloneEdge'; edgeId: string };

// Helper to get edge endpoints from selection
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