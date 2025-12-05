import React from 'react';
import { G, Line, Circle, Text as SvgText } from 'react-native-svg';
import { StandaloneEdge } from '../../types';

interface StandaloneEdgeShapeProps {
  edge: StandaloneEdge;
  isSelected: boolean;
  scale: number;
  onPress?: (id: string) => void;
}

export const StandaloneEdgeShape: React.FC<StandaloneEdgeShapeProps> = ({
  edge,
  isSelected,
  scale,
  onPress,
}) => {
  const { p1, p2, length, id } = edge;

  const strokeWidth = 2 / scale;
  const hitStrokeWidth = 20 / scale;
  const vertexRadius = 4 / scale;
  const fontSize = 12 / scale;

  // Calculate label position
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len;
  const ny = dx / len;
  const labelOffset = 15 / scale;
  const labelX = midX + nx * labelOffset;
  const labelY = midY + ny * labelOffset;

  return (
    <G>
      {/* Hit area */}
      <Line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="transparent"
        strokeWidth={hitStrokeWidth}
        onPress={() => onPress?.(id)}
      />
      {/* Visible line */}
      <Line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={isSelected ? '#3b82f6' : '#6b7280'}
        strokeWidth={isSelected ? strokeWidth * 2 : strokeWidth}
        strokeDasharray={isSelected ? undefined : `${4 / scale},${4 / scale}`}
      />
      {/* Length label */}
      <SvgText
        x={labelX}
        y={labelY}
        fontSize={fontSize}
        fill="#6b7280"
        textAnchor="middle"
        alignmentBaseline="middle"
      >
        {length.toFixed(2)}
      </SvgText>
      {/* Endpoints */}
      <Circle cx={p1.x} cy={p1.y} r={vertexRadius} fill="#6b7280" />
      <Circle cx={p2.x} cy={p2.y} r={vertexRadius} fill="#6b7280" />
    </G>
  );
};
