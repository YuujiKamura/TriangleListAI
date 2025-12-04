
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