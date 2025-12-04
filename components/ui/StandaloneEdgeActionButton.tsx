import React from 'react';
import { Trash2 } from 'lucide-react';

interface StandaloneEdgeActionButtonProps {
  x: number;  // Screen position
  y: number;
  onDelete: () => void;
}

export const StandaloneEdgeActionButton: React.FC<StandaloneEdgeActionButtonProps> = ({
  x,
  y,
  onDelete
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
        onClick={onDelete}
        className="
          flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg
          bg-red-500 hover:bg-red-600 active:bg-red-700 text-white
          transition-all duration-150 ease-out
          hover:scale-105 active:scale-95
        "
        title="Delete edge"
      >
        <Trash2 size={16} />
        <span className="text-sm font-medium whitespace-nowrap">削除</span>
      </button>
    </div>
  );
};

