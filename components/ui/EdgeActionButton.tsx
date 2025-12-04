import React from 'react';
import { Triangle } from 'lucide-react';

interface EdgeActionButtonProps {
  x: number;  // Screen position
  y: number;
  onAddTriangle: () => void;
  disabled?: boolean;
}

export const EdgeActionButton: React.FC<EdgeActionButtonProps> = ({
  x,
  y,
  onAddTriangle,
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
        onClick={onAddTriangle}
        disabled={disabled}
        className={`
          flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg
          transition-all duration-150 ease-out
          ${disabled
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white hover:scale-105 active:scale-95'
          }
        `}
        title="Add triangle from this edge"
      >
        <Triangle size={16} />
        <span className="text-sm font-medium whitespace-nowrap">+</span>
      </button>
    </div>
  );
};
