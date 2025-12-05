import React, { useState, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { G } from 'react-native-svg';

import { RenderedTriangle, StandaloneEdge, EdgeSelection, Point, InteractionState } from '../../types';
import { GridBackground } from './GridBackground';
import { TriangleShape } from './TriangleShape';
import { StandaloneEdgeShape } from './StandaloneEdgeShape';
import { DrawingEdge, PhantomTriangle, SelectionRect } from './PhantomTriangle';
import { distance, calculateThirdPoint } from '../../utils/geometryUtils';
import { GESTURE_CONSTANTS } from '../../constants';
import { ViewTransform, screenToWorld, applyPinchZoom, applyPan, getInitialTransform, fitToBounds } from '../../utils/coordinateTransform';

export interface GeometryCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fitToContent: () => void;
}

interface GeometryCanvasProps {
  triangles: RenderedTriangle[];
  standaloneEdges: StandaloneEdge[];
  selectedTriangleId: string | null;
  selectedEdge: EdgeSelection | null;
  selectedIds: Set<string>;
  interaction: InteractionState;
  edgeEditMode: boolean;
  triangleEditMode: boolean;
  onSelectTriangle: (id: string | null) => void;
  onSelectEdge: (selection: EdgeSelection | null) => void;
  onSelectIds: (ids: Set<string>) => void;
  onInteractionChange: (state: InteractionState) => void;
  onAddStandaloneEdge?: (p1: Point, p2: Point) => void;
  onAddTriangleFromEdge?: (edgeId: string, sideLeft: number, sideRight: number, flip: boolean) => void;
  onDeleteTriangle?: (id: string) => void;
  onDeleteStandaloneEdge?: (id: string) => void;
  onAddAttachedTriangle?: (triangleId: string, edgeIndex: 0 | 1 | 2, sideLeft: number, sideRight: number, flip: boolean) => void;
}

const INITIAL_SCALE = 30;

export const GeometryCanvas = forwardRef<GeometryCanvasHandle, GeometryCanvasProps>(({
  triangles,
  standaloneEdges,
  selectedTriangleId,
  selectedEdge,
  selectedIds,
  interaction,
  edgeEditMode,
  triangleEditMode,
  onSelectTriangle,
  onSelectEdge,
  onSelectIds,
  onInteractionChange,
  onAddStandaloneEdge,
  onAddAttachedTriangle,
}, ref) => {
  const [canvasSize, setCanvasSize] = useState({ width: 400, height: 600 });

  const [transform, setTransform] = useState<ViewTransform>({
    scale: INITIAL_SCALE,
    offsetX: 50,
    offsetY: 400,
  });

  const savedTransform = useRef<ViewTransform>({ scale: INITIAL_SCALE, offsetX: 50, offsetY: 400 });
  const lastTapTime = useRef(0);
  const lastTapPos = useRef({ x: 0, y: 0 });
  const selectRectStart = useRef<Point | null>(null);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      setTransform(prev => applyPinchZoom(prev, 1.3, canvasSize.width / 2, canvasSize.height / 2));
    },
    zoomOut: () => {
      setTransform(prev => applyPinchZoom(prev, 0.7, canvasSize.width / 2, canvasSize.height / 2));
    },
    fitToContent: () => {
      const points: Point[] = [];
      triangles.forEach(t => {
        points.push(t.p1, t.p2, t.p3);
      });
      standaloneEdges.forEach(e => {
        points.push(e.p1, e.p2);
      });

      if (points.length === 0) return;

      const xs = points.map(p => p.x);
      const ys = points.map(p => p.y);
      const bounds = {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      };

      const newTransform = fitToBounds(bounds, canvasSize.width, canvasSize.height);
      setTransform(newTransform);
    },
  }), [canvasSize, triangles, standaloneEdges]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvasSize({ width, height });
    const initialTransform = getInitialTransform(width, height, INITIAL_SCALE);
    setTransform(initialTransform);
    savedTransform.current = initialTransform;
  }, []);

  const toWorld = useCallback((screenX: number, screenY: number): Point => {
    return screenToWorld(screenX, screenY, transform);
  }, [transform]);

  const viewBox = useMemo(() => {
    const topLeft = screenToWorld(0, 0, transform);
    const bottomRight = screenToWorld(canvasSize.width, canvasSize.height, transform);
    return {
      x: topLeft.x,
      y: bottomRight.y,
      width: bottomRight.x - topLeft.x,
      height: topLeft.y - bottomRight.y,
    };
  }, [transform, canvasSize]);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedTransform.current = { ...transform };
    })
    .onUpdate((e) => {
      const newTransform = applyPinchZoom(savedTransform.current, e.scale, e.focalX, e.focalY);
      setTransform(newTransform);
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onStart(() => {
      savedTransform.current = { ...transform };
    })
    .onUpdate((e) => {
      const newTransform = applyPan(savedTransform.current, e.translationX, e.translationY);
      setTransform(newTransform);
    });

  const tapGesture = Gesture.Tap()
    .onEnd((e) => {
      const now = Date.now();
      const timeDiff = now - lastTapTime.current;
      const dx = e.x - lastTapPos.current.x;
      const dy = e.y - lastTapPos.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const worldPos = toWorld(e.x, e.y);

      if (timeDiff < GESTURE_CONSTANTS.DOUBLE_TAP_INTERVAL && dist < GESTURE_CONSTANTS.DOUBLE_TAP_DISTANCE) {
        if (edgeEditMode) {
          onInteractionChange({ type: 'DRAWING_EDGE', startPoint: worldPos, currentMouse: worldPos });
        }
        lastTapTime.current = 0;
      } else {
        if (edgeEditMode && interaction.type === 'IDLE') {
          onInteractionChange({ type: 'DRAWING_EDGE', startPoint: worldPos, currentMouse: worldPos });
        } else if (interaction.type === 'DRAWING_EDGE') {
          const length = distance(interaction.startPoint, worldPos);
          if (length > 0.3 && onAddStandaloneEdge) {
            onAddStandaloneEdge(interaction.startPoint, worldPos);
          }
          onInteractionChange({ type: 'IDLE' });
        } else if (interaction.type === 'PHANTOM_PLACING') {
          // Modal is handling this - just cancel on background tap
          onInteractionChange({ type: 'IDLE' });
        } else {
          onSelectTriangle(null);
          onSelectEdge(null);
          onSelectIds(new Set());
        }
        lastTapTime.current = now;
        lastTapPos.current = { x: e.x, y: e.y };
      }
    });

  // Long press gesture - starts SELECT_RECT
  const longPressGesture = Gesture.LongPress()
    .minDuration(500)
    .onStart((e) => {
      if (interaction.type === 'IDLE' && !edgeEditMode && !triangleEditMode) {
        const worldPos = toWorld(e.x, e.y);
        selectRectStart.current = worldPos;
        onInteractionChange({ type: 'SELECT_RECT', startWorld: worldPos, currentWorld: worldPos });
      }
    });

  // Pan gesture for SELECT_RECT drag
  const selectRectPanGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onUpdate((e) => {
      if (interaction.type === 'SELECT_RECT' && selectRectStart.current) {
        const worldPos = toWorld(e.x, e.y);
        onInteractionChange({ ...interaction, currentWorld: worldPos });
      }
    })
    .onEnd(() => {
      if (interaction.type === 'SELECT_RECT') {
        // Calculate selected triangles
        const { startWorld, currentWorld } = interaction;
        const minX = Math.min(startWorld.x, currentWorld.x);
        const maxX = Math.max(startWorld.x, currentWorld.x);
        const minY = Math.min(startWorld.y, currentWorld.y);
        const maxY = Math.max(startWorld.y, currentWorld.y);

        const newSelectedIds = new Set<string>();
        triangles.forEach(t => {
          const cx = (t.p1.x + t.p2.x + t.p3.x) / 3;
          const cy = (t.p1.y + t.p2.y + t.p3.y) / 3;
          if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
            newSelectedIds.add(t.id);
          }
        });
        onSelectIds(newSelectedIds);
        selectRectStart.current = null;
        onInteractionChange({ type: 'IDLE' });
      }
    });

  const composedGesture = Gesture.Race(
    Gesture.Simultaneous(longPressGesture, selectRectPanGesture),
    Gesture.Simultaneous(pinchGesture, Gesture.Race(panGesture, tapGesture))
  );

  const handleTrianglePress = useCallback((id: string) => {
    onSelectTriangle(id);
    onSelectEdge(null);
  }, [onSelectTriangle, onSelectEdge]);

  const handleEdgePress = useCallback((triangleId: string, edgeIndex: 0 | 1 | 2) => {
    onSelectEdge({ type: 'triangleEdge', triangleId, edgeIndex });

    if (triangleEditMode) {
      const triangle = triangles.find(t => t.id === triangleId);
      if (triangle) {
        let p1: Point, p2: Point;
        if (edgeIndex === 0) { p1 = triangle.p1; p2 = triangle.p2; }
        else if (edgeIndex === 1) { p1 = triangle.p2; p2 = triangle.p3; }
        else { p1 = triangle.p3; p2 = triangle.p1; }

        onInteractionChange({
          type: 'PHANTOM_PLACING',
          tId: triangleId,
          index: edgeIndex,
          p1,
          p2,
          currentMouse: { id: '', x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        });
      }
    }
  }, [onSelectEdge, triangleEditMode, triangles, onInteractionChange]);

  const handleStandaloneEdgePress = useCallback((id: string) => {
    onSelectEdge({ type: 'standaloneEdge', edgeId: id });
  }, [onSelectEdge]);

  const phantomVertex = useMemo(() => {
    if (interaction.type !== 'PHANTOM_PLACING') return null;
    const sideLeft = 5;
    const sideRight = 5;
    const result = calculateThirdPoint(interaction.p1, interaction.p2, sideLeft, sideRight, false);
    return result;
  }, [interaction]);

  const { scale, offsetX, offsetY } = transform;

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={styles.container} onLayout={onLayout}>
        <Svg
          width={canvasSize.width}
          height={canvasSize.height}
          style={styles.svg}
        >
          <G transform={`translate(${offsetX}, ${offsetY}) scale(${scale}, ${-scale})`}>
            <GridBackground viewBox={viewBox} scale={scale} />

            {standaloneEdges.map(edge => (
              <StandaloneEdgeShape
                key={edge.id}
                edge={edge}
                isSelected={selectedEdge?.type === 'standaloneEdge' && selectedEdge.edgeId === edge.id}
                scale={scale}
                onPress={handleStandaloneEdgePress}
              />
            ))}

            {triangles.map(triangle => (
              <TriangleShape
                key={triangle.id}
                triangle={triangle}
                isSelected={selectedTriangleId === triangle.id || selectedIds.has(triangle.id)}
                selectedEdgeIndex={
                  selectedEdge?.type === 'triangleEdge' && selectedEdge.triangleId === triangle.id
                    ? selectedEdge.edgeIndex
                    : null
                }
                scale={scale}
                onTrianglePress={handleTrianglePress}
                onEdgePress={handleEdgePress}
              />
            ))}

            {interaction.type === 'DRAWING_EDGE' && (
              <DrawingEdge
                p1={interaction.startPoint}
                p2={interaction.currentMouse}
                scale={scale}
              />
            )}

            {interaction.type === 'PHANTOM_PLACING' && phantomVertex && (
              <PhantomTriangle
                p1={interaction.p1}
                p2={interaction.p2}
                p3={phantomVertex}
                scale={scale}
                isValid={true}
              />
            )}

            {interaction.type === 'SELECT_RECT' && (
              <SelectionRect
                p1={interaction.startWorld}
                p2={interaction.currentWorld}
                scale={scale}
              />
            )}
          </G>
        </Svg>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  svg: {
    flex: 1,
  },
});
