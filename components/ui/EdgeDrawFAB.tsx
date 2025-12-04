import React from 'react';
import { Pencil } from 'lucide-react';

interface EdgeDrawFABProps {
  isActive: boolean;
  onToggle: () => void;
}

export const EdgeDrawFAB: React.FC<EdgeDrawFABProps> = ({
  isActive,
  onToggle
}) => {
  return (
    <div
      className="fixed top-20 right-4 z-50 pointer-events-auto"
    >
      <button
        onClick={onToggle}
        className={`
          flex items-center justify-center w-14 h-14 rounded-full shadow-lg
          transition-all duration-200 ease-out
          ${isActive
            ? 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white'
            : 'bg-gray-400 hover:bg-gray-500 active:bg-gray-600 text-white'
          }
          hover:scale-110 active:scale-95
        `}
        title={isActive ? "Exit edge drawing mode" : "Enter edge drawing mode"}
      >
        <Pencil size={24} />
      </button>
    </div>
  );
};

