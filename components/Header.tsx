import React from 'react';
import { Gamepad2 } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-slate-700 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
            <Gamepad2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              SpriteGen AI
            </h1>
            <p className="text-xs text-slate-400 font-mono">Studio Suite • Powered by Gemini 2.5</p>
          </div>
        </div>
        <a 
          href="https://ai.google.dev/" 
          target="_blank" 
          rel="noreferrer"
          className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-1.5 rounded-full border border-slate-700 hover:bg-slate-800"
        >
          API Docs
        </a>
      </div>
    </header>
  );
};