import React, { useState, useEffect } from 'react';

interface InputPanelProps {
  mode: 'ROOT' | 'ATTACH' | 'EDIT_ROOT' | 'EDIT_ATTACHED';
  initialValues?: { s1?: number | string, s2?: number | string, s3?: number | string };
  parentTriangleName?: string;
  onSubmit: (values: any) => void;
  onCancel?: () => void;
}

const InputPanel: React.FC<InputPanelProps> = ({
  mode,
  parentTriangleName,
  initialValues,
  onSubmit,
  onCancel
}) => {
  const [values, setValues] = useState(() => {
    if (initialValues) {
      return {
        s1: initialValues.s1?.toString() || '',
        s2: initialValues.s2?.toString() || '',
        s3: initialValues.s3?.toString() || ''
      };
    }
    return { s1: '', s2: '', s3: '' };
  });

  // Reset values when mode or initialValues change (for when key doesn't change)
  useEffect(() => {
    if (initialValues) {
        const newValues = {
            s1: initialValues.s1?.toString() || '',
            s2: initialValues.s2?.toString() || '',
            s3: initialValues.s3?.toString() || ''
        };
        setValues(newValues);
    } else {
        setValues({ s1: '', s2: '', s3: '' });
    }
  }, [mode, parentTriangleName, initialValues]);

  const handleChange = (field: string, val: string) => {
    const newValues = { ...values, [field]: val };
    setValues(newValues);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  const isRootMode = mode === 'ROOT' || mode === 'EDIT_ROOT';
  const isEdit = mode.startsWith('EDIT');

  const getTitle = () => {
      if (mode === 'ROOT') return 'Create Base Triangle (SSS)';
      if (mode === 'EDIT_ROOT') return 'Edit Base Triangle';
      if (mode === 'EDIT_ATTACHED') return 'Edit Attached Triangle';
      return <><span className="text-slate-500">Attach to</span> <span className="text-blue-600 bg-blue-50 px-1 rounded">{parentTriangleName}</span></>;
  };

  return (
    <div className="bg-white p-4 border-b border-slate-200 shadow-sm z-10 transition-all">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        {getTitle()}
      </h3>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex gap-2 w-full">
            {isRootMode ? (
                <>
                    <div className="flex-1 min-w-0">
                        <label className="text-[10px] text-slate-400 block mb-1 truncate">Side A (Base)</label>
                        <input autoFocus type="number" step="any" placeholder="Len" className="input-field" value={values.s1} onChange={e => handleChange('s1', e.target.value)} required />
                    </div>
                    <div className="flex-1 min-w-0">
                        <label className="text-[10px] text-slate-400 block mb-1 truncate">Side B (Left)</label>
                        <input type="number" step="any" placeholder="Len" className="input-field" value={values.s2} onChange={e => handleChange('s2', e.target.value)} required />
                    </div>
                    <div className="flex-1 min-w-0">
                        <label className="text-[10px] text-slate-400 block mb-1 truncate">Side C (Right)</label>
                        <input type="number" step="any" placeholder="Len" className="input-field" value={values.s3} onChange={e => handleChange('s3', e.target.value)} required />
                    </div>
                </>
            ) : (
                <>
                    <div className="flex-1 min-w-0">
                        <label className="text-[10px] text-slate-400 block mb-1 truncate">Left Side</label>
                        <input autoFocus type="number" step="any" placeholder="Len" className="input-field" value={values.s1} onChange={e => handleChange('s1', e.target.value)} required />
                    </div>
                    <div className="flex-1 min-w-0">
                        <label className="text-[10px] text-slate-400 block mb-1 truncate">Right Side</label>
                        <input type="number" step="any" placeholder="Len" className="input-field" value={values.s2} onChange={e => handleChange('s2', e.target.value)} required />
                    </div>
                </>
            )}
        </div>
        
        <div className="flex gap-2 mt-1">
            <button type="submit" className={`flex-1 text-white text-sm py-2 rounded-md font-medium transition-colors whitespace-nowrap ${isEdit ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {isEdit ? 'Update Triangle' : (mode === 'ROOT' ? 'Create Base' : 'Add Triangle')}
            </button>
            {onCancel && (
                <button type="button" onClick={onCancel} className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-sm whitespace-nowrap">
                    Cancel
                </button>
            )}
        </div>
      </form>
      <style>{`
        .input-field {
            @apply px-2 py-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full min-w-0;
        }
      `}</style>
    </div>
  );
};

export default InputPanel;