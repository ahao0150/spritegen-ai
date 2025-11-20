import React, { useEffect, useRef, useState } from 'react';
import { SpriteConfig } from '../types';
import { Play, Pause, Download, Settings2, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { FrameEditor } from './FrameEditor';

interface SpritePreviewProps {
  originalImageUrl: string;
}

export const SpritePreview: React.FC<SpritePreviewProps> = ({ originalImageUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State for Configuration
  const [config, setConfig] = useState<SpriteConfig>({
    rows: 1,
    cols: 4,
    fps: 8,
    isPlaying: true,
    activeFrameCount: 4,
  });

  // Image State management
  const [modifiedImageUrl, setModifiedImageUrl] = useState<string | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  
  // UI State
  const [frameIndex, setFrameIndex] = useState(0);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [showTransparent, setShowTransparent] = useState(false);
  const [viewingOriginal, setViewingOriginal] = useState(false);

  // 1. Handle Source Image Changes & Heuristics
  useEffect(() => {
    const targetUrl = viewingOriginal ? originalImageUrl : (modifiedImageUrl || originalImageUrl);
    
    // If switching to a new original, reset completely
    if (targetUrl === originalImageUrl && !modifiedImageUrl) {
         // Heuristic: Try to auto-guess rows/cols
        const img = new Image();
        img.src = targetUrl;
        img.onload = () => {
            setLoadedImage(img);
            const aspect = img.width / img.height;
            let r = 1, c = 4;
            if (aspect > 3) { r = 1; c = 6; } 
            else if (aspect < 0.33) { r = 6; c = 1; }
            else if (Math.abs(aspect - 1) < 0.2) { r = 2; c = 2; } // Squareish
            
            setConfig(prev => ({ 
                ...prev, 
                rows: r, 
                cols: c,
                activeFrameCount: r * c
            }));
        };
    } else {
        // Just load the image
        const img = new Image();
        img.src = targetUrl;
        img.onload = () => {
            setLoadedImage(img);
            // If we modified image, we keep rows/cols same, but ensure activeFrameCount is valid
            setConfig(prev => ({
                ...prev,
                activeFrameCount: Math.min(prev.activeFrameCount, prev.rows * prev.cols)
            }));
        };
    }
  }, [originalImageUrl, modifiedImageUrl, viewingOriginal]);

  // 3. Animation Loop
  useEffect(() => {
    if (!config.isPlaying || !loadedImage || !canvasRef.current) return;

    let animationFrameId: number;
    let lastTime = 0;
    const interval = 1000 / config.fps;
    
    const animate = (timestamp: number) => {
      if (timestamp - lastTime >= interval) {
        // Loop only through the ACTIVE frames
        setFrameIndex((prev) => (prev + 1) % config.activeFrameCount);
        lastTime = timestamp;
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [config.isPlaying, config.fps, config.activeFrameCount, loadedImage]);

  // 4. Render Frame to Canvas
  useEffect(() => {
    if (!loadedImage || !canvasRef.current) return;
    
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const frameWidth = loadedImage.width / config.cols;
    const frameHeight = loadedImage.height / config.rows;

    if (frameWidth <= 0 || frameHeight <= 0) return;

    canvasRef.current.width = frameWidth;
    canvasRef.current.height = frameHeight;

    ctx.clearRect(0, 0, frameWidth, frameHeight);

    const safeFrameIndex = frameIndex % (config.rows * config.cols);
    const col = safeFrameIndex % config.cols;
    const row = Math.floor(safeFrameIndex / config.cols);
    const srcX = col * frameWidth;
    const srcY = row * frameHeight;

    ctx.drawImage(
      loadedImage,
      srcX, srcY, frameWidth, frameHeight,
      0, 0, frameWidth, frameHeight
    );

    if (showTransparent) {
      const imageData = ctx.getImageData(0, 0, frameWidth, frameHeight);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > 240 && g > 240 && b > 240) {
           data[i + 3] = 0; 
        }
        else if (g > 200 && r < 100 && b < 100) {
           data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

  }, [frameIndex, loadedImage, config.rows, config.cols, showTransparent]);

  const handleDownload = () => {
    if (showTransparent && canvasRef.current && loadedImage) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = loadedImage.width;
        tempCanvas.height = loadedImage.height;
        const tCtx = tempCanvas.getContext('2d');
        if (tCtx) {
            tCtx.drawImage(loadedImage, 0, 0);
            const imageData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imageData.data;
             for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i+1], b = data[i+2];
                if ((r > 240 && g > 240 && b > 240) || (g > 200 && r < 100 && b < 100)) {
                   data[i+3] = 0;
                }
             }
             tCtx.putImageData(imageData, 0, 0);
             const a = document.createElement('a');
             a.href = tempCanvas.toDataURL('image/png');
             a.download = `sprite-sheet-transparent-${Date.now()}.png`;
             a.click();
        }
    } else {
        const a = document.createElement('a');
        a.href = viewingOriginal ? originalImageUrl : (modifiedImageUrl || originalImageUrl);
        a.download = `sprite-sheet-${Date.now()}.png`;
        a.click();
    }
  };

  const handleSaveEdits = (newImage: string) => {
      setModifiedImageUrl(newImage);
      setViewingOriginal(false);
  };

  const maxFrames = config.rows * config.cols;

  return (
    <div className="flex flex-col h-full relative">
      
      {isEditorOpen && (
          <FrameEditor 
             imageUrl={viewingOriginal ? originalImageUrl : (modifiedImageUrl || originalImageUrl)}
             rows={config.rows}
             cols={config.cols}
             onSave={handleSaveEdits}
             onClose={() => setIsEditorOpen(false)}
          />
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 flex-grow flex flex-col">
        <div className="flex items-center justify-between mb-4">
             <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Animation Preview
            </h2>
            <button 
                onClick={() => setShowTransparent(!showTransparent)}
                className={`flex items-center gap-2 text-xs px-3 py-1 rounded-full transition-colors border ${showTransparent ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300'}`}
            >
                {showTransparent ? <Eye size={14} /> : <EyeOff size={14} />}
                Transparent {showTransparent ? 'ON' : 'OFF'}
            </button>
        </div>

        <div className="flex-grow bg-[#1a1a1a] rounded-lg border border-slate-700 checkerboard relative flex items-center justify-center overflow-hidden min-h-[300px]">
          <canvas 
            ref={canvasRef} 
            className="max-w-full max-h-full object-contain pixelated rendering-pixelated"
            style={{ imageRendering: 'pixelated' }}
          />
          
          <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur text-[10px] px-2 py-1 rounded text-slate-300 font-mono border border-slate-600/50">
             Grid: {config.cols}x{config.rows} • Frame {frameIndex + 1}/{config.activeFrameCount}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Playback & Frame Limit */}
          <div className="flex flex-col gap-3 bg-slate-900 p-3 rounded-lg border border-slate-700">
             <div className="flex items-center gap-3">
                <button
                    onClick={() => setConfig(prev => ({ ...prev, isPlaying: !prev.isPlaying }))}
                    className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-md text-white transition-colors"
                >
                    {config.isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </button>
                
                <div className="flex-1">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Playback Limit</span>
                        <span>{config.activeFrameCount} Frames</span>
                    </div>
                    <input 
                        type="range" 
                        min="1" 
                        max={maxFrames} 
                        value={config.activeFrameCount} 
                        onChange={(e) => setConfig(prev => ({...prev, activeFrameCount: parseInt(e.target.value)}))}
                        className="w-full accent-purple-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
             </div>
             
             <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800 pt-2">
                <span>Speed</span>
                <div className="flex items-center gap-2">
                    <input 
                    type="range" 
                    min="1" 
                    max="60" 
                    value={config.fps} 
                    onChange={(e) => setConfig(prev => ({...prev, fps: parseInt(e.target.value)}))}
                    className="w-24 accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="w-10 text-right">{config.fps} FPS</span>
                </div>
             </div>
          </div>

          {/* Grid Config */}
          <div className="flex gap-2 bg-slate-900 p-3 rounded-lg border border-slate-700 items-center">
             <div className="flex-1">
               <label className="block text-xs text-slate-400 mb-1">Rows (Y)</label>
               <input 
                 type="number" 
                 min="1" 
                 value={config.rows}
                 onChange={(e) => {
                     const r = Math.max(1, parseInt(e.target.value) || 1);
                     setConfig(prev => ({...prev, rows: r, activeFrameCount: r * prev.cols }));
                 }}
                 className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:border-indigo-500 focus:outline-none"
               />
             </div>
             <div className="flex-1">
               <label className="block text-xs text-slate-400 mb-1">Cols (X)</label>
               <input 
                 type="number" 
                 min="1" 
                 value={config.cols}
                 onChange={(e) => {
                     const c = Math.max(1, parseInt(e.target.value) || 1);
                     setConfig(prev => ({...prev, cols: c, activeFrameCount: prev.rows * c }));
                 }}
                 className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:border-indigo-500 focus:outline-none"
               />
             </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
           <button
              onClick={() => setIsEditorOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg transition-colors text-sm font-medium"
           >
             <Settings2 size={16} />
             Refine & Crop
           </button>
           
           <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
           >
             <Download size={16} />
             Download {showTransparent ? 'Transparent ' : ''}Sheet
           </button>
        </div>

      </div>
      
      <div className="mt-4 p-4 bg-slate-900 rounded-lg border border-slate-800">
         <div className="flex justify-between items-center mb-3">
             <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">
                {viewingOriginal ? 'Original Source' : (modifiedImageUrl ? 'Modified Source' : 'Original Source')}
             </p>
             {modifiedImageUrl && (
                 <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                    <button 
                      onClick={() => setViewingOriginal(true)}
                      className={`px-3 py-1 text-xs rounded transition-all ${viewingOriginal ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Original
                    </button>
                    <button 
                      onClick={() => setViewingOriginal(false)}
                      className={`px-3 py-1 text-xs rounded transition-all ${!viewingOriginal ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Modified
                    </button>
                 </div>
             )}
         </div>
         
         <div className="relative group overflow-hidden rounded checkerboard border border-slate-700">
            <img 
                src={viewingOriginal ? originalImageUrl : (modifiedImageUrl || originalImageUrl)} 
                alt="Full Sheet" 
                className="max-h-40 w-auto max-w-full mx-auto transition-all" 
            />
            
            <div 
                className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity border border-indigo-500/50 rounded"
                style={{
                    backgroundImage: `
                        linear-gradient(to right, rgba(99, 102, 241, 0.3) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(99, 102, 241, 0.3) 1px, transparent 1px)
                    `,
                    backgroundSize: `${100/config.cols}% ${100/config.rows}%`
                }}
            ></div>
         </div>
         <p className="text-[10px] text-slate-500 mt-2 text-right">
            Hover image to see cutting grid
         </p>
      </div>
    </div>
  );
};