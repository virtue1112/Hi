import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HandState } from '../types';

interface HandTrackerProps {
  onHandUpdate: (state: HandState) => void;
  onSwipe: (direction: 'left' | 'right') => void;
}

// Lerp function for smoothing
const lerp = (start: number, end: number, factor: number) => {
  return start + (end - start) * factor;
};

const HandTracker: React.FC<HandTrackerProps> = ({ onHandUpdate, onSwipe }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Status: requesting_access, camera_success, loading_model, running, error
  const [status, setStatus] = useState<'idle' | 'requesting_access' | 'camera_success' | 'loading_model' | 'running' | 'error'>('idle');
  const [errorDetails, setErrorDetails] = useState<string>('');
  
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number | null>(null);
  const isMounted = useRef(true);

  // Smoothing refs
  const prevPos = useRef({ x: 0, y: 0, z: 0 });
  const prevPinch = useRef(0);

  // Auto-start vision on mount
  useEffect(() => {
    isMounted.current = true;
    startVision();
    
    return () => {
      isMounted.current = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const startVision = async () => {
    setStatus('requesting_access');
    setErrorDetails('');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API unavailable. Please use HTTPS.");
      }

      console.log("Requesting camera access...");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 }, 
                height: { ideal: 480 },
                facingMode: "user",
                frameRate: { ideal: 30 }
            },
            audio: false 
        });
      } catch (e) {
        console.warn("Preferred constraints failed, trying basic config", e);
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      if (!isMounted.current) return;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatus('camera_success');
      await new Promise(r => setTimeout(r, 100)); 
      
      setStatus('loading_model');

      console.log("Loading Vision Model...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
      );

      handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      console.log("Vision Ready");
      if (isMounted.current) {
        setStatus('running');
        predict();
      }

    } catch (err: any) {
      console.error("Vision Start Failed:", err);
      if (isMounted.current) {
        setStatus('error');
        setErrorDetails(err.message || "Initialization failed. Check permissions.");
      }
    }
  };

  const drawSkeleton = (ctx: CanvasRenderingContext2D, landmarks: any[], isClosed: boolean, isPinched: boolean) => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      const connections = HandLandmarker.HAND_CONNECTIONS;
      
      ctx.save();
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = isClosed ? '#fbbf24' : (isPinched ? '#818cf8' : '#4ade80');
      
      for (const connection of connections) {
          const start = landmarks[connection.start];
          const end = landmarks[connection.end];
          const startX = (1 - start.x) * ctx.canvas.width;
          const startY = start.y * ctx.canvas.height;
          const endX = (1 - end.x) * ctx.canvas.width;
          const endY = end.y * ctx.canvas.height;

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
      }
      ctx.restore();
  };

  const predict = () => {
    if (!isMounted.current) return;
    
    if (videoRef.current && handLandmarkerRef.current && videoRef.current.readyState >= 2) {
       if (canvasRef.current && videoRef.current) {
           const vW = videoRef.current.videoWidth;
           const vH = videoRef.current.videoHeight;
           if (canvasRef.current.width !== vW || canvasRef.current.height !== vH) {
               canvasRef.current.width = vW;
               canvasRef.current.height = vH;
           }
       }

       const nowInMs = performance.now();
       const results = handLandmarkerRef.current.detectForVideo(videoRef.current, nowInMs);

       if (results.landmarks && results.landmarks.length > 0) {
         const lm = results.landmarks[0]; 
         
         const wrist = lm[0];
         const tips = [8, 12, 16, 20];
         let avgTipDist = 0;
         tips.forEach(i => {
              avgTipDist += Math.hypot(lm[i].x - wrist.x, lm[i].y - wrist.y);
         });
         avgTipDist /= 4;
         
         const isClosed = avgTipDist < 0.25; 
         const isOpen = avgTipDist > 0.4; 

         const thumbTip = lm[4];
         const indexTip = lm[8];
         const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
         const pinchRaw = Math.max(0, Math.min(1, (0.15 - pinchDist) / 0.13));
         const isPinched = pinchRaw > 0.8;

         const pipIndex = lm[6].y;
         const tipIndex = lm[8].y;
         const pipMiddle = lm[10].y;
         const tipMiddle = lm[12].y;
         const palmCenter = lm[9];
         const distRing = Math.hypot(lm[16].x - palmCenter.x, lm[16].y - palmCenter.y);
         const distPinky = Math.hypot(lm[20].x - palmCenter.x, lm[20].y - palmCenter.y);
         
         const fingersUp = tipIndex < pipIndex && tipMiddle < pipMiddle;
         const othersDown = distRing < 0.15 && distPinky < 0.15;
         const isPeaceSign = fingersUp && othersDown && !isClosed && !isPinched;

         const targetX = (1 - palmCenter.x) * 2 - 1; 
         const targetY = -(palmCenter.y * 2 - 1);
         const targetZ = palmCenter.z;

         // Smoother Factor (Lower = Smoother/Slower)
         const smoothFactor = 0.15; 
         
         // Deadzone: If movement is tiny, ignore it to prevent jitter
         let x = lerp(prevPos.current.x, targetX, smoothFactor);
         let y = lerp(prevPos.current.y, targetY, smoothFactor);
         let z = lerp(prevPos.current.z, targetZ, smoothFactor);
         
         if (Math.abs(x - prevPos.current.x) < 0.002) x = prevPos.current.x;
         if (Math.abs(y - prevPos.current.y) < 0.002) y = prevPos.current.y;

         const pinchStrength = lerp(prevPinch.current, pinchRaw, smoothFactor);

         prevPos.current = { x, y, z };
         prevPinch.current = pinchStrength;

         if (canvasRef.current) {
             const ctx = canvasRef.current.getContext('2d');
             if (ctx) drawSkeleton(ctx, lm, isClosed, isPinched);
         }

         onHandUpdate({
           isDetected: true,
           isOpen,
           isClosed,
           isPinched,
           isPeaceSign,
           pinchDistance: pinchStrength,
           position: { x, y, z }
         });
       } else {
         if (canvasRef.current) {
             const ctx = canvasRef.current.getContext('2d');
             if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
         }
         onHandUpdate({ isDetected: false, isOpen: true, isClosed: false, isPinched: false, isPeaceSign: false, pinchDistance: 0, position: { x: 0, y: 0, z: 0 } });
       }
    }
    requestRef.current = requestAnimationFrame(predict);
  };
  
  // UI States
  if (status === 'requesting_access') {
      return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl text-white pointer-events-auto cursor-wait">
             <div className="animate-bounce mb-8">
                 <span className="material-symbols-outlined text-6xl text-indigo-400">arrow_upward</span>
             </div>
             <h2 className="text-2xl font-medium mb-2">Permission Required</h2>
             <p className="text-white/50 text-center max-w-sm px-4">Click <b>Allow</b> in the browser popup to connect.</p>
        </div>
      );
  }

  if (status === 'error') {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 text-white p-6 pointer-events-auto">
             <div className="max-w-md w-full bg-red-950/30 p-8 rounded-3xl border border-red-500/30 text-center">
                <span className="material-symbols-outlined text-5xl text-red-400 mb-4">warning</span>
                <h3 className="text-xl font-bold mb-2 text-red-200">Connection Failed</h3>
                <p className="text-red-200/60 mb-8 text-sm leading-relaxed">{errorDetails}</p>
                <div className="flex gap-4 justify-center">
                    <button onClick={() => window.location.reload()} className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 rounded-xl text-sm font-medium transition-colors">Reload</button>
                    <button onClick={() => startVision()} className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors">Retry</button>
                </div>
             </div>
        </div>
      );
  }

  return (
    <>
        {status === 'loading_model' && (
             <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                    <span className="text-sm font-bold tracking-widest uppercase text-white/80 animate-pulse">Syncing Neural Net...</span>
                </div>
             </div>
        )}

        <div className={`fixed bottom-4 left-4 z-[90] transition-all duration-500 ${status === 'idle' ? 'translate-y-[200%] opacity-0' : 'translate-y-0 opacity-100'}`}>
           <div className="relative rounded-xl overflow-hidden border border-white/20 shadow-2xl bg-black w-40 h-32">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1] opacity-60" playsInline muted />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]" />
              <div className="absolute top-2 right-2 flex gap-1">
                 <div className={`w-2 h-2 rounded-full animate-pulse ${status === 'running' ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-yellow-500'}`}></div>
              </div>
           </div>
        </div>
    </>
  );
};

export default HandTracker;