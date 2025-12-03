
import React from 'react';
import { TriangleDef } from '../types';
import { Edit2, ArrowRight } from 'lucide-react';

interface TriangleListItemProps {
  def: TriangleDef;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}

const TriangleListItem: React.FC<TriangleListItemProps> = ({ 
  def, 
  isSelected, 
  onSelect,
  onDelete,
  onEdit
}) => {
  return (
    <div 
      className={`p-3 border rounded-lg mb-2 transition-all cursor-pointer relative group ${
        isSelected 
          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
          : 'border-slate-200 hover:border-blue-300 hover:bg-white'
      }`}
      onClick={() => onSelect(def.id)}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 overflow-hidden">
            <div 
              className="w-3 h-3 rounded-full flex-shrink-0" 
              style={{ backgroundColor: def.color }}
            ></div>
            <span className="font-bold text-slate-700 truncate">{def.name}</span>
            {def.isRoot && <span className="text-[10px] bg-slate-200 px-1.5 rounded text-slate-600 flex-shrink-0">ROOT</span>}
        </div>
        
        <div className="flex items-center gap-1">
             <button 
              onClick={(e) => { e.stopPropagation(); onEdit(def.id); }}
              className="text-slate-400 hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
              title="Edit"
            >
              <Edit2 size={14} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(def.id); }}
              className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
              title="Delete"
            >
              ×
            </button>
        </div>
      </div>

      <div className="text-xs text-slate-500 font-mono">
        {def.isRoot ? (
          <div className="flex gap-1 w-full">
            <div className="bg-slate-100 px-1 py-1 rounded text-center flex-1 min-w-0 truncate" title={`Side A: ${def.sideA}`}>A:{def.sideA}</div>
            <div className="bg-slate-100 px-1 py-1 rounded text-center flex-1 min-w-0 truncate" title={`Side B: ${def.sideB}`}>B:{def.sideB}</div>
            <div className="bg-slate-100 px-1 py-1 rounded text-center flex-1 min-w-0 truncate" title={`Side C: ${def.sideC}`}>C:{def.sideC}</div>
          </div>
        ) : (
          <div className="flex items-center gap-1 w-full">
            <span className="bg-slate-100 px-2 py-1 rounded flex-1 text-center min-w-0 truncate" title={`Left: ${def.sideLeft}`}>L:{def.sideLeft}</span>
            <span className="bg-slate-100 px-2 py-1 rounded flex-1 text-center min-w-0 truncate" title={`Right: ${def.sideRight}`}>R:{def.sideRight}</span>
            <ArrowRight size={12} className="text-slate-400 flex-shrink-0"/>
            <span className="truncate flex-1 text-right text-[10px]">Ref:{def.attachedToTriangleId?.substring(0,4)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TriangleListItem;
