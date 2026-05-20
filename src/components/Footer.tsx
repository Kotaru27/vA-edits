import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-zinc-800 py-8 mt-auto">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <p className="text-zinc-500 text-sm">VA Edits — 100% Client-Side Processing</p>
        <p className="text-zinc-600 text-xs mt-1">No files are uploaded. Everything happens in your browser.</p>
      </div>
    </footer>
  );
};
