import { describe, it, expect } from 'vitest';
import { recalculateGeometry, isValidRootTriangle, calculateThirdPoint, distance } from './geometryUtils';
import { TriangleDef } from '../types';

describe('recalculateGeometry', () => {
  it('should calculate a single root triangle', () => {
    const defs: TriangleDef[] = [{
      id: 'root-1',
      name: 'T1',
      color: '#ff0000',
      isRoot: true,
      sideA: 5,
      sideB: 5,
      sideC: 5,
    }];

    const result = recalculateGeometry(defs);

    expect(result.triangles).toHaveLength(1);
    expect(result.points).toHaveLength(3);

    const t = result.triangles[0];
    expect(t.id).toBe('root-1');
    expect(t.name).toBe('T1');
    expect(t.edgeLabels).toEqual(['A', 'C', 'B']);

    // Check that vertices exist
    expect(t.p1).toBeDefined();
    expect(t.p2).toBeDefined();
    expect(t.p3).toBeDefined();

    // Check approximate area (equilateral triangle with side 5)
    // Area = (sqrt(3)/4) * 5^2 ≈ 10.83
    expect(t.area).toBeCloseTo(10.83, 1);
  });

  it('should return empty arrays for empty defs', () => {
    const result = recalculateGeometry([]);

    expect(result.triangles).toHaveLength(0);
    expect(result.points).toHaveLength(0);
  });

  it('should calculate attached triangle correctly', () => {
    const defs: TriangleDef[] = [
      {
        id: 'root-1',
        name: 'T1',
        color: '#ff0000',
        isRoot: true,
        sideA: 5,
        sideB: 5,
        sideC: 5,
      },
      {
        id: 'child-1',
        name: 'T2',
        color: '#00ff00',
        isRoot: false,
        attachedToTriangleId: 'root-1',
        attachedEdgeIndex: 1, // Edge p2-p3
        sideLeft: 4,
        sideRight: 4,
        flip: false,
      },
    ];

    const result = recalculateGeometry(defs);

    expect(result.triangles).toHaveLength(2);

    const t2 = result.triangles[1];
    expect(t2.id).toBe('child-1');
    expect(t2.name).toBe('T2');
    expect(t2.edgeLabels[0]).toBe('Ref'); // Shared edge
  });

  it('should handle missing parent gracefully', () => {
    const defs: TriangleDef[] = [
      {
        id: 'orphan-1',
        name: 'T1',
        color: '#ff0000',
        isRoot: false,
        attachedToTriangleId: 'nonexistent',
        attachedEdgeIndex: 0,
        sideLeft: 5,
        sideRight: 5,
      },
    ];

    const result = recalculateGeometry(defs);

    // Orphan should not be rendered
    expect(result.triangles).toHaveLength(0);
  });

  it('should use originP1 and originP2 if provided', () => {
    const defs: TriangleDef[] = [{
      id: 'positioned-1',
      name: 'T1',
      color: '#ff0000',
      isRoot: true,
      sideA: 5,
      sideB: 5,
      sideC: 5,
      originP1: { id: 'o1', x: 10, y: 20 },
      originP2: { id: 'o2', x: 15, y: 20 },
    }];

    const result = recalculateGeometry(defs);

    expect(result.triangles).toHaveLength(1);
    const t = result.triangles[0];
    expect(t.p1.x).toBe(10);
    expect(t.p1.y).toBe(20);
    expect(t.p2.x).toBe(15);
    expect(t.p2.y).toBe(20);
  });
});

describe('isValidRootTriangle', () => {
  it('should return true for valid triangles', () => {
    expect(isValidRootTriangle(3, 4, 5)).toBe(true);
    expect(isValidRootTriangle(5, 5, 5)).toBe(true);
    expect(isValidRootTriangle(10, 10, 10)).toBe(true);
  });

  it('should return false for invalid triangles', () => {
    expect(isValidRootTriangle(1, 2, 10)).toBe(false); // Sum of two sides < third
    expect(isValidRootTriangle(0, 5, 5)).toBe(false);   // Zero side
    expect(isValidRootTriangle(-1, 5, 5)).toBe(false);  // Negative side
  });
});

describe('calculateThirdPoint', () => {
  it('should calculate third point for valid triangle', () => {
    const p1 = { id: 'p1', x: 0, y: 0 };
    const p2 = { id: 'p2', x: 5, y: 0 };

    const p3 = calculateThirdPoint(p1, p2, 5, 5, false);

    expect(p3).not.toBeNull();
    expect(p3!.x).toBeCloseTo(2.5, 1);
    // For equilateral, height = 5 * sqrt(3)/2 ≈ 4.33
    expect(Math.abs(p3!.y)).toBeCloseTo(4.33, 1);
  });

  it('should return null for impossible triangle', () => {
    const p1 = { id: 'p1', x: 0, y: 0 };
    const p2 = { id: 'p2', x: 10, y: 0 };

    // L13=1, L23=1, but d=10, so 1+1 < 10 (impossible)
    const p3 = calculateThirdPoint(p1, p2, 1, 1, false);

    expect(p3).toBeNull();
  });

  it('should flip point to opposite side', () => {
    const p1 = { id: 'p1', x: 0, y: 0 };
    const p2 = { id: 'p2', x: 5, y: 0 };

    const p3NoFlip = calculateThirdPoint(p1, p2, 5, 5, false);
    const p3Flip = calculateThirdPoint(p1, p2, 5, 5, true);

    expect(p3NoFlip).not.toBeNull();
    expect(p3Flip).not.toBeNull();

    // Y coordinates should have opposite signs
    expect(p3NoFlip!.y * p3Flip!.y).toBeLessThan(0);
  });
});

describe('distance', () => {
  it('should calculate correct distance', () => {
    const p1 = { id: 'p1', x: 0, y: 0 };
    const p2 = { id: 'p2', x: 3, y: 4 };

    expect(distance(p1, p2)).toBe(5); // 3-4-5 triangle
  });

  it('should return 0 for same point', () => {
    const p = { id: 'p', x: 5, y: 5 };
    expect(distance(p, p)).toBe(0);
  });
});
