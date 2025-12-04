import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RenderedTriangle, TriangleDef, ToolMode, StandaloneEdge, Point, EdgeSelection } from './types';
import { generateId, recalculateGeometry, isValidRootTriangle, isValidAttachedTriangle, distance } from './utils/geometryUtils';
import { PALETTE } from './constants';
import GeometryCanvas from './components/GeometryCanvas';
import { Calculator, RefreshCw, Download, Undo2 } from 'lucide-react';
import { downloadDXF } from './utils/dxfExport';

const App: React.FC = () => {
  // State: The Definition is the source of truth
  const [defs, setDefs] = useState<TriangleDef[]>(() => {
    try {
      const savedDefs = localStorage.getItem('geosolver_triangle_defs');
      if (savedDefs) {
        return JSON.parse(savedDefs);
      }
    } catch (e) {
      console.error("Failed to load saved geometry:", e);
    }
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

  // Selection State
  const [selectedTriangleId, setSelectedTriangleId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<EdgeSelection | null>(null);

  // Standalone edges
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

  // Edge overlap check
  const edgesOverlap = (edge: StandaloneEdge, p1: Point, p2: Point, tolerance: number = 0.1): boolean => {
    const cross1 = (p2.x - p1.x) * (edge.p1.y - p1.y) - (p2.y - p1.y) * (edge.p1.x - p1.x);
    const cross2 = (p2.x - p1.x) * (edge.p2.y - p1.y) - (p2.y - p1.y) * (edge.p2.x - p1.x);

    const edgeLen = distance(p1, p2);
    if (Math.abs(cross1) > tolerance * edgeLen || Math.abs(cross2) > tolerance * edgeLen) {
      return false;
    }

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return false;

    const t1 = ((edge.p1.x - p1.x) * dx + (edge.p1.y - p1.y) * dy) / lenSq;
    const t2 = ((edge.p2.x - p1.x) * dx + (edge.p2.y - p1.y) * dy) / lenSq;

    const proj1X = p1.x + t1 * dx;
    const proj1Y = p1.y + t1 * dy;
    const proj2X = p1.x + t2 * dx;
    const proj2Y = p1.y + t2 * dy;

    const dist1 = Math.sqrt((edge.p1.x - proj1X) ** 2 + (edge.p1.y - proj1Y) ** 2);
    const dist2 = Math.sqrt((edge.p2.x - proj2X) ** 2 + (edge.p2.y - proj2Y) ** 2);

    if (dist1 > tolerance || dist2 > tolerance) {
      return false;
    }

    const minT = Math.min(t1, t2);
    const maxT = Math.max(t1, t2);
    const toleranceT = tolerance / Math.sqrt(lenSq);

    return maxT >= -toleranceT && minT <= 1 + toleranceT;
  };

  // Garbage collect standalone edges
  const garbageCollectEdges = (triangleList: RenderedTriangle[], edges: StandaloneEdge[]): StandaloneEdge[] => {
    return edges.filter(edge => {
      for (const t of triangleList) {
        const triangleEdges: [Point, Point][] = [
          [t.p1, t.p2],
          [t.p2, t.p3],
          [t.p3, t.p1]
        ];

        for (const [tp1, tp2] of triangleEdges) {
          if (edgesOverlap(edge, tp1, tp2)) {
            return false;
          }
        }
      }
      return true;
    });
  };

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('geosolver_triangle_defs', JSON.stringify(defs));
  }, [defs]);

  // Re-calculate geometry
  useEffect(() => {
    const calculated = recalculateGeometry(defs);
    setGeometry(calculated);

    if (calculated.triangles.length > 0 && standaloneEdges.length > 0) {
      const remainingEdges = garbageCollectEdges(calculated.triangles, standaloneEdges);
      if (remainingEdges.length !== standaloneEdges.length) {
        setStandaloneEdges(remainingEdges);
      }
    }
  }, [defs]);

  // Handle root triangle placement completion
  const handleRootPlacingComplete = (origin: Point, angle: number) => {
    if (!rootPlacingMode) return;

    const { sideA, sideB, sideC } = rootPlacingMode;
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

  // Canvas triangle add
  const handleCanvasAddTriangle = (triangleId: string, edgeIndex: 0 | 1 | 2, sideLeft: number, sideRight: number, flip: boolean) => {
    if (sideLeft <= 0 || sideRight <= 0 || isNaN(sideLeft) || isNaN(sideRight)) {
      return;
    }

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
    setSelectedEdge(null);
  };

  // Vertex reshape
  const handleVertexReshape = (triangleId: string, sideLeft: number, sideRight: number, flip: boolean) => {
    if (sideLeft <= 0 || sideRight <= 0 || isNaN(sideLeft) || isNaN(sideRight)) {
      return;
    }

    saveToHistory();
    setDefs(defs.map(d => {
      if (d.id !== triangleId) return d;

      if (d.isRoot) {
        return {
          ...d,
          sideB: parseFloat(sideLeft.toFixed(2)),
          sideC: parseFloat(sideRight.toFixed(2)),
          flip: !flip
        };
      } else {
        return {
          ...d,
          sideLeft: parseFloat(sideLeft.toFixed(2)),
          sideRight: parseFloat(sideRight.toFixed(2)),
          flip: flip
        };
      }
    }));
  };

  // Add standalone edge
  const handleAddStandaloneEdge = (p1: Point, p2: Point) => {
    const len = distance(p1, p2);
    const newEdge: StandaloneEdge = {
      id: generateId(),
      p1,
      p2,
      length: parseFloat(len.toFixed(2))
    };
    saveToHistory();
    setStandaloneEdges(prev => [...prev, newEdge]);
  };

  // Create triangle from standalone edge
  const handleAddTriangleFromEdge = (edgeId: string, sideLeft: number, sideRight: number, flip: boolean) => {
    const edge = standaloneEdges.find(e => e.id === edgeId);
    if (!edge) return;

    const newDef: TriangleDef = {
      id: generateId(),
      name: `T${defs.length + 1}`,
      color: PALETTE[defs.length % PALETTE.length],
      isRoot: true,
      sideA: edge.length,
      sideB: parseFloat(sideLeft.toFixed(2)),
      sideC: parseFloat(sideRight.toFixed(2)),
      originP1: edge.p1,
      originP2: edge.p2,
      flip: !flip
    };

    saveToHistory();
    setDefs(prev => [...prev, newDef]);
    setStandaloneEdges(prev => prev.filter(e => e.id !== edgeId));
  };

  // Dimension update from canvas
  const handleDimensionUpdate = (triangleId: string, edgeIndex: 0 | 1 | 2, newValue: number): boolean => {
    if (isNaN(newValue) || newValue <= 0) {
      alert('値は0より大きい数値である必要があります。');
      return false;
    }

    const triangleDef = defs.find(d => d.id === triangleId);
    if (!triangleDef) return false;

    if (triangleDef.isRoot) {
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
      if (edgeIndex === 0) return false;

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

    saveToHistory();
    setDefs(prevDefs => prevDefs.map(d => {
      if (d.id !== triangleId) return d;

      if (d.isRoot) {
        if (edgeIndex === 0) return { ...d, sideA: newValue };
        if (edgeIndex === 1) return { ...d, sideC: newValue };
        if (edgeIndex === 2) return { ...d, sideB: newValue };
      } else {
        if (edgeIndex === 0) return d;
        if (edgeIndex === 1) return { ...d, sideRight: newValue };
        if (edgeIndex === 2) return { ...d, sideLeft: newValue };
      }
      return d;
    }));
    return true;
  };

  // Renumber triangles
  const renumberTriangles = (triangleDefs: TriangleDef[]): TriangleDef[] => {
    return triangleDefs.map((def, index) => ({
      ...def,
      name: `T${index + 1}`
    }));
  };

  // Delete triangle
  const handleDeleteTriangle = (id: string) => {
    saveToHistory();
    const filtered = defs.filter(d => d.id !== id && d.attachedToTriangleId !== id);
    setDefs(renumberTriangles(filtered));
    if (selectedTriangleId === id) setSelectedTriangleId(null);
  };

  // Delete standalone edge
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

  // Move triangles by offset
  const handleMoveTriangles = (ids: string[], dx: number, dy: number) => {
    console.log('handleMoveTriangles called:', { ids, dx, dy });
    saveToHistory();
    setDefs(prevDefs => prevDefs.map(def => {
      if (!ids.includes(def.id)) return def;

      // Only root triangles can be moved
      if (!def.isRoot) {
        console.log(`Skipping non-root triangle: ${def.id}`);
        return def;
      }

      // If originP1/P2 are not set, compute them from default position
      const sa = def.sideA || 10;
      const currentP1 = def.originP1 || { id: `p_${def.id}_1`, x: 0, y: 0 };
      const currentP2 = def.originP2 || { id: `p_${def.id}_2`, x: sa, y: 0 };

      console.log(`Moving ${def.id}: from (${currentP1.x}, ${currentP1.y}) by (${dx}, ${dy})`);

      const newOriginP1: Point = {
        ...currentP1,
        x: currentP1.x + dx,
        y: currentP1.y + dy
      };

      const newOriginP2: Point = {
        ...currentP2,
        x: currentP2.x + dx,
        y: currentP2.y + dy
      };

      console.log(`New origin: (${newOriginP1.x}, ${newOriginP1.y})`);

      return {
        ...def,
        originP1: newOriginP1,
        originP2: newOriginP2
      };
    }));
  };

  // Move standalone edges by offset
  const handleMoveStandaloneEdges = (ids: string[], dx: number, dy: number) => {
    saveToHistory();
    setStandaloneEdges(prev => prev.map(edge => {
      if (!ids.includes(edge.id)) return edge;

      return {
        ...edge,
        p1: { ...edge.p1, x: edge.p1.x + dx, y: edge.p1.y + dy },
        p2: { ...edge.p2, x: edge.p2.x + dx, y: edge.p2.y + dy }
      };
    }));
  };

  const handleClear = () => {
    if (window.confirm("全てのジオメトリをクリアしますか？")) {
      saveToHistory();
      setDefs([]);
      setStandaloneEdges([]);
      setSelectedTriangleId(null);
      setSelectedEdge(null);
    }
  };

  const handleBackgroundClick = () => {
    setSelectedEdge(null);
    setSelectedTriangleId(null);
  };

  const totalArea = geometry.triangles.reduce((acc, t) => acc + t.area, 0);

  // Calculate occupied edges
  const occupiedEdges = useMemo(() => {
    const occupied = new Set<string>();
    defs.forEach(d => {
      if (!d.isRoot && d.attachedToTriangleId !== undefined && d.attachedEdgeIndex !== undefined) {
        const parentEdgeKey = `${d.attachedToTriangleId}-${d.attachedEdgeIndex}`;
        occupied.add(parentEdgeKey);
        const childRefEdgeKey = `${d.id}-0`;
        occupied.add(childRefEdgeKey);
      }
    });
    return occupied;
  }, [defs]);

  // Find parent triangle for display
  const getParentName = (def: TriangleDef): string | null => {
    if (def.isRoot || !def.attachedToTriangleId) return null;
    const parent = defs.find(d => d.id === def.attachedToTriangleId);
    return parent?.name || null;
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-100 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white shadow-sm">
            <Calculator size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800">TriangleList</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 active:scale-95"
            title="元に戻す (Ctrl+Z)"
          >
            <Undo2 size={20} />
          </button>
          <button
            onClick={() => downloadDXF(geometry.triangles)}
            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors active:scale-95"
            title="DXF出力"
          >
            <Download size={20} />
          </button>
          <button
            onClick={handleClear}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors active:scale-95"
          >
            <RefreshCw size={20} />
          </button>
          <div className="bg-slate-100 px-3 py-1.5 rounded-md text-sm font-mono text-slate-600 border border-slate-200 ml-2">
            <span className="font-bold text-slate-900">{totalArea.toFixed(2)}</span> m²
          </div>
        </div>
      </header>

      {/* Triangle List - Horizontal scroll */}
      <div className="bg-white border-b border-slate-200 shadow-sm z-10">
        <div className="overflow-x-auto whitespace-nowrap py-3 px-2 no-scrollbar">
          {defs.length === 0 ? (
            <div className="flex items-center justify-center text-slate-400 text-sm py-2">
              キャンバスをダブルタップしてエッジを作成
            </div>
          ) : (
            <div className="flex gap-2">
              {defs.map(def => {
                const isSelected = selectedTriangleId === def.id;
                const parentName = getParentName(def);
                return (
                  <button
                    key={def.id}
                    onClick={() => setSelectedTriangleId(isSelected ? null : def.id)}
                    className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium border transition-all active:scale-95 ${isSelected
                        ? 'bg-blue-100 border-blue-400 text-blue-800 shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                  >
                    <span className="font-bold">{def.name}</span>
                    {def.isRoot ? (
                      <span className="text-slate-500 ml-1 text-xs">
                        ({def.sideA}/{def.sideB}/{def.sideC})
                      </span>
                    ) : (
                      <span className="text-slate-500 ml-1 text-xs">
                        ← {parentName} ({def.sideLeft}/{def.sideRight})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Canvas Area - Takes remaining space */}
      <div className="flex-1 relative">
        <GeometryCanvas
          triangles={geometry.triangles}
          mode={ToolMode.VIEW}
          selectedTriangleId={selectedTriangleId}
          onSelectTriangle={setSelectedTriangleId}
          onEdgeSelect={(tId, idx) => {
            setSelectedEdge({ type: 'triangleEdge', triangleId: tId, edgeIndex: idx });
          }}
          onEdgeDoubleClick={(tId, idx) => {
            setSelectedEdge({ type: 'triangleEdge', triangleId: tId, edgeIndex: idx });
          }}
          onDimensionChange={handleDimensionUpdate}
          onAddAttachedTriangle={handleCanvasAddTriangle}
          onVertexReshape={handleVertexReshape}
          onBackgroundClick={handleBackgroundClick}
          selectedEdge={selectedEdge}
          occupiedEdges={occupiedEdges}
          standaloneEdges={standaloneEdges}
          onStandaloneEdgeSelect={(edgeId) => {
            setSelectedEdge({ type: 'standaloneEdge', edgeId });
          }}
          onAddStandaloneEdge={handleAddStandaloneEdge}
          onAddTriangleFromEdge={handleAddTriangleFromEdge}
          onDeleteTriangle={handleDeleteTriangle}
          onDeleteStandaloneEdge={handleDeleteStandaloneEdge}
          onUpdateStandaloneEdgeLength={handleUpdateStandaloneEdgeLength}
          onMoveTriangles={handleMoveTriangles}
          onMoveStandaloneEdges={handleMoveStandaloneEdges}
          rootPlacingMode={rootPlacingMode}
          onRootPlacingComplete={handleRootPlacingComplete}
          onRootPlacingCancel={handleRootPlacingCancel}
        />

        {/* Placement mode overlay */}
        {rootPlacingMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-500/90 backdrop-blur px-4 py-2 rounded-lg shadow-lg border border-blue-300 text-sm text-white flex items-center gap-3 z-10">
            <span><span className="font-bold">1. 起点をクリック</span> → <span className="font-bold">2. 角度を決めてクリック</span></span>
            <button
              onClick={handleRootPlacingCancel}
              className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-medium"
            >
              キャンセル
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
