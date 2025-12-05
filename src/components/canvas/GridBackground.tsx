import React, { useMemo } from 'react';
import { G, Line, Text as SvgText } from 'react-native-svg';
import { GRID } from '../../constants';

interface GridBackgroundProps {
  viewBox: { x: number; y: number; width: number; height: number };
  scale: number;
}

export const GridBackground: React.FC<GridBackgroundProps> = ({ viewBox, scale }) => {
  const gridLines = useMemo(() => {
    const lines: React.ReactNode[] = [];

    // Draw a fixed range that covers typical use
    const minX = -20;
    const maxX = 50;
    const minY = -20;
    const maxY = 50;

    // Minor grid lines (every 1 unit)
    for (let gx = minX; gx <= maxX; gx++) {
      const isMajor = gx % GRID.MAJOR_LINE_INTERVAL === 0;
      lines.push(
        <Line
          key={`v-${gx}`}
          x1={gx}
          y1={minY}
          x2={gx}
          y2={maxY}
          stroke={isMajor ? GRID.MAJOR_LINE_COLOR : GRID.MINOR_LINE_COLOR}
          strokeWidth={(isMajor ? 1 : 0.5) / scale}
        />
      );
    }

    for (let gy = minY; gy <= maxY; gy++) {
      const isMajor = gy % GRID.MAJOR_LINE_INTERVAL === 0;
      lines.push(
        <Line
          key={`h-${gy}`}
          x1={minX}
          y1={gy}
          x2={maxX}
          y2={gy}
          stroke={isMajor ? GRID.MAJOR_LINE_COLOR : GRID.MINOR_LINE_COLOR}
          strokeWidth={(isMajor ? 1 : 0.5) / scale}
        />
      );
    }

    // Axes (thicker)
    lines.push(
      <Line
        key="y-axis"
        x1={0}
        y1={minY}
        x2={0}
        y2={maxY}
        stroke={GRID.AXIS_COLOR}
        strokeWidth={2 / scale}
      />
    );

    lines.push(
      <Line
        key="x-axis"
        x1={minX}
        y1={0}
        x2={maxX}
        y2={0}
        stroke={GRID.AXIS_COLOR}
        strokeWidth={2 / scale}
      />
    );

    return lines;
  }, [scale]);

  const labels = useMemo(() => {
    const texts: React.ReactNode[] = [];
    const fontSize = 10 / scale;
    const labelOffset = 0.3;

    // X axis labels (below x-axis)
    for (let gx = -15; gx <= 45; gx += GRID.MAJOR_LINE_INTERVAL) {
      if (gx === 0) continue;
      const ly = -labelOffset;
      texts.push(
        <SvgText
          key={`lx-${gx}`}
          x={gx}
          y={ly}
          fontSize={fontSize}
          fill="#6b7280"
          textAnchor="middle"
          transform={`translate(${gx}, ${ly}) scale(1, -1) translate(${-gx}, ${-ly})`}
        >
          {gx}
        </SvgText>
      );
    }

    // Y axis labels (left of y-axis)
    for (let gy = -15; gy <= 45; gy += GRID.MAJOR_LINE_INTERVAL) {
      if (gy === 0) continue;
      const lx = -labelOffset;
      texts.push(
        <SvgText
          key={`ly-${gy}`}
          x={lx}
          y={gy}
          fontSize={fontSize}
          fill="#6b7280"
          textAnchor="end"
          transform={`translate(${lx}, ${gy}) scale(1, -1) translate(${-lx}, ${-gy})`}
        >
          {gy}
        </SvgText>
      );
    }

    return texts;
  }, [scale]);

  return (
    <G>
      {gridLines}
      {labels}
    </G>
  );
};
