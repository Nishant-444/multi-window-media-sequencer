import React, { useState } from 'react';
import { X, Monitor } from 'lucide-react';

export default function AddWindowModal({ isOpen, onClose, onAddWindow }) {
  if (!isOpen) return null;

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Window name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onAddWindow(name.trim());
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create window');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-slate-700/80 shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Add New Display Window</h2>
            <p className="text-xs text-slate-400">Register a new screen in the sequencer</p>
          </div>
        </div>

        {error && (
          <div className="my-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Window / Screen Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Window 4 - Rooftop Terrace"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

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
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition shadow-md shadow-cyan-500/20 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Window'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
