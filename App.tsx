import React, { useState, useRef } from 'react';
import { Header } from './components/Header';
import { SpritePreview } from './components/SpritePreview';
import { Spinner } from './components/Spinner';
import { generateSpriteSheet } from './services/geminiService';
import { Upload, Wand2, AlertCircle, Image as ImageIcon, PaintBucket, Layers, FileUp } from 'lucide-react';
import { GenerationState, BackgroundOption } from './types';

const App: React.FC = () => {
  // State
  const [mode, setMode] = useState<'generate' | 'import'>('generate');
  const [refImage, setRefImage] = useState<string | null>(null);
  const [importedSprite, setImportedSprite] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [backgroundOpt, setBackgroundOpt] = useState<BackgroundOption>('white');
  const [genState, setGenState] = useState<GenerationState>({
    isLoading: false,
    error: null,
    resultImage: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Handlers
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setRefImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImportSprite = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImportedSprite(reader.result as string);
        // Clear any previous AI generation
        setGenState({ isLoading: false, error: null, resultImage: null });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!refImage) {
      setGenState(prev => ({ ...prev, error: "Please upload a reference character first." }));
      return;
    }
    if (!prompt.trim()) {
      setGenState(prev => ({ ...prev, error: "Please describe the action (e.g., 'running animation')." }));
      return;
    }

    setGenState({ isLoading: true, error: null, resultImage: null });

    try {
      const resultBase64 = await generateSpriteSheet(refImage, prompt, backgroundOpt);
      setGenState({
        isLoading: false,
        error: null,
        resultImage: resultBase64,
      });
    } catch (error: any) {
      setGenState({
        isLoading: false,
        error: error.message || "An unexpected error occurred.",
        resultImage: null,
      });
    }
  };

  // Determine which image to show in preview
  const activeImage = mode === 'generate' ? genState.resultImage : importedSprite;

  return (
    <div className="min-h-screen flex flex-col bg-[#0f172a] text-slate-200 font-sans">
      <Header />
      
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
          
          {/* LEFT COLUMN: Controls */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Mode Tabs */}
            <div className="bg-slate-800 p-1 rounded-lg flex text-sm font-medium border border-slate-700">
              <button
                onClick={() => setMode('generate')}
                className={`flex-1 py-2 rounded-md flex items-center justify-center gap-2 transition-all ${mode === 'generate' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                <Wand2 size={16} /> AI Generator
              </button>
              <button
                onClick={() => setMode('import')}
                className={`flex-1 py-2 rounded-md flex items-center justify-center gap-2 transition-all ${mode === 'import' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                <FileUp size={16} /> Import Sheet
              </button>
            </div>

            {mode === 'generate' ? (
              <>
                {/* 1. Upload Section */}
                <section className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl animate-fade-in">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
                    <ImageIcon className="text-indigo-400" size={20} />
                    1. Reference Character
                  </h2>
                  
                  <div 
                    className={`
                      border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer group
                      ${refImage ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'}
                    `}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {refImage ? (
                      <div className="relative">
                        <img 
                          src={refImage} 
                          alt="Reference" 
                          className="mx-auto max-h-48 rounded shadow-lg object-contain" 
                        />
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded">
                          <span className="text-sm font-medium text-white">Change Image</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="p-3 bg-slate-700 rounded-full group-hover:scale-110 transition-transform">
                          <Upload size={24} className="text-slate-300" />
                        </div>
                        <p className="text-sm text-slate-300 font-medium">Click to upload character</p>
                        <p className="text-xs text-slate-500">PNG, JPG (Max 5MB)</p>
                      </div>
                    )}
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </div>
                </section>

                {/* 2. Prompt Section */}
                <section className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl animate-fade-in">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
                    <Wand2 className="text-purple-400" size={20} />
                    2. Action Prompt
                  </h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">Describe the animation</label>
                      <textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., Create a running animation sequence for this character, side view, 6 frames."
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none h-24"
                      />
                    </div>

                    {/* Background Selection */}
                    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                        <label className="block text-xs text-slate-400 mb-2 font-semibold flex items-center gap-1">
                            <PaintBucket size={12} /> GENERATION BACKGROUND
                        </label>
                        <div className="flex gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="bgOption" 
                                    checked={backgroundOpt === 'white'}
                                    onChange={() => setBackgroundOpt('white')}
                                    className="text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-600"
                                />
                                <span className="text-sm text-white">White</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="bgOption" 
                                    checked={backgroundOpt === 'green'}
                                    onChange={() => setBackgroundOpt('green')}
                                    className="text-green-500 focus:ring-green-500 bg-slate-800 border-slate-600"
                                />
                                <span className="text-sm text-green-400">Green Screen</span>
                            </label>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2">
                            * Select Green Screen for easier background removal on complex characters.
                        </p>
                    </div>

                    <button 
                      onClick={handleGenerate}
                      disabled={genState.isLoading || !refImage}
                      className={`
                        w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg
                        ${genState.isLoading || !refImage 
                          ? 'bg-slate-600 cursor-not-allowed opacity-50' 
                          : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/25'}
                      `}
                    >
                      {genState.isLoading ? (
                        <>
                          <Spinner />
                          <span>Generating Assets...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 size={18} />
                          <span>Generate Sprite Sheet</span>
                        </>
                      )}
                    </button>

                    {genState.error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-400 text-sm">
                        <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                        <p>{genState.error}</p>
                      </div>
                    )}
                  </div>
                </section>
              </>
            ) : (
              /* IMPORT MODE */
              <section className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl animate-fade-in">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
                  <Layers className="text-emerald-400" size={20} />
                  Import Existing Sheet
                </h2>
                <div 
                    className={`
                      border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer group
                      ${importedSprite ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'}
                    `}
                    onClick={() => importInputRef.current?.click()}
                  >
                    {importedSprite ? (
                      <div className="relative">
                        <img 
                          src={importedSprite} 
                          alt="Imported Sprite" 
                          className="mx-auto max-h-48 rounded shadow-lg object-contain" 
                        />
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded">
                          <span className="text-sm font-medium text-white">Change File</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="p-3 bg-slate-700 rounded-full group-hover:scale-110 transition-transform">
                          <FileUp size={24} className="text-slate-300" />
                        </div>
                        <p className="text-sm text-slate-300 font-medium">Click to upload sprite sheet</p>
                        <p className="text-xs text-slate-500">Any PNG/JPG Grid</p>
                      </div>
                    )}
                    <input 
                      type="file" 
                      ref={importInputRef} 
                      onChange={handleImportSprite} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-4">
                    Import an external sprite sheet to use the cutting, animation preview, and editing tools.
                  </p>
              </section>
            )}
          </div>

          {/* RIGHT COLUMN: Preview */}
          <div className="lg:col-span-8 h-full min-h-[500px]">
            {activeImage ? (
              <SpritePreview originalImageUrl={activeImage} />
            ) : (
              <div className="h-full bg-slate-800/50 border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center text-slate-500 p-8">
                 <div className="w-16 h-16 mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
                    <ImageIcon className="opacity-20" size={32} />
                 </div>
                 <h3 className="text-xl font-semibold text-slate-400 mb-2">
                    {mode === 'generate' ? 'Ready to Generate' : 'Ready to Import'}
                 </h3>
                 <p className="text-center max-w-md">
                   {mode === 'generate' 
                     ? "Upload a character reference on the left and describe the action. Gemini will generate a sprite sheet." 
                     : "Upload an existing sprite sheet on the left to access the slicer, animator, and crop tools."}
                 </p>
                 <div className="mt-8 grid grid-cols-4 gap-2 opacity-30">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="w-12 h-16 bg-slate-600 rounded"></div>
                    ))}
                 </div>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;