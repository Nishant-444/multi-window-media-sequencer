import React, { useState } from 'react';
import { X, Film, Image as ImageIcon, Moon, Sparkles } from 'lucide-react';

const PRESET_ASSETS = [
  {
    title: 'Majestic Waterfall Video',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    duration: 15,
  },
  {
    title: 'Neon Cyberpunk City (Image)',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80',
    duration: 10,
  },
  {
    title: 'Minimalist Architecture (Image)',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80',
    duration: 12,
  },
  {
    title: 'Ambient Break (Blank State)',
    type: 'blank',
    url: '',
    duration: 5,
  },
];

export default function AddMediaModal({
  isOpen,
  onClose,
  windows,
  initialWindowId,
  onAddMedia,
}) {
  if (!isOpen) return null;

  const [selectedWindowId, setSelectedWindowId] = useState(
    initialWindowId || (windows.length > 0 ? windows[0].id : '')
  );
  const [title, setTitle] = useState('');
  const [type, setType] = useState('image');
  const [url, setUrl] = useState('');
  const [duration, setDuration] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleApplyPreset = (preset) => {
    setTitle(preset.title);
    setType(preset.type);
    setUrl(preset.url);
    setDuration(preset.duration);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedWindowId) {
      setError('Please select a target window');
      return;
    }
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (type !== 'blank' && !url.trim()) {
      setError('URL is required for video and image media');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onAddMedia(selectedWindowId, {
        title,
        type,
        url: type === 'blank' ? '' : url,
        duration: parseInt(duration, 10),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add media item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-slate-700/80 shadow-2xl p-6 relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-white mb-1">Add Media Item</h2>
        <p className="text-xs text-slate-400 mb-4">
          Dynamically append media to a window's continuous playlist sequence.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Quick Presets */}
        <div className="mb-4">
          <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1 mb-2">
            <Sparkles className="w-3 h-3 text-cyan-400" /> One-Click Presets for Fast Testing:
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_ASSETS.map((preset, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="text-left p-2 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800/80 transition text-xs group"
              >
                <div className="font-semibold text-slate-300 group-hover:text-white truncate">
                  {preset.title}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5 uppercase">
                  {preset.type} • {preset.duration}s
                </div>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target Window */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Target Window
            </label>
            <select
              value={selectedWindowId}
              onChange={(e) => setSelectedWindowId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Media Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Media Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('image')}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition ${
                  type === 'image'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" /> Image
              </button>

              <button
                type="button"
                onClick={() => setType('video')}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition ${
                  type === 'video'
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <Film className="w-3.5 h-3.5" /> Video
              </button>

              <button
                type="button"
                onClick={() => setType('blank')}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition ${
                  type === 'blank'
                    ? 'bg-slate-700/60 text-slate-200 border-slate-600'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <Moon className="w-3.5 h-3.5" /> Blank Fallback
              </button>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Title / Label
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Summer Promotional Reel"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* URL (Hidden if blank) */}
          {type !== 'blank' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Asset URL (Direct HTTPS link to image or MP4)
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://images.unsplash.com/... or https://.../video.mp4"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono text-[11px]"
              />
            </div>
          )}

          {/* Duration */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Duration (Seconds)
            </label>
            <input
              type="number"
              min="1"
              max="3600"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
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
              {loading ? 'Adding...' : 'Add to Window Playlist'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
