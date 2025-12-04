import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Line, Text, Group, Shape, Rect, Circle } from 'react-konva';
import Konva from 'konva';
import { RenderedTriangle, ToolMode, Point, StandaloneEdge, EdgeSelection, getEdgePoints } from '../types';
import { getCentroid, distance, generateId, calculateThirdPoint } from '../utils/geometryUtils';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { GridBackground } from './canvas/GridBackground';
import { CanvasControls } from './ui/CanvasControls';
import { ContextMenu } from './ui/ContextMenu';
import { DeleteConfirmationDialog } from './ui/DeleteConfirmationDialog';
import { DebugConsole } from './ui/DebugConsole';
import { EdgeActionButton } from './ui/EdgeActionButton';
import { TriangleActionButton } from './ui/TriangleActionButton';
import { StandaloneEdgeActionButton } from './ui/StandaloneEdgeActionButton';
import { EntityDeleteFAB } from './ui/EntityDeleteFAB';
import { usePointer, GESTURE_CONSTANTS, PointerInfo } from '../hooks/usePointer';
import { clickHandlers, interactiveHandlers, ClickTapEvent } from '../hooks/useKonvaHandlers';

interface GeometryCanvasProps {
  triangles: RenderedTriangle[];
  mode: ToolMode;
  selectedTriangleId: string | null;
  onSelectTriangle: (id: string) => void;
  onEdgeSelect: (triangleId: string, edgeIndex: 0 | 1 | 2) => void;
  onEdgeDoubleClick: (triangleId: string, edgeIndex: 0 | 1 | 2) => void;
  onDimensionChange?: (triangleId: string, edgeIndex: 0 | 1 | 2, newValue: number) => boolean;
  onAddAttachedTriangle?: (triangleId: string, edgeIndex: 0 | 1 | 2, sideLeft: number, sideRight: number, flip: boolean) => void;
  onVertexReshape?: (triangleId: string, sideLeft: number, sideRight: number, flip: boolean) => void;
  onBackgroundClick?: () => void;
  selectedEdge: EdgeSelection | null;
  occupiedEdges?: Set<string>;
  standaloneEdges?: StandaloneEdge[];
  onStandaloneEdgeSelect?: (edgeId: string) => void;
  onAddStandaloneEdge?: (p1: Point, p2: Point) => void;
  onAddTriangleFromEdge?: (edgeId: string, sideLeft: number, sideRight: number, flip: boolean) => void;
  onDeleteTriangle?: (id: string) => void;
  onDeleteStandaloneEdge?: (id: string) => void;
  onDeleteMultiple?: (triangleIds: string[], edgeIds: string[]) => void;
  onUpdateStandaloneEdgeLength?: (id: string, newLength: number) => void;
  onMoveTriangles?: (ids: string[], dx: number, dy: number) => void;
  onMoveStandaloneEdges?: (ids: string[], dx: number, dy: number) => void;
  // Root triangle placement mode
  rootPlacingMode?: { sideA: number; sideB: number; sideC: number } | null;
  onRootPlacingComplete?: (origin: Point, angle: number) => void;
  onRootPlacingCancel?: () => void;
  // Edge editing mode (pencil button) - for edge creation and reshaping
  edgeEditMode?: boolean;
  onEdgeEditModeChange?: (active: boolean) => void;
  // Triangle editing mode (triangle button) - for triangle creation and reshaping
  triangleEditMode?: boolean;
  onTriangleEditModeChange?: (active: boolean) => void;
}

type InteractionState =
  | { type: 'IDLE' }
  | { type: 'PAN_READY'; startX: number; startY: number }
  | { type: 'PANNING'; lastX: number; lastY: number }
  | { type: 'SELECT_RECT'; startWorld: Point; currentWorld: Point }
  | { type: 'EDGE_READY'; tId: string; index: 0 | 1 | 2; p1: Point; p2: Point; startX: number; startY: number }

  | { type: 'PHANTOM_PLACING'; tId: string; index: 0 | 1 | 2; p1: Point; p2: Point; currentMouse: Point }
  | { type: 'VERTEX_RESHAPING'; tId: string; p1: Point; p2: Point; currentMouse: Point }
  | { type: 'DRAWING_EDGE'; startPoint: Point; currentMouse: Point }
  | { type: 'STANDALONE_EDGE_PLACING'; edgeId: string; p1: Point; p2: Point; currentMouse: Point }
  | { type: 'EXTENDING_EDGE'; fromEdgeId: string; fromPoint: Point; currentMouse: Point }
  | { type: 'ROOT_PLACING_ORIGIN'; sideA: number; sideB: number; sideC: number; currentMouse: Point }
  | { type: 'ROOT_PLACING_ANGLE'; sideA: number; sideB: number; sideC: number; origin: Point; currentMouse: Point }
  | { type: 'MOVING_SELECTION'; startWorld: Point; currentWorld: Point; targetIds: Set<string> };

// Context menu state
type ContextMenuState = {
  x: number;  // Screen coordinates
  y: number;
  targetType: 'triangle' | 'edge' | 'selection';
  targetId?: string;
} | null;

// Long press duration in milliseconds
const LONG_PRESS_DURATION = 300;

const GeometryCanvas: React.FC<GeometryCanvasProps> = ({
  triangles,
  mode,
  selectedTriangleId,
  onSelectTriangle,
  onEdgeSelect,
  onEdgeDoubleClick,
  onDimensionChange,
  onAddAttachedTriangle,
  onVertexReshape,
  onBackgroundClick,
  selectedEdge,
  occupiedEdges,
  standaloneEdges = [],
  onStandaloneEdgeSelect,
  onAddStandaloneEdge,
  onAddTriangleFromEdge,
  onDeleteTriangle,
  onDeleteStandaloneEdge,
  onDeleteMultiple,
  onUpdateStandaloneEdgeLength,
  onMoveTriangles,
  onMoveStandaloneEdges,
  rootPlacingMode,
  onRootPlacingComplete,
  onRootPlacingCancel,
  edgeEditMode = false,
  onEdgeEditModeChange,
  triangleEditMode = false,
  onTriangleEditModeChange
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  // Track if panning just ended to prevent accidental edge generation
  const panningJustEndedRef = useRef<boolean>(false);
  // Track if pointer is currently pressed down
  const isPointerDownRef = useRef<boolean>(false);

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

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
    addLog(`interaction -> ${interaction.type}`);
  }, [interaction.type, addLog]);

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

  // Snap threshold in world units
  const SNAP_THRESHOLD = 0.5;

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
    let nearestDist = SNAP_THRESHOLD;

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

  // Long press handlers - now opens context menu instead of delete dialog
  const startEntityLongPress = useCallback((type: 'triangle' | 'edge', id: string, screenX: number, screenY: number) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressStartPosRef.current = { x: screenX, y: screenY };

    longPressTimerRef.current = window.setTimeout(() => {
      // Show context menu on long press
      setContextMenu({ x: screenX, y: screenY, targetType: type, targetId: id });
      longPressTimerRef.current = null;
    }, LONG_PRESS_DURATION);
  }, []);

  // Long press on background - starts SELECT_RECT mode
  const startBackgroundLongPress = useCallback((screenX: number, screenY: number, worldPoint: Point) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressStartPosRef.current = { x: screenX, y: screenY };

    longPressTimerRef.current = window.setTimeout(() => {
      // Only start SELECT_RECT if pointer is still pressed down (click and hold)
      if (isPointerDownRef.current) {
        setInteraction({ type: 'SELECT_RECT', startWorld: worldPoint, currentWorld: worldPoint });
      }
      longPressTimerRef.current = null;
    }, LONG_PRESS_DURATION);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartPosRef.current = null;
  }, []);

  // Right-click handler for context menu
  const handleContextMenu = useCallback((e: React.MouseEvent | Konva.KonvaEventObject<MouseEvent>, type: 'triangle' | 'edge' | 'selection', id?: string) => {
    if ('evt' in e) {
      e.evt.preventDefault();
      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, targetType: type, targetId: id });
    } else {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, targetType: type, targetId: id });
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // ESC key cancels creation mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const creationModes = [
          'PHANTOM_PLACING',
          'VERTEX_RESHAPING',
          'DRAWING_EDGE',
          'STANDALONE_EDGE_PLACING',
          'EXTENDING_EDGE',
          'ROOT_PLACING_ORIGIN',
          'ROOT_PLACING_ANGLE'
        ];
        if (creationModes.includes(interaction.type)) {
          e.preventDefault();
          setInteraction({ type: 'IDLE' });
          // Also notify parent to cancel root placing mode if applicable
          if ((interaction.type === 'ROOT_PLACING_ORIGIN' || interaction.type === 'ROOT_PLACING_ANGLE') && onRootPlacingCancel) {
            onRootPlacingCancel();
          }
          // Exit edit modes on ESC
          if (edgeEditMode && onEdgeEditModeChange) {
            onEdgeEditModeChange(false);
          }
          if (triangleEditMode && onTriangleEditModeChange) {
            onTriangleEditModeChange(false);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [interaction.type, onRootPlacingCancel, edgeEditMode, onEdgeEditModeChange, triangleEditMode, onTriangleEditModeChange]);

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

  // Cancel creation modes when edit modes are turned off
  useEffect(() => {
    // Cancel edge-related modes when edge edit mode is turned off
    if (!edgeEditMode) {
      const edgeModes = ['DRAWING_EDGE', 'EXTENDING_EDGE'];
      if (edgeModes.includes(interaction.type)) {
        setInteraction({ type: 'IDLE' });
      }
    }
    // Cancel triangle-related modes when triangle edit mode is turned off
    if (!triangleEditMode) {
      const triangleModes = ['PHANTOM_PLACING', 'VERTEX_RESHAPING', 'STANDALONE_EDGE_PLACING'];
      if (triangleModes.includes(interaction.type)) {
        setInteraction({ type: 'IDLE' });
      }
    }
  }, [edgeEditMode, triangleEditMode, interaction.type]);

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

  // Get world point from stage event (supports both mouse and pointer events)
  const getWorldPoint = useCallback((evt: Konva.KonvaEventObject<any>): Point => {
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

  // Get world point from client coordinates
  const getWorldPointFromClient = useCallback((clientX: number, clientY: number): Point => {
    if (!stageRef.current || !containerRef.current) return { id: generateId(), x: 0, y: 0 };
    const stage = stageRef.current;
    const containerRect = containerRef.current.getBoundingClientRect();

    const pointerX = clientX - containerRect.left;
    const pointerY = clientY - containerRect.top;

    const stageX = (pointerX - stage.x()) / stage.scaleX();
    const stageY = (pointerY - stage.y()) / stage.scaleY();

    const world = stageToWorld(stageX, stageY);
    return { id: generateId(), x: world.x, y: world.y };
  }, [stageToWorld]);

  // Calculate bounding box of all entities
  const getEntitiesBounds = useCallback(() => {
    const allPoints: Point[] = [];

    // Collect all triangle vertices
    triangles.forEach(t => {
      allPoints.push(t.p1, t.p2, t.p3);
    });

    // Collect all standalone edge endpoints
    standaloneEdges.forEach(e => {
      allPoints.push(e.p1, e.p2);
    });

    if (allPoints.length === 0) {
      // No entities, return default bounds
      return null;
    }

    const xs = allPoints.map(p => p.x);
    const ys = allPoints.map(p => p.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Add padding
    const padding = Math.max(maxX - minX, maxY - minY) * 0.2 || 5;

    return {
      minX: minX - padding,
      maxX: maxX + padding,
      minY: minY - padding,
      maxY: maxY + padding,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2
    };
  }, [triangles, standaloneEdges]);

  // Track if this is the first render with entities
  const hasInitializedView = useRef(false);

  // Initialize stage size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setStageSize({ width: rect.width, height: rect.height });

        // Only set initial scale/position on first load
        if (!hasInitializedView.current) {
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
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Auto-center on entities when they first appear (initial load)
  useEffect(() => {
    if (hasInitializedView.current) return;
    if (triangles.length === 0 && standaloneEdges.length === 0) return;
    if (!containerRef.current) return;

    const bounds = getEntitiesBounds();
    if (!bounds) return;

    const rect = containerRef.current.getBoundingClientRect();

    // Calculate scale to fit entities
    const entityStageWidth = bounds.width * (1000 / worldBounds.w);
    const entityStageHeight = bounds.height * (800 / worldBounds.h);

    const scaleX = rect.width / entityStageWidth;
    const scaleY = rect.height / entityStageHeight;
    const fitScale = Math.min(scaleX, scaleY) * 0.8; // 80% to leave margin

    // Convert entity center to stage coordinates
    const centerStage = worldToStage(bounds.centerX, bounds.centerY);

    // Position stage so that entity center is at screen center
    const newX = rect.width / 2 - centerStage.x * fitScale;
    const newY = rect.height / 2 - centerStage.y * fitScale;

    setStageScale(fitScale);
    setStagePosition({ x: newX, y: newY });

    hasInitializedView.current = true;
  }, [triangles, standaloneEdges, getEntitiesBounds, worldToStage]);

  // Single click on background to start drawing an edge (legacy - for GridBackground)
  // This is called from the background Rect, not Stage, to avoid intercepting other element events
  const handleBackgroundClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Only handle if click target is the background rect itself
    const targetName = e.target.name();
    if (targetName !== 'background-rect') return;

    // パンニング操作が終了した直後はエッジ生成を開始しない
    if (panningJustEndedRef.current) {
      return;
    }

    // Only start edge drawing in edge edit mode
    if (edgeEditMode) {
      const startPoint = getWorldPoint(e);
      setInteraction({ type: 'DRAWING_EDGE', startPoint, currentMouse: startPoint });
    }
  };

  // Edge pointer down handler - works with both mouse and touch via pointer events
  const handleEdgePointerDown = (e: Konva.KonvaEventObject<PointerEvent>, tId: string, index: 0 | 1 | 2, p1: Point, p2: Point) => {
    e.evt.stopPropagation();
    if (!editingDim) {
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

  // Check if a triangle is inside a selection rectangle
  const isTriangleInRect = useCallback((t: RenderedTriangle, minX: number, maxX: number, minY: number, maxY: number): boolean => {
    // Check if centroid is inside rectangle
    const cx = (t.p1.x + t.p2.x + t.p3.x) / 3;
    const cy = (t.p1.y + t.p2.y + t.p3.y) / 3;
    return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
  }, []);

  // Check if a standalone edge is inside a selection rectangle
  const isEdgeInRect = useCallback((e: StandaloneEdge, minX: number, maxX: number, minY: number, maxY: number): boolean => {
    const cx = (e.p1.x + e.p2.x) / 2;
    const cy = (e.p1.y + e.p2.y) / 2;
    return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
  }, []);

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    // In edit modes, disable zoom operations
    if (edgeEditMode || triangleEditMode) {
      e.evt.preventDefault();
      e.evt.stopPropagation();
      return;
    }

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

  // ===========================================
  // Unified Pointer Event Handling
  // ===========================================

  // Pinch zoom state (managed by usePointer hook)
  const pinchBaseScaleRef = useRef<number>(1);
  const pinchBasePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Helper to check if we're in a creation mode
  const isInCreationMode = useCallback(() => {
    return interaction.type === 'PHANTOM_PLACING' ||
      interaction.type === 'VERTEX_RESHAPING' ||
      interaction.type === 'DRAWING_EDGE' ||
      interaction.type === 'STANDALONE_EDGE_PLACING' ||
      interaction.type === 'EXTENDING_EDGE' ||
      interaction.type === 'ROOT_PLACING_ORIGIN' ||
      interaction.type === 'ROOT_PLACING_ANGLE';
  }, [interaction.type]);

  // usePointer hook for unified gesture handling
  const pointerHandlers = usePointer({
    isInCreationMode,

    onPointerDown: useCallback((pointer: PointerInfo, target: Konva.Node, evt: PointerEvent, isDoubleTap?: boolean) => {
      // Mark pointer as pressed down
      isPointerDownRef.current = true;
      
      const targetName = target.name();
      addLog(`PointerDown: type=${pointer.pointerType}, target=${targetName}, doubleTap=${isDoubleTap}`);

      // Creation mode confirmation: on single tap (double tap is no longer used)
      const inCreationMode = interaction.type === 'PHANTOM_PLACING' ||
        interaction.type === 'VERTEX_RESHAPING' ||
        interaction.type === 'DRAWING_EDGE' ||
        interaction.type === 'STANDALONE_EDGE_PLACING' ||
        interaction.type === 'EXTENDING_EDGE' ||
        interaction.type === 'ROOT_PLACING_ORIGIN' ||
        interaction.type === 'ROOT_PLACING_ANGLE';

      // In creation mode: single tap confirms (double tap check removed)
      // Note: isDoubleTap parameter is kept for compatibility but not used

      // If in a creation mode, handle confirmation on next click
      if (interaction.type === 'MOVING_SELECTION') {
        const { startWorld, currentWorld, targetIds } = interaction;
        const dx = currentWorld.x - startWorld.x;
        const dy = currentWorld.y - startWorld.y;

        addLog(`MOVE CONFIRM: dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}, targets=${targetIds.size}`);

        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
          const triangleIds: string[] = [];
          const edgeIds: string[] = [];

          targetIds.forEach(id => {
            if (triangles.find(t => t.id === id)) {
              triangleIds.push(id);
            } else if (standaloneEdges.find(edge => edge.id === id)) {
              edgeIds.push(id);
            }
          });

          if (triangleIds.length > 0 && onMoveTriangles) {
            onMoveTriangles(triangleIds, dx, dy);
          }
          if (edgeIds.length > 0 && onMoveStandaloneEdges) {
            onMoveStandaloneEdges(edgeIds, dx, dy);
          }
        }

        setInteraction({ type: 'IDLE' });
        return;
      }

      // Handle ROOT_PLACING_ORIGIN
      if (interaction.type === 'ROOT_PLACING_ORIGIN') {
        const worldPoint = getWorldPointFromClient(pointer.clientX, pointer.clientY);
        const snappedOrigin = applySnap(worldPoint, []);
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

      // Handle ROOT_PLACING_ANGLE
      if (interaction.type === 'ROOT_PLACING_ANGLE') {
        const { origin, currentMouse } = interaction;
        const dx = currentMouse.x - origin.x;
        const dy = currentMouse.y - origin.y;
        const angle = Math.atan2(dy, dx);
        if (onRootPlacingComplete) {
          onRootPlacingComplete(origin, angle);
        }
        setInteraction({ type: 'IDLE' });
        return;
      }

      // Handle PHANTOM_PLACING confirmation
      if (interaction.type === 'PHANTOM_PLACING') {
        // Only allow confirmation in triangle edit mode
        if (!triangleEditMode) {
          setInteraction({ type: 'IDLE' });
          return;
        }
        if (onAddAttachedTriangle) {
          const { p1, p2, currentMouse, tId, index } = interaction;
          const isOccupied = occupiedEdges?.has(`${tId}-${index}`) || false;
          if (!isOccupied) {
            const snappedMouse = applySnap(currentMouse, [p1, p2]);
            const sideLeft = distance(p1, snappedMouse);
            const sideRight = distance(p2, snappedMouse);
            const flip = isFlipSide(p1, p2, snappedMouse);
            if (sideLeft > 0 && sideRight > 0) {
              onAddAttachedTriangle(tId, index, sideLeft, sideRight, flip);
            }
          }
        }
        setInteraction({ type: 'IDLE' });
        // Don't exit edge draw mode - keep it active
        return;
      }

      // Handle VERTEX_RESHAPING confirmation
      if (interaction.type === 'VERTEX_RESHAPING') {
        // Only allow confirmation in triangle edit mode
        if (!triangleEditMode) {
          setInteraction({ type: 'IDLE' });
          return;
        }
        if (onVertexReshape) {
          const { p1, p2, currentMouse, tId } = interaction;
          const snappedMouse = applySnap(currentMouse, [p1, p2]);
          const sideLeft = distance(p1, snappedMouse);
          const sideRight = distance(p2, snappedMouse);
          const flip = isFlipSide(p1, p2, snappedMouse);
          if (sideLeft > 0 && sideRight > 0) {
            onVertexReshape(tId, sideLeft, sideRight, flip);
          }
        }
        setInteraction({ type: 'IDLE' });
        // Don't exit edge draw mode - keep it active
        return;
      }

      // Handle DRAWING_EDGE confirmation
      if (interaction.type === 'DRAWING_EDGE') {
        // Only allow confirmation in edge edit mode
        if (!edgeEditMode) {
          setInteraction({ type: 'IDLE' });
          return;
        }
        if (onAddStandaloneEdge) {
          const { startPoint, currentMouse } = interaction;
          const snappedMouse = applySnap(currentMouse, [startPoint]);
          const len = distance(startPoint, snappedMouse);
          if (len > 0.1) {
            onAddStandaloneEdge(startPoint, snappedMouse);
          }
        }
        setInteraction({ type: 'IDLE' });
        // Don't exit edge draw mode automatically - keep it active until user explicitly toggles it
        return;
      }

      // Handle STANDALONE_EDGE_PLACING confirmation
      if (interaction.type === 'STANDALONE_EDGE_PLACING') {
        // Only allow confirmation in triangle edit mode
        if (!triangleEditMode) {
          setInteraction({ type: 'IDLE' });
          return;
        }
        if (onAddTriangleFromEdge) {
          const { edgeId, p1, p2, currentMouse } = interaction;
          const snappedMouse = applySnap(currentMouse, [p1, p2]);
          const sideLeft = distance(p1, snappedMouse);
          const sideRight = distance(p2, snappedMouse);
          const flip = isFlipSide(p1, p2, snappedMouse);
          if (sideLeft > 0 && sideRight > 0) {
            onAddTriangleFromEdge(edgeId, sideLeft, sideRight, flip);
          }
        }
        setInteraction({ type: 'IDLE' });
        // Don't exit edge draw mode - keep it active
        return;
      }

      // Handle EXTENDING_EDGE confirmation
      if (interaction.type === 'EXTENDING_EDGE') {
        // Only allow confirmation in edge edit mode
        if (!edgeEditMode) {
          setInteraction({ type: 'IDLE' });
          return;
        }
        if (onAddStandaloneEdge) {
          const { fromPoint, currentMouse } = interaction;
          const snappedMouse = applySnap(currentMouse, [fromPoint]);
          const len = distance(fromPoint, snappedMouse);
          if (len > 0.1) {
            onAddStandaloneEdge(fromPoint, snappedMouse);
          }
        }
        setInteraction({ type: 'IDLE' });
        return;
      }

      // Only start PAN_READY on background clicks, not on edges/triangles/etc.
      // This check is critical because React state updates are async - when an edge's
      // onPointerDown calls setInteraction, the state hasn't updated yet when Stage's
      // onPointerDown fires in the same event cycle.
      const isBackgroundClick = targetName === 'background-rect' || !targetName;
      if (!isBackgroundClick) {
        // Clicked on something (edge, triangle, etc.), don't start pan
        return;
      }

      // Edge edit mode: start DRAWING_EDGE on first tap
      // In edit modes, disable pan/zoom operations and only handle entity generation
      if (edgeEditMode || triangleEditMode) {
        // パンニング操作が終了した直後はエッジ生成を開始しない
        if (panningJustEndedRef.current) {
          return;
        }
        // Only start DRAWING_EDGE in edge edit mode
        if (edgeEditMode && interaction.type === 'IDLE') {
          const worldPoint = getWorldPointFromClient(pointer.clientX, pointer.clientY);
          const startPoint = applySnap(worldPoint, []);
          setInteraction({ type: 'DRAWING_EDGE', startPoint, currentMouse: startPoint });
          return;
        }
        // In edit modes, allow SELECT_RECT but don't start pan
        if (!editingDim) {
          const worldPoint = getWorldPointFromClient(pointer.clientX, pointer.clientY);
          startBackgroundLongPress(pointer.clientX, pointer.clientY, worldPoint);
        }
        return;
      }

      // Default: start long press timer and PAN_READY
      if (!editingDim) {
        const worldPoint = getWorldPointFromClient(pointer.clientX, pointer.clientY);
        startBackgroundLongPress(pointer.clientX, pointer.clientY, worldPoint);
        setInteraction({ type: 'PAN_READY', startX: pointer.clientX, startY: pointer.clientY });
      }
    }, [interaction, triangles, standaloneEdges, editingDim, occupiedEdges, edgeEditMode, triangleEditMode,
      onMoveTriangles, onMoveStandaloneEdges, onRootPlacingComplete,
      onAddAttachedTriangle, onVertexReshape, onAddStandaloneEdge,
      onAddTriangleFromEdge, applySnap, isFlipSide, getWorldPointFromClient,
      startBackgroundLongPress, addLog]),

    onPointerMove: useCallback((pointer: PointerInfo, evt: PointerEvent) => {
      const worldPoint = getWorldPointFromClient(pointer.clientX, pointer.clientY);

      // Handle SELECT_RECT and MOVING_SELECTION first (allowed in all modes)
      if (interaction.type === 'SELECT_RECT') {
        setInteraction({ ...interaction, currentWorld: worldPoint });
        return;
      }

      if (interaction.type === 'MOVING_SELECTION') {
        setInteraction({ ...interaction, currentWorld: worldPoint });
        return;
      }

      // In edit modes, only handle entity generation, disable pan/zoom
      if (edgeEditMode || triangleEditMode) {
        // Update mouse position for edge-related modes (edge edit mode)
        if (edgeEditMode && (interaction.type === 'DRAWING_EDGE' || interaction.type === 'EXTENDING_EDGE')) {
          setInteraction({ ...interaction, currentMouse: worldPoint });
        }
        // Update mouse position for triangle-related modes (triangle edit mode)
        if (triangleEditMode && (interaction.type === 'PHANTOM_PLACING' || 
            interaction.type === 'VERTEX_RESHAPING' || 
            interaction.type === 'STANDALONE_EDGE_PLACING')) {
          setInteraction({ ...interaction, currentMouse: worldPoint });
        }
        return;
      }

      // If not in appropriate edit mode, cancel creation states
      if ((interaction.type === 'DRAWING_EDGE' || interaction.type === 'EXTENDING_EDGE') && !edgeEditMode) {
        setInteraction({ type: 'IDLE' });
        return;
      }
      if ((interaction.type === 'PHANTOM_PLACING' || interaction.type === 'VERTEX_RESHAPING' || 
           interaction.type === 'STANDALONE_EDGE_PLACING') && !triangleEditMode) {
        setInteraction({ type: 'IDLE' });
        return;
      }

      // Cancel long press if moved too much
      if (longPressStartPosRef.current && longPressTimerRef.current) {
        const dx = pointer.clientX - longPressStartPosRef.current.x;
        const dy = pointer.clientY - longPressStartPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
          cancelLongPress();
        }
      }


      if (interaction.type === 'PAN_READY') {
        const dist = Math.sqrt(Math.pow(pointer.clientX - interaction.startX, 2) + Math.pow(pointer.clientY - interaction.startY, 2));
        if (dist > 3) {
          cancelLongPress();
          setInteraction({ type: 'PANNING', lastX: pointer.clientX, lastY: pointer.clientY });
        }
        return;
      }

      if (interaction.type === 'PANNING') {
        const dx = pointer.clientX - interaction.lastX;
        const dy = pointer.clientY - interaction.lastY;
        setStagePosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        setInteraction({ type: 'PANNING', lastX: pointer.clientX, lastY: pointer.clientY });
        return;
      }

      // EDGE_READY should not switch to PANNING. 
      // This prevents "forced panning" when trying to select an edge with a shaky hand.
      if (interaction.type === 'EDGE_READY') {
        return;
      }

      // Update mouse position for various creation modes
      // For edge-related modes, only update if in edge edit mode
      if (interaction.type === 'DRAWING_EDGE' || interaction.type === 'EXTENDING_EDGE') {
        if (edgeEditMode) {
          setInteraction({ ...interaction, currentMouse: worldPoint });
        } else {
          // Cancel if not in edge edit mode
          setInteraction({ type: 'IDLE' });
        }
      } else if (interaction.type === 'PHANTOM_PLACING' ||
        interaction.type === 'VERTEX_RESHAPING' ||
        interaction.type === 'STANDALONE_EDGE_PLACING') {
        // For triangle-related modes, only update if in triangle edit mode
        if (triangleEditMode) {
          setInteraction({ ...interaction, currentMouse: worldPoint });
        } else {
          // Cancel if not in triangle edit mode
          setInteraction({ type: 'IDLE' });
        }
      } else if (interaction.type === 'ROOT_PLACING_ORIGIN' ||
        interaction.type === 'ROOT_PLACING_ANGLE') {
        setInteraction({ ...interaction, currentMouse: worldPoint });
      }
    }, [interaction, edgeEditMode, triangleEditMode, cancelLongPress, getWorldPointFromClient]),

    onPointerUp: useCallback((pointer: PointerInfo, evt: PointerEvent) => {
      // Mark pointer as released
      isPointerDownRef.current = false;
      
      addLog(`PointerUp: type=${pointer.pointerType}, id=${pointer.id}, interaction=${interaction.type}`);

      // Creation modes: finger lift does NOT confirm anymore
      // User must double-tap to confirm (consistent for both mouse and touch)

      // Handle MOVING_SELECTION completion
      if (interaction.type === 'MOVING_SELECTION') {
        const { startWorld, currentWorld, targetIds } = interaction;
        const dx = currentWorld.x - startWorld.x;
        const dy = currentWorld.y - startWorld.y;

        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
          const triangleIds: string[] = [];
          const edgeIds: string[] = [];

          targetIds.forEach(id => {
            if (triangles.find(t => t.id === id)) {
              triangleIds.push(id);
            } else if (standaloneEdges.find(e => e.id === id)) {
              edgeIds.push(id);
            }
          });

          if (triangleIds.length > 0 && onMoveTriangles) {
            onMoveTriangles(triangleIds, dx, dy);
          }
          if (edgeIds.length > 0 && onMoveStandaloneEdges) {
            onMoveStandaloneEdges(edgeIds, dx, dy);
          }
        }

        setInteraction({ type: 'IDLE' });
        return;
      }

      // Handle SELECT_RECT completion
      if (interaction.type === 'SELECT_RECT') {
        const { startWorld, currentWorld } = interaction;
        const minX = Math.min(startWorld.x, currentWorld.x);
        const maxX = Math.max(startWorld.x, currentWorld.x);
        const minY = Math.min(startWorld.y, currentWorld.y);
        const maxY = Math.max(startWorld.y, currentWorld.y);

        if (Math.abs(maxX - minX) > 0.1 || Math.abs(maxY - minY) > 0.1) {
          const newSelection = new Set<string>();

          triangles.forEach(t => {
            if (isTriangleInRect(t, minX, maxX, minY, maxY)) {
              newSelection.add(t.id);
            }
          });

          standaloneEdges.forEach(e => {
            if (isEdgeInRect(e, minX, maxX, minY, maxY)) {
              newSelection.add(e.id);
            }
          });

          setSelectedIds(newSelection);
        }
        setInteraction({ type: 'IDLE' });
        return;
      }

      // Don't reset interaction for placing/drawing modes - they need to persist until confirmed
      // But only if in appropriate edit mode
      if (interaction.type === 'ROOT_PLACING_ORIGIN' ||
        interaction.type === 'ROOT_PLACING_ANGLE') {
        return;
      }
      
      // Edge-related modes: only persist if in edge edit mode
      if (interaction.type === 'DRAWING_EDGE' || interaction.type === 'EXTENDING_EDGE') {
        if (edgeEditMode) {
          return;
        } else {
          setInteraction({ type: 'IDLE' });
          return;
        }
      }
      
      // Triangle-related modes: only persist if in triangle edit mode
      if (interaction.type === 'PHANTOM_PLACING' ||
        interaction.type === 'VERTEX_RESHAPING' ||
        interaction.type === 'STANDALONE_EDGE_PLACING') {
        if (triangleEditMode) {
          return;
        } else {
          setInteraction({ type: 'IDLE' });
          return;
        }
      }

      if (interaction.type === 'EDGE_READY') {
        onEdgeSelect(interaction.tId, interaction.index);
      } else if (interaction.type === 'PANNING') {
        // PANNING操作が終了した場合、エッジ生成を開始しない
        // パンニング操作が実際に行われたので、背景クリックとして扱わない
        panningJustEndedRef.current = true;
        // 短い時間後にフラグをリセット（次のクリックイベントを防ぐため）
        setTimeout(() => {
          panningJustEndedRef.current = false;
        }, 100);
        setSelectedIds(new Set());
      } else if (interaction.type === 'PAN_READY') {
        // PAN_READY状態で終了した場合、実際にパンニングが開始されたかチェック
        // 移動距離が小さい場合のみ背景クリックとして扱う
        const { startX, startY } = interaction;
        const dist = Math.sqrt(Math.pow(pointer.clientX - startX, 2) + Math.pow(pointer.clientY - startY, 2));
        // 移動距離が3ピクセル未満の場合のみ背景クリックとして扱う
        if (dist < 3 && !panningJustEndedRef.current) {
          if (onBackgroundClick) {
            onBackgroundClick();
          }
        }
        setSelectedIds(new Set());
      }
      setInteraction({ type: 'IDLE' });
    }, [interaction, triangles, standaloneEdges, occupiedEdges,
      onMoveTriangles, onMoveStandaloneEdges, onAddStandaloneEdge,
      onAddAttachedTriangle, onAddTriangleFromEdge, onVertexReshape,
      onEdgeSelect, onBackgroundClick, applySnap, isFlipSide,
      isTriangleInRect, isEdgeInRect, addLog]),

    onLongPress: useCallback((clientX: number, clientY: number, target: Konva.Node) => {
      // Only proceed if pointer is still pressed down (click and hold)
      if (!isPointerDownRef.current) {
        return;
      }

      // Get entity info from target
      const targetName = target.name();
      addLog(`LongPress: target=${targetName}`);

      // Background long press - always allow SELECT_RECT (even in edit modes)
      if (targetName === 'background-rect') {
        // Long press on background ONLY - start SELECT_RECT (only if still holding)
        if (isPointerDownRef.current) {
          const worldPoint = getWorldPointFromClient(clientX, clientY);
          setInteraction({ type: 'SELECT_RECT', startWorld: worldPoint, currentWorld: worldPoint });
        }
        return;
      }

      // In edit modes, disable context menu for entities (but allow SELECT_RECT on background)
      if (edgeEditMode || triangleEditMode) {
        return;
      }

      // Check if it's a triangle-related element (fill, edge, label, vertex)
      if (targetName.startsWith('triangle-fill-')) {
        const tId = targetName.replace('triangle-fill-', '');
        setContextMenu({ x: clientX, y: clientY, targetType: 'triangle', targetId: tId });
      } else if (targetName.startsWith('triangle-edge-')) {
        // triangle-edge-{tId}-{index} -> extract tId
        const parts = targetName.replace('triangle-edge-', '').split('-');
        const tId = parts[0];
        setContextMenu({ x: clientX, y: clientY, targetType: 'triangle', targetId: tId });
      } else if (targetName.startsWith('triangle-label-')) {
        const tId = targetName.replace('triangle-label-', '');
        setContextMenu({ x: clientX, y: clientY, targetType: 'triangle', targetId: tId });
      } else if (targetName.startsWith('triangle-vertex-')) {
        // triangle-vertex-{tId}-{pointId} -> extract tId
        const parts = targetName.replace('triangle-vertex-', '').split('-');
        const tId = parts[0];
        setContextMenu({ x: clientX, y: clientY, targetType: 'triangle', targetId: tId });
      } else if (targetName.startsWith('standalone-edge-')) {
        const edgeId = targetName.replace('standalone-edge-', '');
        setContextMenu({ x: clientX, y: clientY, targetType: 'edge', targetId: edgeId });
      }
      // For any other unnamed elements (grid lines, etc.), do nothing
    }, [edgeEditMode, triangleEditMode, getWorldPointFromClient, addLog]),

    onDoubleTap: useCallback((clientX: number, clientY: number, target: Konva.Node, evt: PointerEvent) => {
      // Double tap is no longer used - all operations are single tap now
      // This callback is kept for compatibility but does nothing
    }, []),

    onPinchStart: useCallback((centerX: number, centerY: number, distance: number) => {
      // In edit modes, disable pinch zoom
      if (edgeEditMode || triangleEditMode) {
        return;
      }
      if (stageRef.current) {
        pinchBaseScaleRef.current = stageRef.current.scaleX();
        pinchBasePosRef.current = { x: stageRef.current.x(), y: stageRef.current.y() };
      }
      addLog(`PinchStart: center=(${centerX.toFixed(0)}, ${centerY.toFixed(0)}), dist=${distance.toFixed(0)}`);
    }, [edgeEditMode, triangleEditMode, addLog]),

    onPinchMove: useCallback((centerX: number, centerY: number, scale: number, distance: number) => {
      // In edit modes, disable pinch zoom
      if (edgeEditMode || triangleEditMode) {
        return;
      }
      if (!stageRef.current || !containerRef.current) return;

      const stage = stageRef.current;
      const containerRect = containerRef.current.getBoundingClientRect();
      const pointerX = centerX - containerRect.left;
      const pointerY = centerY - containerRect.top;

      const oldScale = pinchBaseScaleRef.current;
      const mousePointTo = {
        x: (pointerX - pinchBasePosRef.current.x) / oldScale,
        y: (pointerY - pinchBasePosRef.current.y) / oldScale,
      };

      const newScale = Math.max(0.1, Math.min(5, oldScale * scale));

      const newPos = {
        x: pointerX - mousePointTo.x * newScale,
        y: pointerY - mousePointTo.y * newScale,
      };

      setStageScale(newScale);
      setStagePosition(newPos);
    }, []),

    onPinchEnd: useCallback(() => {
      addLog('PinchEnd');
    }, [addLog]),
  });

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
    // Only allow triangle dimension editing in triangle edit mode
    if (!triangleEditMode) return;
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
    // Only allow edge dimension editing in edge edit mode
    if (!edgeEditMode) return;
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

  // Render Edge with label
  const renderEdge = (
    t: RenderedTriangle,
    pStart: Point,
    pEnd: Point,
    index: 0 | 1 | 2
  ) => {
    const isSelectedEdge = selectedEdge?.type === 'triangleEdge' && selectedEdge.triangleId === t.id && selectedEdge.edgeIndex === index;
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
    const uiScale = (worldBounds.w / 50) * (stageRef.current?.scaleX() || 1);
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
            name={`triangle-edge-${t.id}-${index}`}
            points={[sp1.x, sp1.y, sp2.x, sp2.y]}
            stroke="transparent"
            strokeWidth={20}
            {...clickHandlers(
              // Single click/tap: enter phantom placing mode (if not occupied) or select edge
              // Only allow triangle generation in triangle edit mode
              !isOccupied && triangleEditMode ? (e) => {
                e.evt.stopPropagation();
                e.cancelBubble = true;
                const currentMouse = getWorldPoint(e);
                setInteraction({
                  type: 'PHANTOM_PLACING',
                  tId: t.id,
                  index,
                  p1: pStart,
                  p2: pEnd,
                  currentMouse
                });
              } : (e) => {
                e.evt.stopPropagation();
                e.cancelBubble = true;
                onEdgeSelect(t.id, index);
              }
            )}
            onPointerDown={(e) => {
              e.evt.stopPropagation();
              e.cancelBubble = true;
              if (!isOccupied) {
                handleEdgePointerDown(e, t.id, index, pStart, pEnd);
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
              {...clickHandlers(() => handleLabelClick(t.id, index, rawLen, edgeLabel, labelPos.x, labelPos.y, angle, fontSize))}
            />
          </Group>
        ) : null}
      </Group>
    );
  };

  // Render Triangle Fill only (for bottom layer)
  const renderTriangleFill = (t: RenderedTriangle) => {
    const isSelected = selectedTriangleId === t.id;
    const isMultiSelected = selectedIds.has(t.id);
    const isEditingAnyEdge = editingDim?.tId === t.id;

    const sp1 = worldToStage(t.p1.x, t.p1.y);
    const sp2 = worldToStage(t.p2.x, t.p2.y);
    const sp3 = worldToStage(t.p3.x, t.p3.y);

    return (
      <Shape
        name={`triangle-fill-${t.id}`}
        key={`fill-${t.id}`}
        sceneFunc={(context, shape) => {
          context.beginPath();
          context.moveTo(sp1.x, sp1.y);
          context.lineTo(sp2.x, sp2.y);
          context.lineTo(sp3.x, sp3.y);
          context.closePath();
          context.fillStrokeShape(shape);
        }}
        fill={isMultiSelected ? "#3b82f6" : "#94a3b8"}
        opacity={isMultiSelected ? 0.4 : (isEditingAnyEdge ? 0.1 : (isSelected ? 0.4 : 0.2))}
        stroke={isMultiSelected ? "#2563eb" : "#64748b"}
        strokeWidth={isSelected || isMultiSelected ? 2 : 1}
        onMouseDown={(e) => {
          if (e.evt.button === 0) {
            startEntityLongPress('triangle', t.id, e.evt.clientX, e.evt.clientY);
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
          onSelectTriangle(t.id);
        }}
        onTap={() => {
          cancelLongPress();
          onSelectTriangle(t.id);
        }}
        onTouchStart={(e) => {
          const touch = e.evt.touches[0];
          if (touch) {
            startEntityLongPress('triangle', t.id, touch.clientX, touch.clientY);
          }
        }}
        onTouchEnd={() => {
          cancelLongPress();
        }}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          handleContextMenu(e, 'triangle', t.id);
        }}
      />
    );
  };

  // Render a vertex marker (for extending edges from triangle vertices)
  const renderVertexMarker = (point: Point, triangleId: string) => {
    const sp = worldToStage(point.x, point.y);
    const uiScale = (worldBounds.w / 50) * (stageRef.current?.scaleX() || 1);
    const radius = Math.max(4, 0.4 * uiScale);

    return (
      <Circle
        key={`vertex-${triangleId}-${point.id}`}
        name={`triangle-vertex-${triangleId}-${point.id}`}
        x={sp.x}
        y={sp.y}
        radius={radius}
        fill="#64748b"
        stroke="white"
        strokeWidth={1}
        opacity={0.7}
        {...clickHandlers(
          // Single click/tap: start extending edge from this vertex
          // Only allow edge extension in edge edit mode
          edgeEditMode ? (e) => {
            e.evt.stopPropagation();
            setInteraction({
              type: 'EXTENDING_EDGE',
              fromEdgeId: triangleId,
              fromPoint: point,
              currentMouse: point
            });
          } : undefined
        )}
      />
    );
  };



  // ... (inside GeometryCanvas component)

  // Render Triangle Labels (edges and centroid label) - for top layer
  const renderTriangleLabels = (t: RenderedTriangle) => {
    const centroid = getCentroid(t);
    const labelPos = worldToStage(centroid.x, centroid.y);

    // Calculate font size based on world-to-screen scale
    const uiScale = (worldBounds.w / 50) * (stageRef.current?.scaleX() || 1);
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
          name={`triangle-label-${t.id}`}
          x={labelPos.x}
          y={labelPos.y}
          {...clickHandlers(
            // Single click/tap: enter vertex reshaping mode (in triangle edit mode) or select triangle (outside edit mode)
            triangleEditMode ? (e) => {
              e.evt.stopPropagation();
              setInteraction({
                type: 'VERTEX_RESHAPING',
                tId: t.id,
                p1: t.p1,
                p2: t.p2,
                currentMouse: t.p3
              });
            } : (e) => {
              e.evt.stopPropagation();
              onSelectTriangle(t.id);
            }
          )}
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

  // ...







  // Calculate screen position for multiple selected entities (for delete FAB)
  const getMultiSelectedScreenPosition = useCallback((): { x: number; y: number } | null => {
    if (selectedIds.size === 0 || !stageRef.current || !containerRef.current) return null;

    const allPoints: Point[] = [];

    // Collect points from selected triangles
    selectedIds.forEach(id => {
      const t = triangles.find(tri => tri.id === id);
      if (t) {
        allPoints.push(t.p1, t.p2, t.p3);
      }
    });

    // Collect points from selected standalone edges
    selectedIds.forEach(id => {
      const edge = standaloneEdges.find(e => e.id === id);
      if (edge) {
        allPoints.push(edge.p1, edge.p2);
      }
    });

    if (allPoints.length === 0) return null;

    // Calculate center of all points
    const centerX = allPoints.reduce((sum, p) => sum + p.x, 0) / allPoints.length;
    const centerY = allPoints.reduce((sum, p) => sum + p.y, 0) / allPoints.length;

    // Convert to screen coordinates
    const sp = worldToStage(centerX, centerY);
    const stage = stageRef.current;
    const containerRect = containerRef.current.getBoundingClientRect();
    const screenX = containerRect.left + sp.x * stage.scaleX() + stage.x();
    const screenY = containerRect.top + sp.y * stage.scaleY() + stage.y();

    return { x: screenX, y: screenY };
  }, [selectedIds, triangles, standaloneEdges, worldToStage, stageScale, stagePosition]);

  // Calculate screen position for selected triangle action button
  const getSelectedTriangleScreenPosition = useCallback((): { x: number; y: number; t: RenderedTriangle } | null => {
    if (!selectedTriangleId || !stageRef.current || !containerRef.current) return null;

    const t = triangles.find(tri => tri.id === selectedTriangleId);
    if (!t) return null;

    const centroid = getCentroid(t);
    const sp = worldToStage(centroid.x, centroid.y);

    const stage = stageRef.current;
    const containerRect = containerRef.current.getBoundingClientRect();
    const screenX = containerRect.left + sp.x * stage.scaleX() + stage.x();
    const screenY = containerRect.top + sp.y * stage.scaleY() + stage.y();

    // Offset button slightly below the number
    const uiScale = (worldBounds.w / 50) * stage.scaleX();
    const fontSize = Math.max(10, 1.2 * uiScale);
    const offsetY = fontSize * 2.5;

    return {
      x: screenX,
      y: screenY + offsetY,
      t
    };
  }, [selectedTriangleId, triangles, worldToStage, stageScale, stagePosition]);

  // Handler to start reshaping from action button
  const handleStartReshaping = useCallback(() => {
    // Only allow triangle reshaping in triangle edit mode
    if (!triangleEditMode) return;

    const info = getSelectedTriangleScreenPosition();
    if (!info) return;
    const { t } = info;

    setInteraction({
      type: 'VERTEX_RESHAPING',
      tId: t.id,
      p1: t.p1,
      p2: t.p2,
      currentMouse: t.p3
    });
  }, [triangleEditMode, getSelectedTriangleScreenPosition]);

  // Render selected edge highlight (separate layer for visibility)
  // Works for both triangle edges and standalone edges
  const renderSelectedEdgeHighlight = () => {
    if (!selectedEdge) return null;

    const edgePoints = getEdgePoints(selectedEdge, triangles, standaloneEdges);
    if (!edgePoints) return null;

    const { p1, p2 } = edgePoints;
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

  // Calculate screen position for selected edge action button
  // Works for both triangle edges and standalone edges
  const getSelectedEdgeScreenPosition = useCallback((): { x: number; y: number; p1: Point; p2: Point } | null => {
    if (!selectedEdge || !stageRef.current || !containerRef.current) return null;

    // For triangle edges, check if occupied
    if (selectedEdge.type === 'triangleEdge') {
      const isOccupied = occupiedEdges?.has(`${selectedEdge.triangleId}-${selectedEdge.edgeIndex}`) || false;
      if (isOccupied) return null;
    }

    const edgePoints = getEdgePoints(selectedEdge, triangles, standaloneEdges);
    if (!edgePoints) return null;

    const { p1, p2 } = edgePoints;

    // Convert world to stage coordinates
    const sp1 = worldToStage(p1.x, p1.y);
    const sp2 = worldToStage(p2.x, p2.y);

    // Calculate midpoint in stage coordinates
    const stageMidX = (sp1.x + sp2.x) / 2;
    const stageMidY = (sp1.y + sp2.y) / 2;

    // Convert stage coordinates to screen coordinates
    const stage = stageRef.current;
    const containerRect = containerRef.current.getBoundingClientRect();
    const screenX = containerRect.left + stageMidX * stage.scaleX() + stage.x();
    const screenY = containerRect.top + stageMidY * stage.scaleY() + stage.y();

    // Offset the button perpendicular to the edge
    const edgeDx = sp2.x - sp1.x;
    const edgeDy = sp2.y - sp1.y;
    const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
    if (edgeLen < 1) return null;

    // Normal vector (perpendicular to edge)
    const normalX = -edgeDy / edgeLen;
    const normalY = edgeDx / edgeLen;

    // For triangle edges, place button on exterior side (opposite to centroid)
    // For standalone edges, place button on one side (arbitrarily positive normal)
    let offsetDirection = 1;
    if (selectedEdge.type === 'triangleEdge') {
      const t = triangles.find(tri => tri.id === selectedEdge.triangleId);
      if (t) {
        const centroid = getCentroid(t);
        const centroidStage = worldToStage(centroid.x, centroid.y);
        const tocentroidX = centroidStage.x - stageMidX;
        const tocentroidY = centroidStage.y - stageMidY;
        const dot = tocentroidX * normalX + tocentroidY * normalY;
        offsetDirection = dot > 0 ? -1 : 1;
      }
    }

    const offsetDistance = 15; // pixels from edge center (close to the edge)
    const offsetX = normalX * offsetDirection * offsetDistance * stage.scaleX();
    const offsetY = normalY * offsetDirection * offsetDistance * stage.scaleY();

    return {
      x: screenX + offsetX,
      y: screenY + offsetY,
      p1,
      p2
    };
  }, [selectedEdge, triangles, standaloneEdges, occupiedEdges, worldToStage, stageScale, stagePosition]);

  // Handler to start triangle placing mode from action button
  // Works for both triangle edges (PHANTOM_PLACING) and standalone edges (STANDALONE_EDGE_PLACING)
  const handleStartTrianglePlacing = useCallback(() => {
    // Only allow triangle generation in triangle edit mode
    if (!triangleEditMode) return;

    const edgeInfo = getSelectedEdgeScreenPosition();
    if (!edgeInfo || !selectedEdge) return;

    const { p1, p2 } = edgeInfo;

    if (selectedEdge.type === 'triangleEdge') {
      // Start phantom placing mode for triangle edge
      setInteraction({
        type: 'PHANTOM_PLACING',
        tId: selectedEdge.triangleId,
        index: selectedEdge.edgeIndex,
        p1,
        p2,
        currentMouse: { id: generateId(), x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      });
    } else {
      // Start standalone edge placing mode
      setInteraction({
        type: 'STANDALONE_EDGE_PLACING',
        edgeId: selectedEdge.edgeId,
        p1,
        p2,
        currentMouse: { id: generateId(), x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      });
    }
  }, [triangleEditMode, selectedEdge, getSelectedEdgeScreenPosition]);

  // Render standalone edges
  const renderStandaloneEdge = (edge: StandaloneEdge) => {
    const sp1 = worldToStage(edge.p1.x, edge.p1.y);
    const sp2 = worldToStage(edge.p2.x, edge.p2.y);
    const midX = (sp1.x + sp2.x) / 2;
    const midY = (sp1.y + sp2.y) / 2;

    const uiScale = (worldBounds.w / 50) * (stageRef.current?.scaleX() || 1);
    const fontSize = Math.max(8, 0.8 * uiScale);
    const lenText = edge.length.toFixed(2);
    const charWidth = fontSize * 0.6;
    const textWidth = lenText.length * charWidth;
    const endpointRadius = Math.max(4, fontSize * 0.4);

    // Check if this standalone edge is selected (via unified selection or multi-select)
    const isSelected = (selectedEdge?.type === 'standaloneEdge' && selectedEdge.edgeId === edge.id) || selectedIds.has(edge.id);

    return (
      <Group key={`standalone-${edge.id}`}>
        {/* Hit area for double-click on edge body (to create triangle) and long press for context menu */}
        <Line
          name={`standalone-edge-${edge.id}`}
          points={[sp1.x, sp1.y, sp2.x, sp2.y]}
          stroke="rgba(0,0,0,0.001)"
          strokeWidth={20}
          hitStrokeWidth={20}
          onMouseDown={(e) => {
            if (e.evt.button === 0) {
              startEntityLongPress('edge', edge.id, e.evt.clientX, e.evt.clientY);
            }
          }}
          onMouseUp={() => {
            cancelLongPress();
          }}
          onMouseLeave={() => {
            cancelLongPress();
          }}
          onClick={(e) => {
            cancelLongPress();
            e.evt.stopPropagation();
            // Enter triangle placing mode from this edge (in triangle edit mode) or select edge (outside edit mode)
            if (triangleEditMode) {
              setInteraction({
                type: 'STANDALONE_EDGE_PLACING',
                edgeId: edge.id,
                p1: edge.p1,
                p2: edge.p2,
                currentMouse: { id: generateId(), x: (edge.p1.x + edge.p2.x) / 2, y: edge.p1.y - 2 }
              });
            } else {
              // Select edge when not in edit mode
              if (onStandaloneEdgeSelect) {
                onStandaloneEdgeSelect(edge.id);
              }
            }
          }}
          onContextMenu={(e) => {
            e.evt.preventDefault();
            handleContextMenu(e, 'edge', edge.id);
          }}
          onTouchStart={(e) => {
            const touch = e.evt.touches[0];
            if (touch) {
              startEntityLongPress('edge', edge.id, touch.clientX, touch.clientY);
            }
          }}
          onTap={(e) => {
            cancelLongPress();
            e.evt.stopPropagation();
            // Enter triangle placing mode from this edge (in triangle edit mode) or select edge (outside edit mode)
            if (triangleEditMode) {
              setInteraction({
                type: 'STANDALONE_EDGE_PLACING',
                edgeId: edge.id,
                p1: edge.p1,
                p2: edge.p2,
                currentMouse: { id: generateId(), x: (edge.p1.x + edge.p2.x) / 2, y: edge.p1.y - 2 }
              });
            } else {
              // Select edge when not in edit mode
              if (onStandaloneEdgeSelect) {
                onStandaloneEdgeSelect(edge.id);
              }
            }
          }}
        />
        {/* Visible edge */}
        <Line
          points={[sp1.x, sp1.y, sp2.x, sp2.y]}
          stroke={isSelected ? "#1d4ed8" : "#3b82f6"}
          strokeWidth={isSelected ? 3 : 2}
          lineCap="round"
        />
        {/* Endpoint 1 - single-click to extend */}
        <Circle
          x={sp1.x}
          y={sp1.y}
          radius={endpointRadius}
          fill="#3b82f6"
          stroke="white"
          strokeWidth={2}
          {...clickHandlers(
            // Only allow edge extension in edge edit mode
            edgeEditMode ? (e) => {
              e.evt.stopPropagation();
              setInteraction({
                type: 'EXTENDING_EDGE',
                fromEdgeId: edge.id,
                fromPoint: edge.p1,
                currentMouse: edge.p1
              });
            } : undefined
          )}
        />
        {/* Endpoint 2 - single-click to extend */}
        <Circle
          x={sp2.x}
          y={sp2.y}
          radius={endpointRadius}
          fill="#3b82f6"
          stroke="white"
          strokeWidth={2}
          {...clickHandlers(
            // Only allow edge extension in edge edit mode
            edgeEditMode ? (e) => {
              e.evt.stopPropagation();
              setInteraction({
                type: 'EXTENDING_EDGE',
                fromEdgeId: edge.id,
                fromPoint: edge.p2,
                currentMouse: edge.p2
              });
            } : undefined
          )}
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
            {...clickHandlers(() => handleEdgeLabelClick(edge.id, edge.length, midX, midY - fontSize, fontSize))}
          />
        )}
      </Group>
    );
  };

  // Render edge drawing ghost (for both new edge and extending edge)
  const renderEdgeDrawingGhost = () => {
    let startPoint: Point, currentMouse: Point;
    let isEdgeEditMode = false;

    if (interaction.type === 'DRAWING_EDGE') {
      startPoint = interaction.startPoint;
      currentMouse = interaction.currentMouse;
      isEdgeEditMode = edgeEditMode;
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

    const uiScale = (worldBounds.w / 50) * (stageRef.current?.scaleX() || 1);
    const fontSize = Math.max(8, 0.8 * uiScale);
    const charWidth = fontSize * 0.6;
    const textWidth = len.length * charWidth;
    const snapRadius = Math.max(6, fontSize * 0.5);
    const crosshairSize = Math.max(12, fontSize * 1.5);

    return (
      <Group>
        {/* Red crosshair at first point (for edge edit mode) */}
        {isEdgeEditMode && (
          <Group x={sp1.x} y={sp1.y}>
            <Line
              points={[-crosshairSize, 0, crosshairSize, 0]}
              stroke="#ef4444"
              strokeWidth={2}
            />
            <Line
              points={[0, -crosshairSize, 0, crosshairSize]}
              stroke="#ef4444"
              strokeWidth={2}
            />
          </Group>
        )}
        {/* Edge preview line */}
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

  // Render Drag Ghost (for PHANTOM_PLACING, VERTEX_RESHAPING, STANDALONE_EDGE_PLACING)
  const renderDragGhost = () => {
    if (interaction.type !== 'PHANTOM_PLACING' && interaction.type !== 'VERTEX_RESHAPING' && interaction.type !== 'STANDALONE_EDGE_PLACING') return null;
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
    const uiScale = (worldBounds.w / 50) * (stageRef.current?.scaleX() || 1);
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
    const uiScale = (worldBounds.w / 50) * (stageRef.current?.scaleX() || 1);
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

      // Use the SAME function as recalculateGeometry
      // recalculateGeometry calls: calculateThirdPoint(p1, p2, sb, sc, !def.flip)
      // def.flip defaults to false/undefined, so !def.flip = true
      const p3 = calculateThirdPoint(p1, p2, sideB, sideC, true);

      if (!p3) {
        return null;
      }

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

  // Render moving selection preview
  const renderMovingPreview = () => {
    if (interaction.type !== 'MOVING_SELECTION') return null;

    const { startWorld, currentWorld, targetIds } = interaction;
    const dx = currentWorld.x - startWorld.x;
    const dy = currentWorld.y - startWorld.y;

    const elements: React.ReactElement[] = [];

    // Draw ghost triangles
    targetIds.forEach(id => {
      const t = triangles.find(tri => tri.id === id);
      if (t) {
        const sp1 = worldToStage(t.p1.x + dx, t.p1.y + dy);
        const sp2 = worldToStage(t.p2.x + dx, t.p2.y + dy);
        const sp3 = worldToStage(t.p3.x + dx, t.p3.y + dy);

        elements.push(
          <Shape
            key={`moving-${t.id}`}
            sceneFunc={(context, shape) => {
              context.beginPath();
              context.moveTo(sp1.x, sp1.y);
              context.lineTo(sp2.x, sp2.y);
              context.lineTo(sp3.x, sp3.y);
              context.closePath();
              context.fillStrokeShape(shape);
            }}
            fill="#3b82f6"
            opacity={0.3}
            stroke="#3b82f6"
            strokeWidth={2}
            dash={[4, 4]}
          />
        );
      }

      const edge = standaloneEdges.find(e => e.id === id);
      if (edge) {
        const sp1 = worldToStage(edge.p1.x + dx, edge.p1.y + dy);
        const sp2 = worldToStage(edge.p2.x + dx, edge.p2.y + dy);

        elements.push(
          <Line
            key={`moving-edge-${edge.id}`}
            points={[sp1.x, sp1.y, sp2.x, sp2.y]}
            stroke="#3b82f6"
            strokeWidth={2}
            dash={[4, 4]}
            opacity={0.6}
          />
        );
      }
    });

    return <Group>{elements}</Group>;
  };

  // Render selection rectangle
  const renderSelectRect = () => {
    if (interaction.type !== 'SELECT_RECT') return null;

    const { startWorld, currentWorld } = interaction;
    const sp1 = worldToStage(startWorld.x, startWorld.y);
    const sp2 = worldToStage(currentWorld.x, currentWorld.y);

    const x = Math.min(sp1.x, sp2.x);
    const y = Math.min(sp1.y, sp2.y);
    const width = Math.abs(sp2.x - sp1.x);
    const height = Math.abs(sp2.y - sp1.y);

    return (
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#3b82f6"
        opacity={0.2}
        stroke="#3b82f6"
        strokeWidth={1}
        dash={[4, 4]}
        shadowColor="rgba(0, 0, 0, 0.3)"
        shadowBlur={4}
        shadowOffset={{ x: 2, y: 2 }}
        shadowOpacity={0.5}
      />
    );
  };

  const cursorStyle = interaction.type === 'PANNING'
    ? 'grabbing'
    : interaction.type === 'MOVING_SELECTION'
      ? 'move'
      : (interaction.type === 'ROOT_PLACING_ORIGIN' || interaction.type === 'ROOT_PLACING_ANGLE' || interaction.type === 'SELECT_RECT')
        ? 'crosshair'
        : 'default';

  return (
    <div ref={containerRef} className="flex-1 h-full relative bg-slate-100 overflow-hidden select-none">
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePosition.x}
        y={stagePosition.y}
        onPointerDown={pointerHandlers.handlePointerDown}
        onPointerMove={pointerHandlers.handlePointerMove}
        onPointerUp={pointerHandlers.handlePointerUp}
        onPointerCancel={pointerHandlers.handlePointerCancel}
        onPointerLeave={pointerHandlers.handlePointerLeave}
        onWheel={handleWheel}
        style={{ cursor: cursorStyle, touchAction: 'none' }}
      >
        <Layer>
          <GridBackground
            worldBounds={worldBounds}
            worldToStage={worldToStage}
            onBackgroundClick={handleBackgroundClick}
          />
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
          {renderSelectRect()}
          {renderMovingPreview()}
        </Layer>
      </Stage>

      <CanvasControls
        onZoomIn={() => handleZoomBtn('in')}
        onZoomOut={() => handleZoomBtn('out')}
        onFitView={handleFitView}
      />

      {/* Edge Action Button - shows when edge is selected and not occupied */}
      {/* Only show in triangle edit mode (for triangle generation) */}
      {triangleEditMode && (() => {
        const edgePos = getSelectedEdgeScreenPosition();
        if (!edgePos || interaction.type !== 'IDLE') return null;
        return (
          <EdgeActionButton
            x={edgePos.x}
            y={edgePos.y}
            onAddTriangle={handleStartTrianglePlacing}
          />
        );
      })()}

      {/* Triangle Action Button - shows when triangle is selected */}
      {/* Only show in triangle edit mode (for triangle reshaping) */}
      {triangleEditMode && (() => {
        const triPos = getSelectedTriangleScreenPosition();
        if (!triPos || interaction.type !== 'IDLE') return null;
        return (
          <TriangleActionButton
            x={triPos.x}
            y={triPos.y}
            onReshape={handleStartReshaping}
          />
        );
      })()}

      {/* Entity Delete FAB - shows when entity is selected (outside edit modes) */}
      {!edgeEditMode && !triangleEditMode && (() => {
        // Show delete button for multiple selected entities
        if (selectedIds.size > 0 && interaction.type === 'IDLE') {
          const multiPos = getMultiSelectedScreenPosition();
          if (multiPos) {
            return (
              <EntityDeleteFAB
                x={multiPos.x}
                y={multiPos.y + 50}
                entityType="triangle"
                onDelete={() => {
                  // Delete all selected entities at once
                  if (onDeleteMultiple) {
                    const triangleIds: string[] = [];
                    const edgeIds: string[] = [];
                    
                    selectedIds.forEach(id => {
                      const t = triangles.find(tri => tri.id === id);
                      if (t) {
                        triangleIds.push(id);
                      } else {
                        const edge = standaloneEdges.find(e => e.id === id);
                        if (edge) {
                          edgeIds.push(id);
                        }
                      }
                    });
                    
                    onDeleteMultiple(triangleIds, edgeIds);
                  } else {
                    // Fallback to individual deletion if onDeleteMultiple is not provided
                    selectedIds.forEach(id => {
                      const t = triangles.find(tri => tri.id === id);
                      if (t && onDeleteTriangle) {
                        onDeleteTriangle(id);
                      }
                      const edge = standaloneEdges.find(e => e.id === id);
                      if (edge && onDeleteStandaloneEdge) {
                        onDeleteStandaloneEdge(id);
                      }
                    });
                  }
                  setSelectedIds(new Set());
                }}
              />
            );
          }
        }
        // Show delete button for selected triangle (single selection)
        if (selectedIds.size === 0 && selectedTriangleId && interaction.type === 'IDLE') {
          const triPos = getSelectedTriangleScreenPosition();
          if (triPos) {
            return (
              <EntityDeleteFAB
                x={triPos.x}
                y={triPos.y + 50}
                entityType="triangle"
                onDelete={() => {
                  if (onDeleteTriangle) {
                    onDeleteTriangle(selectedTriangleId);
                  }
                }}
              />
            );
          }
        }
        // Show delete button for selected standalone edge (single selection)
        if (selectedIds.size === 0 && selectedEdge && selectedEdge.type === 'standaloneEdge' && interaction.type === 'IDLE') {
          const edgePos = getSelectedEdgeScreenPosition();
          if (edgePos) {
            return (
              <EntityDeleteFAB
                x={edgePos.x}
                y={edgePos.y + 50}
                entityType="edge"
                onDelete={() => {
                  if (onDeleteStandaloneEdge) {
                    onDeleteStandaloneEdge(selectedEdge.edgeId);
                  }
                }}
              />
            );
          }
        }
        return null;
      })()}

      <div className="absolute bottom-28 left-4 bg-white/80 backdrop-blur px-3 py-2 rounded shadow-sm text-[10px] text-slate-500 border border-slate-200 pointer-events-none">
        <p className="font-semibold mb-1">操作方法:</p>
        <p>• <span className="text-green-600 font-bold">背景タップ</span>: エッジ作成</p>
        <p>• <span className="text-blue-600 font-bold">辺タップ</span>: 三角形を追加</p>
        <p>• <span className="text-blue-600 font-bold">寸法タップ</span>: 数値を編集</p>
        <p>• <span className="text-amber-600 font-bold">番号タップ</span>: 頂点を移動</p>
        <p>• <span className="text-red-600 font-bold">図形長押し</span>: 移動/削除メニュー</p>
        <p>• <span className="text-purple-600 font-bold">ピンチ</span>: ズーム / <span className="text-purple-600 font-bold">ドラッグ</span>: パン</p>
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
                setEditingDim({ ...editingDim, value: value });
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
                setEditingEdgeDim({ ...editingEdgeDim, value: value });
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
        <DeleteConfirmationDialog
          type={deleteConfirm.type}
          name={deleteConfirm.name}
          onConfirm={() => {
            if (deleteConfirm.type === 'triangle' && onDeleteTriangle) {
              onDeleteTriangle(deleteConfirm.id);
            } else if (deleteConfirm.type === 'edge' && onDeleteStandaloneEdge) {
              onDeleteStandaloneEdge(deleteConfirm.id);
            }
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Debug Console */}
      <DebugConsole
        interactionType={interaction.type}
        selectedCount={selectedIds.size}
        logs={debugLogs}
        onClear={() => setDebugLogs([])}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetType={contextMenu.targetType}
          targetId={contextMenu.targetId}
          selectedIds={selectedIds}
          onClose={() => setContextMenu(null)}
          onMove={(idsToMove) => {
            // Update selectedIds for visual feedback
            setSelectedIds(idsToMove);

            addLog(`Move clicked: idsToMove=${idsToMove.size}, ids=[${Array.from(idsToMove).join(',')}]`);

            // Start moving mode - convert screen coordinates to world coordinates
            const stage = stageRef.current;
            const container = containerRef.current;
            if (stage && container) {
              const containerRect = container.getBoundingClientRect();
              // Convert screen coordinates to stage-relative coordinates
              const stageRelativeX = contextMenu.x - containerRect.left;
              const stageRelativeY = contextMenu.y - containerRect.top;
              // Convert to internal stage coordinates
              const stageX = (stageRelativeX - stage.x()) / stage.scaleX();
              const stageY = (stageRelativeY - stage.y()) / stage.scaleY();
              const world = stageToWorld(stageX, stageY);
              const startWorld: Point = { id: generateId(), x: world.x, y: world.y };
              addLog(`Start MOVING_SELECTION: world=(${world.x.toFixed(2)}, ${world.y.toFixed(2)})`);
              // Store targetIds in interaction to avoid async state issues
              setInteraction({ type: 'MOVING_SELECTION', startWorld, currentWorld: startWorld, targetIds: idsToMove });
            } else {
              addLog(`Move failed: stage=${!!stage}, container=${!!container}`);
            }
            setContextMenu(null);
          }}
          onDelete={() => {
            if (contextMenu.targetType === 'triangle' && contextMenu.targetId && onDeleteTriangle) {
              const t = triangles.find(tri => tri.id === contextMenu.targetId);
              setDeleteConfirm({ type: 'triangle', id: contextMenu.targetId, name: t?.name || 'Triangle' });
            } else if (contextMenu.targetType === 'edge' && contextMenu.targetId && onDeleteStandaloneEdge) {
              setDeleteConfirm({ type: 'edge', id: contextMenu.targetId, name: 'Edge' });
            } else if (contextMenu.targetType === 'selection' && selectedIds.size > 0) {
              // Delete all selected items
              selectedIds.forEach(id => {
                if (triangles.find(t => t.id === id)) {
                  onDeleteTriangle?.(id);
                } else if (standaloneEdges.find(e => e.id === id)) {
                  onDeleteStandaloneEdge?.(id);
                }
              });
              setSelectedIds(new Set());
            }
            setContextMenu(null);
          }}
        />
      )}

      {/* Click outside to close context menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
};

export default GeometryCanvas;
