import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface RainBackgroundProps {
  mediaUrl: string | null; // URL for image or video
  isVideo: boolean;
}

const RainBackground: React.FC<RainBackgroundProps> = ({ mediaUrl, isVideo }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Shader from Shadertoy "Heartfelt" simplified/adapted for ThreeJS
  // Original by BigWIngs (The Art of Code) concept
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float iTime;
    uniform vec2 iResolution;
    uniform sampler2D iChannel0; // The background texture
    varying vec2 vUv;

    // Random function
    vec3 N13(float p) {
       vec3 p3 = fract(vec3(p) * vec3(.1031, .11369, .13787));
       p3 += dot(p3, p3.yzx + 19.19);
       return fract(vec3((p3.x + p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x));
    }

    vec4 N14(float t) {
        return fract(sin(t*vec4(123., 1024., 1456., 264.))*vec4(6547., 345., 8799., 1564.));
    }
    float N(float t) {
        return fract(sin(t*12345.564)*7658.76);
    }

    float Saw(float b, float t) {
        return smoothstep(0., b, t)*smoothstep(1., b, t);
    }

    vec2 DropLayer2(vec2 uv, float t) {
        vec2 UV = uv;
        
        uv.y += t*0.75;
        vec2 a = vec2(6., 3.);
        vec2 grid = a*2.;
        vec2 id = floor(uv*grid);
        
        float colShift = N(id.x); 
        uv.y += colShift;
        
        id = floor(uv*grid);
        vec3 n = N13(id.x*35.2+id.y*2376.1);
        vec2 st = fract(uv*grid)-vec2(.5, 0);
        
        float x = n.x-.5;
        
        float y = UV.y*20.;
        float wiggle = sin(y+sin(y));
        x += wiggle*(.5-abs(x))*(n.z-.5);
        x *= .7;
        float ti = fract(t+n.z);
        float y_pos = (Saw(.85, ti)-.5)*.9+.5;
        vec2 p = vec2(x, y_pos);
        
        float d = length((st-p)*a.yx);
        
        float mainDrop = smoothstep(.4, .0, d);
        
        float r = sqrt(smoothstep(1., y_pos, st.y));
        float cd = abs(st.x-x);
        float trail = smoothstep(.23*r, .15*r*r, cd);
        float trailFront = smoothstep(-.02, .02, st.y-y_pos);
        trail *= trailFront*r*r;
        
        y = UV.y;
        float trail2 = smoothstep(.2*r, .0, cd);
        float droplets = max(0., (sin(y*(1.-y)*120.)-st.y))*trail2*trailFront*n.z;
        y = fract(y*10.)+(st.y-.5);
        float dd = length(st-vec2(x, y));
        droplets = smoothstep(.3, 0., dd);
        float m = mainDrop+droplets*r*trailFront;
        
        return vec2(m, trail);
    }

    float StaticDrops(vec2 uv, float t) {
        uv *= 40.;
        
        vec2 id = floor(uv);
        uv = fract(uv)-.5;
        vec3 n = N13(id.x*107.45+id.y*3543.654);
        vec2 p = (n.xy-.5)*.7;
        float d = length(uv-p);
        
        float fade = Saw(.025, fract(t+n.z));
        float c = smoothstep(.3, 0., d)*fract(n.z*10.)*fade;
        return c;
    }

    vec2 Drops(vec2 uv, float t, float l0, float l1, float l2) {
        float s = StaticDrops(uv, t)*l0; 
        vec2 m1 = DropLayer2(uv, t)*l1;
        vec2 m2 = DropLayer2(uv*1.85, t)*l2;
        
        float c = s+m1.x+m2.x;
        c = smoothstep(.3, 1., c);
        
        return vec2(c, max(m1.y*l0, m2.y*l1));
    }

    void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
        vec2 UV = gl_FragCoord.xy / iResolution.xy;
        float t = iTime * 0.2;
        
        // Rain Drops
        float staticDrops = smoothstep(-.5, 1., sin(t*2.+uv.x)+cos(t+uv.y));
        vec2 drops = Drops(uv, t, staticDrops, 1., 1.);
        
        // Distortion
        vec2 offset = drops.x * vec2(.05, .05);
        vec3 col = texture2D(iChannel0, UV + offset).rgb;
        
        // Vignette & Blur simulation via simple darkening on drops
        // Ideally we would LOD sample for blur, but basic WebGL 1.0 lacks easy LOD bias in some contexts without setup
        // We will just darken and tint slightly
        
        // Add "Heartfelt" reddish/warm tint or keep original? Keeping original but slightly dimmed
        col *= 0.9; 
        
        // Add brightness to drops
        col += drops.x * 0.2; 
        
        gl_FragColor = vec4(col, 1.0);
    }
  `;

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);

    const geometry = new THREE.PlaneGeometry(2, 2);
    
    // Default Texture (if none provided)
    const textureLoader = new THREE.TextureLoader();
    let texture: THREE.Texture;
    let videoElement: HTMLVideoElement | null = null;

    if (mediaUrl && isVideo) {
        videoElement = document.createElement('video');
        videoElement.src = mediaUrl;
        videoElement.loop = true;
        videoElement.muted = true;
        videoElement.play().catch(e => console.warn("Background video autoplay blocked", e));
        texture = new THREE.VideoTexture(videoElement);
    } else {
        texture = textureLoader.load(mediaUrl || 'https://images.unsplash.com/photo-1518066000714-58c45f1a2c0a?q=80&w=2070&auto=format&fit=crop');
    }
    
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new THREE.Vector2(containerRef.current.clientWidth, containerRef.current.clientHeight) },
        iChannel0: { value: texture }
      },
      vertexShader,
      fragmentShader
    });

    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    const animate = (time: number) => {
        material.uniforms.iTime.value = time * 0.001;
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    };
    animate(0);

    const handleResize = () => {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        renderer.setSize(w, h);
        material.uniforms.iResolution.value.set(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        if (containerRef.current) {
            containerRef.current.innerHTML = '';
        }
        if (videoElement) {
            videoElement.pause();
            videoElement.src = "";
        }
        texture.dispose();
        geometry.dispose();
        material.dispose();
        renderer.dispose();
    };
  }, [mediaUrl, isVideo]);

  return <div ref={containerRef} className="fixed inset-0 w-full h-full z-[-1] bg-black" />;
};

export default RainBackground;
