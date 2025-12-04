
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

/**
 * Triangle Definition - The source of truth for triangle geometry.
 *
 * This uses a single interface with optional fields rather than a discriminated union
 * to avoid excessive type narrowing complexity throughout the codebase.
 *
 * Convention:
 * - If isRoot=true: sideA, sideB, sideC are required (defines a standalone triangle)
 * - If isRoot=false: attachedToTriangleId, attachedEdgeIndex, sideLeft, sideRight, flip are required
 */
export interface TriangleDef {
  id: string;
  name: string;
  color: string;
  isRoot: boolean;

  // Root triangle properties
  sideA?: number; // Base edge length
  sideB?: number; // Left edge length (p1 to p3)
  sideC?: number; // Right edge length (p2 to p3)
  originP1?: Point; // Optional origin for root triangle
  originP2?: Point;

  // Attached triangle properties
  attachedToTriangleId?: string;
  attachedEdgeIndex?: 0 | 1 | 2; // 0=p1-p2, 1=p2-p3, 2=p3-p1
  sideLeft?: number;  // Distance from edge start to new vertex
  sideRight?: number; // Distance from edge end to new vertex
  flip?: boolean;     // If true, place vertex on right side of edge; if false, left side
}

// Type guard for root triangle
export const isRootTriangle = (def: TriangleDef): def is TriangleDef & { isRoot: true; sideA: number; sideB: number; sideC: number } => {
  return def.isRoot === true && def.sideA !== undefined && def.sideB !== undefined && def.sideC !== undefined;
};

// Type guard for attached triangle
export const isAttachedTriangle = (def: TriangleDef): def is TriangleDef & {
  isRoot: false;
  attachedToTriangleId: string;
  attachedEdgeIndex: 0 | 1 | 2;
  sideLeft: number;
  sideRight: number;
  flip: boolean;
} => {
  return def.isRoot === false &&
    def.attachedToTriangleId !== undefined &&
    def.attachedEdgeIndex !== undefined &&
    def.sideLeft !== undefined &&
    def.sideRight !== undefined;
};

export interface GeometryData {
  points: Point[];
  triangles: RenderedTriangle[];
}

export enum ToolMode {
  VIEW = 'VIEW',
  ADD_TRIANGLE = 'ADD_TRIANGLE',
  DELETE = 'DELETE'
}

export interface AIAnalysisResult {
  text: string;
  loading: boolean;
  error?: string;
}

// Standalone edge (not part of a triangle yet)
export interface StandaloneEdge {
  id: string;
  p1: Point;
  p2: Point;
  length: number;
}