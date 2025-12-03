
import React, { useState, useEffect, useMemo } from 'react';
import { RenderedTriangle, TriangleDef, AIAnalysisResult, ToolMode } from './types';
import { generateId, recalculateGeometry, calculateAttachedTriangle } from './utils/geometryUtils';
import { PALETTE } from './constants';
import { analyzeGeometry } from './services/geminiService';
import GeometryCanvas from './components/GeometryCanvas';
import TriangleListItem from './components/TriangleListItem';
import InputPanel from './components/Toolbar';
import { BrainCircuit, Sparkles, Calculator } from 'lucide-react';

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
  
  // Keep track of current inputs to render phantom triangle in real-time
  const [currentInputValues, setCurrentInputValues] = useState({ s1: '', s2: '', s3: '' });
  
  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult>({ text: "", loading: false });
  const [userQuery, setUserQuery] = useState("");

  // Persist to localStorage whenever defs change
  useEffect(() => {
    localStorage.setItem('geosolver_triangle_defs', JSON.stringify(defs));
  }, [defs]);

  // Re-calculate geometry whenever definitions change
  useEffect(() => {
    const calculated = recalculateGeometry(defs);
    setGeometry(calculated);
  }, [defs]);

  // Handlers
  const handleAddRootTriangle = (values: { s1: string, s2: string, s3: string }) => {
    const sA = parseFloat(values.s1);
    const sB = parseFloat(values.s2);
    const sC = parseFloat(values.s3);

    if (isNaN(sA) || isNaN(sB) || isNaN(sC)) return;

    const newDef: TriangleDef = {
      id: generateId(),
      name: `T${defs.length + 1}`,
      color: PALETTE[defs.length % PALETTE.length],
      isRoot: true,
      sideA: sA,
      sideB: sB,
      sideC: sC
    };

    setDefs([...defs, newDef]);
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

    setDefs([...defs, newDef]);
    setSelectedEdge(null); // Clear selection after add
  };

  const handleCanvasAddTriangle = (triangleId: string, edgeIndex: 0 | 1 | 2, sideLeft: number, sideRight: number) => {
    const newDef: TriangleDef = {
      id: generateId(),
      name: `T${defs.length + 1}`,
      color: PALETTE[defs.length % PALETTE.length],
      isRoot: false,
      attachedToTriangleId: triangleId,
      attachedEdgeIndex: edgeIndex,
      sideLeft: parseFloat(sideLeft.toFixed(2)),
      sideRight: parseFloat(sideRight.toFixed(2)),
      flip: false // Assume default for now; user can flip in details if needed later
    };
    setDefs([...defs, newDef]);
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setSelectedEdge(null);
    setSelectedTriangleId(id);
  };

  const handleUpdateTriangle = (values: any) => {
    if (!editingId) return;

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
  const handleDimensionUpdate = (triangleId: string, edgeIndex: 0 | 1 | 2, newValue: number) => {
    if (isNaN(newValue) || newValue <= 0) return;

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
  };

  const handleDelete = (id: string) => {
    if(window.confirm("Delete this triangle? Attached triangles may disappear.")) {
        setDefs(defs.filter(d => d.id !== id && d.attachedToTriangleId !== id));
        if (selectedTriangleId === id) setSelectedTriangleId(null);
        if (editingId === id) setEditingId(null);
    }
  };

  const handleClear = () => {
    if (window.confirm("Clear all geometry?")) {
      setDefs([]);
      setSelectedTriangleId(null);
      setSelectedEdge(null);
      setEditingId(null);
      setAiAnalysis({ text: "", loading: false });
    }
  };

  const handleEdgeDoubleClick = (tId: string, edgeIndex: 0 | 1 | 2) => {
      setEditingId(tId);
      setSelectedTriangleId(tId);
      setSelectedEdge(null);
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
  } else if (defs.length === 0) {
    inputMode = 'ROOT';
    inputInitialValues = { s1: 5, s2: 5, s3: 5 }; // Default suggestions
    inputSubmit = handleAddRootTriangle;
  } else if (selectedEdge) {
    inputMode = 'ATTACH';
    // Suggestions for new triangle (User can type over these)
    inputInitialValues = { s1: 5, s2: 5 }; 
    inputSubmit = handleAddAttachedTriangle;
    inputCancel = () => setSelectedEdge(null);
  }

  const parentTriangleName = selectedEdge 
    ? geometry.triangles.find(t => t.id === selectedEdge.triangleId)?.name 
    : '';

  // Calculate Phantom Triangle (Preview)
  const phantomTriangle = useMemo(() => {
    if (!selectedEdge || !inputMode || inputMode !== 'ATTACH') return null;

    const parent = geometry.triangles.find(t => t.id === selectedEdge.triangleId);
    if (!parent) return null;

    // Use current input values, or defaults if invalid/empty
    const sL = parseFloat(currentInputValues.s1) || 5;
    const sR = parseFloat(currentInputValues.s2) || 5;

    return calculateAttachedTriangle(parent, {
        sideLeft: sL,
        sideRight: sR,
        attachedEdgeIndex: selectedEdge.edgeIndex,
        color: '#94a3b8'
    });
  }, [selectedEdge, inputMode, currentInputValues, geometry.triangles]);

  const handlePhantomClick = () => {
      // Trigger add with current values
      if (inputMode === 'ATTACH') {
          const val = {
              s1: currentInputValues.s1 || '5',
              s2: currentInputValues.s2 || '5'
          };
          handleAddAttachedTriangle(val);
      }
  };

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
             <button onClick={handleClear} className="text-xs text-red-600 font-medium px-3 py-1.5 hover:bg-red-50 rounded transition-colors">
                 Reset All
             </button>
             <div className="bg-slate-100 px-3 py-1.5 rounded text-xs font-mono text-slate-600 border border-slate-200">
                 Total Area: <span className="font-bold text-slate-900">{totalArea.toFixed(2)}</span>
             </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Canvas Area */}
        <div className="flex-1 flex flex-col relative bg-slate-100">
          <GeometryCanvas
            triangles={geometry.triangles}
            phantomTriangle={phantomTriangle}
            mode={ToolMode.VIEW}
            selectedTriangleId={selectedTriangleId}
            onSelectTriangle={setSelectedTriangleId}
            onEdgeSelect={(tId, idx) => {
                if (!editingId) setSelectedEdge({ triangleId: tId, edgeIndex: idx });
            }}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            onDimensionChange={handleDimensionUpdate}
            onAddAttachedTriangle={handleCanvasAddTriangle}
            onPhantomClick={handlePhantomClick}
            onBackgroundClick={handleBackgroundClick}
            selectedEdge={selectedEdge}
          />

          {/* Prompt Overlay */}
          {!inputMode && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-blue-100 text-sm text-blue-800 animate-in fade-in slide-in-from-top-4 pointer-events-none">
                👆 Drag an edge to add a triangle or click a dimension to edit
             </div>
          )}
        </div>

        {/* Right: Sidebar - Widened to w-96 */}
        <div className="w-96 bg-white border-l border-slate-200 flex flex-col shadow-xl z-20">
          
          {/* Input Area (Dynamic) */}
          {inputMode ? (
              <InputPanel 
                key={inputMode + (editingId || selectedEdge?.triangleId || selectedEdge?.edgeIndex || 'root')}
                mode={inputMode}
                parentTriangleName={parentTriangleName}
                initialValues={inputInitialValues}
                onSubmit={inputSubmit}
                onCancel={inputCancel}
                onValuesChange={setCurrentInputValues}
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
            {defs.map(def => (
                <TriangleListItem
                    key={def.id}
                    def={def}
                    isSelected={selectedTriangleId === def.id || editingId === def.id}
                    onSelect={setSelectedTriangleId}
                    onDelete={handleDelete}
                    onEdit={() => handleEdit(def.id)}
                />
            ))}
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

        </div>
      </div>
    </div>
  );
};

export default App;
