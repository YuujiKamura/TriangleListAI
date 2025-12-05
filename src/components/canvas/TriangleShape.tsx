import React from 'react';
import { G, Polygon, Line, Text as SvgText, Circle } from 'react-native-svg';
import { RenderedTriangle, Point } from '../../types';
import { distance } from '../../utils/geometryUtils';

interface TriangleShapeProps {
  triangle: RenderedTriangle;
  isSelected: boolean;
  selectedEdgeIndex: number | null;
  scale: number;
  onTrianglePress?: (id: string) => void;
  onEdgePress?: (triangleId: string, edgeIndex: 0 | 1 | 2) => void;
}

export const TriangleShape: React.FC<TriangleShapeProps> = ({
  triangle,
  isSelected,
  selectedEdgeIndex,
  scale,
  onTrianglePress,
  onEdgePress,
}) => {
  const { p1, p2, p3, color, edgeLabels } = triangle;

  const edges: Array<{ p1: Point; p2: Point; index: 0 | 1 | 2; label: string }> = [
    { p1, p2, index: 0, label: edgeLabels[0] },
    { p1: p2, p2: p3, index: 1, label: edgeLabels[1] },
    { p1: p3, p2: p1, index: 2, label: edgeLabels[2] },
  ];

  // Scale-independent sizes
  const strokeWidth = 2 / scale;
  const hitStrokeWidth = 20 / scale;
  const fontSize = 11 / scale;
  const vertexRadius = 3 / scale;

  return (
    <G>
      {/* Fill */}
      <Polygon
        points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`}
        fill={color}
        fillOpacity={isSelected ? 0.5 : 0.3}
        onPress={() => onTrianglePress?.(triangle.id)}
      />

      {/* Edges */}
      {edges.map((edge) => {
        const isEdgeSelected = selectedEdgeIndex === edge.index;
        const midX = (edge.p1.x + edge.p2.x) / 2;
        const midY = (edge.p1.y + edge.p2.y) / 2;
        const length = distance(edge.p1, edge.p2);

        // Calculate label position (offset perpendicular to edge)
        const dx = edge.p2.x - edge.p1.x;
        const dy = edge.p2.y - edge.p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len;
        const ny = dx / len;
        const labelOffset = 12 / scale;
        const labelX = midX + nx * labelOffset;
        const labelY = midY + ny * labelOffset;

        return (
          <G key={`edge-${edge.index}`}>
            {/* Hit area (invisible, wider line for touch) */}
            <Line
              x1={edge.p1.x}
              y1={edge.p1.y}
              x2={edge.p2.x}
              y2={edge.p2.y}
              stroke="transparent"
              strokeWidth={hitStrokeWidth}
              onPress={() => onEdgePress?.(triangle.id, edge.index)}
            />
            {/* Visible line */}
            <Line
              x1={edge.p1.x}
              y1={edge.p1.y}
              x2={edge.p2.x}
              y2={edge.p2.y}
              stroke={isEdgeSelected ? '#3b82f6' : '#374151'}
              strokeWidth={isEdgeSelected ? strokeWidth * 2 : strokeWidth}
            />
            {/* Length label - flip Y back for readable text */}
            <SvgText
              x={labelX}
              y={labelY}
              fontSize={fontSize}
              fill="#1f2937"
              textAnchor="middle"
              transform={`translate(${labelX}, ${labelY}) scale(1, -1) translate(${-labelX}, ${-labelY})`}
            >
              {length.toFixed(1)}
            </SvgText>
          </G>
        );
      })}

      {/* Vertices */}
      {[p1, p2, p3].map((p, idx) => (
        <Circle
          key={`vertex-${idx}`}
          cx={p.x}
          cy={p.y}
          r={vertexRadius}
          fill="#1f2937"
        />
      ))}
    </G>
  );
};
