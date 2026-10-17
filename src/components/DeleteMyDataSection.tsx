import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteMyData } from '../lib/api';

// Right to erasure (audit F8). Two-step, in-app confirmation (no browser dialogs). On
// success the server has anonymised the account and deleted the person's evidence; this
// device's cached state and device id are cleared so nothing personal stays behind.
export const DeleteMyDataSection: React.FC = () => {
  const [stage, setStage] = useState<'idle' | 'confirm' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setStage('busy');
    setError(null);
    try {
      await deleteMyData();
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('safaiseva_'))
          .forEach((k) => localStorage.removeItem(k));
        if ('indexedDB' in window) indexedDB.deleteDatabase('keyval-store');
      } catch {
        /* storage blocked — the server side is already done */
      }
      setStage('done');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setError(e?.message || 'Could not delete your data. Check your connection and try again.');
      setStage('confirm');
    }
  };

  return (
    <div className="mt-5 pt-3.5 border-t border-zinc-800 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-white">Delete my data</div>
          <div className="text-[11px] text-zinc-400">
            Removes your account details, your photos and videos, and where you took them. Your
            household's credit history stays with the household.
          </div>
        </div>
        {stage === 'idle' && (
          <button
            type="button"
            onClick={() => setStage('confirm')}
            className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-red-950 text-zinc-200 border border-zinc-700 text-xs font-medium px-3 py-2 rounded-lg shrink-0 cursor-pointer min-h-[40px]"
          >
            <Trash2 size={13} aria-hidden="true" />
            <span>Delete…</span>
          </button>
        )}
      </div>
      {(stage === 'confirm' || stage === 'busy') && (
        <div className="bg-red-950/40 border border-red-900/60 rounded-lg p-3 space-y-2" role="alert">
          <p className="text-[11px] text-zinc-200">
            This cannot be undone. You will be signed out on this device.
          </p>
          {error && <p className="text-[11px] text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStage('idle')}
              disabled={stage === 'busy'}
              className="flex-1 text-xs text-zinc-300 border border-zinc-700 rounded-md min-h-[40px] cursor-pointer"
            >
              Keep my data
            </button>
            <button
              type="button"
              onClick={run}
              disabled={stage === 'busy'}
              className="flex-1 text-xs font-semibold text-white bg-red-700 hover:bg-red-600 rounded-md min-h-[40px] cursor-pointer disabled:opacity-50"
            >
              {stage === 'busy' ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </div>
      )}
      {stage === 'done' && <p className="text-[11px] text-emerald-400">Your data has been deleted.</p>}
    </div>
  );
};
