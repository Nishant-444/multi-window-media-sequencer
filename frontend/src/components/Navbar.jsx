import React from 'react';
import { Layers, Radio, Plus, Server, Database, Wifi, WifiOff } from 'lucide-react';

export default function Navbar({
  wsStatus,
  onOpenSyncModal,
  onOpenAddMediaModal,
  onOpenAddWindowModal,
  isSyncActive,
}) {
  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800/80 px-4 lg:px-8 py-3.5 shadow-xl shadow-black/20">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand & Stack Badges */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Layers className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                  Media Sequencer
                  <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono font-medium">
                    v1.0
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400">
                Multi-Window Display & Sync Playback Engine
              </p>
            </div>
          </div>

          {/* Backend Stack Pills */}
          <div className="hidden lg:flex items-center gap-1.5 ml-4 pl-4 border-l border-slate-800 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 font-mono text-[11px] text-sky-400">
              <Server className="w-3 h-3 text-sky-400" /> Golang net/http
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 font-mono text-[11px] text-emerald-400">
              <Database className="w-3 h-3 text-emerald-400" /> SQLite
            </span>
          </div>
        </div>

        {/* Live Status & Controls */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          
          {/* WebSocket Status Indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
            {wsStatus === 'CONNECTED' ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-slate-300 font-medium font-mono text-[11px] flex items-center gap-1">
                  <Wifi className="w-3 h-3 text-emerald-400" /> Live Sync
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span className="text-amber-400 font-medium font-mono text-[11px] flex items-center gap-1">
                  <WifiOff className="w-3 h-3" /> Reconnecting
                </span>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <button
            onClick={onOpenAddMediaModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition shadow-sm hover:border-slate-600"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span>Add Media</span>
          </button>

          <button
            onClick={onOpenSyncModal}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-lg ${
              isSyncActive
                ? 'bg-gradient-to-r from-amber-500 to-rose-600 text-white shadow-rose-500/25 animate-pulse'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold shadow-cyan-500/25 hover:shadow-cyan-500/40'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{isSyncActive ? 'Override Active' : 'Trigger Sync'}</span>
          </button>
        </div>

      </div>
    </header>
  );
}
