import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Film, 
  Image as ImageIcon, 
  Moon, 
  Trash2, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  Radio, 
  Clock, 
  Layers 
} from 'lucide-react';

export default function WindowPlayer({
  window,
  syncState,
  onDeleteMedia,
  onOpenAddMediaModal,
}) {
  const mediaItems = window.media_items || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [itemProgress, setItemProgress] = useState(0);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const videoRef = useRef(null);

  // Active sync override check
  const isSyncActive = Boolean(syncState?.is_active && syncState?.media_item);
  const activeMedia = isSyncActive ? syncState.media_item : mediaItems[currentIndex];

  // Advance to next item in sequence seamlessly
  const advanceToNext = () => {
    if (mediaItems.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % mediaItems.length);
    setItemProgress(0);
  };

  // Continuous Sequence Timer for Non-Video or Fallback
  useEffect(() => {
    // If sync override is active, normal timeline is frozen/bypassed
    if (isSyncActive || !activeMedia) {
      return;
    }

    const duration = activeMedia.duration || 10;
    const intervalMs = 100;
    const step = (intervalMs / (duration * 1000)) * 100;

    const timer = setInterval(() => {
      setItemProgress((prev) => {
        if (prev >= 100) {
          advanceToNext();
          return 0;
        }
        return prev + step;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [currentIndex, activeMedia, isSyncActive, mediaItems.length]);

  // When media changes, reset video playback if video
  useEffect(() => {
    if (activeMedia?.type === 'video' && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch((err) => {
        console.warn('Autoplay error (safe to ignore in muted preview):', err);
      });
    }
  }, [activeMedia]);

  // Format seconds to mm:ss
  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Total window playlist duration
  const totalWindowDuration = mediaItems.reduce((acc, it) => acc + (it.duration || 0), 0);

  return (
    <div className="glass-panel rounded-2xl overflow-hidden shadow-xl border border-slate-800/80 flex flex-col transition-all duration-300 hover:border-slate-700/80">
      
      {/* Window Header */}
      <div className="px-5 py-3.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">
              {window.name}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
              <span>{mediaItems.length} items</span>
              <span>•</span>
              <span>Cycle: {formatDuration(totalWindowDuration)}</span>
            </div>
          </div>
        </div>

        {/* Sync Override Status Pill */}
        {isSyncActive ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-mono font-bold animate-pulse">
            <Radio className="w-3 h-3" /> SYNC OVERRIDE
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700 text-[11px] font-mono">
            <Play className="w-3 h-3 text-cyan-400" /> Loop Sequence
          </span>
        )}
      </div>

      {/* Main Media Display Stage (16:9 Aspect Ratio Container) */}
      <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden group">
        
        {/* Render Media */}
        {isSyncActive ? (
          // SYNC OVERRIDE MEDIA
          <div className="absolute inset-0 w-full h-full flex items-center justify-center">
            {syncState.media_item.type === 'video' ? (
              <video
                key={`sync-${syncState.media_item.id}`}
                ref={videoRef}
                src={syncState.media_item.url}
                autoPlay
                muted
                loop
                playsInline
                className="w-full h-full object-cover"
              />
            ) : syncState.media_item.type === 'image' ? (
              <img
                src={syncState.media_item.url}
                alt={syncState.media_item.title}
                className="w-full h-full object-cover animate-fade-in"
              />
            ) : (
              <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                <Moon className="w-10 h-10 mb-2 text-slate-600 animate-pulse" />
                <p className="text-xs font-mono uppercase tracking-widest">Synced Blank State</p>
              </div>
            )}

            {/* Sync Overlay Watermark Badge */}
            <div className="absolute top-3 left-3 bg-rose-600/90 text-white text-[11px] font-mono font-bold px-2.5 py-1 rounded-md shadow-lg backdrop-blur-sm flex items-center gap-1.5">
              <Radio className="w-3 h-3 animate-spin" /> SYNCED PLAYBACK
            </div>
          </div>
        ) : activeMedia ? (
          // NORMAL SEQUENCE MEDIA
          <div className="absolute inset-0 w-full h-full flex items-center justify-center">
            {activeMedia.type === 'video' ? (
              <video
                key={activeMedia.id}
                ref={videoRef}
                src={activeMedia.url}
                autoPlay
                muted
                playsInline
                onEnded={advanceToNext}
                className="w-full h-full object-cover transition-opacity duration-300"
              />
            ) : activeMedia.type === 'image' ? (
              <img
                key={activeMedia.id}
                src={activeMedia.url}
                alt={activeMedia.title}
                className="w-full h-full object-cover transition-opacity duration-500"
              />
            ) : (
              // Blank / Fallback State
              <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-3">
                  <Moon className="w-6 h-6 text-slate-500" />
                </div>
                <h4 className="text-xs font-mono uppercase tracking-widest text-slate-400">
                  {activeMedia.title || 'Blank / Fallback Slot'}
                </h4>
                <p className="text-[11px] text-slate-600 mt-1 font-mono">
                  Duration: {activeMedia.duration}s
                </p>
              </div>
            )}

            {/* Item Info Overlay Badge (Bottom Left) */}
            <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs shadow-lg max-w-[80%]">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {activeMedia.type}
                </span>
                <span className="font-semibold text-white truncate text-[12px]">
                  {activeMedia.title}
                </span>
              </div>
            </div>

            {/* Item Progress Bar (Top of video stage) */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-black/40 z-10">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-100 ease-linear"
                style={{ width: `${itemProgress}%` }}
              />
            </div>
          </div>
        ) : (
          // Empty playlist state
          <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
            <Layers className="w-10 h-10 mb-2 text-slate-700" />
            <p className="text-xs font-semibold text-slate-400">No media in playlist</p>
            <button
              onClick={() => onOpenAddMediaModal(window.id)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs font-medium transition"
            >
              <Plus className="w-3.5 h-3.5" /> Add Media Item
            </button>
          </div>
        )}
      </div>

      {/* Footer Controls & Playlist Accordion */}
      <div className="p-3.5 bg-slate-900/60 border-t border-slate-800/80 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPlaylist(!showPlaylist)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition font-medium px-2 py-1 rounded-md hover:bg-slate-800"
            >
              <span>Playlist ({mediaItems.length})</span>
              {showPlaylist ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <button
            onClick={() => onOpenAddMediaModal(window.id)}
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-semibold px-2 py-1 rounded-md hover:bg-cyan-500/10 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Item
          </button>
        </div>

        {/* Expandable Playlist Items Drawer */}
        {showPlaylist && (
          <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {mediaItems.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2 text-center">
                Playlist is empty.
              </p>
            ) : (
              mediaItems.map((item, idx) => {
                const isCurrent = !isSyncActive && idx === currentIndex;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition border ${
                      isCurrent
                        ? 'bg-cyan-500/10 border-cyan-500/30 text-white'
                        : 'bg-slate-950/40 border-slate-800/60 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="font-mono text-[10px] text-slate-500 w-4">
                        #{idx + 1}
                      </span>
                      {item.type === 'video' ? (
                        <Film className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      ) : item.type === 'image' ? (
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Moon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      )}
                      <span className="truncate font-medium">{item.title}</span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="font-mono text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {item.duration}s
                      </span>
                      <button
                        onClick={() => onDeleteMedia(item.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded transition hover:bg-rose-500/10"
                        title="Delete from playlist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

    </div>
  );
}
