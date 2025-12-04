import React from 'react';
import { Rect, Line } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';

interface GridBackgroundProps {
      worldBounds: {
            x: number;
            y: number;
            w: number;
            h: number;
      };
      worldToStage: (wx: number, wy: number) => { x: number; y: number };
      onBackgroundDblClick: (e: KonvaEventObject<MouseEvent>) => void;
}

export const GridBackground: React.FC<GridBackgroundProps> = ({
      worldBounds,
      worldToStage,
      onBackgroundDblClick
}) => {
      const step = 1;
      const startX = Math.floor(worldBounds.x / step) * step;
      const startY = Math.floor(worldBounds.y / step) * step;
      const endX = worldBounds.x + worldBounds.w;
      const endY = worldBounds.y + worldBounds.h;

      const topLeft = worldToStage(worldBounds.x, worldBounds.y);
      const bottomRight = worldToStage(endX, endY);

      const elements = [];

      // Background rect for catching double-clicks on empty areas
      elements.push(
            <Rect
                  key="background-rect"
                  name="background-rect"
                  x={topLeft.x}
                  y={topLeft.y}
                  width={bottomRight.x - topLeft.x}
                  height={bottomRight.y - topLeft.y}
                  fill="transparent"
                  onDblClick={onBackgroundDblClick}
            />
      );

      for (let x = startX; x <= endX; x += step) {
            const sp1 = worldToStage(x, worldBounds.y);
            const sp2 = worldToStage(x, endY);
            const isMajor = Math.abs(x % (step * 5)) < 0.001 || Math.abs(x) < 0.001;
            elements.push(
                  <Line
                        key={`v${x}`}
                        points={[sp1.x, sp1.y, sp2.x, sp2.y]}
                        stroke={x === 0 ? "#94a3b8" : (isMajor ? "#cbd5e1" : "#e2e8f0")}
                        strokeWidth={x === 0 ? 2 : 1}
                  />
            );
      }
      for (let y = startY; y <= endY; y += step) {
            const sp1 = worldToStage(worldBounds.x, y);
            const sp2 = worldToStage(endX, y);
            const isMajor = Math.abs(y % (step * 5)) < 0.001 || Math.abs(y) < 0.001;
            elements.push(
                  <Line
                        key={`h${y}`}
                        points={[sp1.x, sp1.y, sp2.x, sp2.y]}
                        stroke={y === 0 ? "#94a3b8" : (isMajor ? "#cbd5e1" : "#e2e8f0")}
                        strokeWidth={y === 0 ? 2 : 1}
                  />
            );
      }
      return <>{elements}</>;
};
