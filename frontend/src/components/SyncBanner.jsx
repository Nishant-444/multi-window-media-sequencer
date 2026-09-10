import React from 'react';
import { Radio, XCircle, Clock } from 'lucide-react';

export default function SyncBanner({ syncState, onStopSync }) {
  if (!syncState || !syncState.is_active || !syncState.media_item) {
    return null;
  }

  const { media_item, remaining_seconds, duration_seconds } = syncState;
  const progressPercent = duration_seconds > 0 
    ? Math.max(0, Math.min(100, (remaining_seconds / duration_seconds) * 100))
    : 0;

  return (
    <div className="w-full bg-gradient-to-r from-rose-950/90 via-red-900/80 to-amber-950/90 border-y border-rose-500/30 px-4 lg:px-8 py-3 shadow-2xl relative overflow-hidden backdrop-blur-md">
      {/* Background Animated Accent */}
      <div className="absolute inset-0 bg-rose-500/10 animate-pulse-slow pointer-events-none"></div>

      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 relative z-10">
        
        {/* Left: Info */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-300 font-mono">
                Sync Playback Active Across All Windows
              </span>
              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 border border-rose-400/30 text-[11px] font-mono">
                {media_item.type.toUpperCase()}
              </span>
            </div>
            <p className="text-sm font-semibold text-white truncate max-w-md">
              "{media_item.title}"
            </p>
          </div>
        </div>

        {/* Center: Countdown Timer */}
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-rose-500/20 text-xs font-mono">
            <Clock className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-slate-300">Remaining:</span>
            <span className="text-rose-300 font-bold text-sm">
              {remaining_seconds}s
            </span>
            <span className="text-slate-500">/ {duration_seconds}s</span>
          </div>

          {/* Cancel button */}
          <button
            onClick={onStopSync}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 hover:text-white border border-rose-500/40 text-xs font-semibold transition"
            title="Cancel sync override early and resume normal sequences"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Cancel Override</span>
          </button>
        </div>

      </div>

      {/* Progress Line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
        <div 
          className="h-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all duration-1000 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
