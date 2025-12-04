import { describe, it, expect } from 'vitest';
import { generateDXF } from './dxfExport';
import { RenderedTriangle } from '../types';

describe('generateDXF', () => {
  it('should generate valid DXF content for a single triangle', () => {
    const triangle: RenderedTriangle = {
      id: 'test-1',
      name: 'T1',
      color: '#ff0000',
      p1: { id: 'p1', x: 0, y: 0 },
      p2: { id: 'p2', x: 5, y: 0 },
      p3: { id: 'p3', x: 2.5, y: 4.33 },
      sides: [5, 5, 5],
      area: 10.83,
      edgeLabels: ['A', 'B', 'C'],
    };

    const dxf = generateDXF([triangle]);

    // Check basic DXF structure
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('EOF');

    // Check that LINE entities exist (3 edges)
    const lineCount = (dxf.match(/^LINE$/gm) || []).length;
    expect(lineCount).toBe(3);

    // Check that TEXT entities exist (edge labels + triangle number)
    const textCount = (dxf.match(/^TEXT$/gm) || []).length;
    expect(textCount).toBeGreaterThanOrEqual(1);

    // Check that CIRCLE entity exists (for triangle number)
    expect(dxf).toContain('CIRCLE');
  });

  it('should return empty entities section for empty triangle array', () => {
    const dxf = generateDXF([]);

    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('EOF');

    // No LINE entities
    const lineCount = (dxf.match(/^LINE$/gm) || []).length;
    expect(lineCount).toBe(0);
  });

  it('should skip Ref edges in labels', () => {
    const triangle: RenderedTriangle = {
      id: 'test-2',
      name: 'T2',
      color: '#00ff00',
      p1: { id: 'p1', x: 0, y: 0 },
      p2: { id: 'p2', x: 3, y: 0 },
      p3: { id: 'p3', x: 1.5, y: 2.6 },
      sides: [3, 3, 3],
      area: 3.9,
      edgeLabels: ['Ref', 'B', 'C'], // First edge is Ref (shared with parent)
    };

    const dxf = generateDXF([triangle]);

    // Should have 3 LINE entities (all edges drawn)
    const lineCount = (dxf.match(/^LINE$/gm) || []).length;
    expect(lineCount).toBe(3);

    // Should have 2 dimension labels + 1 triangle number = 3 TEXT entities
    // (Ref edge label is skipped)
    const textCount = (dxf.match(/^TEXT$/gm) || []).length;
    expect(textCount).toBe(3); // 2 edge labels + 1 number
  });

  it('should flip Y coordinates for CAD compatibility', () => {
    const triangle: RenderedTriangle = {
      id: 'test-3',
      name: 'T1',
      color: '#0000ff',
      p1: { id: 'p1', x: 0, y: 10 },  // y = 10 should become y = -10
      p2: { id: 'p2', x: 5, y: 10 },
      p3: { id: 'p3', x: 2.5, y: 5 }, // y = 5 should become y = -5
      sides: [5, 5.59, 5.59],
      area: 12.5,
      edgeLabels: ['A', 'B', 'C'],
    };

    const dxf = generateDXF([triangle]);

    // Check that flipped Y values appear in the output
    // LINE entity format has Y after X (group code 20)
    expect(dxf).toContain('-10.0000'); // flipped y = 10
    expect(dxf).toContain('-5.0000');  // flipped y = 5
  });

  it('should handle multiple triangles', () => {
    const triangles: RenderedTriangle[] = [
      {
        id: 'test-1',
        name: 'T1',
        color: '#ff0000',
        p1: { id: 'p1', x: 0, y: 0 },
        p2: { id: 'p2', x: 5, y: 0 },
        p3: { id: 'p3', x: 2.5, y: 4.33 },
        sides: [5, 5, 5],
        area: 10.83,
        edgeLabels: ['A', 'B', 'C'],
      },
      {
        id: 'test-2',
        name: 'T2',
        color: '#00ff00',
        p1: { id: 'p4', x: 5, y: 0 },
        p2: { id: 'p5', x: 2.5, y: 4.33 },
        p3: { id: 'p6', x: 7.5, y: 4.33 },
        sides: [5, 5, 5],
        area: 10.83,
        edgeLabels: ['Ref', 'D', 'E'],
      },
    ];

    const dxf = generateDXF(triangles);

    // Should have 6 LINE entities (3 per triangle)
    const lineCount = (dxf.match(/^LINE$/gm) || []).length;
    expect(lineCount).toBe(6);

    // Should have 2 CIRCLE entities (1 per triangle)
    const circleCount = (dxf.match(/^CIRCLE$/gm) || []).length;
    expect(circleCount).toBe(2);
  });
});
