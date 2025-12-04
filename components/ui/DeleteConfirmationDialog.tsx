import React, { useState } from 'react';

interface DeleteConfirmationDialogProps {
      type: 'triangle' | 'edge';
      name: string;
      onConfirm: () => void;
      onCancel: () => void;
}

export const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
      type,
      name,
      onConfirm,
      onCancel
}) => {
      const [input, setInput] = useState('');

      const handleConfirm = () => {
            if (input.toLowerCase() === 'del') {
                  onConfirm();
                  setInput('');
            }
      };

      const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && input.toLowerCase() === 'del') {
                  handleConfirm();
            } else if (e.key === 'Escape') {
                  onCancel();
            }
      };

      return (
            <div
                  className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
                  onClick={onCancel}
            >
                  <div
                        className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border border-slate-200"
                        onClick={(e) => e.stopPropagation()}
                  >
                        <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                                    <span className="text-slate-600 text-xl">🗑</span>
                              </div>
                              <div>
                                    <h3 className="text-lg font-bold text-slate-800">Delete {name}?</h3>
                                    <p className="text-sm text-slate-500">This action cannot be undone</p>
                              </div>
                        </div>

                        {type === 'triangle' && (
                              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
                                    <p className="text-sm text-amber-700">
                                          <strong>Note:</strong> All triangles connected to {name} will also be deleted.
                                    </p>
                              </div>
                        )}

                        <div className="mb-4">
                              <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Type <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">del</span> to confirm:
                              </label>
                              <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                                    placeholder="del"
                                    autoFocus
                              />
                        </div>

                        <div className="flex gap-3">
                              <button
                                    onClick={onCancel}
                                    className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium"
                              >
                                    Cancel
                              </button>
                              <button
                                    onClick={handleConfirm}
                                    disabled={input.toLowerCase() !== 'del'}
                                    className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${input.toLowerCase() === 'del'
                                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                          }`}
                              >
                                    Confirm
                              </button>
                        </div>
                  </div>
            </div>
      );
};
