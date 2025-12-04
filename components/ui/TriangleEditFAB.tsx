import React from 'react';
import { Triangle } from 'lucide-react';

interface TriangleEditFABProps {
  isActive: boolean;
  onToggle: () => void;
}

export const TriangleEditFAB: React.FC<TriangleEditFABProps> = ({
  isActive,
  onToggle
}) => {
  return (
    <div
      className="fixed top-36 right-4 z-50 pointer-events-auto"
    >
      <button
        onClick={onToggle}
        className={`
          flex items-center justify-center w-14 h-14 rounded-full shadow-lg
          transition-all duration-200 ease-out
          ${isActive
            ? 'bg-green-500 hover:bg-green-600 active:bg-green-700 text-white'
            : 'bg-gray-400 hover:bg-gray-500 active:bg-gray-600 text-white'
          }
          hover:scale-110 active:scale-95
        `}
        title={isActive ? "Exit triangle editing mode" : "Enter triangle editing mode"}
      >
        <Triangle size={24} />
      </button>
    </div>
  );
};

