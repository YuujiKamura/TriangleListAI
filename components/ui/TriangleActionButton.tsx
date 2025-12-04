import React from 'react';
import { Move } from 'lucide-react';

interface TriangleActionButtonProps {
      x: number;  // Screen position
      y: number;
      onReshape: () => void;
      disabled?: boolean;
}

export const TriangleActionButton: React.FC<TriangleActionButtonProps> = ({
      x,
      y,
      onReshape,
      disabled = false
}) => {
      return (
            <div
                  className="absolute pointer-events-auto"
                  style={{
                        left: x,
                        top: y,
                        transform: 'translate(-50%, -50%)',
                        zIndex: 100,
                  }}
            >
                  <button
                        onClick={onReshape}
                        disabled={disabled}
                        className={`
          flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg
          transition-all duration-150 ease-out
          ${disabled
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white hover:scale-105 active:scale-95'
                              }
        `}
                        title="Reshape triangle vertex"
                  >
                        <Move size={16} />
                        <span className="text-sm font-medium whitespace-nowrap">変形</span>
                  </button>
            </div>
      );
};
