import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Text, Group, Shape, Rect, Circle } from 'react-konva';
import Konva from 'konva';
import { RenderedTriangle, ToolMode, Point } from '../types';
import { getCentroid, distance, generateId } from '../utils/geometryUtils';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface GeometryCanvasProps {
  triangles: RenderedTriangle[];
  phantomTriangle?: RenderedTriangle | null;
  mode: ToolMode;
  selectedTriangleId: string | null;
  onSelectTriangle: (id: string) => void;
  onEdgeSelect: (triangleId: string, edgeIndex: 0 | 1 | 2) => void;
  onEdgeDoubleClick: (triangleId: string, edgeIndex: 0 | 1 | 2) => void;
  onDimensionChange?: (triangleId: string, edgeIndex: 0 | 1 | 2, newValue: number) => boolean;
  onAddAttachedTriangle?: (triangleId: string, edgeIndex: 0 | 1 | 2, sideLeft: number, sideRight: number, flip: boolean) => void;
  onVertexReshape?: (triangleId: string, sideLeft: number, sideRight: number, flip: boolean) => void;
  onPhantomClick?: () => void;
  onBackgroundClick?: () => void;
  selectedEdge: { triangleId: string, edgeIndex: 0 | 1 | 2 } | null;
  occupiedEdges?: Set<string>;
}

type InteractionState =
  | { type: 'IDLE' }
  | { type: 'PAN_READY'; startX: number; startY: number }
  | { type: 'PANNING'; lastX: number; lastY: number }
  | { type: 'EDGE_READY'; tId: string; index: 0 | 1 | 2; p1: Point; p2: Point; startX: number; startY: number }
  | { type: 'EDGE_DRAGGING'; tId: string; index: 0 | 1 | 2; p1: Point; p2: Point; currentMouse: Point }
  | { type: 'PHANTOM_PLACING'; tId: string; index: 0 | 1 | 2; p1: Point; p2: Point; currentMouse: Point }
  | { type: 'VERTEX_RESHAPING'; tId: string; p1: Point; p2: Point; currentMouse: Point };

const GeometryCanvas: React.FC<GeometryCanvasProps> = ({
  triangles,
  phantomTriangle,
  mode,
  selectedTriangleId,
  onSelectTriangle,
  onEdgeSelect,
  onEdgeDoubleClick,
  onDimensionChange,
  onAddAttachedTriangle,
  onVertexReshape,
  onPhantomClick,
  onBackgroundClick,
  selectedEdge,
  occupiedEdges
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport state - using scale and position for Konva
  const [stageScale, setStageScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 200, y: 150 }); // Initial offset to center view
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [interaction, setInteraction] = useState<InteractionState>({ type: 'IDLE' });
  const [editingDim, setEditingDim] = useState<{ tId: string, index: 0 | 1 | 2, value: string, originalValue: number, label: string } | null>(null);
  const [editingInputPos, setEditingInputPos] = useState<{ x: number; y: number; angle: number; fontSize: number } | null>(null);

  // Initial viewport: -10, -10 to 40, 30 (width: 50, height: 40)
  // CAD-like coordinate system: origin at bottom-left, positive X right, positive Y up
  // But screen Y is inverted, so we use negative Y values for "up"
  const worldBounds = { x: 0, y: -40, w: 50, h: 40 };

  // Determine which side of the edge (p1->p2) the mouse point is on
  // Returns true if the point is on the "flip" side (negative cross product)
  const isFlipSide = useCallback((p1: Point, p2: Point, mouse: Point): boolean => {
    // Cross product of (p2-p1) and (mouse-p1)
    const cross = (p2.x - p1.x) * (mouse.y - p1.y) - (p2.y - p1.y) * (mouse.x - p1.x);
    return cross < 0;
  }, []);

  // Convert world coordinates to stage coordinates
  const worldToStage = useCallback((worldX: number, worldY: number): { x: number; y: number } => {
    const normalizedX = (worldX - worldBounds.x) / worldBounds.w;
    const normalizedY = (worldY - worldBounds.y) / worldBounds.h;
    return {
      x: normalizedX * 1000, // Use a fixed virtual canvas size
      y: normalizedY * 800
    };
  }, []);

  // Convert stage coordinates to world coordinates
  const stageToWorld = useCallback((stageX: number, stageY: number): { x: number; y: number } => {
    const normalizedX = stageX / 1000;
    const normalizedY = stageY / 800;
    return {
      x: worldBounds.x + normalizedX * worldBounds.w,
      y: worldBounds.y + normalizedY * worldBounds.h
    };
  }, []);

  // Get world point from stage event
  const getWorldPoint = useCallback((evt: Konva.KonvaEventObject<MouseEvent>): Point => {
    if (!stageRef.current) return { id: generateId(), x: 0, y: 0 };
    const stage = stageRef.current;
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return { id: generateId(), x: 0, y: 0 };
    
    // Get position relative to stage
    const stageX = (pointerPos.x - stage.x()) / stage.scaleX();
    const stageY = (pointerPos.y - stage.y()) / stage.scaleY();
    
    const world = stageToWorld(stageX, stageY);
    return { id: generateId(), x: world.x, y: world.y };
  }, [stageToWorld]);

  // Initialize stage size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setStageSize({ width: rect.width, height: rect.height });
        
        // Calculate initial scale to fit world bounds
        const scaleX = rect.width / 1000;
        const scaleY = rect.height / 800;
        const initialScale = Math.min(scaleX, scaleY) * 0.9;
        setStageScale(initialScale);
        
        // Center the view
        const centerX = rect.width / 2 - (1000 * initialScale) / 2;
        const centerY = rect.height / 2 - (800 * initialScale) / 2;
        setStagePosition({ x: centerX, y: centerY });
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 0 && !editingDim) {
      // If in phantom placing mode, confirm the triangle on click
      if (interaction.type === 'PHANTOM_PLACING') {
        if (onAddAttachedTriangle) {
          const { p1, p2, currentMouse, tId, index } = interaction;
          // Check if this edge is already occupied
          const isOccupied = occupiedEdges?.has(`${tId}-${index}`) || false;
          if (isOccupied) {
            // Edge already has a child triangle - don't add another
            setInteraction({ type: 'IDLE' });
            return;
          }
          const sideLeft = distance(p1, currentMouse);
          const sideRight = distance(p2, currentMouse);
          const flip = isFlipSide(p1, p2, currentMouse);
          if (sideLeft > 0 && sideRight > 0) {
            onAddAttachedTriangle(tId, index, sideLeft, sideRight, flip);
          }
        }
        setInteraction({ type: 'IDLE' });
        return;
      }
      // If in vertex reshaping mode, confirm the reshape on click
      if (interaction.type === 'VERTEX_RESHAPING') {
        if (onVertexReshape) {
          const { p1, p2, currentMouse, tId } = interaction;
          const sideLeft = distance(p1, currentMouse);
          const sideRight = distance(p2, currentMouse);
          const flip = isFlipSide(p1, p2, currentMouse);
          if (sideLeft > 0 && sideRight > 0) {
            onVertexReshape(tId, sideLeft, sideRight, flip);
          }
        }
        setInteraction({ type: 'IDLE' });
        return;
      }
      setInteraction({ type: 'PAN_READY', startX: e.evt.clientX, startY: e.evt.clientY });
    }
  };

  const handleEdgeMouseDown = (e: Konva.KonvaEventObject<MouseEvent>, tId: string, index: 0 | 1 | 2, p1: Point, p2: Point) => {
    e.evt.stopPropagation();
    if (e.evt.button === 0 && !editingDim) {
      setInteraction({
        type: 'EDGE_READY',
        tId,
        index,
        p1,
        p2,
        startX: e.evt.clientX,
        startY: e.evt.clientY
      });
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (interaction.type === 'PAN_READY') {
      const dist = Math.sqrt(Math.pow(e.evt.clientX - interaction.startX, 2) + Math.pow(e.evt.clientY - interaction.startY, 2));
      if (dist > 3) {
        setInteraction({ type: 'PANNING', lastX: e.evt.clientX, lastY: e.evt.clientY });
      }
    } else if (interaction.type === 'PANNING') {
      const dx = e.evt.clientX - interaction.lastX;
      const dy = e.evt.clientY - interaction.lastY;
      setStagePosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setInteraction({ type: 'PANNING', lastX: e.evt.clientX, lastY: e.evt.clientY });
    } else if (interaction.type === 'EDGE_READY') {
      const dist = Math.sqrt(Math.pow(e.evt.clientX - interaction.startX, 2) + Math.pow(e.evt.clientY - interaction.startY, 2));
      if (dist > 5) {
        // Check if this edge is already occupied before allowing drag
        const isOccupied = occupiedEdges?.has(`${interaction.tId}-${interaction.index}`) || false;
        if (isOccupied) {
          // Edge is occupied, cancel drag and switch to panning
          setInteraction({ type: 'PANNING', lastX: e.evt.clientX, lastY: e.evt.clientY });
          return;
        }
        const currentMouse = getWorldPoint(e);
        setInteraction({
          type: 'EDGE_DRAGGING',
          tId: interaction.tId,
          index: interaction.index,
          p1: interaction.p1,
          p2: interaction.p2,
          currentMouse
        });
      }
    } else if (interaction.type === 'EDGE_DRAGGING') {
      const currentMouse = getWorldPoint(e);
      setInteraction({ ...interaction, currentMouse });
    } else if (interaction.type === 'PHANTOM_PLACING') {
      const currentMouse = getWorldPoint(e);
      setInteraction({ ...interaction, currentMouse });
    } else if (interaction.type === 'VERTEX_RESHAPING') {
      const currentMouse = getWorldPoint(e);
      setInteraction({ ...interaction, currentMouse });
    }
  };

  const handleMouseUp = () => {
    if (interaction.type === 'EDGE_READY') {
      // Single click on edge - do nothing (use double click for phantom mode)
    } else if (interaction.type === 'EDGE_DRAGGING') {
      if (onAddAttachedTriangle) {
        const { p1, p2, currentMouse, tId, index } = interaction;
        // Check if this edge is already occupied
        const isOccupied = occupiedEdges?.has(`${tId}-${index}`) || false;
        if (isOccupied) {
          // Edge already has a child triangle - don't add another
          setInteraction({ type: 'IDLE' });
          return;
        }
        const sideLeft = distance(p1, currentMouse);
        const sideRight = distance(p2, currentMouse);
        const flip = isFlipSide(p1, p2, currentMouse);
        // Only add if both sides are valid (greater than 0)
        if (sideLeft > 0 && sideRight > 0) {
          onAddAttachedTriangle(tId, index, sideLeft, sideRight, flip);
        }
      }
    } else if (interaction.type === 'PAN_READY') {
      if (onBackgroundClick) {
        onBackgroundClick();
      }
    }
    setInteraction({ type: 'IDLE' });
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    e.evt.stopPropagation();

    if (!stageRef.current) return;

    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const zoomSensitivity = 0.002;
    const delta = e.evt.deltaY;
    const scaleBy = 1 - delta * zoomSensitivity;
    const newScale = Math.max(0.1, Math.min(5, oldScale * scaleBy));

    // Limit zoom (already applied above)

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    setStageScale(newScale);
    setStagePosition(newPos);
  };

  const handleZoomBtn = (direction: 'in' | 'out') => {
    if (!stageRef.current) return;
    
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const center = {
      x: stageSize.width / 2,
      y: stageSize.height / 2,
    };

    const mousePointTo = {
      x: (center.x - stage.x()) / oldScale,
      y: (center.y - stage.y()) / oldScale,
    };

    const scaleBy = direction === 'in' ? 1.25 : 0.8;
    const newScale = oldScale * scaleBy;

    if (newScale < 0.1 || newScale > 5) return;

    const newPos = {
      x: center.x - mousePointTo.x * newScale,
      y: center.y - mousePointTo.y * newScale,
    };

    setStageScale(newScale);
    setStagePosition(newPos);
  };

  const handleFitView = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = rect.width / 1000;
    const scaleY = rect.height / 800;
    const initialScale = Math.min(scaleX, scaleY) * 0.9;
    setStageScale(initialScale);
    
    const centerX = rect.width / 2 - (1000 * initialScale) / 2;
    const centerY = rect.height / 2 - (800 * initialScale) / 2;
    setStagePosition({ x: centerX, y: centerY });
  };

  const handleLabelClick = (tId: string, index: 0 | 1 | 2, currentLen: number, label: string, labelX: number, labelY: number, angle: number, fontSize: number) => {
    if (label === 'Ref') return;
    setEditingDim({ tId, index, value: currentLen.toFixed(2), originalValue: currentLen, label: label || '' });
    
    // Convert Konva stage coordinates to HTML screen coordinates
    if (stageRef.current && containerRef.current) {
      const stage = stageRef.current;
      const containerRect = containerRef.current.getBoundingClientRect();
      
      // Get the actual screen position of the label
      const stageX = (labelX * stage.scaleX()) + stage.x();
      const stageY = (labelY * stage.scaleY()) + stage.y();
      
      setEditingInputPos({
        x: containerRect.left + stageX,
        y: containerRect.top + stageY,
        angle,
        fontSize: fontSize * stage.scaleX() // Scale font size to match zoom
      });
    }
  };

  const commitEdit = () => {
    if (!editingDim || !onDimensionChange) {
      setEditingDim(null);
      setEditingInputPos(null);
      return;
    }
    const val = parseFloat(editingDim.value);
    if (!isNaN(val) && val > 0) {
      const success = onDimensionChange(editingDim.tId, editingDim.index, val);
      if (success) {
        setEditingDim(null);
        setEditingInputPos(null);
      } else {
        setEditingDim(null);
        setEditingInputPos(null);
      }
    } else {
      setEditingDim(null);
      setEditingInputPos(null);
    }
  };

  // Render Grid
  const renderGrid = () => {
    const step = 1;
    const startX = Math.floor(worldBounds.x / step) * step;
    const startY = Math.floor(worldBounds.y / step) * step;
    const endX = worldBounds.x + worldBounds.w;
    const endY = worldBounds.y + worldBounds.h;

    const lines = [];
    for (let x = startX; x <= endX; x += step) {
      const sp1 = worldToStage(x, worldBounds.y);
      const sp2 = worldToStage(x, endY);
      const isMajor = Math.abs(x % (step * 5)) < 0.001 || Math.abs(x) < 0.001;
      lines.push(
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
      lines.push(
        <Line
          key={`h${y}`}
          points={[sp1.x, sp1.y, sp2.x, sp2.y]}
          stroke={y === 0 ? "#94a3b8" : (isMajor ? "#cbd5e1" : "#e2e8f0")}
          strokeWidth={y === 0 ? 2 : 1}
        />
      );
    }
    return lines;
  };

  // Render Edge with label
  const renderEdge = (
    t: RenderedTriangle,
    pStart: Point,
    pEnd: Point,
    index: 0 | 1 | 2,
    isPhantom: boolean = false
  ) => {
    const isSelectedEdge = selectedEdge?.triangleId === t.id && selectedEdge?.edgeIndex === index;
    const isSelectedTriangle = selectedTriangleId === t.id;
    const isOccupied = occupiedEdges?.has(`${t.id}-${index}`) || false;
    const rawLen = distance(pStart, pEnd);
    const len = rawLen.toFixed(2);

    const sp1 = worldToStage(pStart.x, pStart.y);
    const sp2 = worldToStage(pEnd.x, pEnd.y);

    const midX = (pStart.x + pEnd.x) / 2;
    const midY = (pStart.y + pEnd.y) / 2;

    const labelPos = worldToStage(midX, midY);
    const edgeLabel = t.edgeLabels ? t.edgeLabels[index] : '';
    const isEditing = editingDim?.tId === t.id && editingDim?.index === index;

    // Calculate angle for label rotation
    const dx = pEnd.x - pStart.x;
    const dy = pEnd.y - pStart.y;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle > 90 || angle < -90) {
      angle += 180;
    }

    // Calculate font size based on world-to-screen scale
    // Similar to original SVG: uiScale = viewBox.w / 50
    const uiScale = (worldBounds.w / 50) * (stageRef.current?.scaleX() || 1);
    const fontSize = Math.max(8, 0.8 * uiScale);

    // Calculate text for label
    // Normal: just the value (e.g. "5.00")
    // Editing: with label prefix (e.g. "B: 5.00")
    const labelText = len;
    const editingText = edgeLabel && edgeLabel !== 'Ref' ? `${edgeLabel}: ${editingDim?.value}` : editingDim?.value || '';

    // Estimate text width (monospace: ~0.6 * fontSize per character)
    const charWidth = fontSize * 0.6;
    const labelWidth = labelText.length * charWidth;
    const editingWidth = editingText.length * charWidth;

    return (
      <Group key={`edge-${t.id}-${index}`}>
        {/* Hit Area & Drag Trigger - skip for Ref edges to not block parent's label */}
        {edgeLabel !== 'Ref' && (
          <Line
            points={[sp1.x, sp1.y, sp2.x, sp2.y]}
            stroke="transparent"
            strokeWidth={20}
            onMouseDown={(e) => !isPhantom && !isOccupied && handleEdgeMouseDown(e, t.id, index, pStart, pEnd)}
            onDblClick={(e) => {
              if (!isPhantom && !isOccupied) {
                e.evt.stopPropagation();
                // Enter phantom placing mode
                const currentMouse = getWorldPoint(e);
                setInteraction({
                  type: 'PHANTOM_PLACING',
                  tId: t.id,
                  index,
                  p1: pStart,
                  p2: pEnd,
                  currentMouse
                });
              }
            }}
          />
        )}
        {/* Visible Edge */}
        <Line
          points={[sp1.x, sp1.y, sp2.x, sp2.y]}
          stroke={isSelectedEdge ? "#ef4444" : (isPhantom ? "#94a3b8" : "rgba(0,0,0,0.2)")}
          strokeWidth={isSelectedEdge ? 2 : 1}
          dash={isSelectedEdge ? undefined : (isPhantom ? [4, 4] : [8, 8])}
        />
        {/* Label - skip rendering for Ref edges (child's shared edge) to avoid duplicate */}
        {edgeLabel !== 'Ref' && !isEditing ? (
          <Group x={labelPos.x} y={labelPos.y} rotation={angle}>
            <Text
              x={0}
              y={0}
              text={labelText}
              fontSize={fontSize}
              fontFamily="monospace"
              fontStyle="bold"
              fill="#64748b"
              fillAfterStrokeEnabled={true}
              stroke="white"
              strokeWidth={3}
              offsetX={labelWidth / 2}
              offsetY={fontSize / 2}
              onClick={() => !isPhantom && handleLabelClick(t.id, index, rawLen, edgeLabel, labelPos.x, labelPos.y, angle, fontSize)}
            />
          </Group>
        ) : null}
      </Group>
    );
  };

  // Render Triangle Fill only (for bottom layer)
  const renderTriangleFill = (t: RenderedTriangle, isPhantom: boolean = false) => {
    const isSelected = selectedTriangleId === t.id;
    const isEditingAnyEdge = editingDim?.tId === t.id;

    const sp1 = worldToStage(t.p1.x, t.p1.y);
    const sp2 = worldToStage(t.p2.x, t.p2.y);
    const sp3 = worldToStage(t.p3.x, t.p3.y);

    return (
      <Shape
        key={`fill-${t.id}`}
        sceneFunc={(context, shape) => {
          context.beginPath();
          context.moveTo(sp1.x, sp1.y);
          context.lineTo(sp2.x, sp2.y);
          context.lineTo(sp3.x, sp3.y);
          context.closePath();
          context.fillStrokeShape(shape);
        }}
        fill={isPhantom ? "#cbd5e1" : "#94a3b8"}
        opacity={isPhantom ? 0.3 : (isEditingAnyEdge ? 0.1 : (isSelected ? 0.4 : 0.2))}
        stroke={isPhantom ? "#94a3b8" : "#64748b"}
        strokeWidth={isSelected ? 2 : 1}
        dash={isPhantom ? [4, 4] : undefined}
        onClick={() => {
          if (isPhantom && onPhantomClick) {
            onPhantomClick();
          } else {
            onSelectTriangle(t.id);
          }
        }}
        onDblClick={(e) => {
          if (!isPhantom) {
            e.evt.stopPropagation();
            // Enter vertex reshaping mode
            setInteraction({
              type: 'VERTEX_RESHAPING',
              tId: t.id,
              p1: t.p1,
              p2: t.p2,
              currentMouse: t.p3
            });
          }
        }}
      />
    );
  };

  // Render Triangle Labels (edges and centroid label) - for top layer
  const renderTriangleLabels = (t: RenderedTriangle, isPhantom: boolean = false) => {
    const centroid = getCentroid(t);
    const labelPos = worldToStage(centroid.x, centroid.y);

    // Calculate font size based on world-to-screen scale
    const uiScale = (worldBounds.w / 50) * (stageRef.current?.scaleX() || 1);
    const fontSize = Math.max(10, 1.2 * uiScale);

    return (
      <Group key={`labels-${t.id}`}>
        {/* Edges */}
        {renderEdge(t, t.p1, t.p2, 0, isPhantom)}
        {renderEdge(t, t.p2, t.p3, 1, isPhantom)}
        {renderEdge(t, t.p3, t.p1, 2, isPhantom)}
        {/* Triangle Number in Circle */}
        {isPhantom ? (
          <Text
            x={labelPos.x}
            y={labelPos.y}
            text="+"
            fontSize={fontSize}
            fontStyle="bold"
            fill="#334155"
            opacity={0.5}
            offsetX={fontSize * 0.3}
            offsetY={fontSize / 2}
          />
        ) : (
          <Group x={labelPos.x} y={labelPos.y}>
            <Circle
              x={0}
              y={0}
              radius={fontSize * 0.7}
              fill="white"
              stroke="#3b82f6"
              strokeWidth={2}
              opacity={0.9}
            />
            <Text
              x={0}
              y={0}
              text={t.name.replace(/\D/g, '')}
              fontSize={fontSize * 0.8}
              fontStyle="bold"
              fill="#3b82f6"
              offsetX={t.name.replace(/\D/g, '').length * fontSize * 0.24}
              offsetY={fontSize * 0.4}
            />
          </Group>
        )}
      </Group>
    );
  };

  // Render Drag Ghost (for EDGE_DRAGGING, PHANTOM_PLACING, and VERTEX_RESHAPING)
  const renderDragGhost = () => {
    if (interaction.type !== 'EDGE_DRAGGING' && interaction.type !== 'PHANTOM_PLACING' && interaction.type !== 'VERTEX_RESHAPING') return null;
    const { p1, p2, currentMouse } = interaction;

    const sp1 = worldToStage(p1.x, p1.y);
    const sp2 = worldToStage(p2.x, p2.y);
    const sp3 = worldToStage(currentMouse.x, currentMouse.y);

    const sL = distance(p1, currentMouse).toFixed(2);
    const sR = distance(p2, currentMouse).toFixed(2);

    // Calculate font size based on world-to-screen scale
    const uiScale = (worldBounds.w / 50) * (stageRef.current?.scaleX() || 1);
    const fontSize = Math.max(8, 0.8 * uiScale);

    // Estimate text width (monospace: ~0.6 * fontSize per character)
    const charWidth = fontSize * 0.6;
    const textB = `B: ${sL}`;
    const textC = `C: ${sR}`;
    const widthB = textB.length * charWidth;
    const widthC = textC.length * charWidth;

    return (
      <Group>
        <Shape
          sceneFunc={(context, shape) => {
            context.beginPath();
            context.moveTo(sp1.x, sp1.y);
            context.lineTo(sp2.x, sp2.y);
            context.lineTo(sp3.x, sp3.y);
            context.closePath();
            context.fillStrokeShape(shape);
          }}
          fill="#94a3b8"
          opacity={0.2}
          stroke="#94a3b8"
          strokeWidth={1}
          dash={[4, 4]}
        />
        <Line points={[sp1.x, sp1.y, sp3.x, sp3.y]} stroke="#64748b" strokeWidth={1} />
        <Line points={[sp2.x, sp2.y, sp3.x, sp3.y]} stroke="#64748b" strokeWidth={1} />

        <Text
          x={(sp1.x + sp3.x) / 2}
          y={(sp1.y + sp3.y) / 2}
          text={textB}
          fontSize={fontSize}
          fill="#64748b"
          fillAfterStrokeEnabled={true}
          stroke="white"
          strokeWidth={2}
          offsetX={widthB / 2}
          offsetY={fontSize / 2}
        />
        <Text
          x={(sp2.x + sp3.x) / 2}
          y={(sp2.y + sp3.y) / 2}
          text={textC}
          fontSize={fontSize}
          fill="#64748b"
          fillAfterStrokeEnabled={true}
          stroke="white"
          strokeWidth={2}
          offsetX={widthC / 2}
          offsetY={fontSize / 2}
        />
      </Group>
    );
  };

  const cursorStyle = interaction.type === 'PANNING' || interaction.type === 'EDGE_DRAGGING' 
    ? 'grabbing' 
    : 'default';

  return (
    <div ref={containerRef} className="flex-1 h-full relative bg-slate-50 overflow-hidden select-none">
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePosition.x}
        y={stagePosition.y}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: cursorStyle }}
      >
        <Layer>
          {renderGrid()}
          {/* Render all triangle fills first (bottom layer) */}
          {triangles.map((t) => renderTriangleFill(t, false))}
          {phantomTriangle && renderTriangleFill(phantomTriangle, true)}
          {/* Render all labels on top (so they're clickable) */}
          {triangles.map((t) => renderTriangleLabels(t, false))}
          {phantomTriangle && renderTriangleLabels(phantomTriangle, true)}
          {renderDragGhost()}
        </Layer>
      </Stage>

      <div className="absolute bottom-6 right-6 flex flex-col gap-2">
        <button
          onClick={() => handleZoomBtn('in')}
          className="p-2 bg-white rounded-full shadow border border-slate-200 hover:bg-slate-50 text-slate-600"
        >
          <ZoomIn size={20} />
        </button>
        <button
          onClick={() => handleZoomBtn('out')}
          className="p-2 bg-white rounded-full shadow border border-slate-200 hover:bg-slate-50 text-slate-600"
        >
          <ZoomOut size={20} />
        </button>
        <button
          onClick={handleFitView}
          className="p-2 bg-white rounded-full shadow border border-slate-200 hover:bg-slate-50 text-slate-600"
          title="Reset View"
        >
          <Maximize size={20} />
        </button>
      </div>

      <div className="absolute bottom-4 left-4 bg-white/80 backdrop-blur px-3 py-2 rounded shadow-sm text-[10px] text-slate-500 border border-slate-200 pointer-events-none">
        <p className="font-semibold">Controls:</p>
        <p>• Click Label: <span className="text-blue-600 font-bold">Edit Dimension</span></p>
        <p>• Drag Edge: <span className="text-emerald-600 font-bold">Add New Triangle</span></p>
        <p>• Scroll: Zoom / Drag BG: Pan</p>
      </div>

      {/* HTML Input overlay for editing dimensions */}
      {editingDim && editingInputPos && (
        <div
          style={{
            position: 'fixed',
            left: `${editingInputPos.x}px`,
            top: `${editingInputPos.y}px`,
            transform: `translate(-50%, -50%) rotate(${editingInputPos.angle}deg)`,
            fontSize: `${editingInputPos.fontSize}px`,
            fontFamily: 'ui-monospace, monospace',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.2em',
            zIndex: 1000
          }}
        >
          {editingDim.label && (
            <span style={{ color: '#64748b' }}>
              {editingDim.label}:
            </span>
          )}
          <input
            type="text"
            inputMode="decimal"
            value={editingDim.value}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
                setEditingDim({...editingDim, value: value});
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditingDim(null);
                setEditingInputPos(null);
              }
            }}
            onBlur={commitEdit}
            autoFocus
            style={{
              fontSize: 'inherit',
              fontFamily: 'inherit',
              fontWeight: 'inherit',
              textAlign: 'center',
              border: 'none',
              outline: 'none',
              background: 'rgba(255,255,255,0.9)',
              color: '#64748b',
              padding: '0 0.2em',
              margin: '0',
              cursor: 'text',
              width: 'auto',
              minWidth: '3em',
              borderRadius: '2px'
            }}
          />
        </div>
      )}
    </div>
  );
};

export default GeometryCanvas;
