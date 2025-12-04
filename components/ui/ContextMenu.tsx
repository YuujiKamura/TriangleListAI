import React from 'react';

interface ContextMenuProps {
      x: number;
      y: number;
      targetType: 'triangle' | 'edge' | 'selection';
      targetId?: string;
      selectedIds: Set<string>;
      onClose: () => void;
      onMove: (targetIds: Set<string>) => void;
      onDelete: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
      x,
      y,
      targetType,
      targetId,
      selectedIds,
      onClose,
      onMove,
      onDelete
}) => {
      const handleMove = (e: React.MouseEvent) => {
            e.stopPropagation();

            // Determine the IDs to move
            let idsToMove: Set<string>;
            if (targetType === 'triangle' && targetId) {
                  idsToMove = selectedIds.has(targetId) ? selectedIds : new Set([targetId]);
            } else if (targetType === 'edge' && targetId) {
                  idsToMove = selectedIds.has(targetId) ? selectedIds : new Set([targetId]);
            } else {
                  idsToMove = selectedIds;
            }

            onMove(idsToMove);
      };

      const handleDelete = (e: React.MouseEvent) => {
            e.stopPropagation();
            onDelete();
      };

      return (
            <div
                  className="fixed bg-white/90 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200/50 py-2 z-50 min-w-40 overflow-hidden animation-fade-in"
                  style={{ left: x, top: y }}
                  onClick={onClose}
            >
                  {/* Move option - only show if something is selected or targeting a specific entity */}
                  {((targetType === 'selection' && selectedIds.size > 0) ||
                        (targetType === 'triangle' && targetId) ||
                        (targetType === 'edge' && targetId)) && (
                              <button
                                    className="w-full px-4 py-3 text-left text-base hover:bg-slate-100/50 flex items-center gap-3 text-blue-600 active:bg-blue-50"
                                    onClick={handleMove}
                              >
                                    <span className="text-lg">✥</span>
                                    <span className="font-medium">移動</span>
                              </button>
                        )}
                  {/* Delete option */}
                  <button
                        className="w-full px-4 py-3 text-left text-base hover:bg-slate-100/50 flex items-center gap-3 text-red-600 active:bg-red-50"
                        onClick={handleDelete}
                  >
                        <span className="text-lg">🗑</span>
                        <span className="font-medium">削除</span>
                  </button>
            </div>
      );
};
