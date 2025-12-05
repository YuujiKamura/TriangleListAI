import React from 'react';
import { G, Polygon, Line, Circle } from 'react-native-svg';
import { Point } from '../../types';

interface PhantomTriangleProps {
  p1: Point;
  p2: Point;
  p3: Point;
  scale: number;
  isValid: boolean;
}

export const PhantomTriangle: React.FC<PhantomTriangleProps> = ({
  p1,
  p2,
  p3,
  scale,
  isValid,
}) => {
  const strokeWidth = 2 / scale;
  const vertexRadius = 4 / scale;
  const color = isValid ? '#22c55e' : '#ef4444';

  return (
    <G>
      <Polygon
        points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`}
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${4 / scale},${4 / scale}`}
      />
      {/* Highlight the new vertex */}
      <Circle
        cx={p3.x}
        cy={p3.y}
        r={vertexRadius * 1.5}
        fill={color}
        fillOpacity={0.8}
      />
    </G>
  );
};

interface DrawingEdgeProps {
  p1: Point;
  p2: Point;
  scale: number;
}

export const DrawingEdge: React.FC<DrawingEdgeProps> = ({ p1, p2, scale }) => {
  const strokeWidth = 2 / scale;
  const vertexRadius = 4 / scale;

  return (
    <G>
      <Line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="#3b82f6"
        strokeWidth={strokeWidth}
        strokeDasharray={`${4 / scale},${4 / scale}`}
      />
      <Circle cx={p1.x} cy={p1.y} r={vertexRadius} fill="#3b82f6" />
      <Circle cx={p2.x} cy={p2.y} r={vertexRadius} fill="#3b82f6" />
    </G>
  );
};

interface SelectionRectProps {
  p1: Point;
  p2: Point;
  scale: number;
}

export const SelectionRect: React.FC<SelectionRectProps> = ({ p1, p2, scale }) => {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const width = Math.abs(p2.x - p1.x);
  const height = Math.abs(p2.y - p1.y);
  const strokeWidth = 1 / scale;

  return (
    <G>
      <Line x1={x} y1={y} x2={x + width} y2={y} stroke="#3b82f6" strokeWidth={strokeWidth} />
      <Line x1={x + width} y1={y} x2={x + width} y2={y + height} stroke="#3b82f6" strokeWidth={strokeWidth} />
      <Line x1={x + width} y1={y + height} x2={x} y2={y + height} stroke="#3b82f6" strokeWidth={strokeWidth} />
      <Line x1={x} y1={y + height} x2={x} y2={y} stroke="#3b82f6" strokeWidth={strokeWidth} />
    </G>
  );
};
