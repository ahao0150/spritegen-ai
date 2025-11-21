import React, { useEffect, useRef, useState } from 'react';
import { RotateCw, Minimize2, Maximize2, FlipHorizontal, Trash2, Check, X, Undo2, GripVertical, ArrowRightLeft, Scissors, Loader2 } from 'lucide-react';

interface FrameData {
  id: number;
  rotation: number;
  scale: number;
  flipH: boolean;
  isDeleted: boolean;
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentImageSrc, setCurrentImageSrc] = useState(imageUrl);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  
  // Initialize or Re-initialize when image source changes
  useEffect(() => {
    const img = new Image();
    img.src = currentImageSrc;
    img.onload = () => {
      sourceImageRef.current = img;
      const totalFrames = rows * cols;
      
      // Only reset frames if the length doesn't match (initial load)
      setFrames(Array.from({ length: totalFrames }, (_, i) => ({
        id: i,
        rotation: 0,
        scale: 1,
        flipH: false,
        isDeleted: false,
      })));
      
      if (selectedFrameId === null) setSelectedFrameId(0);
    };
  }, [currentImageSrc, rows, cols]);

  const handleUpdateFrame = (updates: Partial<FrameData>) => {
    if (selectedFrameId === null) return;
    setFrames(prev => prev.map(f => 
      f.id === selectedFrameId ? { ...f, ...updates } : f
    ));
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

  // --- Smart Crop Logic ---
  const handleSmartCrop = () => {
    if (!sourceImageRef.current) return;
    setIsProcessing(true);

    setTimeout(() => {
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

        // 1. Analyze all frames to find the global bounding box
        let minX = frameW, minY = frameH, maxX = 0, maxY = 0;
        let hasContent = false;

        // Draw first frame to check background color
        ctx.drawImage(img, 0, 0, frameW, frameH, 0, 0, frameW, frameH);
        const bgPixel = ctx.getImageData(0, 0, 1, 1).data;
        
        const isBackground = (r: number, g: number, b: number) => {
            const threshold = 40; // Slightly loose to catch noise
            return Math.abs(r - bgPixel[0]) < threshold &&
                   Math.abs(g - bgPixel[1]) < threshold &&
                   Math.abs(b - bgPixel[2]) < threshold;
        };

        // Analyze every frame
        frames.forEach(frame => {
            if (frame.isDeleted) return;

            // Clear temp canvas
            ctx.clearRect(0, 0, frameW, frameH);
            
            // Draw the frame with its CURRENT transforms
            const srcCol = frame.id % cols;
            const srcRow = Math.floor(frame.id / cols);
            
            ctx.save();
            ctx.translate(frameW/2, frameH/2);
            ctx.rotate((frame.rotation * Math.PI) / 180);
            ctx.scale(frame.flipH ? -1 : 1, 1);
            ctx.scale(frame.scale, frame.scale);
            ctx.drawImage(
                img, 
                srcCol * frameW, srcRow * frameH, frameW, frameH, 
                -frameW/2, -frameH/2, frameW, frameH
            );
            ctx.restore();

            // Scan pixels
            const imageData = ctx.getImageData(0, 0, frameW, frameH);
            const data = imageData.data;

            for (let y = 0; y < frameH; y+=2) { // Optimization: skip every other pixel for speed
                for (let x = 0; x < frameW; x+=2) {
                    const i = (y * frameW + x) * 4;
                    // Check if NOT background
                    if (!isBackground(data[i], data[i+1], data[i+2])) {
                         if (x < minX) minX = x;
                         if (x > maxX) maxX = x;
                         if (y < minY) minY = y;
                         if (y > maxY) maxY = y;
                         hasContent = true;
                    }
                }
            }
        });

        if (!hasContent) {
            minX = 0; minY = 0; maxX = frameW; maxY = frameH;
        }

        // Add a little padding
        const padding = 4;
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(frameW, maxX + padding);
        maxY = Math.min(frameH, maxY + padding);

        const newFrameW = maxX - minX;
        const newFrameH = maxY - minY;

        // 2. Generate new Sprite Sheet
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = newFrameW * cols;
        finalCanvas.height = newFrameH * rows;
        const finalCtx = finalCanvas.getContext('2d');

        if (!finalCtx) {
            setIsProcessing(false);
            return;
        }

        // Fill background color on new canvas to maintain consistency
        finalCtx.fillStyle = `rgb(${bgPixel[0]}, ${bgPixel[1]}, ${bgPixel[2]})`;
        finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

        // Redraw all frames into the new tight grid
        frames.forEach((frame, outputIndex) => {
             if (frame.isDeleted) return;

             // Draw original frame to temp
             ctx.clearRect(0, 0, frameW, frameH);
             ctx.fillStyle = `rgb(${bgPixel[0]}, ${bgPixel[1]}, ${bgPixel[2]})`;
             ctx.fillRect(0, 0, frameW, frameH);

             const srcCol = frame.id % cols;
             const srcRow = Math.floor(frame.id / cols);
             
             ctx.save();
             ctx.translate(frameW/2, frameH/2);
             ctx.rotate((frame.rotation * Math.PI) / 180);
             ctx.scale(frame.flipH ? -1 : 1, 1);
             ctx.scale(frame.scale, frame.scale);
             ctx.drawImage(
                 img, 
                 srcCol * frameW, srcRow * frameH, frameW, frameH, 
                 -frameW/2, -frameH/2, frameW, frameH
             );
             ctx.restore();

             // Copy CROP region
             const destCol = outputIndex % cols;
             const destRow = Math.floor(outputIndex / cols);

             finalCtx.drawImage(
                 tempCanvas,
                 minX, minY, newFrameW, newFrameH,
                 destCol * newFrameW, destRow * newFrameH, newFrameW, newFrameH
             );
        });

        const resultData = finalCanvas.toDataURL('image/png');
        setCurrentImageSrc(resultData); 
        setIsProcessing(false);
    }, 100);
  };

  // --- Final Save ---
  const handleSave = () => {
    if (!sourceImageRef.current) return;
    
    const img = sourceImageRef.current;
    const frameW = img.width / cols;
    const frameH = img.height / rows;
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    frames.forEach((frame, outputIndex) => {
      if (frame.isDeleted) return;

      const srcCol = frame.id % cols;
      const srcRow = Math.floor(frame.id / cols);
      const srcX = srcCol * frameW;
      const srcY = srcRow * frameH;

      const destCol = outputIndex % cols;
      const destRow = Math.floor(outputIndex / cols);
      
      const destCenterX = (destCol * frameW) + (frameW / 2);
      const destCenterY = (destRow * frameH) + (frameH / 2);

      ctx.save();
      ctx.translate(destCenterX, destCenterY);
      ctx.rotate((frame.rotation * Math.PI) / 180);
      ctx.scale(frame.flipH ? -1 : 1, 1);
      ctx.scale(frame.scale, frame.scale);

      ctx.drawImage(
        img,
        srcX, srcY, frameW, frameH,
        -frameW / 2, -frameH / 2, frameW, frameH
      );

      ctx.restore();
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
            <p className="text-xs text-slate-400">Drag to Reorder • Crop to Subject • Delete Invalid</p>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={handleSmartCrop} 
               disabled={isProcessing}
               className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2 border border-purple-400/30"
               title="Auto-detect subjects and remove extra whitespace"
             >
              {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />}
              Smart Crop
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
                  <h3 className="text-xl font-bold">Analyzing Frames...</h3>
                  <p className="text-slate-400">Optimizing frame sizes based on character bounds</p>
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
                    <div className="w-40 h-40 mx-auto bg-slate-700/50 border border-slate-600 rounded-lg checkerboard flex items-center justify-center overflow-hidden relative shadow-inner">
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
                    </div>
                    <div className="mt-3 text-xs text-slate-500 font-mono">
                        Original ID: {selectedFrame.id + 1}
                    </div>
                 </div>

                 <div className="space-y-6 border-t border-slate-700/50 pt-6">
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

                    <div className="space-y-3">
                        <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                            <Maximize2 size={12} /> SCALE
                        </label>
                        <div className="bg-slate-700/50 p-1 rounded-lg flex items-center justify-between">
                            <button 
                                onClick={() => handleUpdateFrame({ scale: Math.max(0.5, selectedFrame.scale - 0.1) })}
                                className="p-2 hover:bg-slate-600 rounded text-white transition-colors"
                            >
                                <Minimize2 size={16} />
                            </button>
                            <span className="text-sm font-mono text-white font-bold">
                                {Math.round(selectedFrame.scale * 100)}%
                            </span>
                            <button 
                                onClick={() => handleUpdateFrame({ scale: Math.min(2.0, selectedFrame.scale + 0.1) })}
                                className="p-2 hover:bg-slate-600 rounded text-white transition-colors"
                            >
                                <Maximize2 size={16} />
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
                            Deleted frames are transparent and skipped in playback.
                        </p>
                    </div>
                 </div>
               </>
             ) : (
                 <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                     <Undo2 size={48} />
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

    const srcX = (frame.id % cols) * frameW;
    const srcY = Math.floor(frame.id / cols) * frameH;

    ctx.save();
    ctx.translate(frameW/2, frameH/2);
    ctx.rotate((frame.rotation * Math.PI) / 180);
    ctx.scale(frame.flipH ? -1 : 1, 1);
    ctx.scale(frame.scale, frame.scale);
    
    ctx.drawImage(
      sourceImage,
      srcX, srcY, frameW, frameH,
      -frameW/2, -frameH/2, frameW, frameH
    );
    ctx.restore();

  }, [sourceImage, frame, rows, cols]);

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
      const srcX = (frame.id % cols) * frameW;
      const srcY = Math.floor(frame.id / cols) * frameH;
      ctx.save();
      ctx.translate(frameW/2, frameH/2);
      ctx.rotate((frame.rotation * Math.PI) / 180);
      ctx.scale(frame.flipH ? -1 : 1, 1);
      ctx.scale(frame.scale, frame.scale);
      ctx.drawImage(
        sourceImage,
        srcX, srcY, frameW, frameH,
        -frameW/2, -frameH/2, frameW, frameH
      );
      ctx.restore();
    }, [frame, sourceImage, rows, cols]);

    return <canvas ref={canvasRef} className="w-full h-full object-contain" />;
}