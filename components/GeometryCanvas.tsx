
import React, { useRef, useState, useEffect } from 'react';
import { RenderedTriangle, ToolMode, Point } from '../types';
import { getCentroid, distance } from '../utils/geometryUtils';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface GeometryCanvasProps {
  triangles: RenderedTriangle[];
  phantomTriangle?: RenderedTriangle | null;
  mode: ToolMode;
  selectedTriangleId: string | null;
  onSelectTriangle: (id: string) => void;
  onEdgeSelect: (triangleId: string, edgeIndex: 0 | 1 | 2) => void;
  onEdgeDoubleClick: (triangleId: string, edgeIndex: 0 | 1 | 2) => void;
  onDimensionChange?: (triangleId: string, edgeIndex: 0 | 1 | 2, newValue: number) => void;
  onAddAttachedTriangle?: (triangleId: string, edgeIndex: 0 | 1 | 2, sideLeft: number, sideRight: number) => void;
  onPhantomClick?: () => void;
  onBackgroundClick?: () => void;
  selectedEdge: { triangleId: string, edgeIndex: 0 | 1 | 2 } | null;
}

type InteractionState = 
  | { type: 'IDLE' }
  | { type: 'PAN_READY'; startX: number; startY: number }
  | { type: 'PANNING'; lastX: number; lastY: number }
  | { type: 'EDGE_READY'; tId: string; index: 0 | 1 | 2; p1: Point; p2: Point; startX: number; startY: number }
  | { type: 'EDGE_DRAGGING'; tId: string; index: 0 | 1 | 2; p1: Point; p2: Point; currentMouse: Point };

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
  onPhantomClick,
  onBackgroundClick,
  selectedEdge
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Viewport state
  const [viewBox, setViewBox] = useState({ x: -10, y: -10, w: 50, h: 40 });
  const [interaction, setInteraction] = useState<InteractionState>({ type: 'IDLE' });

  // Inline editing state
  const [editingDim, setEditingDim] = useState<{ tId: string, index: 0 | 1 | 2, value: string } | null>(null);

  // Helper to get SVG coordinates from mouse event
  const getSvgPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = viewBox.x + (clientX - rect.left) * (viewBox.w / rect.width);
    const y = viewBox.y + (clientY - rect.top) * (viewBox.h / rect.height);
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only handle background clicks here
    if (e.button === 0 && !editingDim) { 
       setInteraction({ type: 'PAN_READY', startX: e.clientX, startY: e.clientY });
    }
  };

  const handleEdgeMouseDown = (e: React.MouseEvent, tId: string, index: 0 | 1 | 2, p1: Point, p2: Point) => {
      e.stopPropagation();
      if (e.button === 0 && !editingDim) {
          setInteraction({ 
              type: 'EDGE_READY', 
              tId, 
              index, 
              p1, 
              p2, 
              startX: e.clientX, 
              startY: e.clientY 
          });
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (interaction.type === 'PAN_READY') {
        const dist = Math.sqrt(Math.pow(e.clientX - interaction.startX, 2) + Math.pow(e.clientY - interaction.startY, 2));
        if (dist > 3) {
            setInteraction({ type: 'PANNING', lastX: e.clientX, lastY: e.clientY });
        }
    } else if (interaction.type === 'PANNING') {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const scaleX = viewBox.w / rect.width;
        const scaleY = viewBox.h / rect.height;
        const dx = (e.clientX - interaction.lastX) * scaleX;
        const dy = (e.clientY - interaction.lastY) * scaleY;
        setViewBox(prev => ({ ...prev, x: prev.x - dx, y: prev.y - dy }));
        setInteraction({ type: 'PANNING', lastX: e.clientX, lastY: e.clientY });
    } else if (interaction.type === 'EDGE_READY') {
        const dist = Math.sqrt(Math.pow(e.clientX - interaction.startX, 2) + Math.pow(e.clientY - interaction.startY, 2));
        if (dist > 5) {
            const currentMouse = getSvgPoint(e.clientX, e.clientY);
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
        const currentMouse = getSvgPoint(e.clientX, e.clientY);
        setInteraction({ ...interaction, currentMouse });
    }
  };

  const handleMouseUp = () => {
    if (interaction.type === 'EDGE_READY') {
        // Clicked but didn't drag -> Select Edge
        onEdgeSelect(interaction.tId, interaction.index);
    } else if (interaction.type === 'EDGE_DRAGGING') {
        // Finished dragging -> Add Triangle
        if (onAddAttachedTriangle) {
            const { p1, p2, currentMouse, tId, index } = interaction;
            const sideLeft = distance(p1, currentMouse);
            const sideRight = distance(p2, currentMouse);
            onAddAttachedTriangle(tId, index, sideLeft, sideRight);
        }
    } else if (interaction.type === 'PAN_READY') {
        // Clicked without dragging (panning)
        if (onBackgroundClick) {
            onBackgroundClick();
        }
    }
    setInteraction({ type: 'IDLE' });
  };

  const handleWheel = (e: React.WheelEvent) => {
      e.stopPropagation();
      const zoomSensitivity = 0.001;
      const delta = e.deltaY;
      const scaleFactor = 1 + Math.min(Math.max(delta * zoomSensitivity, -0.5), 0.5);

      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const unitsPerPixelW = viewBox.w / rect.width;
      const unitsPerPixelH = viewBox.h / rect.height;
      const mouseX = viewBox.x + mx * unitsPerPixelW;
      const mouseY = viewBox.y + my * unitsPerPixelH;

      const newW = viewBox.w * scaleFactor;
      const newH = viewBox.h * scaleFactor;
      const newX = mouseX - (mx / rect.width) * newW;
      const newY = mouseY - (my / rect.height) * newH;

      setViewBox({ x: newX, y: newY, w: newW, h: newH });
  };

  const handleZoomBtn = (direction: 'in' | 'out') => {
      const factor = direction === 'in' ? 0.8 : 1.25;
      const newW = viewBox.w * factor;
      const newH = viewBox.h * factor;
      const dx = (viewBox.w - newW) / 2;
      const dy = (viewBox.h - newH) / 2;
      setViewBox(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy, w: newW, h: newH }));
  };

  const handleFitView = () => {
      setViewBox({ x: -10, y: -10, w: 50, h: 40 });
  };

  const handleLabelClick = (e: React.MouseEvent, tId: string, index: 0 | 1 | 2, currentLen: number, label: string) => {
      e.stopPropagation();
      if (label === 'Ref') return; // Cannot edit Ref edges directly here
      setEditingDim({ tId, index, value: currentLen.toString() });
  };

  const commitEdit = () => {
      if (!editingDim || !onDimensionChange) {
          setEditingDim(null);
          return;
      }
      const val = parseFloat(editingDim.value);
      if (!isNaN(val) && val > 0) {
          onDimensionChange(editingDim.tId, editingDim.index, val);
      }
      setEditingDim(null);
  };

  // Render Grid Lines
  const renderGrid = () => {
    let step = 1;
    if (viewBox.w > 200) step = 50;
    else if (viewBox.w > 100) step = 10;
    else if (viewBox.w > 20) step = 5;
    else step = 1;

    const startX = Math.floor(viewBox.x / step) * step;
    const startY = Math.floor(viewBox.y / step) * step;
    const endX = viewBox.x + viewBox.w;
    const endY = viewBox.y + viewBox.h;

    const lines = [];
    for (let x = startX; x <= endX; x += step) {
        const isMajor = Math.abs(x % (step * 5)) < 0.001 || Math.abs(x) < 0.001; 
        lines.push(
            <line 
                key={`v${x}`} x1={x} y1={viewBox.y} x2={x} y2={endY} 
                stroke={x === 0 ? "#94a3b8" : (isMajor ? "#cbd5e1" : "#e2e8f0")} 
                strokeWidth={x === 0 ? (viewBox.w / 400) : (viewBox.w / 800)} 
                vectorEffect="non-scaling-stroke"
            />
        );
        if (isMajor) {
            lines.push(
                <text key={`vt${x}`} x={x + step*0.1} y={viewBox.y + viewBox.h * 0.95} fontSize={viewBox.w / 40} fill="#94a3b8" className="select-none pointer-events-none">
                    {Math.round(x)}m
                </text>
            );
        }
    }
    for (let y = startY; y <= endY; y += step) {
        const isMajor = Math.abs(y % (step * 5)) < 0.001 || Math.abs(y) < 0.001;
        lines.push(
            <line 
                key={`h${y}`} x1={viewBox.x} y1={y} x2={endX} y2={y} 
                stroke={y === 0 ? "#94a3b8" : (isMajor ? "#cbd5e1" : "#e2e8f0")} 
                strokeWidth={y === 0 ? (viewBox.w / 400) : (viewBox.w / 800)}
                vectorEffect="non-scaling-stroke"
            />
        );
         if (isMajor) {
            lines.push(
                <text key={`ht${y}`} x={viewBox.x + viewBox.w * 0.01} y={y - step*0.1} fontSize={viewBox.w / 40} fill="#94a3b8" className="select-none pointer-events-none">
                    {Math.round(y)}m
                </text>
            );
        }
    }
    return <g pointerEvents="none">{lines}</g>;
  };

  const renderEdge = (t: RenderedTriangle, pStart: Point, pEnd: Point, index: 0 | 1 | 2, isPhantom: boolean = false) => {
      const isSelectedEdge = selectedEdge?.triangleId === t.id && selectedEdge?.edgeIndex === index;
      const isSelectedTriangle = selectedTriangleId === t.id;
      const rawLen = distance(pStart, pEnd);
      const len = rawLen.toFixed(2);
      
      const midX = (pStart.x + pEnd.x) / 2;
      const midY = (pStart.y + pEnd.y) / 2;
      const dx = pEnd.x - pStart.x;
      const dy = pEnd.y - pStart.y;
      
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle > 90 || angle < -90) {
        angle += 180;
      }
      
      const uiScale = viewBox.w / 50; 
      
      const centroid = getCentroid(t);
      const vx = midX - centroid.x;
      const vy = midY - centroid.y;
      const vLen = Math.sqrt(vx * vx + vy * vy);
      
      let labelX = midX;
      let labelY = midY;
      
      if (vLen > 0.0001) {
          const offsetDist = 1.3 * uiScale; 
          labelX += (vx / vLen) * offsetDist;
          labelY += (vy / vLen) * offsetDist;
      }

      const edgeLabel = t.edgeLabels ? t.edgeLabels[index] : '';
      const isEditing = editingDim?.tId === t.id && editingDim?.index === index;

      return (
          <g key={`edge-${t.id}-${index}`} className="group">
              {/* Hit Area & Drag Trigger */}
              <line 
                x1={pStart.x} y1={pStart.y} x2={pEnd.x} y2={pEnd.y} 
                stroke="transparent" 
                strokeWidth={1 * uiScale * 5} 
                className={isPhantom ? "cursor-default" : "cursor-crosshair"}
                onMouseDown={(e) => !isPhantom && handleEdgeMouseDown(e, t.id, index, pStart, pEnd)}
              />
              {/* Visible Edge */}
              <line 
                x1={pStart.x} y1={pStart.y} x2={pEnd.x} y2={pEnd.y} 
                stroke={isSelectedEdge ? "#ef4444" : (isPhantom ? "#94a3b8" : "rgba(0,0,0,0.2)")} 
                strokeWidth={isSelectedEdge ? 0.3 * uiScale : 0.05 * uiScale} 
                strokeDasharray={isSelectedEdge ? "none" : (isPhantom ? `${0.2 * uiScale},${0.2 * uiScale}` : `${0.5 * uiScale},${0.5 * uiScale}`)}
                pointerEvents="none"
              />
              {/* Label Group */}
              <g transform={`translate(${labelX}, ${labelY}) rotate(${angle})`}>
                 {isEditing ? (
                     <foreignObject 
                        x={-2.5 * uiScale} 
                        y={-1.2 * uiScale} 
                        width={5 * uiScale} 
                        height={2.4 * uiScale}
                     >
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <input 
                                type="number"
                                value={editingDim.value}
                                onChange={(e) => setEditingDim({...editingDim, value: e.target.value})}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter') commitEdit();
                                    if(e.key === 'Escape') setEditingDim(null);
                                    e.stopPropagation();
                                }}
                                onBlur={commitEdit}
                                autoFocus
                                step="any"
                                style={{
                                    width: '100%',
                                    height: '80%',
                                    fontSize: '12px',
                                    textAlign: 'center',
                                    border: '2px solid #3b82f6',
                                    borderRadius: '4px',
                                    outline: 'none',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                                    backgroundColor: 'white',
                                    color: '#0f172a'
                                }}
                            />
                        </div>
                     </foreignObject>
                 ) : (
                    <>
                        {/* Background Pill - Click to Edit */}
                        <rect 
                            x={-2.2 * uiScale} y={-1.1 * uiScale} width={4.4 * uiScale} height={2.2 * uiScale} 
                            rx={0.5 * uiScale} 
                            fill="white" fillOpacity="0.85" 
                            className={isPhantom ? "pointer-events-none" : "cursor-text shadow-sm"}
                            stroke={isSelectedTriangle ? "#3b82f6" : "none"}
                            strokeWidth={0.05 * uiScale}
                            onClick={(e) => !isPhantom && handleLabelClick(e, t.id, index, rawLen, edgeLabel)}
                        />
                        
                        <text 
                            textAnchor="middle" dominantBaseline="middle" 
                            fontSize={0.8 * uiScale}
                            className="fill-slate-600 font-mono pointer-events-none select-none font-semibold"
                        >
                            {edgeLabel && (
                                <tspan 
                                    fontWeight={isSelectedTriangle ? "bold" : "normal"}
                                    fill={edgeLabel === 'Ref' ? '#94a3b8' : (isSelectedTriangle ? '#3b82f6' : '#64748b')}
                                    dx="-0.2em"
                                >
                                    {edgeLabel}: 
                                </tspan>
                            )}
                            <tspan dx={edgeLabel ? "0.2em" : "0"}>{len}m</tspan>
                        </text>
                    </>
                 )}
              </g>
          </g>
      );
  };

  const renderTriangle = (t: RenderedTriangle, isPhantom: boolean = false) => {
      const isSelected = selectedTriangleId === t.id;
      const centroid = getCentroid(t);
      const uiScale = viewBox.w / 50;

      return (
        <g key={t.id}>
          <path
            d={`M ${t.p1.x} ${t.p1.y} L ${t.p2.x} ${t.p2.y} L ${t.p3.x} ${t.p3.y} Z`}
            fill={isPhantom ? "#cbd5e1" : t.color}
            fillOpacity={isPhantom ? 0.3 : (isSelected ? 0.6 : 0.2)}
            stroke={isPhantom ? "#94a3b8" : t.color}
            strokeWidth={isPhantom ? 0.05 * uiScale : (isSelected ? 0.2 * uiScale : 0.05 * uiScale)}
            strokeDasharray={isPhantom ? `${0.2 * uiScale},${0.2 * uiScale}` : "none"}
            onClick={(e) => { 
                e.stopPropagation(); 
                if (isPhantom && onPhantomClick) {
                    onPhantomClick();
                } else {
                    onSelectTriangle(t.id); 
                }
            }}
            className={`transition-all hover:opacity-80 ${isPhantom ? "cursor-pointer" : "cursor-pointer"}`}
          />
          {renderEdge(t, t.p1, t.p2, 0, isPhantom)}
          {renderEdge(t, t.p2, t.p3, 1, isPhantom)}
          {renderEdge(t, t.p3, t.p1, 2, isPhantom)}

           <text 
             x={centroid.x} 
             y={centroid.y} 
             textAnchor="middle" 
             dominantBaseline="middle"
             fontSize={1.2 * uiScale}
             className="font-bold pointer-events-none fill-slate-800 opacity-50"
           >
             {isPhantom ? "Add" : t.name}
           </text>
        </g>
      );
  }

  // Render Dragging Ghost Triangle
  const renderDragGhost = () => {
      if (interaction.type !== 'EDGE_DRAGGING') return null;
      const { p1, p2, currentMouse } = interaction;
      
      const sL = distance(p1, currentMouse).toFixed(2);
      const sR = distance(p2, currentMouse).toFixed(2);
      const uiScale = viewBox.w / 50;

      return (
          <g pointerEvents="none">
              <path 
                  d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${currentMouse.x} ${currentMouse.y} Z`}
                  fill="#94a3b8" fillOpacity="0.2"
                  stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={0.1 * uiScale}
              />
              <line x1={p1.x} y1={p1.y} x2={currentMouse.x} y2={currentMouse.y} stroke="#64748b" strokeWidth={0.05 * uiScale} />
              <line x1={p2.x} y1={p2.y} x2={currentMouse.x} y2={currentMouse.y} stroke="#64748b" strokeWidth={0.05 * uiScale} />
              
              {/* Labels for ghost sides */}
              <text x={(p1.x + currentMouse.x)/2} y={(p1.y + currentMouse.y)/2} fontSize={0.8 * uiScale} fill="#64748b" textAnchor="middle" stroke="white" strokeWidth={0.2 * uiScale} paintOrder="stroke">L: {sL}</text>
              <text x={(p2.x + currentMouse.x)/2} y={(p2.y + currentMouse.y)/2} fontSize={0.8 * uiScale} fill="#64748b" textAnchor="middle" stroke="white" strokeWidth={0.2 * uiScale} paintOrder="stroke">R: {sR}</text>
          </g>
      );
  };

  return (
    <div className="flex-1 h-full relative bg-slate-50 overflow-hidden select-none">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className={`block w-full h-full ${interaction.type === 'PANNING' ? 'cursor-grabbing' : (interaction.type === 'EDGE_DRAGGING' ? 'cursor-grabbing' : 'cursor-default')}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {renderGrid()}
        {triangles.map((t) => renderTriangle(t, false))}
        {phantomTriangle && renderTriangle(phantomTriangle, true)}
        {renderDragGhost()}
      </svg>
      
      <div className="absolute bottom-6 right-6 flex flex-col gap-2">
          <button onClick={() => handleZoomBtn('in')} className="p-2 bg-white rounded-full shadow border border-slate-200 hover:bg-slate-50 text-slate-600">
              <ZoomIn size={20} />
          </button>
          <button onClick={() => handleZoomBtn('out')} className="p-2 bg-white rounded-full shadow border border-slate-200 hover:bg-slate-50 text-slate-600">
              <ZoomOut size={20} />
          </button>
           <button onClick={handleFitView} className="p-2 bg-white rounded-full shadow border border-slate-200 hover:bg-slate-50 text-slate-600" title="Reset View">
              <Maximize size={20} />
          </button>
      </div>
      
      <div className="absolute bottom-4 left-4 bg-white/80 backdrop-blur px-3 py-2 rounded shadow-sm text-[10px] text-slate-500 border border-slate-200 pointer-events-none">
        <p className="font-semibold">Controls:</p>
        <p>• Click Label: <span className="text-blue-600 font-bold">Edit Dimension</span></p>
        <p>• Drag Edge: <span className="text-emerald-600 font-bold">Add New Triangle</span></p>
        <p>• Scroll: Zoom / Drag BG: Pan</p>
      </div>
    </div>
  );
};

export default GeometryCanvas;
