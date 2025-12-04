import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Text, Group, Shape, Rect, Circle } from 'react-konva';
import Konva from 'konva';
import { RenderedTriangle, ToolMode, Point, StandaloneEdge } from '../types';
import { getCentroid, distance, generateId, calculateNormalizedAngle, shouldPlaceOnLeft } from '../utils/geometryUtils';
import { modelToScreen, screenToModel, calculateThirdVertex, ModelPoint } from '../utils/coordinateSystem';
import { CANVAS_CONFIG } from '../constants';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

// Unified edge selection type
type SelectedEdge =
  | { type: 'triangle'; triangleId: string; edgeIndex: 0 | 1 | 2 }
  | { type: 'standalone'; edgeId: string }
  | null;

interface GeometryCanvasProps {
  triangles: RenderedTriangle[];
  mode: ToolMode;
  selectedTriangleId: string | null;
  onSelectTriangle: (id: string) => void;
  onEdgeSelect: (triangleId: string, edgeIndex: 0 | 1 | 2) => void;
  onStandaloneEdgeSelect?: (edgeId: string) => void;
  onEdgeDoubleClick: (triangleId: string, edgeIndex: 0 | 1 | 2) => void;
  onDimensionChange?: (triangleId: string, edgeIndex: 0 | 1 | 2, newValue: number) => boolean;
  onAddAttachedTriangle?: (triangleId: string, edgeIndex: 0 | 1 | 2, sideLeft: number, sideRight: number, placeOnLeft: boolean) => void;
  onVertexReshape?: (triangleId: string, sideLeft: number, sideRight: number, placeOnLeft: boolean) => void;
  onBackgroundClick?: () => void;
  selectedEdge: SelectedEdge;
  occupiedEdges?: Set<string>;
  standaloneEdges?: StandaloneEdge[];
  onAddStandaloneEdge?: (p1: Point, p2: Point) => void;
  onAddTriangleFromEdge?: (edgeId: string, sideLeft: number, sideRight: number, placeOnLeft: boolean) => void;
  onDeleteTriangle?: (id: string) => void;
  onDeleteStandaloneEdge?: (id: string) => void;
  onUpdateStandaloneEdgeLength?: (id: string, newLength: number) => void;
  // Root triangle placement mode
  rootPlacingMode?: { sideA: number; sideB: number; sideC: number } | null;
  onRootPlacingComplete?: (origin: Point, angle: number) => void;
  onRootPlacingCancel?: () => void;
}

// Source of the edge for triangle placement
type EdgeSource =
  | { kind: 'triangle'; tId: string; index: 0 | 1 | 2 }
  | { kind: 'standalone'; edgeId: string };

type InteractionState =
  | { type: 'IDLE' }
  | { type: 'PAN_READY'; startX: number; startY: number }
  | { type: 'PANNING'; lastX: number; lastY: number }
  | { type: 'EDGE_READY'; tId: string; index: 0 | 1 | 2; p1: Point; p2: Point; startX: number; startY: number }
  | { type: 'EDGE_DRAGGING'; tId: string; index: 0 | 1 | 2; p1: Point; p2: Point; currentMouse: Point }
  | { type: 'PHANTOM_PLACING'; source: EdgeSource; p1: Point; p2: Point; currentMouse: Point }
  | { type: 'VERTEX_RESHAPING'; tId: string; p1: Point; p2: Point; currentMouse: Point }
  | { type: 'DRAWING_EDGE'; startPoint: Point; currentMouse: Point }
  | { type: 'EXTENDING_EDGE'; fromEdgeId: string; fromPoint: Point; currentMouse: Point }
  | { type: 'ROOT_PLACING_ORIGIN'; sideA: number; sideB: number; sideC: number; currentMouse: Point }
  | { type: 'ROOT_PLACING_ANGLE'; sideA: number; sideB: number; sideC: number; origin: Point; currentMouse: Point };

// Extract constants for cleaner code
const { LONG_PRESS_DURATION, SNAP_THRESHOLD, ZOOM_SENSITIVITY, ZOOM_MIN, ZOOM_MAX, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, WORLD_BOUNDS } = CANVAS_CONFIG;

// Placing/drawing modes that should not be interrupted by other interactions
const PLACING_MODES = [
  'PHANTOM_PLACING',
  'VERTEX_RESHAPING',
  'DRAWING_EDGE',
  'EXTENDING_EDGE',
  'ROOT_PLACING_ORIGIN',
  'ROOT_PLACING_ANGLE'
] as const;

const isPlacingMode = (interaction: InteractionState): boolean => {
  return PLACING_MODES.includes(interaction.type as any);
};

const GeometryCanvas: React.FC<GeometryCanvasProps> = ({
  triangles,
  mode,
  selectedTriangleId,
  onSelectTriangle,
  onEdgeSelect,
  onStandaloneEdgeSelect,
  onEdgeDoubleClick,
  onDimensionChange,
  onAddAttachedTriangle,
  onVertexReshape,
  onBackgroundClick,
  selectedEdge,
  occupiedEdges,
  standaloneEdges = [],
  onAddStandaloneEdge,
  onAddTriangleFromEdge,
  onDeleteTriangle,
  onDeleteStandaloneEdge,
  onUpdateStandaloneEdgeLength,
  rootPlacingMode,
  onRootPlacingComplete,
  onRootPlacingCancel
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const [longPressTarget, setLongPressTarget] = useState<{ type: 'triangle' | 'edge'; id: string; progress: number } | null>(null);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'triangle' | 'edge'; id: string; name: string } | null>(null);
  const [deleteInput, setDeleteInput] = useState('');

  // Viewport state - using scale and position for Konva
  const [stageScale, setStageScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 200, y: 150 }); // Initial offset to center view
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [interaction, setInteraction] = useState<InteractionState>({ type: 'IDLE' });
  const [editingDim, setEditingDim] = useState<{ tId: string, index: 0 | 1 | 2, value: string, originalValue: number, label: string } | null>(null);
  const [editingEdgeDim, setEditingEdgeDim] = useState<{ edgeId: string, value: string, originalValue: number } | null>(null);
  const [editingInputPos, setEditingInputPos] = useState<{ x: number; y: number; angle: number; fontSize: number } | null>(null);

  // Debug console state
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addLog = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    setDebugLogs(prev => [...prev.slice(-19), `[${timestamp}] ${msg}`]);
  }, []);

  // Track interaction state changes
  useEffect(() => {
    addLog(`interaction changed -> ${interaction.type}`);
  }, [interaction.type, addLog]);

  // Viewport for coordinate transformations
  const viewport = {
    modelBounds: {
      minX: WORLD_BOUNDS.x,
      minY: WORLD_BOUNDS.y,
      width: WORLD_BOUNDS.w,
      height: WORLD_BOUNDS.h,
    },
    screenWidth: VIRTUAL_WIDTH,
    screenHeight: VIRTUAL_HEIGHT,
  };

  // Get all snap points (triangle vertices and standalone edge endpoints)
  const getSnapPoints = useCallback((): Point[] => {
    const points: Point[] = [];

    // Add all triangle vertices
    triangles.forEach(t => {
      points.push(t.p1, t.p2, t.p3);
    });

    // Add standalone edge endpoints
    standaloneEdges.forEach(e => {
      points.push(e.p1, e.p2);
    });

    return points;
  }, [triangles, standaloneEdges]);

  // Find nearest snap point within threshold
  const findSnapPoint = useCallback((mouse: Point, excludePoints?: Point[]): Point | null => {
    const snapPoints = getSnapPoints();
    let nearest: Point | null = null;
    let nearestDist: number = SNAP_THRESHOLD;

    for (const p of snapPoints) {
      // Skip excluded points (e.g., the base edge endpoints when adding triangle)
      if (excludePoints?.some(ep => Math.abs(ep.x - p.x) < 0.001 && Math.abs(ep.y - p.y) < 0.001)) {
        continue;
      }

      const dist = distance(mouse, p);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = p;
      }
    }

    return nearest;
  }, [getSnapPoints]);

  // Apply snap to a point
  const applySnap = useCallback((mouse: Point, excludePoints?: Point[]): Point => {
    const snapPoint = findSnapPoint(mouse, excludePoints);
    return snapPoint || mouse;
  }, [findSnapPoint]);

  // Ref to hold the current interaction for global click handler
  const interactionRef = useRef(interaction);
  useEffect(() => {
    interactionRef.current = interaction;
  }, [interaction]);

  // Global click handler for placing modes (workaround for Konva event issues)
  useEffect(() => {
    if (!isPlacingMode(interaction)) return;

    const handleGlobalClick = () => {
      const currentInteraction = interactionRef.current;
      addLog(`[Global click] type=${currentInteraction.type}`);

      if (currentInteraction.type === 'PHANTOM_PLACING') {
        const { p1, p2, currentMouse, source } = currentInteraction;
        const snappedMouse = applySnap(currentMouse, [p1, p2]);
        const sideLeft = distance(p1, snappedMouse);
        const sideRight = distance(p2, snappedMouse);
        const placeOnLeft = shouldPlaceOnLeft(p1, p2, snappedMouse);
        addLog(`[Global] L=${sideLeft.toFixed(2)} R=${sideRight.toFixed(2)} source=${source.kind}`);

        if (sideLeft > 0 && sideRight > 0) {
          if (source.kind === 'triangle') {
            const isOccupied = occupiedEdges?.has(`${source.tId}-${source.index}`) || false;
            if (isOccupied) {
              setInteraction({ type: 'IDLE' });
              return;
            }
            if (onAddAttachedTriangle) {
              onAddAttachedTriangle(source.tId, source.index, sideLeft, sideRight, placeOnLeft);
            }
          } else if (source.kind === 'standalone') {
            if (onAddTriangleFromEdge) {
              onAddTriangleFromEdge(source.edgeId, sideLeft, sideRight, placeOnLeft);
            }
          }
        }
        setInteraction({ type: 'IDLE' });
      } else if (currentInteraction.type === 'DRAWING_EDGE') {
        const { startPoint, currentMouse } = currentInteraction;
        if (onAddStandaloneEdge) {
          const snappedMouse = applySnap(currentMouse, [startPoint]);
          const len = distance(startPoint, snappedMouse);
          if (len > 0.1) {
            onAddStandaloneEdge(startPoint, snappedMouse);
          }
        }
        setInteraction({ type: 'IDLE' });
      }
    };

    // Use setTimeout to avoid capturing the double-click that started the mode
    const timer = setTimeout(() => {
      window.addEventListener('click', handleGlobalClick);
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleGlobalClick);
    };
  }, [interaction.type, addLog, applySnap, onAddAttachedTriangle, onAddStandaloneEdge, onAddTriangleFromEdge, occupiedEdges]);

  // Long press handlers
  const startLongPress = useCallback((type: 'triangle' | 'edge', id: string) => {
    // Clear any existing timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    // Start progress animation
    setLongPressTarget({ type, id, progress: 0 });

    // Animate progress
    const startTime = Date.now();
    const animateProgress = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / LONG_PRESS_DURATION, 1);

      if (progress < 1) {
        setLongPressTarget({ type, id, progress });
        longPressTimerRef.current = window.setTimeout(animateProgress, 16); // ~60fps
      } else {
        // Long press completed - show confirmation dialog
        setLongPressTarget(null);
        if (type === 'triangle') {
          const t = triangles.find(tri => tri.id === id);
          setDeleteConfirm({ type, id, name: t?.name || 'Triangle' });
        } else if (type === 'edge') {
          setDeleteConfirm({ type, id, name: 'Edge' });
        }
        setDeleteInput('');
      }
    };

    longPressTimerRef.current = window.setTimeout(animateProgress, 16);
  }, [triangles]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setLongPressTarget(null);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Enter root placing mode when rootPlacingMode is set
  useEffect(() => {
    if (rootPlacingMode) {
      setInteraction({
        type: 'ROOT_PLACING_ORIGIN',
        sideA: rootPlacingMode.sideA,
        sideB: rootPlacingMode.sideB,
        sideC: rootPlacingMode.sideC,
        currentMouse: { id: generateId(), x: 0, y: 0 }
      });
    } else {
      // Cancel placing mode if rootPlacingMode becomes null
      if (interaction.type === 'ROOT_PLACING_ORIGIN' || interaction.type === 'ROOT_PLACING_ANGLE') {
        setInteraction({ type: 'IDLE' });
      }
    }
  }, [rootPlacingMode]);

  // Convert model coordinates to stage (screen) coordinates
  // Uses the coordinate system framework with Y-axis flip
  const worldToStage = useCallback((modelX: number, modelY: number): { x: number; y: number } => {
    return modelToScreen({ x: modelX, y: modelY }, viewport);
  }, [viewport]);

  // Convert stage (screen) coordinates to model coordinates
  const stageToWorld = useCallback((screenX: number, screenY: number): { x: number; y: number } => {
    return screenToModel({ x: screenX, y: screenY }, viewport);
  }, [viewport]);

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
        const scaleX = rect.width / VIRTUAL_WIDTH;
        const scaleY = rect.height / VIRTUAL_HEIGHT;
        const initialScale = Math.min(scaleX, scaleY) * 0.9;
        setStageScale(initialScale);

        // Center the view
        const centerX = rect.width / 2 - (VIRTUAL_WIDTH * initialScale) / 2;
        const centerY = rect.height / 2 - (VIRTUAL_HEIGHT * initialScale) / 2;
        setStagePosition({ x: centerX, y: centerY });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    addLog(`[Stage mouseDown] type=${interaction.type}`);
    if (e.evt.button === 0 && !editingDim) {
      // If in root placing origin mode, set the origin
      if (interaction.type === 'ROOT_PLACING_ORIGIN') {
        const origin = getWorldPoint(e);
        const snappedOrigin = applySnap(origin, []);
        setInteraction({
          type: 'ROOT_PLACING_ANGLE',
          sideA: interaction.sideA,
          sideB: interaction.sideB,
          sideC: interaction.sideC,
          origin: snappedOrigin,
          currentMouse: snappedOrigin
        });
        return;
      }
      // If in root placing angle mode, complete the placement
      if (interaction.type === 'ROOT_PLACING_ANGLE') {
        const { origin, currentMouse, sideA } = interaction;
        // Calculate angle from origin to currentMouse
        const dx = currentMouse.x - origin.x;
        const dy = currentMouse.y - origin.y;
        const angle = Math.atan2(dy, dx);
        if (onRootPlacingComplete) {
          onRootPlacingComplete(origin, angle);
        }
        setInteraction({ type: 'IDLE' });
        return;
      }
      // If in phantom placing mode, confirm the triangle on click
      if (interaction.type === 'PHANTOM_PLACING') {
        addLog('[PHANTOM confirm] processing...');
        const { p1, p2, currentMouse, source } = interaction;
        const snappedMouse = applySnap(currentMouse, [p1, p2]);
        const sideLeft = distance(p1, snappedMouse);
        const sideRight = distance(p2, snappedMouse);
        const placeOnLeft = shouldPlaceOnLeft(p1, p2, snappedMouse);
        addLog(`[PHANTOM confirm] L=${sideLeft.toFixed(2)} R=${sideRight.toFixed(2)} source=${source.kind}`);

        if (sideLeft > 0 && sideRight > 0) {
          if (source.kind === 'triangle') {
            const isOccupied = occupiedEdges?.has(`${source.tId}-${source.index}`) || false;
            addLog(`[PHANTOM confirm] occupied=${isOccupied}`);
            if (isOccupied) {
              setInteraction({ type: 'IDLE' });
              return;
            }
            if (onAddAttachedTriangle) {
              addLog('[PHANTOM confirm] calling onAddAttachedTriangle');
              onAddAttachedTriangle(source.tId, source.index, sideLeft, sideRight, placeOnLeft);
            } else {
              addLog('[PHANTOM confirm] NO CALLBACK (triangle)');
            }
          } else if (source.kind === 'standalone') {
            if (onAddTriangleFromEdge) {
              addLog('[PHANTOM confirm] calling onAddTriangleFromEdge');
              onAddTriangleFromEdge(source.edgeId, sideLeft, sideRight, placeOnLeft);
            } else {
              addLog('[PHANTOM confirm] NO CALLBACK (standalone)');
            }
          }
        } else {
          addLog('[PHANTOM confirm] SKIPPED - invalid sides');
        }
        setInteraction({ type: 'IDLE' });
        return;
      }
      // If in vertex reshaping mode, confirm the reshape on click
      if (interaction.type === 'VERTEX_RESHAPING') {
        if (onVertexReshape) {
          const { p1, p2, currentMouse, tId } = interaction;
          // Apply snap (exclude base edge points)
          const snappedMouse = applySnap(currentMouse, [p1, p2]);
          const sideLeft = distance(p1, snappedMouse);
          const sideRight = distance(p2, snappedMouse);
          const placeOnLeft = shouldPlaceOnLeft(p1, p2, snappedMouse);
          if (sideLeft > 0 && sideRight > 0) {
            onVertexReshape(tId, sideLeft, sideRight, placeOnLeft);
          }
        }
        setInteraction({ type: 'IDLE' });
        return;
      }
      // If drawing edge, confirm on click
      if (interaction.type === 'DRAWING_EDGE') {
        if (onAddStandaloneEdge) {
          const { startPoint, currentMouse } = interaction;
          // Apply snap (exclude start point)
          const snappedMouse = applySnap(currentMouse, [startPoint]);
          const len = distance(startPoint, snappedMouse);
          if (len > 0.1) {
            onAddStandaloneEdge(startPoint, snappedMouse);
          }
        }
        setInteraction({ type: 'IDLE' });
        return;
      }
      // If extending edge, confirm on click
      if (interaction.type === 'EXTENDING_EDGE') {
        if (onAddStandaloneEdge) {
          const { fromPoint, currentMouse } = interaction;
          // Apply snap (exclude from point)
          const snappedMouse = applySnap(currentMouse, [fromPoint]);
          const len = distance(fromPoint, snappedMouse);
          if (len > 0.1) {
            onAddStandaloneEdge(fromPoint, snappedMouse);
          }
        }
        setInteraction({ type: 'IDLE' });
        return;
      }
      setInteraction({ type: 'PAN_READY', startX: e.evt.clientX, startY: e.evt.clientY });
    }
  };

  // Double click on background to start drawing an edge
  // This is called from the background Rect, not Stage, to avoid intercepting other element events
  const handleBackgroundDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Only handle if click target is the background rect itself
    const targetName = e.target.name();
    addLog(`[Background dblClick] target=${targetName}`);
    if (targetName !== 'background-rect') return;

    // Allow adding edges anytime
    const startPoint = getWorldPoint(e);
    addLog(`[Background dblClick] -> DRAWING_EDGE`);
    setInteraction({ type: 'DRAWING_EDGE', startPoint, currentMouse: startPoint });
  };

  const handleEdgeMouseDown = (e: Konva.KonvaEventObject<MouseEvent>, tId: string, index: 0 | 1 | 2, p1: Point, p2: Point) => {
    e.evt.stopPropagation();
    // Don't interrupt placing/drawing modes
    if (isPlacingMode(interaction)) return;
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
      // Dragging on edge no longer creates triangle - switch to panning instead
      const dist = Math.sqrt(Math.pow(e.evt.clientX - interaction.startX, 2) + Math.pow(e.evt.clientY - interaction.startY, 2));
      if (dist > 5) {
        setInteraction({ type: 'PANNING', lastX: e.evt.clientX, lastY: e.evt.clientY });
      }
    } else if (interaction.type === 'PHANTOM_PLACING') {
      const currentMouse = getWorldPoint(e);
      setInteraction({ ...interaction, currentMouse });
    } else if (interaction.type === 'VERTEX_RESHAPING') {
      const currentMouse = getWorldPoint(e);
      setInteraction({ ...interaction, currentMouse });
    } else if (interaction.type === 'DRAWING_EDGE') {
      const currentMouse = getWorldPoint(e);
      setInteraction({ ...interaction, currentMouse });
    } else if (interaction.type === 'EXTENDING_EDGE') {
      const currentMouse = getWorldPoint(e);
      setInteraction({ ...interaction, currentMouse });
    } else if (interaction.type === 'ROOT_PLACING_ORIGIN') {
      const currentMouse = getWorldPoint(e);
      setInteraction({ ...interaction, currentMouse });
    } else if (interaction.type === 'ROOT_PLACING_ANGLE') {
      const currentMouse = getWorldPoint(e);
      setInteraction({ ...interaction, currentMouse });
    }
  };

  const handleMouseUp = () => {
    // Don't reset interaction for placing/drawing modes - they need to persist until confirmed
    if (interaction.type === 'ROOT_PLACING_ORIGIN' ||
        interaction.type === 'ROOT_PLACING_ANGLE' ||
        interaction.type === 'PHANTOM_PLACING' ||
        interaction.type === 'VERTEX_RESHAPING' ||
        interaction.type === 'DRAWING_EDGE' ||
        interaction.type === 'EXTENDING_EDGE') {
      return;
    }

    if (interaction.type === 'EDGE_READY') {
      // Single click on edge - select the edge only (no triangle creation)
      onEdgeSelect(interaction.tId, interaction.index);
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

    const delta = e.evt.deltaY;
    const scaleBy = 1 - delta * ZOOM_SENSITIVITY;
    const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldScale * scaleBy));

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

    if (newScale < ZOOM_MIN || newScale > ZOOM_MAX) return;

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
    const scaleX = rect.width / VIRTUAL_WIDTH;
    const scaleY = rect.height / VIRTUAL_HEIGHT;
    const initialScale = Math.min(scaleX, scaleY) * 0.9;
    setStageScale(initialScale);

    const centerX = rect.width / 2 - (VIRTUAL_WIDTH * initialScale) / 2;
    const centerY = rect.height / 2 - (VIRTUAL_HEIGHT * initialScale) / 2;
    setStagePosition({ x: centerX, y: centerY });
  };

  const handleLabelClick = (tId: string, index: 0 | 1 | 2, currentLen: number, label: string, labelX: number, labelY: number, angle: number, fontSize: number) => {
    if (label === 'Ref') return;
    setEditingDim({ tId, index, value: currentLen.toFixed(2), originalValue: currentLen, label: label || '' });
    setEditingEdgeDim(null); // Clear edge editing if any

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

  const handleEdgeLabelClick = (edgeId: string, currentLen: number, labelX: number, labelY: number, fontSize: number) => {
    setEditingEdgeDim({ edgeId, value: currentLen.toFixed(2), originalValue: currentLen });
    setEditingDim(null); // Clear triangle dim editing if any

    // Convert Konva stage coordinates to HTML screen coordinates
    if (stageRef.current && containerRef.current) {
      const stage = stageRef.current;
      const containerRect = containerRef.current.getBoundingClientRect();

      const stageX = (labelX * stage.scaleX()) + stage.x();
      const stageY = (labelY * stage.scaleY()) + stage.y();

      setEditingInputPos({
        x: containerRect.left + stageX,
        y: containerRect.top + stageY,
        angle: 0,
        fontSize: fontSize * stage.scaleX()
      });
    }
  };

  const commitEdit = () => {
    // Handle triangle dimension edit
    if (editingDim && onDimensionChange) {
      const val = parseFloat(editingDim.value);
      if (!isNaN(val) && val > 0) {
        onDimensionChange(editingDim.tId, editingDim.index, val);
      }
      setEditingDim(null);
      setEditingInputPos(null);
      return;
    }

    // Handle standalone edge dimension edit
    if (editingEdgeDim && onUpdateStandaloneEdgeLength) {
      const val = parseFloat(editingEdgeDim.value);
      if (!isNaN(val) && val > 0) {
        onUpdateStandaloneEdgeLength(editingEdgeDim.edgeId, val);
      }
      setEditingEdgeDim(null);
      setEditingInputPos(null);
      return;
    }

    setEditingDim(null);
    setEditingEdgeDim(null);
    setEditingInputPos(null);
  };

  // Render Grid with background rect for double-click handling
  const renderGrid = () => {
    const { minX, minY, width, height } = viewport.modelBounds;
    const step = 1;
    const startX = Math.floor(minX / step) * step;
    const startY = Math.floor(minY / step) * step;
    const endX = minX + width;
    const endY = minY + height;

    const topLeft = worldToStage(minX, minY);
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
        onDblClick={handleBackgroundDblClick}
      />
    );

    for (let x = startX; x <= endX; x += step) {
      const sp1 = worldToStage(x, minY);
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
      const sp1 = worldToStage(minX, y);
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
    return elements;
  };

  // Render Edge with label
  const renderEdge = (
    t: RenderedTriangle,
    pStart: Point,
    pEnd: Point,
    index: 0 | 1 | 2
  ) => {
    const isSelectedEdge = selectedEdge?.type === 'triangle' && selectedEdge.triangleId === t.id && selectedEdge.edgeIndex === index;
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

    // Calculate angle for label rotation using utility function
    const dx = pEnd.x - pStart.x;
    const dy = pEnd.y - pStart.y;
    const angle = calculateNormalizedAngle(dx, dy);

    // Calculate font size based on world-to-screen scale
    const uiScale = (viewport.modelBounds.width / 50) * (stageRef.current?.scaleX() || 1);
    const fontSize = Math.max(8, 0.8 * uiScale);

    // Calculate text for label
    const labelText = len;

    // Estimate text width (monospace: ~0.6 * fontSize per character)
    const charWidth = fontSize * 0.6;
    const labelWidth = labelText.length * charWidth;

    return (
      <Group key={`edge-${t.id}-${index}`}>
        {/* Hit Area & Drag Trigger - skip for Ref edges to not block parent's label */}
        {edgeLabel !== 'Ref' && (
          <Line
            points={[sp1.x, sp1.y, sp2.x, sp2.y]}
            stroke="transparent"
            strokeWidth={Math.max(20, 30 / (stageRef.current?.scaleX() || 1))}
            lineCap="round"
            onClick={(e) => {
              if (isPlacingMode(interaction)) return;
              e.evt.stopPropagation();
              e.cancelBubble = true;
              onEdgeSelect(t.id, index);
            }}
            onMouseDown={(e) => {
              addLog(`[Edge mouseDown] type=${interaction.type} placing=${isPlacingMode(interaction)}`);
              if (isPlacingMode(interaction)) {
                addLog('[Edge mouseDown] placing mode - bubbling to Stage');
                return;
              }
              e.evt.stopPropagation();
              e.cancelBubble = true;
              handleEdgeMouseDown(e, t.id, index, pStart, pEnd);
            }}
            onDblClick={(e) => {
              addLog(`[Edge dblClick] edge=${index} occupied=${isOccupied}`);
              e.evt.stopPropagation();
              e.cancelBubble = true;
              if (!isOccupied) {
                const currentMouse = getWorldPoint(e);
                addLog(`[Edge dblClick] -> PHANTOM_PLACING (triangle)`);
                setInteraction({
                  type: 'PHANTOM_PLACING',
                  source: { kind: 'triangle', tId: t.id, index },
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
          stroke="rgba(0,0,0,0.2)"
          strokeWidth={1}
          dash={[8, 8]}
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
              onClick={() => handleLabelClick(t.id, index, rawLen, edgeLabel, labelPos.x, labelPos.y, angle, fontSize)}
            />
          </Group>
        ) : null}
      </Group>
    );
  };

  // Render Triangle Fill only (for bottom layer)
  const renderTriangleFill = (t: RenderedTriangle) => {
    const isSelected = selectedTriangleId === t.id;
    const isEditingAnyEdge = editingDim?.tId === t.id;
    const isLongPressing = longPressTarget?.type === 'triangle' && longPressTarget?.id === t.id;

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
        fill={isLongPressing ? "#ef4444" : "#94a3b8"}
        opacity={isLongPressing ? (0.2 + longPressTarget!.progress * 0.4) : (isEditingAnyEdge ? 0.1 : (isSelected ? 0.4 : 0.2))}
        stroke={isLongPressing ? "#ef4444" : "#64748b"}
        strokeWidth={isSelected || isLongPressing ? 2 : 1}
        onMouseDown={(e) => {
          if (isPlacingMode(interaction)) return;
          if (e.evt.button === 0) {
            startLongPress('triangle', t.id);
          }
        }}
        onMouseUp={() => {
          cancelLongPress();
        }}
        onMouseLeave={() => {
          cancelLongPress();
        }}
        onClick={() => {
          cancelLongPress();
          if (isPlacingMode(interaction)) return;
          onSelectTriangle(t.id);
        }}
      />
    );
  };

  // Render a vertex marker (for extending edges from triangle vertices)
  const renderVertexMarker = (point: Point, triangleId: string) => {
    const sp = worldToStage(point.x, point.y);
    const uiScale = (viewport.modelBounds.width / 50) * (stageRef.current?.scaleX() || 1);
    const radius = Math.max(4, 0.4 * uiScale);

    return (
      <Circle
        key={`vertex-${triangleId}-${point.id}`}
        x={sp.x}
        y={sp.y}
        radius={radius}
        fill="#64748b"
        stroke="white"
        strokeWidth={1}
        opacity={0.7}
        onDblClick={(e) => {
          e.evt.stopPropagation();
          // Start extending edge from this vertex
          setInteraction({
            type: 'EXTENDING_EDGE',
            fromEdgeId: triangleId, // Using triangle ID as reference
            fromPoint: point,
            currentMouse: point
          });
        }}
      />
    );
  };

  // Render Triangle Labels (edges and centroid label) - for top layer
  const renderTriangleLabels = (t: RenderedTriangle) => {
    const centroid = getCentroid(t);
    const labelPos = worldToStage(centroid.x, centroid.y);

    // Calculate font size based on world-to-screen scale
    const uiScale = (viewport.modelBounds.width / 50) * (stageRef.current?.scaleX() || 1);
    const fontSize = Math.max(10, 1.2 * uiScale);

    return (
      <Group key={`labels-${t.id}`}>
        {/* Edges */}
        {renderEdge(t, t.p1, t.p2, 0)}
        {renderEdge(t, t.p2, t.p3, 1)}
        {renderEdge(t, t.p3, t.p1, 2)}
        {/* Vertex markers for extending edges */}
        {renderVertexMarker(t.p1, t.id)}
        {renderVertexMarker(t.p2, t.id)}
        {renderVertexMarker(t.p3, t.id)}
        {/* Triangle Number in Circle */}
        <Group
          x={labelPos.x}
          y={labelPos.y}
          onDblClick={(e) => {
            e.evt.stopPropagation();
            // Enter vertex reshaping mode
            setInteraction({
              type: 'VERTEX_RESHAPING',
              tId: t.id,
              p1: t.p1,
              p2: t.p2,
              currentMouse: t.p3
            });
          }}
        >
          <Circle
            x={0}
            y={0}
            radius={fontSize * 0.7}
            fill={selectedTriangleId === t.id ? "#fef08a" : "white"}
            stroke={selectedTriangleId === t.id ? "#facc15" : "#3b82f6"}
            strokeWidth={selectedTriangleId === t.id ? 3 : 2}
            opacity={0.9}
          />
          <Text
            x={0}
            y={0}
            text={t.name.replace(/\D/g, '')}
            fontSize={fontSize * 0.8}
            fontStyle="bold"
            fill={selectedTriangleId === t.id ? "#ca8a04" : "#3b82f6"}
            offsetX={t.name.replace(/\D/g, '').length * fontSize * 0.24}
            offsetY={fontSize * 0.4}
          />
        </Group>
      </Group>
    );
  };

  // Render selected edge highlight (separate layer for visibility)
  const renderSelectedEdgeHighlight = () => {
    if (!selectedEdge) return null;

    let p1: Point, p2: Point;

    if (selectedEdge.type === 'triangle') {
      const t = triangles.find(tri => tri.id === selectedEdge.triangleId);
      if (!t) return null;

      if (selectedEdge.edgeIndex === 0) {
        p1 = t.p1; p2 = t.p2;
      } else if (selectedEdge.edgeIndex === 1) {
        p1 = t.p2; p2 = t.p3;
      } else {
        p1 = t.p3; p2 = t.p1;
      }
    } else if (selectedEdge.type === 'standalone') {
      const edge = standaloneEdges.find(e => e.id === selectedEdge.edgeId);
      if (!edge) return null;
      p1 = edge.p1;
      p2 = edge.p2;
    } else {
      return null;
    }

    const sp1 = worldToStage(p1.x, p1.y);
    const sp2 = worldToStage(p2.x, p2.y);

    return (
      <Group key="selected-edge-highlight">
        {/* Outer glow */}
        <Line
          points={[sp1.x, sp1.y, sp2.x, sp2.y]}
          stroke="#fde047"
          strokeWidth={12}
          lineCap="round"
          opacity={0.6}
        />
        {/* Inner highlight */}
        <Line
          points={[sp1.x, sp1.y, sp2.x, sp2.y]}
          stroke="#facc15"
          strokeWidth={6}
          lineCap="round"
        />
      </Group>
    );
  };

  // Render standalone edges
  const renderStandaloneEdge = (edge: StandaloneEdge) => {
    const sp1 = worldToStage(edge.p1.x, edge.p1.y);
    const sp2 = worldToStage(edge.p2.x, edge.p2.y);
    const midX = (sp1.x + sp2.x) / 2;
    const midY = (sp1.y + sp2.y) / 2;

    const uiScale = (viewport.modelBounds.width / 50) * (stageRef.current?.scaleX() || 1);
    const fontSize = Math.max(8, 0.8 * uiScale);
    const lenText = edge.length.toFixed(2);
    const charWidth = fontSize * 0.6;
    const textWidth = lenText.length * charWidth;
    const endpointRadius = Math.max(4, fontSize * 0.4);

    const isLongPressing = longPressTarget?.type === 'edge' && longPressTarget?.id === edge.id;
    const isSelected = selectedEdge?.type === 'standalone' && selectedEdge.edgeId === edge.id;

    return (
      <Group key={`standalone-${edge.id}`}>
        {/* Hit area for click (select), double-click (create triangle), and long press (delete) */}
        <Line
          points={[sp1.x, sp1.y, sp2.x, sp2.y]}
          stroke="transparent"
          strokeWidth={Math.max(20, 30 / (stageRef.current?.scaleX() || 1))}
          lineCap="round"
          onClick={(e) => {
            if (isPlacingMode(interaction)) return;
            e.evt.stopPropagation();
            e.cancelBubble = true;
            if (onStandaloneEdgeSelect) {
              onStandaloneEdgeSelect(edge.id);
            }
          }}
          onMouseDown={(e) => {
            if (isPlacingMode(interaction)) return; // Let event bubble to Stage
            e.evt.stopPropagation();
            e.cancelBubble = true;
            if (e.evt.button === 0) {
              startLongPress('edge', edge.id);
            }
          }}
          onMouseUp={() => {
            cancelLongPress();
          }}
          onMouseLeave={() => {
            cancelLongPress();
          }}
          onDblClick={(e) => {
            cancelLongPress();
            e.evt.stopPropagation();
            addLog(`[StandaloneEdge dblClick] -> PHANTOM_PLACING (standalone)`);
            // Enter triangle placing mode from this edge
            setInteraction({
              type: 'PHANTOM_PLACING',
              source: { kind: 'standalone', edgeId: edge.id },
              p1: edge.p1,
              p2: edge.p2,
              currentMouse: { id: generateId(), x: (edge.p1.x + edge.p2.x) / 2, y: edge.p1.y - 2 }
            });
          }}
        />
        {/* Selection highlight - render before visible edge */}
        {isSelected && (
          <>
            <Line
              points={[sp1.x, sp1.y, sp2.x, sp2.y]}
              stroke="#fde047"
              strokeWidth={12}
              lineCap="round"
              opacity={0.6}
            />
            <Line
              points={[sp1.x, sp1.y, sp2.x, sp2.y]}
              stroke="#facc15"
              strokeWidth={6}
              lineCap="round"
            />
          </>
        )}
        {/* Visible edge */}
        <Line
          points={[sp1.x, sp1.y, sp2.x, sp2.y]}
          stroke={isLongPressing ? "#ef4444" : "#3b82f6"}
          strokeWidth={isLongPressing ? 3 : (isSelected ? 3 : 2)}
          opacity={isLongPressing ? (0.5 + longPressTarget!.progress * 0.5) : 1}
        />
        {/* Endpoint 1 - double-click to extend */}
        <Circle
          x={sp1.x}
          y={sp1.y}
          radius={endpointRadius}
          fill="#3b82f6"
          stroke="white"
          strokeWidth={2}
          onDblClick={(e) => {
            e.evt.stopPropagation();
            // Start extending from this endpoint
            setInteraction({
              type: 'EXTENDING_EDGE',
              fromEdgeId: edge.id,
              fromPoint: edge.p1,
              currentMouse: edge.p1
            });
          }}
        />
        {/* Endpoint 2 - double-click to extend */}
        <Circle
          x={sp2.x}
          y={sp2.y}
          radius={endpointRadius}
          fill="#3b82f6"
          stroke="white"
          strokeWidth={2}
          onDblClick={(e) => {
            e.evt.stopPropagation();
            // Start extending from this endpoint
            setInteraction({
              type: 'EXTENDING_EDGE',
              fromEdgeId: edge.id,
              fromPoint: edge.p2,
              currentMouse: edge.p2
            });
          }}
        />
        {/* Length label - clickable to edit */}
        {editingEdgeDim?.edgeId !== edge.id && (
          <Text
            x={midX}
            y={midY}
            text={lenText}
            fontSize={fontSize}
            fontFamily="monospace"
            fontStyle="bold"
            fill="#3b82f6"
            fillAfterStrokeEnabled={true}
            stroke="white"
            strokeWidth={3}
            offsetX={textWidth / 2}
            offsetY={fontSize / 2 + fontSize}
            onClick={() => handleEdgeLabelClick(edge.id, edge.length, midX, midY - fontSize, fontSize)}
          />
        )}
      </Group>
    );
  };

  // Render edge drawing ghost (for both new edge and extending edge)
  const renderEdgeDrawingGhost = () => {
    let startPoint: Point, currentMouse: Point;

    if (interaction.type === 'DRAWING_EDGE') {
      startPoint = interaction.startPoint;
      currentMouse = interaction.currentMouse;
    } else if (interaction.type === 'EXTENDING_EDGE') {
      startPoint = interaction.fromPoint;
      currentMouse = interaction.currentMouse;
    } else {
      return null;
    }

    // Apply snap for visual feedback
    const snappedMouse = applySnap(currentMouse, [startPoint]);
    const isSnapping = snappedMouse !== currentMouse;

    const sp1 = worldToStage(startPoint.x, startPoint.y);
    const sp2 = worldToStage(snappedMouse.x, snappedMouse.y);
    const len = distance(startPoint, snappedMouse).toFixed(2);

    const uiScale = (viewport.modelBounds.width / 50) * (stageRef.current?.scaleX() || 1);
    const fontSize = Math.max(8, 0.8 * uiScale);
    const charWidth = fontSize * 0.6;
    const textWidth = len.length * charWidth;
    const snapRadius = Math.max(6, fontSize * 0.5);

    return (
      <Group>
        <Line
          points={[sp1.x, sp1.y, sp2.x, sp2.y]}
          stroke="#3b82f6"
          strokeWidth={2}
          dash={[4, 4]}
        />
        {/* Snap indicator */}
        {isSnapping && (
          <Circle
            x={sp2.x}
            y={sp2.y}
            radius={snapRadius}
            fill="transparent"
            stroke="#22c55e"
            strokeWidth={2}
          />
        )}
        <Text
          x={(sp1.x + sp2.x) / 2}
          y={(sp1.y + sp2.y) / 2}
          text={len}
          fontSize={fontSize}
          fill="#3b82f6"
          fillAfterStrokeEnabled={true}
          stroke="white"
          strokeWidth={2}
          offsetX={textWidth / 2}
          offsetY={fontSize / 2}
        />
      </Group>
    );
  };

  // Render Drag Ghost (for EDGE_DRAGGING, PHANTOM_PLACING, VERTEX_RESHAPING)
  const renderDragGhost = () => {
    if (interaction.type !== 'EDGE_DRAGGING' && interaction.type !== 'PHANTOM_PLACING' && interaction.type !== 'VERTEX_RESHAPING') return null;
    const { p1, p2, currentMouse } = interaction;

    // Apply snap for visual feedback (exclude base edge points)
    const snappedMouse = applySnap(currentMouse, [p1, p2]);
    const isSnapping = snappedMouse !== currentMouse;

    const sp1 = worldToStage(p1.x, p1.y);
    const sp2 = worldToStage(p2.x, p2.y);
    const sp3 = worldToStage(snappedMouse.x, snappedMouse.y);

    const sL = distance(p1, snappedMouse).toFixed(2);
    const sR = distance(p2, snappedMouse).toFixed(2);

    // Calculate font size based on world-to-screen scale
    const uiScale = (viewport.modelBounds.width / 50) * (stageRef.current?.scaleX() || 1);
    const fontSize = Math.max(8, 0.8 * uiScale);
    const snapRadius = Math.max(6, fontSize * 0.5);

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

        {/* Snap indicator */}
        {isSnapping && (
          <Circle
            x={sp3.x}
            y={sp3.y}
            radius={snapRadius}
            fill="transparent"
            stroke="#22c55e"
            strokeWidth={2}
          />
        )}

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

  // Render root triangle placement preview
  const renderRootPlacingPreview = () => {
    if (interaction.type !== 'ROOT_PLACING_ORIGIN' && interaction.type !== 'ROOT_PLACING_ANGLE') return null;

    const { sideA, sideB, sideC, currentMouse } = interaction;
    const uiScale = (viewport.modelBounds.width / 50) * (stageRef.current?.scaleX() || 1);
    const fontSize = Math.max(8, 0.8 * uiScale);
    const snapRadius = Math.max(6, fontSize * 0.5);

    // In ORIGIN mode, just show cursor indicator
    if (interaction.type === 'ROOT_PLACING_ORIGIN') {
      const snappedMouse = applySnap(currentMouse, []);
      const isSnapping = snappedMouse !== currentMouse;
      const sp = worldToStage(snappedMouse.x, snappedMouse.y);

      return (
        <Group>
          {/* Origin cursor indicator */}
          <Circle
            x={sp.x}
            y={sp.y}
            radius={snapRadius * 1.5}
            fill="#3b82f6"
            opacity={0.5}
          />
          {isSnapping && (
            <Circle
              x={sp.x}
              y={sp.y}
              radius={snapRadius * 2}
              fill="transparent"
              stroke="#22c55e"
              strokeWidth={2}
            />
          )}
          <Text
            x={sp.x}
            y={sp.y + snapRadius * 3}
            text="Click to set origin"
            fontSize={fontSize}
            fill="#3b82f6"
            fillAfterStrokeEnabled={true}
            stroke="white"
            strokeWidth={2}
            offsetX={fontSize * 5}
          />
        </Group>
      );
    }

    // In ANGLE mode, show triangle preview
    if (interaction.type === 'ROOT_PLACING_ANGLE') {
      const { origin } = interaction;

      // Calculate p2 position based on currentMouse direction
      const dx = currentMouse.x - origin.x;
      const dy = currentMouse.y - origin.y;
      const angle = Math.atan2(dy, dx);

      // p2 is at distance sideA from origin in the direction of angle
      const p1 = origin;
      const p2: Point = {
        id: 'p2',
        x: origin.x + sideA * Math.cos(angle),
        y: origin.y + sideA * Math.sin(angle)
      };

      // Calculate third vertex on LEFT side (same as recalculateGeometry for root triangles)
      const p3Result = calculateThirdVertex(p1, p2, sideB, sideC, true);

      if (!p3Result) {
        return null;
      }

      const p3: Point = { id: 'p3', x: p3Result.x, y: p3Result.y };

      const sp1 = worldToStage(p1.x, p1.y);
      const sp2 = worldToStage(p2.x, p2.y);
      const sp3 = worldToStage(p3.x, p3.y);

      // Also show angle line from origin to current mouse
      const smouse = worldToStage(currentMouse.x, currentMouse.y);

      return (
        <Group>
          {/* Direction line (faint) */}
          <Line
            points={[sp1.x, sp1.y, smouse.x, smouse.y]}
            stroke="#3b82f6"
            strokeWidth={1}
            dash={[4, 4]}
            opacity={0.5}
          />
          {/* Triangle preview */}
          <Shape
            sceneFunc={(context, shape) => {
              context.beginPath();
              context.moveTo(sp1.x, sp1.y);
              context.lineTo(sp2.x, sp2.y);
              context.lineTo(sp3.x, sp3.y);
              context.closePath();
              context.fillStrokeShape(shape);
            }}
            fill="#3b82f6"
            opacity={0.2}
            stroke="#3b82f6"
            strokeWidth={2}
          />
          {/* Side labels */}
          <Text
            x={(sp1.x + sp2.x) / 2}
            y={(sp1.y + sp2.y) / 2}
            text={`A: ${sideA}`}
            fontSize={fontSize}
            fill="#3b82f6"
            fillAfterStrokeEnabled={true}
            stroke="white"
            strokeWidth={2}
            offsetX={fontSize * 2}
            offsetY={fontSize}
          />
          <Text
            x={(sp1.x + sp3.x) / 2}
            y={(sp1.y + sp3.y) / 2}
            text={`B: ${sideB}`}
            fontSize={fontSize}
            fill="#3b82f6"
            fillAfterStrokeEnabled={true}
            stroke="white"
            strokeWidth={2}
            offsetX={fontSize * 2}
            offsetY={-fontSize * 0.5}
          />
          <Text
            x={(sp2.x + sp3.x) / 2}
            y={(sp2.y + sp3.y) / 2}
            text={`C: ${sideC}`}
            fontSize={fontSize}
            fill="#3b82f6"
            fillAfterStrokeEnabled={true}
            stroke="white"
            strokeWidth={2}
            offsetX={fontSize * 2}
            offsetY={-fontSize * 0.5}
          />
          {/* Instruction */}
          <Text
            x={sp1.x}
            y={sp1.y + snapRadius * 4}
            text="Click to place triangle"
            fontSize={fontSize}
            fill="#3b82f6"
            fillAfterStrokeEnabled={true}
            stroke="white"
            strokeWidth={2}
            offsetX={fontSize * 5.5}
          />
        </Group>
      );
    }

    return null;
  };

  const cursorStyle = interaction.type === 'PANNING' || interaction.type === 'EDGE_DRAGGING'
    ? 'grabbing'
    : (interaction.type === 'ROOT_PLACING_ORIGIN' || interaction.type === 'ROOT_PLACING_ANGLE')
    ? 'crosshair'
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
          {/* Render standalone edges */}
          {standaloneEdges.map((edge) => renderStandaloneEdge(edge))}
          {/* Render all triangle fills first (bottom layer) */}
          {triangles.map((t) => renderTriangleFill(t))}
          {/* Render selected edge highlight (above fills, below labels) */}
          {renderSelectedEdgeHighlight()}
          {/* Render all labels on top (so they're clickable) */}
          {triangles.map((t) => renderTriangleLabels(t))}
          {renderEdgeDrawingGhost()}
          {renderDragGhost()}
          {renderRootPlacingPreview()}
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

      <div className="absolute bottom-32 left-4 bg-white/80 backdrop-blur px-3 py-2 rounded shadow-sm text-[10px] text-slate-500 border border-slate-200 pointer-events-none">
        <p className="font-semibold mb-1">操作方法:</p>
        <p>• <span className="text-blue-600 font-bold">辺ダブルクリック</span>: 三角形を追加</p>
        <p>• <span className="text-blue-600 font-bold">寸法クリック</span>: 数値を編集</p>
        <p>• <span className="text-amber-600 font-bold">番号ダブルクリック</span>: 頂点を移動</p>
        <p>• <span className="text-slate-600 font-bold">長押し</span>: 削除</p>
        <p>• スクロール: ズーム / ドラッグ: パン</p>
      </div>

      {/* Debug Console */}
      <div className="absolute bottom-0 left-0 right-0 h-28 bg-slate-900 text-green-400 font-mono text-xs overflow-y-auto border-t border-slate-700">
        <div className="sticky top-0 bg-slate-800 px-2 py-1 flex justify-between items-center border-b border-slate-700">
          <span className="text-slate-400">Debug Console - interaction: <span className="text-yellow-400">{interaction.type}</span></span>
          <button
            onClick={() => setDebugLogs([])}
            className="text-slate-500 hover:text-white px-2"
          >
            Clear
          </button>
        </div>
        <div className="p-2 space-y-0.5">
          {debugLogs.map((log, i) => (
            <div key={i} className="whitespace-nowrap">{log}</div>
          ))}
          {debugLogs.length === 0 && <div className="text-slate-500">No logs yet...</div>}
        </div>
      </div>

      {/* HTML Input overlay for editing triangle dimensions */}
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

      {/* HTML Input overlay for editing standalone edge dimensions */}
      {editingEdgeDim && editingInputPos && (
        <div
          style={{
            position: 'fixed',
            left: `${editingInputPos.x}px`,
            top: `${editingInputPos.y}px`,
            transform: 'translate(-50%, -50%)',
            fontSize: `${editingInputPos.fontSize}px`,
            fontFamily: 'ui-monospace, monospace',
            fontWeight: '600',
            zIndex: 1000
          }}
        >
          <input
            type="text"
            inputMode="decimal"
            value={editingEdgeDim.value}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
                setEditingEdgeDim({...editingEdgeDim, value: value});
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditingEdgeDim(null);
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
              color: '#3b82f6',
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

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                <span className="text-slate-600 text-xl">🗑</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Delete {deleteConfirm.name}?</h3>
                <p className="text-sm text-slate-500">This action cannot be undone</p>
              </div>
            </div>

            {deleteConfirm.type === 'triangle' && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
                <p className="text-sm text-amber-700">
                  <strong>Note:</strong> All triangles connected to {deleteConfirm.name} will also be deleted.
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Type <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">del</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && deleteInput.toLowerCase() === 'del') {
                    if (deleteConfirm.type === 'triangle' && onDeleteTriangle) {
                      onDeleteTriangle(deleteConfirm.id);
                    } else if (deleteConfirm.type === 'edge' && onDeleteStandaloneEdge) {
                      onDeleteStandaloneEdge(deleteConfirm.id);
                    }
                    setDeleteConfirm(null);
                    setDeleteInput('');
                  } else if (e.key === 'Escape') {
                    setDeleteConfirm(null);
                  }
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                placeholder="del"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteInput.toLowerCase() === 'del') {
                    if (deleteConfirm.type === 'triangle' && onDeleteTriangle) {
                      onDeleteTriangle(deleteConfirm.id);
                    } else if (deleteConfirm.type === 'edge' && onDeleteStandaloneEdge) {
                      onDeleteStandaloneEdge(deleteConfirm.id);
                    }
                    setDeleteConfirm(null);
                    setDeleteInput('');
                  }
                }}
                disabled={deleteInput.toLowerCase() !== 'del'}
                className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
                  deleteInput.toLowerCase() === 'del'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeometryCanvas;
