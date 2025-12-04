import React from 'react';

interface DebugConsoleProps {
      interactionType: string;
      selectedCount: number;
      logs: string[];
      onClear: () => void;
}

export const DebugConsole: React.FC<DebugConsoleProps> = ({
      interactionType,
      selectedCount,
      logs,
      onClear
}) => {
      return (
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-slate-900 text-green-400 font-mono text-xs overflow-y-auto border-t border-slate-700">
                  <div className="sticky top-0 bg-slate-800 px-2 py-1 flex justify-between items-center border-b border-slate-700">
                        <span className="text-slate-400">
                              Debug: <span className="text-yellow-400">{interactionType}</span> | Selected: <span className="text-cyan-400">{selectedCount}</span>
                        </span>
                        <button
                              onClick={onClear}
                              className="text-slate-500 hover:text-white px-2"
                        >
                              Clear
                        </button>
                  </div>
                  <div className="p-2 space-y-0.5">
                        {logs.map((log, i) => (
                              <div key={i} className="whitespace-nowrap">{log}</div>
                        ))}
                        {logs.length === 0 && <div className="text-slate-500">No logs...</div>}
                  </div>
            </div>
      );
};
