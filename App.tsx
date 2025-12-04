import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RenderedTriangle, TriangleDef, AIAnalysisResult, ToolMode, StandaloneEdge, Point } from './types';
import { generateId, recalculateGeometry, isValidRootTriangle, isValidAttachedTriangle, distance } from './utils/geometryUtils';
import { PALETTE } from './constants';
import { analyzeGeometry } from './services/geminiService';
import GeometryCanvas from './components/GeometryCanvas';
import TriangleListItem from './components/TriangleListItem';
import InputPanel from './components/Toolbar';
import { BrainCircuit, Sparkles, Calculator, RefreshCw, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { downloadDXF } from './utils/dxfExport';

const App: React.FC = () => {
  // State: The Definition is the source of truth
  // Initialize from localStorage if available to persist data across reloads
  const [defs, setDefs] = useState<TriangleDef[]>(() => {
    try {
      const savedDefs = localStorage.getItem('geosolver_triangle_defs');
      if (savedDefs) {
        return JSON.parse(savedDefs);
      }
    } catch (e) {
      console.error("Failed to load saved geometry:", e);
    }
    // Default State: Create a 5-5-5 triangle initially
    return [{
      id: generateId(),
      name: 'T1',
      color: PALETTE[0],
      isRoot: true,
      sideA: 5,
      sideB: 5,
      sideC: 5
    }];
  });
  
  // Derived State: Rendered geometry
  const [geometry, setGeometry] = useState<{ points: any[], triangles: RenderedTriangle[] }>({ points: [], triangles: [] });
  
  // Selection & Input State
  const [selectedTriangleId, setSelectedTriangleId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ triangleId: string, edgeIndex: 0 | 1 | 2 } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  
  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult>({ text: "", loading: false });
  const [userQuery, setUserQuery] = useState("");

  // Sidebar state (default open)
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Standalone edges (for starting without triangles)
  const [standaloneEdges, setStandaloneEdges] = useState<StandaloneEdge[]>([]);

  // Root triangle placement mode
  const [rootPlacingMode, setRootPlacingMode] = useState<{ sideA: number; sideB: number; sideC: number } | null>(null);

  // Undo history
  const [history, setHistory] = useState<{ defs: TriangleDef[], edges: StandaloneEdge[] }[]>([]);
  const isUndoing = useRef(false);
  const MAX_HISTORY = 50;

  // Save current state to history before making changes
  const saveToHistory = useCallback(() => {
    if (isUndoing.current) return;
    setHistory(prev => {
      const newHistory = [...prev, { defs: JSON.parse(JSON.stringify(defs)), edges: JSON.parse(JSON.stringify(standaloneEdges)) }];
      // Limit history size
      if (newHistory.length > MAX_HISTORY) {
        return newHistory.slice(-MAX_HISTORY);
      }
      return newHistory;
    });
  }, [defs, standaloneEdges]);

  // Undo function
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;

    isUndoing.current = true;
    const prevState = history[history.length - 1];
    setDefs(prevState.defs);
    setStandaloneEdges(prevState.edges);
    setHistory(prev => prev.slice(0, -1));

    // Reset undo flag after state updates
    setTimeout(() => {
      isUndoing.current = false;
    }, 0);
  }, [history]);

  // Keyboard shortcut for Undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo]);

  // Check if two line segments overlap (share the same line and have overlapping ranges)
  const edgesOverlap = (edge: StandaloneEdge, p1: Point, p2: Point, tolerance: number = 0.1): boolean => {
    // Check if all 4 points are collinear
    const cross1 = (p2.x - p1.x) * (edge.p1.y - p1.y) - (p2.y - p1.y) * (edge.p1.x - p1.x);
    const cross2 = (p2.x - p1.x) * (edge.p2.y - p1.y) - (p2.y - p1.y) * (edge.p2.x - p1.x);

    // If not collinear, no overlap
    const edgeLen = distance(p1, p2);
    if (Math.abs(cross1) > tolerance * edgeLen || Math.abs(cross2) > tolerance * edgeLen) {
      return false;
    }

    // Check if the standalone edge endpoints are within or very close to the triangle edge
    // Project edge points onto the line segment p1-p2
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return false;

    // Get projection parameters for both edge endpoints
    const t1 = ((edge.p1.x - p1.x) * dx + (edge.p1.y - p1.y) * dy) / lenSq;
    const t2 = ((edge.p2.x - p1.x) * dx + (edge.p2.y - p1.y) * dy) / lenSq;

    // Check perpendicular distance from edge endpoints to the line
    const proj1X = p1.x + t1 * dx;
    const proj1Y = p1.y + t1 * dy;
    const proj2X = p1.x + t2 * dx;
    const proj2Y = p1.y + t2 * dy;

    const dist1 = Math.sqrt((edge.p1.x - proj1X) ** 2 + (edge.p1.y - proj1Y) ** 2);
    const dist2 = Math.sqrt((edge.p2.x - proj2X) ** 2 + (edge.p2.y - proj2Y) ** 2);

    // If points are not close to the line, no overlap
    if (dist1 > tolerance || dist2 > tolerance) {
      return false;
    }

    // Check if the segments overlap: standalone edge must be mostly within the triangle edge
    // The standalone edge overlaps if both its endpoints project onto (or near) the triangle edge
    const minT = Math.min(t1, t2);
    const maxT = Math.max(t1, t2);

    // Allow some tolerance outside the segment
    const toleranceT = tolerance / Math.sqrt(lenSq);

    // Check if there's significant overlap (standalone edge is at least partially within triangle edge)
    return maxT >= -toleranceT && minT <= 1 + toleranceT;
  };

  // Garbage collect standalone edges that overlap with triangle edges
  const garbageCollectEdges = (triangleList: RenderedTriangle[], edges: StandaloneEdge[]): StandaloneEdge[] => {
    return edges.filter(edge => {
      // Check against all triangle edges
      for (const t of triangleList) {
        const triangleEdges: [Point, Point][] = [
          [t.p1, t.p2],
          [t.p2, t.p3],
          [t.p3, t.p1]
        ];

        for (const [tp1, tp2] of triangleEdges) {
          if (edgesOverlap(edge, tp1, tp2)) {
            return false; // Edge overlaps, should be removed
          }
        }
      }
      return true; // No overlap, keep the edge
    });
  };

  // Persist to localStorage whenever defs change
  useEffect(() => {
    localStorage.setItem('geosolver_triangle_defs', JSON.stringify(defs));
  }, [defs]);

  // Re-calculate geometry whenever definitions change
  useEffect(() => {
    const calculated = recalculateGeometry(defs);
    setGeometry(calculated);

    // Garbage collect standalone edges that now overlap with triangle edges
    if (calculated.triangles.length > 0 && standaloneEdges.length > 0) {
      const remainingEdges = garbageCollectEdges(calculated.triangles, standaloneEdges);
      if (remainingEdges.length !== standaloneEdges.length) {
        setStandaloneEdges(remainingEdges);
      }
    }
  }, [defs]);

  // Handlers
  const handleAddRootTriangle = (values: { s1: string, s2: string, s3: string }) => {
    const sA = parseFloat(values.s1);
    const sB = parseFloat(values.s2);
    const sC = parseFloat(values.s3);

    if (isNaN(sA) || isNaN(sB) || isNaN(sC)) {
      return;
    }

    // Validate triangle inequality
    if (!isValidRootTriangle(sA, sB, sC)) {
      alert('三角形として成立しません。任意の2辺の和が残りの1辺より大きい必要があります。');
      return;
    }

    // Enter canvas placement mode
    setRootPlacingMode({ sideA: sA, sideB: sB, sideC: sC });
  };

  // Handle completion of root triangle placement on canvas
  const handleRootPlacingComplete = (origin: Point, angle: number) => {
    if (!rootPlacingMode) return;

    const { sideA, sideB, sideC } = rootPlacingMode;

    // Calculate p2 position based on origin and angle
    const p2: Point = {
      id: 'p2',
      x: origin.x + sideA * Math.cos(angle),
      y: origin.y + sideA * Math.sin(angle)
    };

    const newDef: TriangleDef = {
      id: generateId(),
      name: `T${defs.length + 1}`,
      color: PALETTE[defs.length % PALETTE.length],
      isRoot: true,
      sideA: sideA,
      sideB: sideB,
      sideC: sideC,
      originP1: origin,
      originP2: p2
    };

    saveToHistory();
    setDefs([...defs, newDef]);
    setRootPlacingMode(null);
  };

  const handleRootPlacingCancel = () => {
    setRootPlacingMode(null);
  };

  const handleAddAttachedTriangle = (values: { s1: string, s2: string }) => {
    if (!selectedEdge) return;

    const sL = parseFloat(values.s1);
    const sR = parseFloat(values.s2);

    if (isNaN(sL) || isNaN(sR)) return;

    const newDef: TriangleDef = {
      id: generateId(),
      name: `T${defs.length + 1}`,
      color: PALETTE[defs.length % PALETTE.length],
      isRoot: false,
      attachedToTriangleId: selectedEdge.triangleId,
      attachedEdgeIndex: selectedEdge.edgeIndex,
      sideLeft: sL,
      sideRight: sR,
      flip: false // Default direction
    };

    saveToHistory();
    setDefs([...defs, newDef]);
    setSelectedEdge(null); // Clear selection after add
  };

  const handleCanvasAddTriangle = (triangleId: string, edgeIndex: 0 | 1 | 2, sideLeft: number, sideRight: number, flip: boolean) => {
    // Validate that both sides are positive and valid
    if (sideLeft <= 0 || sideRight <= 0 || isNaN(sideLeft) || isNaN(sideRight)) {
      return; // Don't add invalid triangle
    }

    // Get the parent triangle to find the reference edge length
    const parentTriangle = geometry.triangles.find(t => t.id === triangleId);
    if (!parentTriangle) return;

    let refEdge = 0;
    if (edgeIndex === 0) {
      refEdge = distance(parentTriangle.p1, parentTriangle.p2);
    } else if (edgeIndex === 1) {
      refEdge = distance(parentTriangle.p2, parentTriangle.p3);
    } else {
      refEdge = distance(parentTriangle.p3, parentTriangle.p1);
    }

    // Validate triangle inequality
    if (!isValidAttachedTriangle(refEdge, sideLeft, sideRight)) {
      alert('三角形として成立しません。\n2辺の和が参照辺より大きい必要があります。');
      return;
    }

    const newDef: TriangleDef = {
      id: generateId(),
      name: `T${defs.length + 1}`,
      color: PALETTE[defs.length % PALETTE.length],
      isRoot: false,
      attachedToTriangleId: triangleId,
      attachedEdgeIndex: edgeIndex,
      sideLeft: parseFloat(sideLeft.toFixed(2)),
      sideRight: parseFloat(sideRight.toFixed(2)),
      flip: flip
    };
    saveToHistory();
    setDefs([...defs, newDef]);
    setSelectedEdge(null); // Clear selection after adding
  };

  const handleVertexReshape = (triangleId: string, sideLeft: number, sideRight: number, flip: boolean) => {
    // Validate that both sides are positive and valid
    if (sideLeft <= 0 || sideRight <= 0 || isNaN(sideLeft) || isNaN(sideRight)) {
      return;
    }

    saveToHistory();
    setDefs(defs.map(d => {
      if (d.id !== triangleId) return d;

      if (d.isRoot) {
        // For root triangle, update sideB (left) and sideC (right), keep sideA (base)
        // Note: geometryUtils uses !def.flip for root triangles, so we invert here
        return {
          ...d,
          sideB: parseFloat(sideLeft.toFixed(2)),
          sideC: parseFloat(sideRight.toFixed(2)),
          flip: !flip
        };
      } else {
        // For attached triangle, update sideLeft and sideRight
        return {
          ...d,
          sideLeft: parseFloat(sideLeft.toFixed(2)),
          sideRight: parseFloat(sideRight.toFixed(2)),
          flip: flip
        };
      }
    }));
  };

  // Add a standalone edge
  const handleAddStandaloneEdge = (p1: Point, p2: Point) => {
    const len = distance(p1, p2);
    const newEdge: StandaloneEdge = {
      id: generateId(),
      p1,
      p2,
      length: parseFloat(len.toFixed(2))
    };
    saveToHistory();
    setStandaloneEdges(prev => [...prev, newEdge]); // Allow multiple edges
  };

  // Create triangle from a standalone edge
  const handleAddTriangleFromEdge = (edgeId: string, sideLeft: number, sideRight: number, flip: boolean) => {
    const edge = standaloneEdges.find(e => e.id === edgeId);
    if (!edge) return;

    // Create root triangle with the edge as side A, preserving edge position
    const newDef: TriangleDef = {
      id: generateId(),
      name: `T${defs.length + 1}`,
      color: PALETTE[defs.length % PALETTE.length],
      isRoot: true,
      sideA: edge.length,
      sideB: parseFloat(sideLeft.toFixed(2)),
      sideC: parseFloat(sideRight.toFixed(2)),
      originP1: edge.p1, // Use original edge coordinates
      originP2: edge.p2,
      flip: !flip // Invert because geometryUtils uses !flip for root
    };

    saveToHistory();
    setDefs(prev => [...prev, newDef]);
    // Remove only this edge, keep others
    setStandaloneEdges(prev => prev.filter(e => e.id !== edgeId));
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setSelectedEdge(null);
    setSelectedTriangleId(id);
  };

  const handleUpdateTriangle = (values: any) => {
    if (!editingId) return;

    saveToHistory();
    setDefs(defs.map(d => {
      if (d.id !== editingId) return d;
      
      if (d.isRoot) {
        return {
          ...d,
          sideA: parseFloat(values.s1),
          sideB: parseFloat(values.s2),
          sideC: parseFloat(values.s3)
        };
      } else {
        return {
          ...d,
          sideLeft: parseFloat(values.s1),
          sideRight: parseFloat(values.s2)
        };
      }
    }));
    setEditingId(null);
  };

  // Direct dimension update from Canvas
  const handleDimensionUpdate = (triangleId: string, edgeIndex: 0 | 1 | 2, newValue: number): boolean => {
    if (isNaN(newValue) || newValue <= 0) {
      alert('値は0より大きい数値である必要があります。');
      return false;
    }

    const triangleDef = defs.find(d => d.id === triangleId);
    if (!triangleDef) return false;

    // Validate before updating
    if (triangleDef.isRoot) {
      // Root Mapping: 0=A, 1=C, 2=B (See utils/geometryUtils.ts)
      let sideA = triangleDef.sideA || 0;
      let sideB = triangleDef.sideB || 0;
      let sideC = triangleDef.sideC || 0;
      
      if (edgeIndex === 0) sideA = newValue;
      else if (edgeIndex === 1) sideC = newValue;
      else if (edgeIndex === 2) sideB = newValue;

      if (!isValidRootTriangle(sideA, sideB, sideC)) {
        alert('三角形として成立しません。\n任意の2辺の和が残りの1辺より大きい必要があります。');
        return false;
      }
    } else {
      // Attached Mapping: 0=Ref, 1=R, 2=L
      if (edgeIndex === 0) return false; // Ref is locked to parent
      
      // Get parent triangle to find reference edge length
      const parentTriangle = geometry.triangles.find(t => t.id === triangleDef.attachedToTriangleId);
      if (!parentTriangle) return false;

      let refEdge = 0;
      if (triangleDef.attachedEdgeIndex === 0) {
        refEdge = distance(parentTriangle.p1, parentTriangle.p2);
      } else if (triangleDef.attachedEdgeIndex === 1) {
        refEdge = distance(parentTriangle.p2, parentTriangle.p3);
      } else {
        refEdge = distance(parentTriangle.p3, parentTriangle.p1);
      }

      let sideLeft = triangleDef.sideLeft || 0;
      let sideRight = triangleDef.sideRight || 0;

      if (edgeIndex === 1) sideRight = newValue;
      else if (edgeIndex === 2) sideLeft = newValue;

      if (!isValidAttachedTriangle(refEdge, sideLeft, sideRight)) {
        alert('三角形として成立しません。\n参照辺の長さが他の2辺の和より小さい必要があります。');
        return false;
      }
    }

    // Update if validation passed
    saveToHistory();
    setDefs(prevDefs => prevDefs.map(d => {
      if (d.id !== triangleId) return d;

      if (d.isRoot) {
        // Root Mapping: 0=A, 1=C, 2=B (See utils/geometryUtils.ts)
        if (edgeIndex === 0) return { ...d, sideA: newValue };
        if (edgeIndex === 1) return { ...d, sideC: newValue };
        if (edgeIndex === 2) return { ...d, sideB: newValue };
      } else {
        // Attached Mapping: 0=Ref, 1=R, 2=L
        if (edgeIndex === 0) return d; // Ref is locked to parent
        if (edgeIndex === 1) return { ...d, sideRight: newValue };
        if (edgeIndex === 2) return { ...d, sideLeft: newValue };
      }
      return d;
    }));
    return true;
  };

  // Renumber triangles sequentially (T1, T2, T3, ...)
  const renumberTriangles = (triangleDefs: TriangleDef[]): TriangleDef[] => {
    return triangleDefs.map((def, index) => ({
      ...def,
      name: `T${index + 1}`
    }));
  };

  const handleDelete = (id: string) => {
    if(window.confirm("Delete this triangle? Attached triangles may disappear.")) {
        saveToHistory();
        const filtered = defs.filter(d => d.id !== id && d.attachedToTriangleId !== id);
        setDefs(renumberTriangles(filtered));
        if (selectedTriangleId === id) setSelectedTriangleId(null);
        if (editingId === id) setEditingId(null);
    }
  };

  // Delete triangle via long press (with confirmation dialog)
  const handleDeleteTriangle = (id: string) => {
    saveToHistory();
    const filtered = defs.filter(d => d.id !== id && d.attachedToTriangleId !== id);
    setDefs(renumberTriangles(filtered));
    if (selectedTriangleId === id) setSelectedTriangleId(null);
    if (editingId === id) setEditingId(null);
  };

  // Delete standalone edge via long press
  const handleDeleteStandaloneEdge = (id: string) => {
    saveToHistory();
    setStandaloneEdges(prev => prev.filter(e => e.id !== id));
  };

  // Update standalone edge length
  const handleUpdateStandaloneEdgeLength = (id: string, newLength: number) => {
    if (newLength <= 0) return;

    saveToHistory();
    setStandaloneEdges(prev => prev.map(edge => {
      if (edge.id !== id) return edge;

      // Scale the edge from p1 towards p2
      const dx = edge.p2.x - edge.p1.x;
      const dy = edge.p2.y - edge.p1.y;
      const currentLen = Math.sqrt(dx * dx + dy * dy);

      if (currentLen === 0) return edge;

      const scale = newLength / currentLen;
      const newP2: Point = {
        id: edge.p2.id,
        x: edge.p1.x + dx * scale,
        y: edge.p1.y + dy * scale
      };

      return {
        ...edge,
        p2: newP2,
        length: newLength
      };
    }));
  };

  const handleClear = () => {
    if (window.confirm("Clear all geometry?")) {
      saveToHistory();
      setDefs([]);
      setStandaloneEdges([]);
      setSelectedTriangleId(null);
      setSelectedEdge(null);
      setEditingId(null);
      setAiAnalysis({ text: "", loading: false });
    }
  };

  const handleReload = () => {
    if (window.confirm("ページをリロードしますか？未保存の変更は失われます。")) {
      window.location.reload();
    }
  };

  const handleEdgeDoubleClick = (tId: string, edgeIndex: 0 | 1 | 2) => {
      // Enter phantom mode for attaching a new triangle
      if (!editingId) {
        setSelectedEdge({ triangleId: tId, edgeIndex: edgeIndex });
      }
  };

  const handleBackgroundClick = () => {
      setSelectedEdge(null);
      setSelectedTriangleId(null);
      setEditingId(null);
  };

  const handleAskAI = async () => {
    setAiAnalysis({ ...aiAnalysis, loading: true });
    try {
      const result = await analyzeGeometry(geometry.points, geometry.triangles, userQuery);
      setAiAnalysis({ text: result, loading: false });
    } catch (e) {
      setAiAnalysis({ text: "Error connecting to AI service.", loading: false });
    }
  };

  const totalArea = geometry.triangles.reduce((acc, t) => acc + t.area, 0);

  // Calculate which edges are already occupied (have a child triangle attached)
  // Format: "triangleId-edgeIndex"
  // We need to mark BOTH the parent's edge AND the child's Ref edge (index 0) as occupied
  const occupiedEdges = useMemo(() => {
    const occupied = new Set<string>();
    defs.forEach(d => {
      if (!d.isRoot && d.attachedToTriangleId !== undefined && d.attachedEdgeIndex !== undefined) {
        // Mark the parent's edge as occupied
        const parentEdgeKey = `${d.attachedToTriangleId}-${d.attachedEdgeIndex}`;
        occupied.add(parentEdgeKey);
        // Mark the child's Ref edge (edge 0) as occupied too
        const childRefEdgeKey = `${d.id}-0`;
        occupied.add(childRefEdgeKey);
      }
    });
    return occupied;
  }, [defs]);

  // Determine Input Panel Props
  let inputMode: 'ROOT' | 'ATTACH' | 'EDIT_ROOT' | 'EDIT_ATTACHED' | null = null;
  let inputInitialValues = undefined;
  let inputSubmit = undefined;
  let inputCancel = undefined;

  const editingDef = editingId ? defs.find(d => d.id === editingId) : null;

  if (editingDef) {
    inputMode = editingDef.isRoot ? 'EDIT_ROOT' : 'EDIT_ATTACHED';
    inputInitialValues = editingDef.isRoot
        ? { s1: editingDef.sideA, s2: editingDef.sideB, s3: editingDef.sideC }
        : { s1: editingDef.sideLeft, s2: editingDef.sideRight };
    inputSubmit = handleUpdateTriangle;
    inputCancel = () => setEditingId(null);
  } else if (selectedEdge) {
    // Only show ATTACH panel if the edge is not occupied
    const isEdgeOccupied = occupiedEdges.has(`${selectedEdge.triangleId}-${selectedEdge.edgeIndex}`);
    if (!isEdgeOccupied) {
      inputMode = 'ATTACH';
      // Suggestions for new triangle (User can type over these)
      inputInitialValues = { s1: 5, s2: 5 };
      inputSubmit = handleAddAttachedTriangle;
      inputCancel = () => setSelectedEdge(null);
    }
  } else {
    // Default: show ROOT panel to add new base triangle
    inputMode = 'ROOT';
    inputInitialValues = { s1: 5, s2: 5, s3: 5 }; // Default suggestions
    inputSubmit = handleAddRootTriangle;
  }

  const parentTriangleName = selectedEdge
    ? geometry.triangles.find(t => t.id === selectedEdge.triangleId)?.name
    : '';

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
                <Calculator size={20} />
            </div>
            <div>
                <h1 className="text-lg font-bold text-slate-800 tracking-tight">GeoSolver: Triangulation</h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Area Unfolding Tool</p>
            </div>
        </div>
        <div className="flex items-center gap-2">
             <button
                 onClick={handleReload}
                 className="text-xs text-blue-600 font-medium px-3 py-1.5 hover:bg-blue-50 rounded transition-colors flex items-center gap-1.5"
                 title="ページをリロード"
             >
                 <RefreshCw size={14} />
                 リロード
             </button>
             <button
                 onClick={() => downloadDXF(geometry.triangles)}
                 className="text-xs text-green-600 font-medium px-3 py-1.5 hover:bg-green-50 rounded transition-colors flex items-center gap-1.5"
                 title="DXF形式でエクスポート"
             >
                 <Download size={14} />
                 DXF
             </button>
             <button onClick={handleClear} className="text-xs text-red-600 font-medium px-3 py-1.5 hover:bg-red-50 rounded transition-colors">
                 Reset All
             </button>
             <div className="bg-slate-100 px-3 py-1.5 rounded text-xs font-mono text-slate-600 border border-slate-200">
                 Total Area: <span className="font-bold text-slate-900">{totalArea.toFixed(2)}</span>
             </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Canvas Area - Always full width */}
        <div className="flex-1 flex flex-col relative bg-slate-100">
          <GeometryCanvas
            triangles={geometry.triangles}
            mode={ToolMode.VIEW}
            selectedTriangleId={selectedTriangleId}
            onSelectTriangle={setSelectedTriangleId}
            onEdgeSelect={(tId, idx) => {
                if (!editingId) setSelectedEdge({ triangleId: tId, edgeIndex: idx });
            }}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            onDimensionChange={handleDimensionUpdate}
            onAddAttachedTriangle={handleCanvasAddTriangle}
            onVertexReshape={handleVertexReshape}
            onBackgroundClick={handleBackgroundClick}
            selectedEdge={selectedEdge}
            occupiedEdges={occupiedEdges}
            standaloneEdges={standaloneEdges}
            onAddStandaloneEdge={handleAddStandaloneEdge}
            onAddTriangleFromEdge={handleAddTriangleFromEdge}
            onDeleteTriangle={handleDeleteTriangle}
            onDeleteStandaloneEdge={handleDeleteStandaloneEdge}
            onUpdateStandaloneEdgeLength={handleUpdateStandaloneEdgeLength}
            rootPlacingMode={rootPlacingMode}
            onRootPlacingComplete={handleRootPlacingComplete}
            onRootPlacingCancel={handleRootPlacingCancel}
          />

          {/* Prompt Overlay */}
          {rootPlacingMode ? (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-500/90 backdrop-blur px-4 py-2 rounded-lg shadow-lg border border-blue-300 text-sm text-white flex items-center gap-3">
                <span><span className="font-bold">1. 起点をクリック</span> → <span className="font-bold">2. 角度を決めてクリック</span></span>
                <button
                  onClick={handleRootPlacingCancel}
                  className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-medium"
                >
                  キャンセル
                </button>
             </div>
          ) : !inputMode && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-lg shadow-lg border border-blue-100 text-sm text-blue-800 pointer-events-none">
                <span className="font-medium">ダブルクリック</span>で三角形追加 / <span className="font-medium">クリック</span>で寸法編集
             </div>
          )}
        </div>

        {/* Right: Collapsible Sidebar - Overlay style for full canvas when closed */}
        <div
          className={`absolute top-0 right-0 h-full bg-white border-l border-slate-200 flex flex-col shadow-xl z-20 transition-transform duration-300 ease-in-out w-96 max-w-[85vw] ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {/* Sidebar content always rendered but hidden via transform */}
          <div className={`flex flex-col h-full ${sidebarOpen ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}>
            <>
              {/* Input Area (Dynamic) */}
              {inputMode && inputSubmit ? (
                  <InputPanel
                    key={inputMode + (editingId || selectedEdge?.triangleId || '') + (selectedEdge?.edgeIndex ?? '') + 'panel'}
                    mode={inputMode}
                    parentTriangleName={parentTriangleName}
                    initialValues={inputInitialValues}
                    onSubmit={inputSubmit}
                    onCancel={inputCancel}
                  />
              ) : (
                 <div className="p-6 text-center text-slate-400 bg-slate-50 border-b border-slate-100">
                    <p className="text-sm">Select an edge to add attached triangle.</p>
                    <p className="text-xs mt-2 opacity-70">Single click a dimension on canvas to edit it.</p>
                 </div>
              )}

              {/* List Title */}
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-sm font-semibold text-slate-700">Triangle List</h2>
                <span className="text-xs bg-white border px-2 py-0.5 rounded text-slate-500">{defs.length}</span>
              </div>

              {/* List Content */}
              <div className="flex-1 overflow-y-auto p-3 bg-slate-50/50">
                {defs.map(def => {
                    // Find parent triangle name for attached triangles
                    const parentDef = def.attachedToTriangleId
                      ? defs.find(d => d.id === def.attachedToTriangleId)
                      : null;
                    return (
                      <TriangleListItem
                          key={def.id}
                          def={def}
                          isSelected={selectedTriangleId === def.id || editingId === def.id}
                          onSelect={setSelectedTriangleId}
                          onDelete={handleDelete}
                          onEdit={() => handleEdit(def.id)}
                          parentName={parentDef?.name}
                      />
                    );
                })}
              </div>

              {/* AI Analysis Section */}
              <div className="p-4 border-t border-slate-200 bg-white">
                <div className="flex items-center gap-2 mb-2 text-blue-600 font-medium text-sm">
                    <BrainCircuit size={16} />
                    <span>AI Geometric Assistant</span>
                </div>

                <textarea
                    className="w-full text-xs border border-slate-300 rounded-md p-2 mb-2 focus:ring-1 focus:ring-blue-500 outline-none resize-none bg-slate-50"
                    rows={2}
                    placeholder="Ask about shape, area, or layout..."
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                />

                <button
                    onClick={handleAskAI}
                    disabled={aiAnalysis.loading || defs.length === 0}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-2 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-2"
                >
                    {aiAnalysis.loading ? (
                        <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>
                    ) : (
                        <Sparkles size={14} />
                    )}
                    Analyze Structure
                </button>

                {aiAnalysis.text && (
                    <div className="mt-3 p-3 bg-slate-50 rounded border border-slate-200 text-xs text-slate-700 max-h-32 overflow-y-auto leading-relaxed">
                        {aiAnalysis.text}
                    </div>
                )}
              </div>
            </>
          </div>
        </div>

        {/* Sidebar Toggle Button - Positioned at sidebar edge */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-l-md p-2 shadow-md hover:bg-slate-50 z-30 transition-all duration-300 ease-in-out"
          style={{ right: sidebarOpen ? 'min(384px, 85vw)' : '0' }}
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {sidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </div>
  );
};

export default App;
