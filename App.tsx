import React, { useState, useRef, useCallback, useEffect } from 'react';
import HandTracker from './components/HandTracker';
import ParticleOrb from './components/ParticleOrb';
import ChatBot from './components/ChatBot';
import RainBackground from './components/RainBackground';
import { generateMemoryMetadata } from './services/aiService';
import { audioEngine } from './services/audioEngine';
import { HandState, Memory } from './types';

// Memoize heavy components to prevent re-renders when hand state flags change
const MemoizedRainBackground = React.memo(RainBackground);
const MemoizedChatBot = React.memo(ChatBot);
const MemoizedHandTracker = React.memo(HandTracker);
// ParticleOrb is already memoized in its export

const App: React.FC = () => {
  // --- STATE (UI Logic Only) ---
  const [hasStarted, setHasStarted] = useState(false);
  const [view, setView] = useState<'create' | 'orb'>('create');
  const [memories, setMemories] = useState<Memory[]>([]);
  const [currentMemoryIndex, setCurrentMemoryIndex] = useState<number>(-1);
  
  // Hand Flags State (Only update when these BOOLEANS change, not position/floats)
  // REMOVED pinchStrength from here to prevent re-renders on float changes
  const [handFlags, setHandFlags] = useState<{
    isDetected: boolean;
    isOpen: boolean;
    isClosed: boolean;
    isPinched: boolean;
    isPeaceSign: boolean;
  }>({ isDetected: false, isOpen: true, isClosed: false, isPinched: false, isPeaceSign: false });

  const [orbShapeIndex, setOrbShapeIndex] = useState(0); 

  // --- REFS (Animation & High Frequency Data) ---
  // Store position and continuous values in Refs to avoid React Render Cycle
  const handPositionRef = useRef({ x: 0, y: 0, z: 0 });
  const pinchStrengthRef = useRef(0); // NEW: Pass this ref to ParticleOrb
  const cursorRef = useRef<HTMLDivElement>(null);
  
  const grabCooldownRef = useRef(0);
  const peaceCooldownRef = useRef(0);
  const prevFlagsRef = useRef(handFlags);

  // Form State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [diaryEntry, setDiaryEntry] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [density, setDensity] = useState(0.5);
  const [fontColor, setFontColor] = useState('#e0e0e0');
  const [backgroundMedia, setBackgroundMedia] = useState<{url: string | null, isVideo: boolean}>({ url: null, isVideo: false });
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);

  const activeMemory = currentMemoryIndex >= 0 && memories.length > 0 ? memories[currentMemoryIndex] : null;

  const handleStart = async () => {
      await audioEngine.resume();
      setHasStarted(true);
  };

  // Optimized Callback: Handles high-frequency updates without re-rendering App
  const handleHandUpdate = useCallback((state: HandState) => {
    // 1. Update Refs (consumed by ParticleOrb's animation loop directly)
    handPositionRef.current = state.position;
    pinchStrengthRef.current = state.pinchDistance;

    // 2. Direct DOM Update for Cursor (Zero React Overhead)
    if (cursorRef.current) {
        if (state.isDetected) {
            cursorRef.current.style.opacity = '1';
            // Lerped position is already coming from HandTracker
            const x = state.position.x; 
            const y = state.position.y;
            // Convert normalized (-1 to 1) to vw/vh offsets
            cursorRef.current.style.transform = `translate(calc(-50% + ${x * 50}vw), calc(-50% + ${y * 50}vh)) scale(${state.isClosed ? 0.75 : 1})`;
        } else {
            cursorRef.current.style.opacity = '0';
        }
    }

    // 3. Logic Checks (Grab/Peace)
    const now = Date.now();
    const prev = prevFlagsRef.current;

    // GRAB -> Next Memory
    if (!prev.isClosed && state.isClosed && memories.length > 0 && view === 'orb') {
        if (now - grabCooldownRef.current > 1500) { 
             nextMemoryRef.current(); 
             grabCooldownRef.current = now;
        }
    }

    // PEACE -> Morph
    if (state.isPeaceSign && view === 'orb') {
        if (orbShapeIndex === 0 && now - peaceCooldownRef.current > 1000) {
             morphShapeRef.current(); 
             peaceCooldownRef.current = now;
        }
    }

    // 4. Update React State ONLY if DISCRETE flags change
    const flagsChanged = 
        prev.isDetected !== state.isDetected ||
        prev.isOpen !== state.isOpen ||
        prev.isClosed !== state.isClosed ||
        prev.isPinched !== state.isPinched ||
        prev.isPeaceSign !== state.isPeaceSign;

    if (flagsChanged) {
        const newFlags = {
            isDetected: state.isDetected,
            isOpen: state.isOpen,
            isClosed: state.isClosed,
            isPinched: state.isPinched,
            isPeaceSign: state.isPeaceSign
        };
        setHandFlags(newFlags);
        prevFlagsRef.current = newFlags;
    } 
    // We NO LONGER set state for simple pinch strength changes, so App render is skipped!
  }, [memories.length, view, orbShapeIndex]); 

  // Refs for logic functions to avoid stale closures in the high-freq callback
  const nextMemoryRef = useRef(() => {});
  const morphShapeRef = useRef(() => {});

  const morphShapeBasedOnContext = () => {
      if (!activeMemory) return;
      const text = (activeMemory.diary + " " + activeMemory.keywords.join(" ")).toLowerCase();
      let targetShape = 4;
      if (text.match(/love|heart|romance|kiss|happy/)) targetShape = 1;
      else if (text.match(/star|night|dream|space|light/)) targetShape = 2;
      else if (text.match(/fly|bird|butterfly|nature|flower/)) targetShape = 3;
      else if (text.match(/world|earth|planet|round/)) targetShape = 4;
      else targetShape = (Math.floor(Math.random() * 4)) + 1;
      setOrbShapeIndex(targetShape);
  };

  const nextMemory = () => {
    if (memories.length === 0) return;
    setCurrentMemoryIndex(prev => {
        const next = (prev + 1) % memories.length;
        if (memories[next]) playMemoryMusic(memories[next]);
        return next;
    });
    setOrbShapeIndex(0);
  };

  const prevMemory = () => {
    if (memories.length === 0) return;
    setCurrentMemoryIndex(prev => {
        const next = (prev - 1 + memories.length) % memories.length;
        if (memories[next]) playMemoryMusic(memories[next]);
        return next;
    });
    setOrbShapeIndex(0);
  };

  // Update logic refs
  useEffect(() => {
      nextMemoryRef.current = nextMemory;
      morphShapeRef.current = morphShapeBasedOnContext;
  }, [memories, activeMemory]);

  const playMemoryMusic = async (mem: Memory) => {
     try {
        await audioEngine.play(mem.musicalParams, mem.id);
        setIsPlaying(true);
     } catch (e) {
         console.error("Audio playback failed", e);
     }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const isVideo = file.type.startsWith('video');
          const url = URL.createObjectURL(file);
          setBackgroundMedia({ url, isVideo });
      }
  };

  const handleCreateMemory = async () => {
    if (!selectedImage || !diaryEntry) return;

    setIsProcessing(true);
    await audioEngine.resume(); 
    
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const metadata = await generateMemoryMetadata(diaryEntry, dateStr);

    const newMemory: Memory = {
      id: Date.now().toString() + Math.random().toString(),
      imageUrl: selectedImage,
      diary: diaryEntry,
      date: dateStr,
      keywords: metadata.keywords,
      musicalParams: metadata.musicalParams,
      title: metadata.title
    };

    const updatedMemories = [...memories, newMemory]; 
    setMemories(updatedMemories);
    setCurrentMemoryIndex(updatedMemories.length - 1); 
    setView('orb');
    setSelectedImage(null);
    setDiaryEntry('');
    setIsProcessing(false);
    await playMemoryMusic(newMemory);
  };

  const toggleMusic = async () => {
    if (!activeMemory) return;
    if (isPlaying) {
      audioEngine.stop();
      setIsPlaying(false);
    } else {
      await playMemoryMusic(activeMemory);
    }
  };

  if (!hasStarted) {
      return (
          <div className="w-full h-screen bg-black flex flex-col items-center justify-center text-white cursor-pointer relative overflow-hidden" onClick={handleStart}>
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1518066000714-58c45f1a2c0a?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-30" />
              <div className="z-10 flex flex-col items-center gap-6 animate-pulse">
                  <h1 className="text-5xl font-serif italic tracking-wider">Memory Orb</h1>
                  <p className="text-sm uppercase tracking-[0.3em] opacity-70">Click to Connect</p>
              </div>
          </div>
      );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans selection:bg-indigo-500/30 cursor-none" style={{ color: fontColor }}>
      <MemoizedRainBackground mediaUrl={backgroundMedia.url} isVideo={backgroundMedia.isVideo} />

      <div className="absolute inset-0 z-0">
        <ParticleOrb 
          imageUrl={activeMemory?.imageUrl || (selectedImage || '')} 
          isActive={view === 'orb' || !!selectedImage}
          handPositionRef={handPositionRef}
          pinchStrengthRef={pinchStrengthRef} // Updated prop
          handStateFlags={handFlags}
          isMusicPlaying={isPlaying}
          density={density}
          shapeIndex={orbShapeIndex}
        />
      </div>

      <MemoizedHandTracker onHandUpdate={handleHandUpdate} onSwipe={() => {}} />

      {/* Visual Hand Cursor (Direct DOM manipulation via ref) */}
      <div 
        ref={cursorRef}
        className="fixed w-12 h-12 pointer-events-none z-[100] transition-colors duration-200 mix-blend-difference flex items-center justify-center opacity-0 will-change-transform"
        style={{ left: '50%', top: '50%' }}
      >
         {/* Ring */}
         <div className={`absolute inset-0 rounded-full border-2 opacity-80 transition-colors duration-200 
            ${handFlags.isClosed ? 'border-yellow-400 bg-yellow-400/20' : 
              handFlags.isPinched ? 'border-indigo-400 bg-indigo-400/20' : 
              'border-white/80'}`} 
         />
         {/* Dot */}
         <div className={`w-2 h-2 bg-white rounded-full transition-colors duration-200
            ${handFlags.isClosed ? 'bg-yellow-400' : handFlags.isPinched ? 'bg-indigo-400' : 'bg-white'}
         `} />
         {/* Label */}
         <div className="absolute top-14 text-[10px] font-bold tracking-widest uppercase text-white whitespace-nowrap opacity-90 drop-shadow-md">
             {handFlags.isClosed ? 'NEXT' : handFlags.isPeaceSign ? 'MORPH' : handFlags.isPinched ? 'RIPPLE' : ''}
         </div>
      </div>

      {/* UI Overlay */}
      <div className="absolute inset-0 z-10 flex flex-col pointer-events-none cursor-auto">
        
        {/* Header */}
        <header className="p-6 flex justify-between items-center pointer-events-auto">
          <div className="flex flex-col">
              <h1 className="text-3xl font-serif italic tracking-wider drop-shadow-lg" style={{ color: fontColor }}>Memory Orb</h1>
              {memories.length > 0 && <span className="text-[10px] uppercase tracking-widest opacity-50 mt-1">{memories.length} Memories Stored</span>}
          </div>
          <button onClick={() => setShowLeftSidebar(!showLeftSidebar)} className="md:hidden text-white"><span className="material-symbols-outlined">menu</span></button>
        </header>

        {/* Left Sidebar */}
        <div className={`absolute left-6 top-1/2 -translate-y-1/2 pointer-events-auto transition-transform duration-300 ${showLeftSidebar ? 'translate-x-0' : '-translate-x-[150%]'} md:translate-x-0`}>
            <div className="bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex flex-col gap-4 w-16 group hover:w-64 transition-all duration-300 overflow-hidden">
                <div className="flex items-center gap-4">
                     <span className="material-symbols-outlined text-white/70">palette</span>
                     <span className="text-xs uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">Text Color</span>
                </div>
                <input type="color" value={fontColor} onChange={(e) => setFontColor(e.target.value)} className="w-8 h-8 rounded-full cursor-pointer bg-transparent border-none" />
                <div className="h-px bg-white/10 w-full" />
                <div className="flex items-center gap-4">
                     <span className="material-symbols-outlined text-white/70">wallpaper</span>
                     <span className="text-xs uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">Background</span>
                </div>
                <label className="cursor-pointer">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"><span className="material-symbols-outlined text-sm">upload</span></div>
                    <input type="file" accept="image/*,video/*" className="hidden" onChange={handleBackgroundUpload} />
                </label>
            </div>
        </div>

        {/* Right Sidebar Controls */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-6 pointer-events-auto bg-black/20 backdrop-blur-sm p-4 rounded-full border border-white/10">
          <button onClick={() => { setView('create'); setSelectedImage(null); setDiaryEntry(''); audioEngine.stop(); setIsPlaying(false); }} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/30 flex items-center justify-center transition-all border border-white/20" title="Add Another Memory">
            <span className="material-symbols-outlined text-xl">add_circle</span>
          </button>
          <div className="h-48 w-2 relative flex justify-center">
             <input type="range" min="0" max="1" step="0.01" value={density} onChange={(e) => setDensity(parseFloat(e.target.value))}
                className="absolute w-48 -rotate-90 origin-center top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 appearance-none bg-white/20 h-1 rounded-full cursor-pointer" />
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/50 rotate-90 whitespace-nowrap">Density</div>
        </div>
        
        {/* Navigation Arrows (Manual Control) */}
        {view === 'orb' && memories.length > 1 && (
            <>
                <button onClick={prevMemory} className="absolute left-24 md:left-32 top-1/2 -translate-y-1/2 pointer-events-auto w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center backdrop-blur-sm transition-all hover:scale-110 z-20 border border-white/10">
                    <span className="material-symbols-outlined text-3xl">chevron_left</span>
                </button>
                <button onClick={nextMemory} className="absolute right-24 md:right-32 top-1/2 -translate-y-1/2 pointer-events-auto w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center backdrop-blur-sm transition-all hover:scale-110 z-20 border border-white/10">
                    <span className="material-symbols-outlined text-3xl">chevron_right</span>
                </button>
            </>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex items-center justify-center p-6 relative">
          
          {/* Create View */}
          {view === 'create' && (
            <div className="transition-all duration-700 w-full max-w-lg translate-y-0">
              {!selectedImage && (
                <div className="text-center pointer-events-auto bg-black/40 backdrop-blur-sm p-10 rounded-3xl border border-white/10 animate-fade-in">
                  <label className="cursor-pointer group flex flex-col items-center gap-4">
                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/30 group-hover:border-white flex items-center justify-center transition-all">
                      <span className="material-symbols-outlined text-3xl text-white/50 group-hover:text-white">add_a_photo</span>
                    </div>
                    <span className="text-lg font-light">Upload Memory #{memories.length + 1}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>
              )}
              {selectedImage && (
                <div className="pointer-events-auto bg-black/60 backdrop-blur-md p-8 rounded-3xl border border-white/10 animate-slide-up shadow-2xl">
                  <h2 className="text-xl font-serif mb-4">What do you remember?</h2>
                  <textarea 
                    value={diaryEntry}
                    onChange={(e) => setDiaryEntry(e.target.value)}
                    placeholder="Write your diary entry here..."
                    className="w-full h-32 bg-transparent border-b border-white/20 focus:border-white focus:outline-none resize-none mb-6 font-light text-lg leading-relaxed placeholder-white/30"
                  />
                  <div className="flex gap-4">
                      {memories.length > 0 && (
                          <button onClick={() => setView('orb')} className="flex-1 py-4 bg-transparent border border-white/10 hover:bg-white/5 rounded-xl transition-all font-semibold uppercase tracking-widest text-xs">
                              Cancel
                          </button>
                      )}
                      <button onClick={handleCreateMemory} disabled={!diaryEntry || isProcessing} className="flex-[2] py-4 bg-white/10 hover:bg-white/20 rounded-xl transition-all font-semibold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
                        {isProcessing ? <><span className="material-symbols-outlined animate-spin">refresh</span> Crystallizing...</> : 'Add to Collection'}
                      </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Orb View */}
          {view === 'orb' && activeMemory && (
            <div className={`pointer-events-auto text-center space-y-4 animate-fade-in absolute bottom-[5vh] left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 flex flex-col items-center transition-all duration-500 transform ${handFlags.isOpen ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
              
              <button onClick={toggleMusic} className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 hover:scale-105 transition-all flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl">{isPlaying ? 'pause' : 'play_arrow'}</span>
              </button>

              <h2 className="text-4xl md:text-5xl font-serif italic text-white drop-shadow-lg" style={{ color: fontColor }}>
                {activeMemory.title}
              </h2>
              
              <div className="inline-block px-4 py-1 border-y border-white/30">
                  <span className="text-sm font-medium tracking-[0.3em] uppercase" style={{ color: '#FFD700' }}>
                      {activeMemory.date}
                  </span>
              </div>
              
              <div className="max-h-32 overflow-y-auto w-full text-center px-4 mt-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                  <p className="text-lg font-light leading-relaxed text-white/90 italic shadow-black drop-shadow-md">
                      "{activeMemory.diary}"
                  </p>
              </div>

              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {activeMemory.keywords.map((kw, i) => (
                  <span key={i} className="px-3 py-1 rounded-full border border-white/20 text-xs bg-black/20 backdrop-blur-sm">#{kw}</span>
                ))}
              </div>
            </div>
          )}
          
          {/* Hint Overlay */}
           {view === 'orb' && handFlags.isOpen && (
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/30 text-center pointer-events-none">
                   <span className="material-symbols-outlined text-4xl mb-2 animate-bounce">back_hand</span>
                   <p className="tracking-[0.5em] text-xs uppercase mb-2">Galaxy Mode</p>
                   <p className="tracking-[0.2em] text-[10px] uppercase opacity-70">✌️ Peace: Transform | 🤏 Pinch: Ripple | ✊ Grab: Next</p>
               </div>
           )}

        </main>
      </div>

      <MemoizedChatBot />
      
    </div>
  );
};

export default App;