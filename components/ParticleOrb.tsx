import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface ParticleOrbProps {
  imageUrl: string;
  isActive: boolean;
  handPositionRef: React.MutableRefObject<{x: number, y: number, z: number}>;
  pinchStrengthRef: React.MutableRefObject<number>; // Optimized: Read via ref
  handStateFlags: { isOpen: boolean }; // Only discrete flags that trigger state changes
  isMusicPlaying: boolean;
  density: number;
  shapeIndex: number; 
}

const ParticleOrb: React.FC<ParticleOrbProps> = ({ imageUrl, isActive, handPositionRef, pinchStrengthRef, handStateFlags, isMusicPlaying, density, shapeIndex }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const frameIdRef = useRef<number>(0);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Store non-animating props in ref to access in loop
  const latestProps = useRef({ density, shapeIndex, handStateFlags, isMusicPlaying });
  const currentDispersionRef = useRef(0); 

  useEffect(() => {
      latestProps.current = { density, shapeIndex, handStateFlags, isMusicPlaying };
  }, [density, shapeIndex, handStateFlags, isMusicPlaying]);

  const vertexShader = `
    uniform float uTime;
    uniform float uDispersion; 
    uniform vec3 uHandPos; // World Space
    uniform float uShapeIndex; 
    uniform float uPinchStrength; 
    
    varying vec2 vUv;
    varying float vAlpha;
    varying float vDist;

    // --- NOISE (Simplex) ---
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) { 
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i); 
        vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 )) + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }

    vec3 curlNoise(vec3 p) {
        float e = 0.1;
        vec3 dx = vec3(e, 0.0, 0.0); vec3 dy = vec3(0.0, e, 0.0); vec3 dz = vec3(0.0, 0.0, e);
        vec3 p_x0 = snoise(p - dx)*vec3(1.0); vec3 p_x1 = snoise(p + dx)*vec3(1.0);
        vec3 p_y0 = snoise(p - dy)*vec3(1.0); vec3 p_y1 = snoise(p + dy)*vec3(1.0);
        vec3 p_z0 = snoise(p - dz)*vec3(1.0); vec3 p_z1 = snoise(p + dz)*vec3(1.0);
        float x = p_y1.z - p_y0.z - p_z1.y + p_z0.y;
        float y = p_z1.x - p_z0.x - p_x1.z + p_x0.z;
        float z = p_x1.y - p_x0.y - p_y1.x + p_y0.x;
        return normalize(vec3(x, y, z));
    }

    // --- SHAPES ---
    vec3 getHeart(vec3 p) {
        p *= 1.5;
        float x = p.x;
        float y = p.y;
        float z = p.z;
        float y2 = y - abs(x)*0.5; // squash top
        return vec3(x, y2, z*0.5);
    }

    vec3 getStar(vec3 p) {
        vec3 pos = normalize(p);
        float a = atan(pos.y, pos.x);
        float r = 1.0 + 0.6 * sin(a * 5.0);
        return pos * r * (1.0 - abs(pos.z)*0.5);
    }
    
    vec3 getButterfly(vec3 p) {
        vec3 pos = normalize(p);
        float theta = atan(pos.y, pos.x);
        float r = (exp(cos(theta)) - 2.0*cos(4.0*theta) + pow(sin(theta/12.0), 5.0));
        return vec3(r * cos(theta), r * sin(theta), pos.z * 0.2);
    }

    vec3 getPlanet(vec3 p) {
        vec3 pos = normalize(p);
        if(abs(p.y) < 0.1) return vec3(pos.x*2.0, pos.y*0.1, pos.z*2.0); // Ring
        return pos; // Sphere
    }

    void main() {
        vUv = uv;
        vec3 pos = position; // Original sphere position
        
        // 1. Calculate Target Shape
        vec3 target = pos;
        float t = uShapeIndex;
        
        vec3 sHeart = getHeart(pos);
        vec3 sStar = getStar(pos);
        vec3 sButter = getButterfly(pos);
        vec3 sPlanet = getPlanet(pos);

        if (t < 0.5) target = pos;
        else if (t < 1.5) target = mix(pos, sHeart, (t-0.5)*2.0);
        else if (t < 2.5) target = mix(sHeart, sStar, (t-1.5)*2.0);
        else if (t < 3.5) target = mix(sStar, sButter, (t-2.5)*2.0);
        else target = mix(sButter, sPlanet, (t-3.5)*2.0);

        // 2. Pinch Distortion (Wave/Ripple)
        // Strong pinch strength means BIG waves
        float distFromCenter = length(target.xy);
        float wave = sin(distFromCenter * 8.0 - uTime * 5.0) * uPinchStrength * 0.4;
        
        // Also twist
        float twistAngle = uPinchStrength * 2.0 * target.y;
        float c = cos(twistAngle); float s = sin(twistAngle);
        mat2 m = mat2(c, -s, s, c);
        target.xz = m * target.xz;
        target += normal * wave;

        // 3. Nebula (Dispersed) Mode
        // Attract to Hand in World Space
        vec3 noiseOffset = curlNoise(pos + uTime * 0.1);
        
        // Nebula flow
        vec3 dispersed = pos * 3.0 + noiseOffset * 2.0;
        
        // IMPORTANT: Attraction to uHandPos
        // uHandPos is projected to Z=0 plane roughly
        vec3 handSpace = uHandPos; 
        
        // When dispersed, particles follow hand like a swarm
        if (uDispersion > 0.1) {
             float d = distance(dispersed, handSpace);
             vec3 dir = normalize(handSpace - dispersed);
             // Magnetic pull
             dispersed += dir * (3.0 / (d + 0.1)) * uDispersion * 0.1;
        }

        // 4. Final Mix
        vec3 finalPos = mix(target, dispersed, uDispersion);
        
        vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        // 5. Size (High Res)
        // High quality calculation based on depth
        float size = (5.0 + uPinchStrength * 5.0) * (1.0 / -mvPosition.z);
        if (uDispersion > 0.5) size *= 0.6; // Smaller stars
        
        gl_PointSize = size;
        vAlpha = 1.0;
        vDist = length(finalPos);
    }
  `;

  const fragmentShader = `
    uniform sampler2D uTexture;
    uniform float uDispersion;
    varying vec2 vUv;
    varying float vAlpha;

    void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        if(length(coord) > 0.5) discard;

        vec4 texColor = texture2D(uTexture, vUv);
        
        // Nebula Mode: Sparkling Blue/Violet
        vec3 spaceColor = vec3(0.4, 0.6, 1.0) * 1.5; 
        
        vec3 finalColor = mix(texColor.rgb, spaceColor, uDispersion);
        
        gl_FragColor = vec4(finalColor, vAlpha * 0.9);
    }
  `;

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    camera.position.z = 3.5;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "high-performance" });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OPTIMIZATION: Reduced segments from 128 to 80 (approx 16k -> 6k vertices)
    const geometry = new THREE.SphereGeometry(1.0, 80, 80); 
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(imageUrl || 'https://picsum.photos/800/800'); 
    texture.flipY = true;
    texture.minFilter = THREE.LinearFilter;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTexture: { value: texture },
        uHandPos: { value: new THREE.Vector3(0, 0, 0) },
        uShapeIndex: { value: 0 },
        uDispersion: { value: 0 },
        uPinchStrength: { value: 0 }
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    materialRef.current = material;
    particlesRef.current = new THREE.Points(geometry, material);
    scene.add(particlesRef.current);

    const animate = (time: number) => {
      frameIdRef.current = requestAnimationFrame(animate);

      if (materialRef.current && particlesRef.current && cameraRef.current) {
        const props = latestProps.current;
        const handPos = handPositionRef.current; // Read REF directly
        const currentPinch = pinchStrengthRef.current; // Read REF directly

        // Target Dispersion logic
        let targetDispersion = props.handStateFlags.isOpen ? 1.0 : 0.0;
        currentDispersionRef.current += (targetDispersion - currentDispersionRef.current) * 0.08;

        // Map Hand to World Coordinates
        const vec = new THREE.Vector3(handPos.x, handPos.y, 0.5);
        vec.unproject(cameraRef.current);
        const dir = vec.sub(cameraRef.current.position).normalize();
        const distance = -cameraRef.current.position.z / dir.z; 
        const pos = cameraRef.current.position.clone().add(dir.multiplyScalar(distance));
        
        materialRef.current.uniforms.uTime.value = time * 0.001;
        materialRef.current.uniforms.uShapeIndex.value += (props.shapeIndex - materialRef.current.uniforms.uShapeIndex.value) * 0.1; 
        materialRef.current.uniforms.uDispersion.value = currentDispersionRef.current;
        materialRef.current.uniforms.uHandPos.value.copy(pos);
        // Use the Ref value directly for smooth updates without react renders
        materialRef.current.uniforms.uPinchStrength.value = currentPinch; 
      }
      
      if(particlesRef.current) particlesRef.current.rotation.y += 0.001;
      renderer.render(scene, camera);
    };

    animate(0);

    const handleResize = () => {
      if (containerRef.current && rendererRef.current && cameraRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameIdRef.current);
      if (containerRef.current && rendererRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    };
  }, [imageUrl]); 

  return <div ref={containerRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
};

export default React.memo(ParticleOrb);