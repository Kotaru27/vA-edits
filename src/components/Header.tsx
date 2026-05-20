import React from 'react';
import { ToolType } from '../types';

interface HeaderProps {
  activeTool: ToolType | null;
  onSelectTool: (tool: ToolType | null) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTool, onSelectTool }) => {
  return (
    <header className="border-b border-zinc-800">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <button
          onClick={() => onSelectTool(null)}
          className="text-white font-bold text-xl cursor-pointer"
        >
          VA Edits
        </button>
        
        {activeTool && (
          <nav className="flex gap-2">
            {[
              { id: 'compressor' as ToolType, label: 'Compress' },
              { id: 'audio-converter' as ToolType, label: 'Audio Convert' },
              { id: 'video-trim-crop' as ToolType, label: 'Video Trim' },
              { id: 'audio-trimmer' as ToolType, label: 'Audio Trim' },
            ].map((tool) => (
              <button
                key={tool.id}
                onClick={() => onSelectTool(tool.id)}
                className={`px-3 py-1.5 text-sm rounded cursor-pointer transition-colors ${
                  activeTool === tool.id
                    ? 'bg-white text-black font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tool.label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
};
