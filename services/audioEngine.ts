import { MusicalParams } from '../types';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private masterGain: GainNode | null = null;
  private melodyInterval: number | null = null;
  private reverbNode: ConvolverNode | null = null;
  private delayNode: DelayNode | null = null;
  private currentOscillators: OscillatorNode[] = [];

  // Scales defined by intervals relative to root
  private scales = {
    major: [0, 2, 4, 5, 7, 9, 11, 12],
    minor: [0, 2, 3, 5, 7, 8, 10, 12],
    pentatonic: [0, 2, 4, 7, 9, 12, 14, 16], // Major Pentatonic
    mystic: [0, 2, 4, 6, 9, 11, 12], // Promethean / Mystic scale
    dream: [0, 2, 4, 5, 7, 9, 11] // Lydian mode (dreamy)
  };

  constructor() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      this.ctx = new AudioContextClass();
    }
  }

  public async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // Generate a pseudo-random number from a string seed (Memory ID)
  private getRandomFromSeed(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return () => {
        const x = Math.sin(hash++) * 10000;
        return x - Math.floor(x);
    };
  }

  public async play(params: MusicalParams, memoryId: string) {
    if (!this.ctx) return;
    await this.resume();
    this.stop(); 
    
    // Create Effects Chain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 1.0);
    this.masterGain.connect(this.ctx.destination);

    // Add Reverb & Delay
    await this.setupEffects();

    // Deterministic Randomness based on Memory ID
    // This ensures every memory has a UNIQUE but consistent song
    const rng = this.getRandomFromSeed(memoryId);

    // 1. Play Pad (Background Texture)
    this.startPad(params, rng);

    // 2. Play Melody (Foreground)
    this.startGenerativeMelody(params, rng);
    
    this.isPlaying = true;
  }

  private async setupEffects() {
      if (!this.ctx || !this.masterGain) return;

      // Reverb
      if (!this.reverbNode) {
          this.reverbNode = this.ctx.createConvolver();
          // Create impulse response
          const rate = this.ctx.sampleRate;
          const length = rate * 3.0; 
          const impulse = this.ctx.createBuffer(2, length, rate);
          for (let i = 0; i < length; i++) {
              const n = i / length;
              const rand = (Math.random() * 2 - 1) * Math.pow(1 - n, 2.0);
              impulse.getChannelData(0)[i] = rand;
              impulse.getChannelData(1)[i] = rand;
          }
          this.reverbNode.buffer = impulse;
      }
      
      // Delay
      if (!this.delayNode) {
          this.delayNode = this.ctx.createDelay();
          this.delayNode.delayTime.value = 0.5;
          const fb = this.ctx.createGain();
          fb.gain.value = 0.3;
          this.delayNode.connect(fb);
          fb.connect(this.delayNode);
      }

      const wet = this.ctx.createGain();
      wet.gain.value = 0.4;
      this.masterGain.connect(wet);
      wet.connect(this.reverbNode);
      wet.connect(this.delayNode);
      this.reverbNode.connect(this.ctx.destination);
      this.delayNode.connect(this.ctx.destination);
  }

  private startPad(params: MusicalParams, rng: () => number) {
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime;
      const root = params.baseFrequency / 2; // Lower octave
      
      // Chord structure based on scale
      const chordOffsets = [1, 1.5, 1.25]; // Root, 5th, Major 3rd approx
      
      chordOffsets.forEach(mult => {
          const osc = this.ctx!.createOscillator();
          osc.type = rng() > 0.5 ? 'sine' : 'triangle';
          osc.frequency.value = root * mult;
          
          const g = this.ctx!.createGain();
          g.gain.value = 0.08;
          
          // LFO for movement
          const lfo = this.ctx!.createOscillator();
          lfo.frequency.value = 0.1 + rng() * 0.2;
          const lfoGain = this.ctx!.createGain();
          lfoGain.gain.value = 0.02;
          lfo.connect(lfoGain);
          lfoGain.connect(g.gain);
          lfo.start(t);

          osc.connect(g);
          g.connect(this.masterGain!);
          osc.start(t);
          this.currentOscillators.push(osc);
          this.currentOscillators.push(lfo);
      });
  }

  private startGenerativeMelody(params: MusicalParams, rng: () => number) {
      if (!this.ctx) return;
      
      // Select scale
      const scaleName = params.scale === 'minor' ? 'minor' : 'pentatonic'; 
      const scaleNotes = this.scales[scaleName] || this.scales.pentatonic;
      
      const bpm = params.tempo || 80;
      const noteDuration = 60 / bpm;

      this.melodyInterval = window.setInterval(() => {
          if (!this.isPlaying || !this.ctx || !this.masterGain) return;
          
          // Use RNG to decide note
          if (rng() > (1 - params.complexity)) {
              const noteIdx = Math.floor(rng() * scaleNotes.length);
              const octave = rng() > 0.7 ? 2 : 1;
              const freq = params.baseFrequency * Math.pow(2, scaleNotes[noteIdx] / 12) * octave;
              
              const t = this.ctx.currentTime;
              const osc = this.ctx.createOscillator();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(freq, t);
              
              const env = this.ctx.createGain();
              env.connect(this.masterGain);
              
              // Bell-like envelope
              env.gain.setValueAtTime(0, t);
              env.gain.linearRampToValueAtTime(0.3, t + 0.05);
              env.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
              
              osc.connect(env);
              osc.start(t);
              osc.stop(t + 2.0);
              
              // Clean up later
              setTimeout(() => { osc.disconnect(); env.disconnect(); }, 2100);
          }
      }, noteDuration * 1000); 
  }

  public stop() {
    this.isPlaying = false;
    if (this.melodyInterval) {
        clearInterval(this.melodyInterval);
        this.melodyInterval = null;
    }
    this.currentOscillators.forEach(o => {
        try { o.stop(); o.disconnect(); } catch(e){}
    });
    this.currentOscillators = [];
    
    if (this.masterGain) {
        this.masterGain.disconnect();
        this.masterGain = null;
    }
  }
}

export const audioEngine = new AudioEngine();