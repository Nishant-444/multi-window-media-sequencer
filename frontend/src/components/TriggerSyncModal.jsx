import React, { useState } from 'react';
import { X, Radio, Clock, Film, Image as ImageIcon, Sparkles } from 'lucide-react';

export default function TriggerSyncModal({
  isOpen,
  onClose,
  windows,
  onTriggerSync,
}) {
  if (!isOpen) return null;

  // Flatten all available media items across all windows
  const allMediaItems = [];
  windows.forEach((win) => {
    (win.media_items || []).forEach((item) => {
      allMediaItems.push({
        ...item,
        windowName: win.name,
      });
    });
  });

  const [selectedItemId, setSelectedItemId] = useState(
    allMediaItems.length > 0 ? allMediaItems[0].id : ''
  );
  const [duration, setDuration] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedItem = allMediaItems.find((m) => m.id === selectedItemId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedItemId) {
      setError('Please select a media item to synchronize');
      return;
    }
    if (duration <= 0) {
      setError('Duration must be greater than 0');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onTriggerSync(selectedItemId, duration);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to trigger sync override');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-rose-500/40 shadow-2xl shadow-rose-950/40 p-6 relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Trigger Sync Playback</h2>
            <p className="text-xs text-rose-300 font-mono">
              Synchronized Override Across All Windows
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-400 my-3 leading-relaxed">
          When triggered, the Golang backend will broadcast a <code className="text-cyan-400 font-mono text-[11px] bg-slate-900 px-1 py-0.5 rounded">SYNC_START</code> event to all connected display windows. Every window will immediately interrupt its current sequence and display the chosen media item. When the duration ends, each window seamlessly resumes its normal playlist.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Select Media Item */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Select Media Item to Sync
            </label>
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {allMediaItems.map((item) => {
                const isSelected = item.id === selectedItemId;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-rose-500/15 border-rose-500/60 shadow-md shadow-rose-950/30'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {item.type === 'video' ? (
                        <Film className="w-4 h-4 text-sky-400 shrink-0" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="text-xs font-semibold text-white truncate">
                          {item.title}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">
                          Source: {item.windowName}
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 shrink-0 ml-2">
                      {item.duration}s
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sync Duration Presets */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Sync Duration</span>
              <span className="text-rose-400 font-mono text-[11px] font-bold">
                {duration} seconds
              </span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[5, 10, 15, 30].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setDuration(sec)}
                  className={`py-1.5 rounded-lg text-xs font-mono font-semibold border transition ${
                    duration === sec
                      ? 'bg-rose-500/20 border-rose-500/60 text-rose-300'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          {/* Selected Item Preview */}
          {selectedItem && (
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-mono">
                  Sync Target Ready:
                </span>
                <p className="font-semibold text-white mt-0.5">{selectedItem.title}</p>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-mono font-bold">
                {duration}s Override
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedItemId}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white text-xs font-extrabold transition shadow-lg shadow-rose-500/30 disabled:opacity-50"
            >
              {loading ? 'Broadcasting...' : 'Broadcast Sync Over All Windows'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
