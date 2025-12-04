import { RenderedTriangle, Point } from '../types';
import { distance, calculateNormalizedAngle } from './geometryUtils';

// DXF color constants
const COLOR_BLUE = 5;      // Blue for triangle numbers
const COLOR_GRAY = 8;      // Gray for edges and dimensions

// Helper to flip Y coordinate (screen Y is inverted from CAD Y)
const flipY = (y: number): number => -y;

// Generate DXF file content from triangles
export const generateDXF = (triangles: RenderedTriangle[]): string => {
  const lines: string[] = [];

  // DXF Header
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('HEADER');
  lines.push('9');
  lines.push('$ACADVER');
  lines.push('1');
  lines.push('AC1009'); // AutoCAD R12 format for compatibility
  lines.push('0');
  lines.push('ENDSEC');

  // Tables section (minimal)
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('TABLES');
  lines.push('0');
  lines.push('ENDSEC');

  // Entities section
  lines.push('0');
  lines.push('SECTION');
  lines.push('2');
  lines.push('ENTITIES');

  // Add each triangle
  triangles.forEach((t) => {
    const p1 = { x: t.p1.x, y: flipY(t.p1.y) };
    const p2 = { x: t.p2.x, y: flipY(t.p2.y) };
    const p3 = { x: t.p3.x, y: flipY(t.p3.y) };

    // Triangle edges (gray)
    lines.push(...createLine(p1.x, p1.y, p2.x, p2.y, COLOR_GRAY));
    lines.push(...createLine(p2.x, p2.y, p3.x, p3.y, COLOR_GRAY));
    lines.push(...createLine(p3.x, p3.y, p1.x, p1.y, COLOR_GRAY));

    // Dimension labels at edge midpoints
    const edges = [
      { start: p1, end: p2, label: t.edgeLabels?.[0] },
      { start: p2, end: p3, label: t.edgeLabels?.[1] },
      { start: p3, end: p1, label: t.edgeLabels?.[2] },
    ];

    // Calculate centroid for determining "outside" direction
    const cx = (p1.x + p2.x + p3.x) / 3;
    const cy = (p1.y + p2.y + p3.y) / 3;
    const textHeight = 0.3;
    const offsetDist = textHeight * 0.5;

    edges.forEach((edge) => {
      // Skip Ref edges (shared with parent)
      if (edge.label === 'Ref') return;

      const midX = (edge.start.x + edge.end.x) / 2;
      const midY = (edge.start.y + edge.end.y) / 2;
      const len = distance(edge.start as Point, edge.end as Point);
      const dimText = len.toFixed(2);

      // Calculate edge direction and perpendicular
      const dx = edge.end.x - edge.start.x;
      const dy = edge.end.y - edge.start.y;
      const edgeLen = Math.sqrt(dx * dx + dy * dy);

      // Perpendicular vector (normalized)
      const perpX = -dy / edgeLen;
      const perpY = dx / edgeLen;

      // Determine which side is "outside" (away from centroid)
      const toMidX = midX - cx;
      const toMidY = midY - cy;
      const dot = toMidX * perpX + toMidY * perpY;
      const sign = dot >= 0 ? 1 : -1;

      // Offset position
      const labelX = midX + sign * perpX * offsetDist;
      const labelY = midY + sign * perpY * offsetDist;

      // Calculate angle for text rotation using utility function
      const angle = calculateNormalizedAngle(dx, dy);

      lines.push(...createText(labelX, labelY, dimText, textHeight, COLOR_GRAY, angle));
    });

    // Triangle number in circle at centroid (blue)
    const number = t.name.replace(/\D/g, '');

    // Circle around number
    lines.push(...createCircle(cx, cy, 0.5, COLOR_BLUE));
    // Number text
    lines.push(...createText(cx, cy, number, 0.4, COLOR_BLUE, 0));
  });

  lines.push('0');
  lines.push('ENDSEC');

  // EOF
  lines.push('0');
  lines.push('EOF');

  return lines.join('\n');
};

// Create a LINE entity
const createLine = (x1: number, y1: number, x2: number, y2: number, color: number): string[] => {
  return [
    '0',
    'LINE',
    '8',
    '0', // Layer
    '62',
    color.toString(), // Color
    '10',
    x1.toFixed(4),
    '20',
    y1.toFixed(4),
    '30',
    '0', // Z1
    '11',
    x2.toFixed(4),
    '21',
    y2.toFixed(4),
    '31',
    '0', // Z2
  ];
};

// Create a CIRCLE entity
const createCircle = (x: number, y: number, radius: number, color: number): string[] => {
  return [
    '0',
    'CIRCLE',
    '8',
    '0', // Layer
    '62',
    color.toString(), // Color
    '10',
    x.toFixed(4),
    '20',
    y.toFixed(4),
    '30',
    '0', // Z
    '40',
    radius.toFixed(4), // Radius
  ];
};

// Create a TEXT entity with rotation
const createText = (x: number, y: number, text: string, height: number, color: number, rotation: number = 0): string[] => {
  return [
    '0',
    'TEXT',
    '8',
    '0', // Layer
    '62',
    color.toString(), // Color
    '10',
    x.toFixed(4),
    '20',
    y.toFixed(4),
    '30',
    '0', // Z
    '40',
    height.toFixed(4), // Text height
    '1',
    text, // Text content
    '50',
    rotation.toFixed(2), // Rotation angle
    '72',
    '1', // Horizontal justification: center
    '73',
    '2', // Vertical justification: middle
    '11',
    x.toFixed(4), // Alignment point X
    '21',
    y.toFixed(4), // Alignment point Y
    '31',
    '0',
  ];
};

// Download DXF file
export const downloadDXF = (triangles: RenderedTriangle[], filename: string = 'triangles.dxf'): void => {
  const dxfContent = generateDXF(triangles);
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
