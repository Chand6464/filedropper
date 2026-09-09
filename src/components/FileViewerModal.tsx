import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileQuestion,
  ExternalLink,
  Bookmark,
} from 'lucide-react';
import { SharedFile } from '../types';
import { formatFileSize, getFileCategory } from '../utils/format';

interface FileViewerModalProps {
  file: SharedFile | null;
  files: SharedFile[];
  onClose: () => void;
  onSelectFile: (file: SharedFile) => void;
  onSaveFile?: (file: SharedFile) => void;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  file,
  files,
  onClose,
  onSelectFile,
  onSaveFile,
}) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  useEffect(() => {
    // Reset zoom and rotation when file changes
    setScale(1);
    setRotation(0);
    setTextContent(null);

    if (!file) return;

    const category = getFileCategory(file.mimeType, file.name);
    if (category === 'text') {
      setTextLoading(true);
      fetch(file.rawUrl)
        .then((res) => res.text())
        .then((text) => {
          setTextContent(text);
          setTextLoading(false);
        })
        .catch(() => {
          setTextLoading(false);
        });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file]);

  if (!file) return null;

  const currentIndex = files.findIndex((f) => f.id === file.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < files.length - 1;

  const handlePrev = () => {
    if (hasPrev) onSelectFile(files[currentIndex - 1]);
  };

  const handleNext = () => {
    if (hasNext) onSelectFile(files[currentIndex + 1]);
  };

  const category = getFileCategory(file.mimeType, file.name);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      id="file-viewer-backdrop"
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md text-white select-none animate-in fade-in duration-200"
    >
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800 bg-slate-900/80">
        <div className="flex items-center space-x-3 truncate max-w-xl">
          <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
            {category === 'pdf' ? (
              <FileText className="w-5 h-5" />
            ) : (
              <FileText className="w-5 h-5" />
            )}
          </div>
          <div className="truncate">
            <h2 className="text-base font-semibold truncate text-slate-100">{file.name}</h2>
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <span>{formatFileSize(file.size)}</span>
              <span>•</span>
              <span>Uploaded by {file.uploaderDevice}</span>
              {files.length > 1 && (
                <>
                  <span>•</span>
                  <span>
                    {currentIndex + 1} of {files.length}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {category === 'image' && (
            <div className="hidden sm:flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
              <button
                id="zoom-out-btn"
                onClick={() => setScale((s) => Math.max(0.4, s - 0.2))}
                className="p-1.5 hover:bg-slate-700 rounded text-slate-300 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-mono text-slate-300">
                {Math.round(scale * 100)}%
              </span>
              <button
                id="zoom-in-btn"
                onClick={() => setScale((s) => Math.min(3, s + 0.2))}
                className="p-1.5 hover:bg-slate-700 rounded text-slate-300 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                id="rotate-btn"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-1.5 hover:bg-slate-700 rounded text-slate-300 hover:text-white border-l border-slate-700"
                title="Rotate 90°"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            id="fullscreen-toggle-btn"
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            title="Toggle Fullscreen Presentation"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <a
            id="raw-link-btn"
            href={file.rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center space-x-1 px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Open in new browser tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>New Tab</span>
          </a>

          {onSaveFile && (
            <button
              id="viewer-save-file-btn"
              onClick={() => onSaveFile(file)}
              className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition ${
                file.isSaved
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 hover:bg-amber-500/20 text-slate-200 hover:text-amber-300 border-slate-700'
              }`}
              title={file.isSaved ? 'Saved in Vault & Discord' : 'Save File (Protected by 6-digit code)'}
            >
              <Bookmark className={`w-3.5 h-3.5 ${file.isSaved ? 'fill-amber-400 text-amber-400' : ''}`} />
              <span>{file.isSaved ? 'Saved in Vault' : 'Save File'}</span>
            </button>
          )}

          <a
            id="download-file-btn"
            href={file.downloadUrl}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </a>

          <button
            id="close-viewer-btn"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-200 border border-slate-700 transition"
            title="Close viewer (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Display Body */}
      <div className="relative flex-1 flex items-center justify-center p-2 sm:p-6 overflow-hidden">
        {/* Navigation Arrows */}
        {hasPrev && (
          <button
            id="prev-file-btn"
            onClick={handlePrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-white shadow-lg transition"
            title="Previous file (Left Arrow)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {hasNext && (
          <button
            id="next-file-btn"
            onClick={handleNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-white shadow-lg transition"
            title="Next file (Right Arrow)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Content Renderers */}
        {category === 'image' && (
          <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
            <img
              src={file.rawUrl}
              alt={file.name}
              className="max-h-[85vh] max-w-full object-contain rounded-md shadow-2xl transition-transform duration-200 select-none pointer-events-auto"
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg)`,
              }}
            />
          </div>
        )}

        {category === 'pdf' && (
          <div className="w-full h-full max-w-5xl bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-2xl flex flex-col">
            <div className="bg-slate-800/80 px-4 py-2 text-xs text-slate-300 flex items-center justify-between border-b border-slate-700">
              <span>PDF Document Presentation View</span>
              <span className="text-slate-400">Use embedded controls to navigate pages or zoom</span>
            </div>
            <iframe
              src={`${file.rawUrl}#toolbar=1&navpanes=1`}
              title={file.name}
              className="w-full flex-1 border-0 bg-white"
            />
          </div>
        )}

        {category === 'video' && (
          <div className="w-full max-w-4xl max-h-[85vh] flex items-center justify-center p-4">
            <video
              src={file.rawUrl}
              controls
              autoPlay
              className="max-h-[80vh] w-auto max-w-full rounded-xl shadow-2xl bg-black"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        )}

        {category === 'audio' && (
          <div className="w-full max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <FileText className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white truncate">{file.name}</h3>
              <p className="text-sm text-slate-400 mt-1">{formatFileSize(file.size)}</p>
            </div>
            <audio src={file.rawUrl} controls className="w-full" autoPlay>
              Your browser does not support audio playback.
            </audio>
          </div>
        )}

        {category === 'text' && (
          <div className="w-full h-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700 text-xs font-mono text-slate-400 flex justify-between items-center">
              <span>{file.name}</span>
              <span>{textLoading ? 'Loading text...' : 'Plaintext / Source Preview'}</span>
            </div>
            <div className="flex-1 p-5 overflow-auto font-mono text-sm text-slate-200 leading-relaxed whitespace-pre-wrap selection:bg-indigo-600">
              {textLoading ? (
                <div className="flex items-center justify-center h-48 text-slate-400">Loading document...</div>
              ) : (
                textContent || '(Empty file or unable to read text)'
              )}
            </div>
          </div>
        )}

        {category === 'other' && (
          <div className="w-full max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <FileQuestion className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white truncate">{file.name}</h3>
              <p className="text-sm text-slate-400">
                This file type ({file.mimeType || 'binary'}) requires a native application to view.
              </p>
              <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
            </div>
            <div className="pt-2">
              <a
                href={file.downloadUrl}
                className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30 transition"
              >
                <Download className="w-4 h-4" />
                <span>Download File to Device</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
