import React, { useEffect, useRef, useState } from 'react';
import { RotateCw, Minimize2, Maximize2, FlipHorizontal, Trash2, Check, X, Undo2, GripVertical, ArrowRightLeft, Scissors, Loader2, Sparkles, RefreshCw, PaintBucket, MousePointer2 } from 'lucide-react';
import { regenerateSingleFrame } from '../services/geminiService';
import { BackgroundOption } from '../types';

interface FrameData {
  id: number;
  rotation: number;
  scale: number;
  flipH: boolean;
  isDeleted: boolean;
  overrideImage?: string; // URL/Base64 of the AI regenerated image
}

interface FrameEditorProps {
  imageUrl: string;
  rows: number;
  cols: number;
  onSave: (newImageUrl: string) => void;
  onClose: () => void;
}

export const FrameEditor: React.FC<FrameEditorProps> = ({ imageUrl, rows, cols, onSave, onClose }) => {
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<number | null>(null); 
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // For smart crop
  const [currentImageSrc, setCurrentImageSrc] = useState(imageUrl);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  
  // AI Redraw State
  const [redrawPrompt, setRedrawPrompt] = useState('');
  const [isGeneratingVar, setIsGeneratingVar] = useState(false);
  const [variations, setVariations] = useState<string[]>([]);
  const [redrawBg, setRedrawBg] = useState<BackgroundOption>('white');

  // Initialize
  useEffect(() => {
    const img = new Image();
    img.src = currentImageSrc;
    img.onload = () => {
      sourceImageRef.current = img;
      const totalFrames = rows * cols;
      
      // Preserve existing frames logic if just refreshing image, 
      // but usually we reset on new Editor open. 
      // Here we simple-check length to avoid wiping state on re-renders if strict mode
      if (frames.length !== totalFrames) {
        setFrames(Array.from({ length: totalFrames }, (_, i) => ({
          id: i,
          rotation: 0,
          scale: 1,
          flipH: false,
          isDeleted: false,
        })));
      }
      
      if (selectedFrameId === null) setSelectedFrameId(0);
    };
  }, [currentImageSrc, rows, cols]);

  // Reset variations when changing selection
  useEffect(() => {
    setVariations([]);
    setRedrawPrompt('');
  }, [selectedFrameId]);

  const handleUpdateFrame = (updates: Partial<FrameData>) => {
    if (selectedFrameId === null) return;
    setFrames(prev => prev.map(f => 
      f.id === selectedFrameId ? { ...f, ...updates } : f
    ));
  };

  // --- AI Redraw Logic ---
  const generateVariations = async () => {
    const selectedFrame = frames.find(f => f.id === selectedFrameId);
    if (!selectedFrame || !sourceImageRef.current || !redrawPrompt.trim()) return;

    setIsGeneratingVar(true);
    setVariations([]);

    try {
        // 1. Extract the current frame visuals as base64
        const img = sourceImageRef.current;
        const frameW = img.width / cols;
        const frameH = img.height / rows;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = frameW;
        tempCanvas.height = frameH;
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
            // If it has an override, use that, otherwise crop from source
            if (selectedFrame.overrideImage) {
                 const overrideImg = await new Promise<HTMLImageElement>((resolve) => {
                     const i = new Image();
                     i.onload = () => resolve(i);
                     i.src = selectedFrame.overrideImage!;
                 });
                 ctx.drawImage(overrideImg, 0, 0, frameW, frameH);
            } else {
                 const srcCol = selectedFrame.id % cols;
                 const srcRow = Math.floor(selectedFrame.id / cols);
                 ctx.drawImage(img, srcCol * frameW, srcRow * frameH, frameW, frameH, 0, 0, frameW, frameH);
            }
            
            const base64Ref = tempCanvas.toDataURL('image/png');

            // 2. Generate 3 variations in parallel
            // Pass the background constraint
            const promises = [1, 2, 3].map(() => regenerateSingleFrame(base64Ref, redrawPrompt, redrawBg));
            const results = await Promise.all(promises);
            
            setVariations(results);
        }
    } catch (e) {
        console.error("Variation generation failed", e);
        // Maybe show error toast
    } finally {
        setIsGeneratingVar(false);
    }
  };

  // --- Drag & Drop Logic ---
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; 
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    const newFrames = [...frames];
    const temp = newFrames[draggedIndex];
    newFrames[draggedIndex] = newFrames[targetIndex];
    newFrames[targetIndex] = temp;
    setFrames(newFrames);
    setDraggedIndex(null);
  };

  // --- Advanced Smart Crop & Center Logic ---
  const handleSmartCrop = () => {
    if (!sourceImageRef.current) return;
    setIsProcessing(true);

    // Use timeout to allow UI to show loading state
    setTimeout(async () => {
        const img = sourceImageRef.current!;
        const frameW = img.width / cols;
        const frameH = img.height / rows;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = frameW;
        tempCanvas.height = frameH;
        const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) {
            setIsProcessing(false);
            return;
        }

        // Pre-load all override images
        const overrideImages = new Map<number, HTMLImageElement>();
        for (const f of frames) {
            if (f.overrideImage && !f.isDeleted) {
                const i = new Image();
                await new Promise((r) => { i.onload = r; i.src = f.overrideImage!; });
                overrideImages.set(f.id, i);
            }
        }

        // Helper to get pixel data of a rendered frame and ensure it is drawn on tempCanvas
        const renderFrameToTemp = (frame: FrameData) => {
             // Clear
             ctx.clearRect(0, 0, frameW, frameH);
             
             // Draw logic (transforms, overrides, or source)
             ctx.save();
             ctx.translate(frameW/2, frameH/2);
             ctx.rotate((frame.rotation * Math.PI) / 180);
             ctx.scale(frame.flipH ? -1 : 1, 1);
             ctx.scale(frame.scale, frame.scale);

             if (overrideImages.has(frame.id)) {
                const oImg = overrideImages.get(frame.id)!;
                ctx.drawImage(oImg, -frameW/2, -frameH/2, frameW, frameH);
             } else {
                const srcCol = frame.id % cols;
                const srcRow = Math.floor(frame.id / cols);
                ctx.drawImage(
                    img, 
                    srcCol * frameW, srcRow * frameH, frameW, frameH, 
                    -frameW/2, -frameH/2, frameW, frameH
                );
             }
             ctx.restore();
             
             return ctx.getImageData(0, 0, frameW, frameH);
        };

        // 1. Determine Background Color (sample corners of first visible frame)
        const firstVisibleFrame = frames.find(f => !f.isDeleted) || frames[0];
        const firstFrameData = renderFrameToTemp(firstVisibleFrame).data;
        const bgPixel = [firstFrameData[0], firstFrameData[1], firstFrameData[2]];
        
        const isBackground = (r: number, g: number, b: number) => {
            const threshold = 40; 
            return Math.abs(r - bgPixel[0]) < threshold &&
                   Math.abs(g - bgPixel[1]) < threshold &&
                   Math.abs(b - bgPixel[2]) < threshold;
        };

        // 2. Analyze EACH frame to find its unique content bounds (Per-Frame Segmentation)
        interface Rect { x: number, y: number, w: number, h: number, hasContent: boolean }
        const frameBounds: Rect[] = [];
        let maxContentW = 0;
        let maxContentH = 0;

        for (const frame of frames) {
            if (frame.isDeleted) {
                frameBounds.push({ x:0, y:0, w:0, h:0, hasContent: false });
                continue;
            }
            
            const imageData = renderFrameToTemp(frame); 
            const data = imageData.data;
            
            // Find bounds for THIS frame
            let minX = frameW, minY = frameH, maxX = 0, maxY = 0;
            let hasContent = false;
            
            for (let y = 0; y < frameH; y++) {
                for (let x = 0; x < frameW; x++) {
                    const i = (y * frameW + x) * 4;
                    if (!isBackground(data[i], data[i+1], data[i+2])) {
                         if (x < minX) minX = x;
                         if (x > maxX) maxX = x;
                         if (y < minY) minY = y;
                         if (y > maxY) maxY = y;
                         hasContent = true;
                    }
                }
            }

            if (hasContent) {
                const w = maxX - minX + 1;
                const h = maxY - minY + 1;
                if (w > maxContentW) maxContentW = w;
                if (h > maxContentH) maxContentH = h;
                frameBounds.push({ x: minX, y: minY, w, h, hasContent: true });
            } else {
                frameBounds.push({ x: 0, y: 0, w: 0, h: 0, hasContent: false });
            }
        }
        
        // If no content found at all
        if (maxContentW === 0) {
             maxContentW = frameW;
             maxContentH = frameH;
        }

        // Add safe padding
        const padding = 4;
        maxContentW = Math.min(frameW, maxContentW + padding * 2);
        maxContentH = Math.min(frameH, maxContentH + padding * 2);
        
        // 3. Create New Optimized Canvas
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = maxContentW * cols;
        finalCanvas.height = maxContentH * rows;
        const finalCtx = finalCanvas.getContext('2d');
        
        if(!finalCtx) {
             setIsProcessing(false);
             return;
        }
        
        // Fill Background
        finalCtx.fillStyle = `rgb(${bgPixel[0]}, ${bgPixel[1]}, ${bgPixel[2]})`;
        finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        
        // 4. Draw frames CENTERED in new slots
        // REPACKING LOGIC: Use packedIndex to skip holes
        let packedIndex = 0;
        
        frames.forEach((frame, i) => {
            // Skip deleted OR empty frames (removed from flow)
            if (frame.isDeleted || !frameBounds[i].hasContent) return;
            
            const bounds = frameBounds[i];
            
            // Re-render frame to temp canvas to get the source pixels
            renderFrameToTemp(frame); 
            
            // Destination in new canvas (Sequential Packing)
            const destCol = packedIndex % cols;
            const destRow = Math.floor(packedIndex / cols);
            
            // Calculate position to center the content
            const cellX = destCol * maxContentW;
            const cellY = destRow * maxContentH;
            
            // Center logic:
            const destX = cellX + (maxContentW - bounds.w) / 2;
            const destY = cellY + (maxContentH - bounds.h) / 2;
            
            finalCtx.drawImage(
                tempCanvas,
                bounds.x, bounds.y, bounds.w, bounds.h, // Source crop
                destX, destY, bounds.w, bounds.h        // Dest location (Centered)
            );
            
            packedIndex++;
        });
        
        // 5. Update State
        const resultData = finalCanvas.toDataURL('image/png');
        
        // Important: Reset transforms & state since we baked the image.
        // We also reset deletions because the deleted frames are now GONE from the source image.
        setFrames(Array.from({ length: rows * cols }, (_, i) => ({
          id: i,
          rotation: 0,
          scale: 1,
          flipH: false,
          isDeleted: false, // Reset to fresh state
        })));
        
        setCurrentImageSrc(resultData); 
        setIsProcessing(false);
    }, 100);
  };

  // --- Final Save ---
  const handleSave = async () => {
    if (!sourceImageRef.current) return;
    
    const img = sourceImageRef.current;
    const frameW = img.width / cols;
    const frameH = img.height / rows;
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pre-load override images
    const overrideImages = new Map<number, HTMLImageElement>();
    for (const f of frames) {
        if (f.overrideImage && !f.isDeleted) {
            const i = new Image();
            await new Promise((r) => { i.onload = r; i.src = f.overrideImage!; });
            overrideImages.set(f.id, i);
        }
    }
    
    // Repack Logic on Save
    let packedIndex = 0;

    frames.forEach((frame) => {
      // Skip deleted frames so they don't appear in final output
      if (frame.isDeleted) return;

      // Calculate destination based on PACKED index (0, 1, 2...)
      // This shifts frames to fill gaps
      const destCol = packedIndex % cols;
      const destRow = Math.floor(packedIndex / cols);
      
      const destCenterX = (destCol * frameW) + (frameW / 2);
      const destCenterY = (destRow * frameH) + (frameH / 2);

      ctx.save();
      ctx.translate(destCenterX, destCenterY);
      ctx.rotate((frame.rotation * Math.PI) / 180);
      ctx.scale(frame.flipH ? -1 : 1, 1);
      ctx.scale(frame.scale, frame.scale);

      if (overrideImages.has(frame.id)) {
         const oImg = overrideImages.get(frame.id)!;
         // Draw override centered
         ctx.drawImage(oImg, -frameW/2, -frameH/2, frameW, frameH);
      } else {
         const srcCol = frame.id % cols;
         const srcRow = Math.floor(frame.id / cols);
         const srcX = srcCol * frameW;
         const srcY = srcRow * frameH;
         ctx.drawImage(
            img,
            srcX, srcY, frameW, frameH,
            -frameW / 2, -frameH / 2, frameW, frameH
         );
      }

      ctx.restore();
      packedIndex++;
    });

    onSave(canvas.toDataURL('image/png'));
    onClose();
  };

  const selectedFrame = frames.find(f => f.id === selectedFrameId);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900 shrink-0">
          <div className="flex flex-col">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Undo2 size={20} className="text-indigo-400" />
              Refine Sprite Sheet
            </h3>
            <p className="text-xs text-slate-400">Drag to Reorder • AI Redraw • Smart Crop</p>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={handleSmartCrop} 
               disabled={isProcessing}
               className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2 border border-purple-400/30"
               title="Isolate subjects, remove deleted frames, and center in grid"
             >
              {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />}
              Repack & Center
            </button>
            <div className="w-px h-8 bg-slate-700 mx-2"></div>
            <button onClick={onClose} className="px-4 py-2 text-slate-300 hover:text-white text-sm">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium flex items-center gap-2">
              <Check size={16} /> Save Changes
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-grow flex overflow-hidden relative">
          
          {isProcessing && (
              <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur flex flex-col items-center justify-center text-white">
                  <Loader2 size={48} className="animate-spin text-purple-500 mb-4" />
                  <h3 className="text-xl font-bold">Repacking Sprite Sheet...</h3>
                  <p className="text-slate-400">Removing gaps and centering characters</p>
              </div>
          )}

          {/* Left: Grid View */}
          <div className="flex-grow p-8 overflow-y-auto bg-slate-950/50 checkerboard">
             <div 
               className="grid gap-3 mx-auto transition-all"
               style={{ 
                 gridTemplateColumns: `repeat(${cols}, minmax(80px, 120px))`,
                 width: 'fit-content',
                 justifyContent: 'center'
               }}
             >
               {frames.map((frame, arrayIndex) => (
                 <FrameThumbnail 
                   key={frame.id} 
                   frame={frame}
                   arrayIndex={arrayIndex}
                   sourceImage={sourceImageRef.current}
                   rows={rows}
                   cols={cols}
                   isSelected={selectedFrameId === frame.id}
                   isDragging={draggedIndex === arrayIndex}
                   onClick={() => setSelectedFrameId(frame.id)}
                   onDragStart={handleDragStart}
                   onDragOver={handleDragOver}
                   onDrop={handleDrop}
                 />
               ))}
             </div>
          </div>

          {/* Right: Controls */}
          <div className="w-80 bg-slate-800 border-l border-slate-700 p-6 flex flex-col gap-6 shrink-0 overflow-y-auto">
             {selectedFrame ? (
               <>
                 <div className="text-center">
                    <h4 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-4">Selected Frame</h4>
                    <div className="w-40 h-40 mx-auto bg-slate-700/50 border border-slate-600 rounded-lg checkerboard flex items-center justify-center overflow-hidden relative shadow-inner group">
                        {sourceImageRef.current && (
                            <FrameCanvasPreview 
                            frame={selectedFrame} 
                            sourceImage={sourceImageRef.current}
                            rows={rows}
                            cols={cols}
                            />
                        )}
                        {selectedFrame.isDeleted && (
                            <div className="absolute inset-0 flex items-center justify-center bg-red-900/60 text-red-200 font-bold backdrop-blur-sm">DELETED</div>
                        )}
                        {selectedFrame.overrideImage && (
                             <div className="absolute bottom-2 right-2 bg-purple-600 text-white text-[9px] px-1.5 py-0.5 rounded shadow">AI EDITED</div>
                        )}
                    </div>
                    <div className="mt-3 text-xs text-slate-500 font-mono">
                        Original ID: {selectedFrame.id + 1}
                    </div>
                 </div>

                 {/* AI Redraw Section */}
                 <div className="bg-slate-900/50 p-3 rounded-lg border border-purple-500/20 mt-2">
                    <label className="text-xs font-bold text-purple-400 flex items-center gap-1.5 mb-2">
                        <Sparkles size={12} /> AI REDRAW / INPAINT
                    </label>
                    
                    <div className="flex gap-2 mb-2">
                        <input 
                            type="text" 
                            value={redrawPrompt}
                            onChange={(e) => setRedrawPrompt(e.target.value)}
                            placeholder="e.g. change sword to axe"
                            className="flex-grow bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-purple-500 outline-none"
                        />
                    </div>

                    <div className="flex gap-3 mb-3 text-[10px] text-slate-400">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input 
                                type="radio" 
                                name="redrawBg" 
                                checked={redrawBg === 'white'}
                                onChange={() => setRedrawBg('white')}
                                className="bg-slate-800 border-slate-600 text-purple-500 focus:ring-purple-500"
                            />
                            <span>White BG</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input 
                                type="radio" 
                                name="redrawBg" 
                                checked={redrawBg === 'green'}
                                onChange={() => setRedrawBg('green')}
                                className="bg-slate-800 border-slate-600 text-green-500 focus:ring-green-500"
                            />
                            <span className="text-green-400">Green BG</span>
                        </label>
                    </div>
                    
                    <button 
                        onClick={generateVariations}
                        disabled={isGeneratingVar || !redrawPrompt.trim()}
                        className="w-full py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold rounded hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isGeneratingVar ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Generate 3 Variations
                    </button>

                    {/* Variations Grid */}
                    {variations.length > 0 && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            {variations.map((v, i) => (
                                <img 
                                    key={i} 
                                    src={v} 
                                    onClick={() => handleUpdateFrame({ overrideImage: v })}
                                    className="w-full h-16 object-contain bg-slate-800 rounded border border-slate-700 hover:border-purple-400 cursor-pointer hover:scale-105 transition-all"
                                    title="Click to apply this variation"
                                />
                            ))}
                        </div>
                    )}
                 </div>

                 <div className="space-y-6 border-t border-slate-700/50 pt-6">
                    {/* Transforms */}
                    <div className="space-y-3">
                        <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                            <ArrowRightLeft size={12} /> TRANSFORM
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={() => handleUpdateFrame({ rotation: (selectedFrame.rotation + 90) % 360 })}
                                className="bg-slate-700 hover:bg-slate-600 p-3 rounded-lg text-white flex flex-col items-center gap-1 transition-colors" 
                                title="Rotate 90°"
                            >
                                <RotateCw size={20} />
                                <span className="text-[10px] text-slate-400">Rotate</span>
                            </button>
                            <button 
                                onClick={() => handleUpdateFrame({ flipH: !selectedFrame.flipH })}
                                className={`p-3 rounded-lg text-white flex flex-col items-center gap-1 transition-colors ${selectedFrame.flipH ? 'bg-indigo-600 shadow-lg shadow-indigo-500/20' : 'bg-slate-700 hover:bg-slate-600'}`}
                                title="Flip Horizontal"
                            >
                                <FlipHorizontal size={20} />
                                <span className="text-[10px] text-slate-400">Flip H</span>
                            </button>
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-700/50">
                        <button 
                        onClick={() => handleUpdateFrame({ isDeleted: !selectedFrame.isDeleted })}
                        className={`w-full py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
                            selectedFrame.isDeleted 
                            ? 'bg-slate-600 text-white hover:bg-slate-500' // Restore
                            : 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/20' // Delete
                        }`}
                        >
                        {selectedFrame.isDeleted ? (
                            <><Undo2 size={18} /> Restore Frame</>
                        ) : (
                            <><Trash2 size={18} /> Clear Frame</>
                        )}
                        </button>
                        <p className="text-[10px] text-center mt-2 text-slate-500">
                            Deleted frames are removed during download/save.
                        </p>
                    </div>
                 </div>
               </>
             ) : (
                 <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                     <MousePointer2 size={48} />
                     <p className="mt-4 text-sm">Select a frame to edit</p>
                 </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

const FrameThumbnail: React.FC<{
  frame: FrameData;
  arrayIndex: number;
  sourceImage: HTMLImageElement | null;
  rows: number;
  cols: number;
  isSelected: boolean;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
}> = ({ frame, arrayIndex, sourceImage, rows, cols, isSelected, isDragging, onClick, onDragStart, onDragOver, onDrop }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [overrideImg, setOverrideImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
      if (frame.overrideImage) {
          const i = new Image();
          i.src = frame.overrideImage;
          i.onload = () => setOverrideImg(i);
      } else {
          setOverrideImg(null);
      }
  }, [frame.overrideImage]);

  useEffect(() => {
    if (!sourceImage || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const frameW = sourceImage.width / cols;
    const frameH = sourceImage.height / rows;

    canvasRef.current.width = frameW;
    canvasRef.current.height = frameH;

    if (frame.isDeleted) {
      ctx.clearRect(0, 0, frameW, frameH);
      return;
    }

    ctx.save();
    ctx.translate(frameW/2, frameH/2);
    ctx.rotate((frame.rotation * Math.PI) / 180);
    ctx.scale(frame.flipH ? -1 : 1, 1);
    ctx.scale(frame.scale, frame.scale);
    
    if (overrideImg) {
        ctx.drawImage(overrideImg, -frameW/2, -frameH/2, frameW, frameH);
    } else {
        const srcX = (frame.id % cols) * frameW;
        const srcY = Math.floor(frame.id / cols) * frameH;
        ctx.drawImage(
            sourceImage,
            srcX, srcY, frameW, frameH,
            -frameW/2, -frameH/2, frameW, frameH
        );
    }
    ctx.restore();

  }, [sourceImage, frame, rows, cols, overrideImg]);

  return (
    <div 
      onClick={onClick}
      draggable
      onDragStart={(e) => onDragStart(e, arrayIndex)}
      onDragOver={(e) => onDragOver(e, arrayIndex)}
      onDrop={(e) => onDrop(e, arrayIndex)}
      className={`
        relative cursor-pointer bg-slate-800 rounded-lg overflow-hidden transition-all
        ${isSelected ? 'ring-2 ring-indigo-500 shadow-lg shadow-indigo-500/20 scale-105 z-10' : 'ring-1 ring-slate-700 hover:ring-slate-500'}
        ${isDragging ? 'opacity-20 scale-90 border-2 border-dashed border-white' : 'opacity-100'}
      `}
      style={{ aspectRatio: '1/1' }}
    >
      <canvas ref={canvasRef} className="w-full h-full object-contain pointer-events-none" />
      <div className="absolute top-1 left-1 bg-black/60 backdrop-blur text-white text-[10px] font-bold px-1.5 py-0.5 rounded border border-white/10 pointer-events-none">
        {arrayIndex + 1}
      </div>
      {frame.isDeleted && (
        <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center backdrop-blur-[1px]">
          <X className="text-red-200 drop-shadow-md" size={24} />
        </div>
      )}
      {frame.overrideImage && (
         <div className="absolute bottom-1 right-1">
            <Sparkles size={10} className="text-purple-400 drop-shadow-md" />
         </div>
      )}
      {isSelected && (
          <div className="absolute inset-0 border-2 border-indigo-500 rounded-lg pointer-events-none"></div>
      )}
    </div>
  );
};

const FrameCanvasPreview: React.FC<{
  frame: FrameData;
  sourceImage: HTMLImageElement;
  rows: number;
  cols: number;
}> = ({ frame, sourceImage, rows, cols }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [overrideImg, setOverrideImg] = useState<HTMLImageElement | null>(null);
  
    useEffect(() => {
        if (frame.overrideImage) {
            const i = new Image();
            i.src = frame.overrideImage;
            i.onload = () => setOverrideImg(i);
        } else {
            setOverrideImg(null);
        }
    }, [frame.overrideImage]);

    useEffect(() => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      const frameW = sourceImage.width / cols;
      const frameH = sourceImage.height / rows;
      canvasRef.current.width = frameW;
      canvasRef.current.height = frameH;
  
      if (frame.isDeleted) {
        ctx.clearRect(0, 0, frameW, frameH);
        return;
      }

      ctx.save();
      ctx.translate(frameW/2, frameH/2);
      ctx.rotate((frame.rotation * Math.PI) / 180);
      ctx.scale(frame.flipH ? -1 : 1, 1);
      ctx.scale(frame.scale, frame.scale);

      if (overrideImg) {
        ctx.drawImage(overrideImg, -frameW/2, -frameH/2, frameW, frameH);
      } else {
        const srcX = (frame.id % cols) * frameW;
        const srcY = Math.floor(frame.id / cols) * frameH;
        ctx.drawImage(
            sourceImage,
            srcX, srcY, frameW, frameH,
            -frameW/2, -frameH/2, frameW, frameH
        );
      }
      ctx.restore();
    }, [frame, sourceImage, rows, cols, overrideImg]);

    return <canvas ref={canvasRef} className="w-full h-full object-contain" />;
}