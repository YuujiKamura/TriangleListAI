import React from 'react';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface CanvasControlsProps {
      onZoomIn: () => void;
      onZoomOut: () => void;
      onFitView: () => void;
}

export const CanvasControls: React.FC<CanvasControlsProps> = ({
      onZoomIn,
      onZoomOut,
      onFitView
}) => {
      return (
            <div className="absolute bottom-6 right-6 flex flex-col gap-3">
                  <button
                        onClick={onZoomIn}
                        className="p-3 bg-white/90 backdrop-blur rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 text-slate-600 active:scale-95 transition-all"
                  >
                        <ZoomIn size={24} />
                  </button>
                  <button
                        onClick={onZoomOut}
                        className="p-3 bg-white/90 backdrop-blur rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 text-slate-600 active:scale-95 transition-all"
                  >
                        <ZoomOut size={24} />
                  </button>
                  <button
                        onClick={onFitView}
                        className="p-3 bg-white/90 backdrop-blur rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 text-slate-600 active:scale-95 transition-all"
                        title="Reset View"
                  >
                        <Maximize size={24} />
                  </button>
            </div>
      );
};
