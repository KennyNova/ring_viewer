"use client";

import { useEffect, useRef, Suspense } from "react";
import { useFrame, invalidate } from '@react-three/fiber'
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  useGLTF,
  Stats,
  useProgress,
} from "@react-three/drei";
import { useControls } from "leva";
import React, { createContext, useContext, useState } from 'react';
import { Leva } from "leva";

declare global {
  interface Window {
    __LEVA__: {
      setSettings: (settings: { hidden?: boolean, collapsed?: boolean } | ((prev: unknown) => unknown)) => void;
    };
  }
}

// Create a context to provide the performance factor.
const PerformanceContext = createContext({ factor: 1 });

export function usePerformance() {
  return useContext(PerformanceContext);
}

export type PerformanceMonitorApi = {
  fps: number;
  factor: number;
  refreshrate: number;
  frames: number[];
  averages: number[];
};

export type PerformanceMonitorProps = {
  ms?: number; // how often (ms) to sample, default 250
  iterations?: number; // how many samples to average, default 10
  threshold?: number; // not used in this example, default 0.75
  bounds: (refreshrate: number) => [lower: number, upper: number];
  flipflops?: number;
  factor?: number;
  step?: number;
  onIncline?: (api: PerformanceMonitorApi) => void;
  onDecline?: (api: PerformanceMonitorApi) => void;
  onChange?: (api: PerformanceMonitorApi) => void;
  onFallback?: (api: PerformanceMonitorApi) => void;
  staticFactor?: number; // Static performance factor to disable dynamic adjustments.
  children?: React.ReactNode;
};

export function PerformanceMonitor({
  ms = 250,
  iterations = 10,
  bounds,
  flipflops = Infinity,
  factor: initialFactor = 1,
  step = 0.1,
  onIncline,
  onDecline,
  onChange,
  onFallback,
  staticFactor,
  children,
}: PerformanceMonitorProps) {
  const [factor, setFactor] = useState(staticFactor !== undefined ? staticFactor : initialFactor);
  const frames = useRef<number[]>([]);
  const averages = useRef<number[]>([]);
  const flipCount = useRef(0);
  // Use high-resolution time
  const startTime = useRef(performance.now());
  // New ref to hold the current sample interval
  const sampleIntervalRef = useRef(ms);
  // New ref to track the last time we adjusted the quality factor
  const lastUpdateTime = useRef(performance.now());
  // Define a cooldown period (in ms) between adjustments
  const cooldown = 500;

  useFrame((state, delta) => {
    // Skip dynamic adjustments if a static factor is provided.
    if (staticFactor !== undefined) return;

    frames.current.push(1 / delta);
    const now = performance.now();

    // Use the dynamic sample interval instead of a constant ms
    if (now - startTime.current >= sampleIntervalRef.current) {
      const avg = frames.current.reduce((a, b) => a + b, 0) / frames.current.length;
      averages.current.push(avg);
      frames.current = [];
      startTime.current = now;
      if (averages.current.length >= iterations) {
        const finalAvg = averages.current.reduce((a, b) => a + b, 0) / averages.current.length;
        const [lower, upper] = bounds(finalAvg);
        
        // Adjust sampling interval dynamically
        if (finalAvg > upper) {
          sampleIntervalRef.current = Math.min(sampleIntervalRef.current * 1.5, ms * 4);
        } else if (finalAvg < lower) {
          sampleIntervalRef.current = Math.max(sampleIntervalRef.current / 1.5, ms / 2);
        }
        
        if (now - lastUpdateTime.current >= cooldown) {
          if (finalAvg < lower) {
            const adjustmentFactor = step * ((lower - finalAvg) / lower);
            const newFactor = Math.max(0, factor - adjustmentFactor);
            setFactor(newFactor);
            flipCount.current++;
            if (onDecline) {
              onDecline({
                fps: finalAvg,
                factor: newFactor,
                refreshrate: finalAvg,
                frames: frames.current,
                averages: averages.current,
              });
            }
          } else if (finalAvg > upper) {
            const adjustmentFactor = step * ((finalAvg - upper) / upper);
            const newFactor = Math.min(1, factor + adjustmentFactor);
            setFactor(newFactor);
            flipCount.current++;
            if (onIncline) {
              onIncline({
                fps: finalAvg,
                factor: newFactor,
                refreshrate: finalAvg,
                frames: frames.current,
                averages: averages.current,
              });
            }
          }
          lastUpdateTime.current = now;
        }
        if (onChange) {
          onChange({
            fps: finalAvg,
            factor: factor,
            refreshrate: finalAvg,
            frames: frames.current,
            averages: averages.current,
          });
        }
        averages.current = [];
        if (flipCount.current >= flipflops) {
          if (onFallback) {
            onFallback({
              fps: finalAvg,
              factor: factor,
              refreshrate: finalAvg,
              frames: frames.current,
              averages: averages.current,
            });
          }
        }
      }
    }
  });

  return (
    <PerformanceContext.Provider value={{ factor }}>
      {children}
    </PerformanceContext.Provider>
  );
}

function CombinedLoader({ preTestProgress }: { preTestProgress: number }) {
  const { progress: modelProgress } = useProgress();
  // Combine both progress values. Adjust these weights as desired.
  const combined = 0.4 * preTestProgress + 0.6 * modelProgress;
  if (combined >= 100) return null;
  return (
    <div style={{
      position: "absolute",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#111",
      zIndex: 9999,
      opacity: 0.95,
      fontFamily: "monospace"
    }}>
      <div style={{
        marginBottom: "1rem",
        color: "#0ff",
        fontSize: "1.5rem"
      }}>
        Loading {combined.toFixed(0)}%
      </div>
      <div style={{
        width: "80%",
        height: "8px",
        background: "#333",
        borderRadius: "4px",
        overflow: "hidden"
      }}>
        <div style={{
          height: "100%",
          width: `${combined}%`,
          background: "#0ff",
          transition: "width 0.3s ease"
        }} />
      </div>
    </div>
  );
}

// Add this helper hook to check if environment is loaded
function useEnvironment() {
  const { scene } = useThree();
  const [ready, setReady] = useState(false);
  
  useEffect(() => {
    // Check if environment exists initially
    if (scene.environment && scene.environment.isTexture) {
      setReady(true);
      // Ensure an initial frame renders on demand frameloop
      invalidate();
    }
    
    // Set up an observer to detect when the environment is set
    const checkInterval = setInterval(() => {
      if (scene.environment && scene.environment.isTexture) {
        setReady(true);
        clearInterval(checkInterval);
        // Render once when it becomes ready
        invalidate();
      }
    }, 100);
    
    return () => clearInterval(checkInterval);
  }, [scene]);
  
  return ready;
}

function Diamond(props: {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  isOval?: boolean;
  batterySaver?: boolean;
  qualityTier?: 'ultra' | 'high' | 'medium' | 'low';
}) {
  const { scene } = useThree();
  const { isOval = false, batterySaver = false, qualityTier } = props; 
  const { factor: perfFactor } = usePerformance();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const isIOS = typeof navigator !== "undefined" && 
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || 
     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const environmentReady = useEnvironment();
  const isLowTier = batterySaver || qualityTier === 'low' || perfFactor < 0.45 || (isMobile && perfFactor < 0.6);
  
  // Ensure a frame when geometry arrives under demand frameloop
  useEffect(() => {
    if (props.geometry) invalidate();
  }, [props.geometry]);
  
  // Enhanced configuration for mobile/iOS optimization + quality tiering
  const tier = qualityTier || (perfFactor > 0.8 ? 'high' : perfFactor > 0.55 ? 'medium' : 'low');
  const config = {
    bounces: isOval ? 1 : (
      tier === 'ultra' ? 4 : tier === 'high' ? 3 : tier === 'medium' ? 2 : 1
    ),
    aberrationStrength: isOval ? 0.0 : (
      tier === 'ultra' ? 0.012 : tier === 'high' ? 0.008 : tier === 'medium' ? 0.004 : 0.002
    ),
    ior: 2.75,
    fresnel: 1,
    color: "white",
    transmission: 0,
    thickness: isOval ? 0.3 : 0.5,
    roughness: 0,
    clearcoat: isOval ? 0 : (tier === 'low' ? 0.03 : 0.08),
    clearcoatRoughness: isOval ? 0 : (tier === 'low' ? 0.08 : 0.06),
    attenuationDistance: 1,
    attenuationColor: "#ffffff",
    fastChroma: (isMobile || isIOS) || tier !== 'ultra',
  };

  // Always use standard material if environment is not ready
  if (!environmentReady || isLowTier) {
    return (
      <mesh
        castShadow={false}
        geometry={props.geometry}
        position={props.position}
        rotation={props.rotation}
        scale={props.scale}
      >
        {/* Cheaper glassy look for battery saver/low tier */}
        <meshPhysicalMaterial
          color="#ffffff"
          transmission={0.98}
          thickness={0.5}
          ior={2.4}
          roughness={0.02}
          metalness={0}
          reflectivity={0.2}
          clearcoat={0.1}
          clearcoatRoughness={0.1}
        />
      </mesh>
    );
  }
  
  // Adjust blur based on performance
  const baseBlur = tier === 'ultra' ? 0.35 : tier === 'high' ? 0.3 : tier === 'medium' ? 0.25 : 0.2;
  const adjustedBlur = baseBlur + (1 - perfFactor) * 0.2;
  const blurToUse = perfFactor < 0.7 ? adjustedBlur + 0.2 : adjustedBlur;
  
  return (
    <mesh
      castShadow
      geometry={props.geometry}
      position={props.position}
      rotation={props.rotation}
      scale={props.scale}
    >
      <MeshRefractionMaterial
        envMap={scene.environment as THREE.CubeTexture}
        {...config} 
        toneMapped={false}
        // @ts-expect-error: blur prop is not defined in the MeshRefractionMaterial type
        blur={blurToUse}
        flatShading={perfFactor < 0.7}
      />
    </mesh>
  );
}

// AnimatedStandardMaterial component to gradually animate the color change
// (Replaced by AnimatedPhysicalMaterial)

// AnimatedPhysicalMaterial improves metal realism using MeshPhysicalMaterial
function AnimatedPhysicalMaterial({ 
  targetColor,
  metalness,
  roughness,
  envMapIntensity = 1.3,
  clearcoat = 0.45,
  clearcoatRoughness = 0.07,
  ior = 2.1,
  reflectivity = 0.6,
  ...props
}: {
  targetColor: string;
  metalness: number;
  roughness: number;
  envMapIntensity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  ior?: number;
  reflectivity?: number;
  [key: string]: unknown;
}) {
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null!);
  const targetColorRef = useRef(new THREE.Color(targetColor));

  useEffect(() => {
    targetColorRef.current.set(targetColor);
  }, [targetColor]);

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.color.set(targetColor);
    }
  }, [targetColor]);

  const speed = 3;
  useFrame((state, delta) => {
    if (materialRef.current) {
      const current = materialRef.current.color;
      const target = targetColorRef.current;
      const dist = Math.abs(current.r - target.r) + Math.abs(current.g - target.g) + Math.abs(current.b - target.b);
      if (dist > 1e-3) {
        current.lerp(target, delta * speed);
        invalidate();
      }
    }
  });

  return (
    <meshPhysicalMaterial
      ref={materialRef}
      metalness={metalness}
      roughness={roughness}
      envMapIntensity={envMapIntensity}
      clearcoat={clearcoat}
      clearcoatRoughness={clearcoatRoughness}
      ior={ior}
      reflectivity={reflectivity}
      toneMapped
      {...props}
    />
  );
}

function RingModel({ 
  modelPath, 
  selectedBandColor, 
  selectedAccentBandColor,
  onAccentBandDetected,
  batterySaver,
  qualityTier
}: { 
  modelPath: string, 
  selectedBandColor: string,
  selectedAccentBandColor: string,
  onAccentBandDetected?: (hasAccentBand: boolean) => void,
  batterySaver?: boolean,
  qualityTier?: 'ultra' | 'high' | 'medium' | 'low'
}) {
  const gltf = useGLTF(modelPath) as unknown as { nodes: { [key: string]: THREE.Mesh | THREE.Object3D } };
  const { nodes } = gltf;
  const ringRef = useRef<THREE.Group>(null!);
  
  // State to track accent band detection
  const [hasAccentBand, setHasAccentBand] = useState(false);
  
  // Notify parent component when accent band detection changes
  useEffect(() => {
    if (onAccentBandDetected) {
      onAccentBandDetected(hasAccentBand);
    }
  }, [hasAccentBand, onAccentBandDetected]);

  // Log the nodes to the console
  console.log("3D Model Nodes:", nodes);

  // Node visibility controls
  const meshNodes = Object.entries(nodes).filter(
    ([, node]) => node instanceof THREE.Mesh
  );
  
  const visibilityControls = useControls('Node Visibility', 
    Object.fromEntries(
      meshNodes.map(([name]) => [ name, true ])
    )
  );

  const bandMaterials = {
    'Yellow Gold': {
      color: '#D4AF37',
      metalness: 1,
      roughness: 0.13,
      envMapIntensity: 1.4,
      clearcoat: 0.5,
      clearcoatRoughness: 0.06,
      ior: 2.05,
      reflectivity: 0.65
    },
    'Rose Gold': {
      color: '#B76E79',
      metalness: 1,
      roughness: 0.14,
      envMapIntensity: 1.35,
      clearcoat: 0.48,
      clearcoatRoughness: 0.07,
      ior: 2.05,
      reflectivity: 0.62
    },
    'White Gold': {
      color: '#E0E3E7',
      metalness: 1,
      roughness: 0.08,
      envMapIntensity: 1.25,
      clearcoat: 0.42,
      clearcoatRoughness: 0.06,
      ior: 2.0,
      reflectivity: 0.58
    },
    'Platinum': {
      color: '#E5E4E2',
      metalness: 1,
      roughness: 0.06,
      envMapIntensity: 1.2,
      clearcoat: 0.4,
      clearcoatRoughness: 0.055,
      ior: 2.1,
      reflectivity: 0.6
    }
  } as const;

  const selectedMaterial = bandMaterials[selectedBandColor as keyof typeof bandMaterials];
  const selectedAccentMaterial = bandMaterials[selectedAccentBandColor as keyof typeof bandMaterials];
  const { factor: perfFactor } = usePerformance();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (!nodes) return null;
  
  // Categorize nodes into diamond, primary band, and accent band nodes
  const diamondNodes: THREE.Mesh[] = [];
  const primaryBandNodes: THREE.Mesh[] = [];
  const accentBandNodes: THREE.Mesh[] = [];
  
  // Keep track of which material names we've seen
  const materialNames: Set<string> = new Set();
  
  for (const [nodeName, node] of Object.entries(nodes)) {
    if (node instanceof THREE.Mesh) {
      const material = node.material instanceof THREE.Material ? node.material : undefined;
      
      // Check if it's a diamond
      if (material?.userData?.gltfExtensions?.WEBGI_materials_diamond) {
        diamondNodes.push(node);
      } else {
        // Categorize metal nodes
        // First, collect material name if it exists
        const materialName = material?.name || "";
        materialNames.add(materialName);
        
        // For materials with "Metal" in the name or node name with "MATERIAL=" 
        if (
          materialName.includes("Metal") || 
          nodeName.includes("MATERIAL=") || 
          (material?.type === "MeshPhysicalMaterial" || material?.type === "MeshStandardMaterial")
        ) {
          // If it's the first metal material or it contains "1" or "primary", it's the primary band
          if (
            primaryBandNodes.length === 0 || 
            materialName.includes("1") || 
            materialName.toLowerCase().includes("primary") || 
            nodeName.includes("_1") || 
            nodeName.includes("primary")
          ) {
            primaryBandNodes.push(node);
          } else {
            // Otherwise, it's an accent band
            accentBandNodes.push(node);
          }
        } else {
          // Default case: if we can't determine, assume it's part of the primary band
          primaryBandNodes.push(node);
        }
      }
    }
  }
  
  // If we didn't categorize any accent bands, but we have multiple bands,
  // let's split them based on material name or node name
  if (accentBandNodes.length === 0 && primaryBandNodes.length > 1) {
    // Try to identify a unique property to split them by
    const nodesToMove = [];
    const primaryMaterialName = primaryBandNodes[0].material instanceof THREE.Material 
      ? primaryBandNodes[0].material.name : "";
    
    for (let i = 1; i < primaryBandNodes.length; i++) {
      const node = primaryBandNodes[i];
      const nodeMaterialName = node.material instanceof THREE.Material 
        ? node.material.name : "";
      
      // If this material has a different name, consider it an accent band
      if (nodeMaterialName !== primaryMaterialName && nodeMaterialName !== "") {
        nodesToMove.push(node);
      }
    }
    
    // Move identified nodes to accent band array
    nodesToMove.forEach(node => {
      primaryBandNodes.splice(primaryBandNodes.indexOf(node), 1);
      accentBandNodes.push(node);
    });
  }

  console.log("Diamond Nodes:", diamondNodes.length);
  console.log("Primary Band Nodes:", primaryBandNodes.length);
  console.log("Accent Band Nodes:", accentBandNodes.length);

  // Update accent band detection state when nodes change
  if (hasAccentBand !== (accentBandNodes.length > 0)) {
    setHasAccentBand(accentBandNodes.length > 0);
  }



  return (
    <group ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Primary band nodes */
      }
      {primaryBandNodes.map((node, index) => (
        visibilityControls[node.name] && (
          <mesh 
            key={`primary-${index}`}
            geometry={node.geometry}
            position={node.position.toArray()}
            rotation={[node.rotation.x, node.rotation.y, node.rotation.z]}
            scale={node.scale.toArray()}
          >
            <AnimatedPhysicalMaterial 
              targetColor={selectedMaterial.color}
              metalness={selectedMaterial.metalness}
              roughness={selectedMaterial.roughness}
              envMapIntensity={selectedMaterial.envMapIntensity * (perfFactor < 0.6 ? (isMobile ? 0.85 : 0.9) : 1)}
              clearcoat={selectedMaterial.clearcoat}
              clearcoatRoughness={selectedMaterial.clearcoatRoughness}
              ior={selectedMaterial.ior}
              reflectivity={selectedMaterial.reflectivity}
            />
          </mesh>
        )
      ))}
      
      {/* Accent band nodes */}
      {accentBandNodes.map((node, index) => (
        visibilityControls[node.name] && (
          <mesh 
            key={`accent-${index}`}
            geometry={node.geometry}
            position={node.position.toArray()}
            rotation={[node.rotation.x, node.rotation.y, node.rotation.z]}
            scale={node.scale.toArray()}
          >
            <AnimatedPhysicalMaterial 
              targetColor={selectedAccentMaterial.color}
              metalness={selectedAccentMaterial.metalness}
              roughness={selectedAccentMaterial.roughness}
              envMapIntensity={selectedAccentMaterial.envMapIntensity * (perfFactor < 0.6 ? (isMobile ? 0.85 : 0.9) : 1)}
              clearcoat={selectedAccentMaterial.clearcoat}
              clearcoatRoughness={selectedAccentMaterial.clearcoatRoughness}
              ior={selectedAccentMaterial.ior}
              reflectivity={selectedAccentMaterial.reflectivity}
            />
          </mesh>
        )
      ))}
      
      {/* Diamond nodes */}
      {diamondNodes.map((gem, index) => (
        visibilityControls[gem.name] && (
          <Diamond
            key={`diamond-${index}`}
            geometry={gem.geometry}
            position={gem.position.toArray()}
            rotation={[gem.rotation.x, gem.rotation.y, gem.rotation.z]}
            scale={gem.scale.toArray()}
            batterySaver={batterySaver}
            qualityTier={qualityTier}
          />
        )
      ))}
    </group>
  );
}

function CameraPanner({ preTestProgress, onComplete }: { preTestProgress: number, onComplete: () => void }) {
  const { camera } = useThree();
  const [startTime, setStartTime] = useState<number | null>(null);
  const [panningComplete, setPanningComplete] = useState(false);
  const duration = 2; // pan duration in seconds
  const spinSpeed = 0.1;  // slow spin: 0.1 radians per second
  
  // Create refs for the start and end camera positions
  const startVec = useRef(new THREE.Vector3(22, 40, 23));
  const endVec = useRef(new THREE.Vector3(22, 31, 23));
  
  // Track if we're in the final smoothing phase
  const isInFinalPhase = useRef(false);

  useEffect(() => {
    if (preTestProgress >= 100 && startTime === null && !panningComplete) {
      setStartTime(performance.now());
    }
  }, [preTestProgress, startTime, panningComplete]);

  useFrame((state, delta) => {
    if (!panningComplete && startTime !== null) {
      const elapsed = (performance.now() - startTime) / 1000; // seconds elapsed
      const t = Math.min(elapsed / duration, 1);
      
      // If we've reached the time threshold but haven't set final phase yet
      if (t >= 1 && !isInFinalPhase.current) {
        isInFinalPhase.current = true;
      }
      
      if (!isInFinalPhase.current) {
        // Standard panning phase with spin
        const basePos = new THREE.Vector3().lerpVectors(startVec.current, endVec.current, t);
        // Blend out the spin effect as t approaches 1
        const effectiveSpinAngle = elapsed * spinSpeed * (1 - t);
        const targetPos = basePos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), effectiveSpinAngle);
        camera.position.lerp(targetPos, delta * 5);
        camera.lookAt(0, 0, 0);
      } else {
        // Final smoothing phase - ensure we reach the exact end position
        camera.position.lerp(endVec.current, delta * 3); // Slightly slower for smoother finish
        camera.lookAt(0, 0, 0);
        
        // Only complete when we're very close to the final position
        if (camera.position.distanceTo(endVec.current) < 0.005) {
          // Don't snap to exact position - let it finish the very small remaining lerp naturally
          setPanningComplete(true);
          onComplete();
        }
      }
      // request a frame while panning
      invalidate();
    }
  });
  return null;
}

// Helper function to darken the color
function darkenColor(color: string): string {
  const amount = 20; // Adjust this value to control how much darker the color should be
  let usePound = false;

  if (color[0] === "#") {
    color = color.slice(1);
    usePound = true;
  }

  const num = parseInt(color, 16);
  let r = (num >> 16) - amount;
  let b = ((num >> 8) & 0x00FF) - amount;
  let g = (num & 0x0000FF) - amount;

  r = r < 0 ? 0 : r;
  b = b < 0 ? 0 : b;
  g = g < 0 ? 0 : g;

  return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16);
}

interface RingViewerProps {
  selectedModel: string;
  category: string;
}

// Import the needed component from @react-three/drei
import { MeshRefractionMaterial } from "@react-three/drei";

export default function RingViewer({ selectedModel, category }: RingViewerProps) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const isSafari =
    typeof navigator !== "undefined" &&
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  
  // iOS detection for context loss prevention
  const isIOS = typeof navigator !== "undefined" && 
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || 
     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  
  // Add the usePerformance hook to get the factor value
  const { factor } = usePerformance();
  
  const [showLeva, setShowLeva] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [preTestProgress, setPreTestProgress] = useState<number>(0);
  const [initialFps, setInitialFps] = useState<number | null>(null);
  const [cameraPannerComplete, setCameraPannerComplete] = useState(false);
  const [selectedBandColor, setSelectedBandColor] = useState("Yellow Gold");
  const [selectedAccentBandColor, setSelectedAccentBandColor] = useState("White Gold");
  const [showBandSelector, setShowBandSelector] = useState(true);
  const [hasAccentBand, setHasAccentBand] = useState(false);
  const [activeBandSelection, setActiveBandSelection] = useState<'primary' | 'accent'>('primary');
  const [batterySaver, setBatterySaver] = useState(false);

  // Pre-test to measure device performance
  useEffect(() => {
    const startTime = performance.now();
    let frameCount = 0;
    let animationFrameId: number;
    
    function measure() {
      frameCount++;
      const now = performance.now();
      const progress = Math.min(((now - startTime) / 2000) * 100, 100);
      setPreTestProgress(progress);
      
      if (now - startTime < 2000) {
        animationFrameId = requestAnimationFrame(measure);
      } else {
        const measuredFps = frameCount / ((now - startTime) / 1000);
        setInitialFps(measuredFps);
      }
    }
    
    animationFrameId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Toggle Leva and Stats on spacebar press
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setShowLeva(prev => !prev);
        setShowStats(prev => !prev);
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Compute quality settings based on measured performance
  const lockedLowFps = initialFps !== null ? initialFps < 30 : false;
  
  // Enhanced mobile/iOS DPR optimization for GPU load reduction
  const computedDpr = (() => {
    if (isIOS || isMobile) {
      // Lower DPR for iOS and mobile to prevent context loss
      return lockedLowFps ? 0.6 : (factor < 0.5 ? 0.8 : 1);
    }
    // Desktop behavior remains the same
    return lockedLowFps ? 0.8 : (factor < 0.5 ? 1 : ([1, 2] as [number, number]));
  })();
  
  const effectiveEnvironmentIntensity = lockedLowFps ? 1.5 : 2.2;
  const qualityTier = (() => {
    if (batterySaver) return 'low' as const;
    if (initialFps !== null) {
      if (initialFps >= 90) return 'ultra' as const;
      if (initialFps >= 60) return 'high' as const;
      if (initialFps >= 45) return 'medium' as const;
      return 'low' as const;
    }
    // Fallback to factor while measuring
    if (factor > 0.8) return 'high' as const;
    if (factor > 0.5) return 'medium' as const;
    return 'low' as const;
  })();

  // Handle accent band detection
  const handleAccentBandDetected = (detected: boolean) => {
    setHasAccentBand(detected);
    if (!detected) {
      setActiveBandSelection('primary');
    }
  };

  // Band color options
  const bandOptions = [
    { name: "Yellow Gold", color: "#ffdc73" },
    { name: "Rose Gold", color: "#B76E79" },
    { name: "White Gold", color: "#E8E8E8" },
    { name: "Platinum", color: "#E5E4E2" }
  ];

  // Handle color selection based on active band
  const handleColorSelection = (colorName: string) => {
    if (activeBandSelection === 'primary') {
      setSelectedBandColor(colorName);
    } else {
      setSelectedAccentBandColor(colorName);
    }
  };

  // Current selected color based on active band
  const currentSelectedColor = activeBandSelection === 'primary' 
    ? selectedBandColor 
    : selectedAccentBandColor;

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      
      {/* Unified Band color selector */}
      <div
        style={{
          position: "absolute",
          ...(isMobile 
            ? {
                top: "10px",
                right: "10px",
                width: "fit-content",
                maxWidth: "250px",
                padding: "10px",
                margin: "20px"
              }
            : {
                bottom: "20px",
                left: "20px",
                width: "260px",
                padding: "18px"
              }
          ),
          background: "rgba(255,255,255,0.9)",
          border: "1px solid rgba(139,115,85,0.15)",
          backdropFilter: "saturate(120%) blur(12px)",
          color: "#000",
          boxSizing: "border-box",
          zIndex: 10,
          borderRadius: "14px",
          boxShadow: "0 8px 24px rgba(139,115,85,0.12)",
          transition: "transform 0.3s ease, box-shadow 0.3s ease"
        }}
      >
        {/* For non-mobile devices */}
        {!isMobile && (
          <div 
            style={{ 
              display: "flex", 
              flexDirection: "column", 
              marginBottom: "10px" 
            }}
          >
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center", 
              width: "100%",
              gap: "8px"
            }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.05em",
                  fontWeight: 600,
                  color: "#4a3f35",
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap"
                }}
              >
                Band Color
              </h2>
              <button
                onClick={() => setShowBandSelector(!showBandSelector)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(139,115,85,0.35)",
                  color: "#4a3f35",
                  borderRadius: "8px",
                  width: "32px",
                  height: "32px",
                  cursor: "pointer",
                  transition: "background 0.2s ease"
                }}
              >
                {showBandSelector ? "▼" : "▲"}
              </button>
            </div>
            
            {/* Band toggle selector in a separate row for non-mobile */}
            {hasAccentBand && (
              <div 
                style={{ 
                  display: "flex", 
                  marginTop: "8px",
                  width: "100%"
                }}
              >
                <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                  <button
                    onClick={() => setActiveBandSelection('primary')}
                    style={{
                      background: activeBandSelection === 'primary' ? "#ffffff" : "transparent",
                      color: "#4a3f35",
                      border: activeBandSelection === 'primary' ? "1px solid rgba(139,115,85,0.35)" : "1px solid transparent",
                      borderRadius: "999px",
                      padding: "6px 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    Primary
                  </button>
                  <button
                    onClick={() => setActiveBandSelection('accent')}
                    style={{
                      background: activeBandSelection === 'accent' ? "#ffffff" : "transparent",
                      color: "#4a3f35",
                      border: activeBandSelection === 'accent' ? "1px solid rgba(139,115,85,0.35)" : "1px solid transparent",
                      borderRadius: "999px",
                      padding: "6px 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    Accent
                  </button>
                  {/* Battery saver (non-mobile hint only) */}
                  {!isMobile && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px', fontSize: '12px', color: '#4a3f35' }}>
                      <input type="checkbox" checked={batterySaver} onChange={(e) => setBatterySaver(e.target.checked)} />
                      Battery saver
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* For mobile devices */}
        {isMobile && (
          <div style={{ width: "100%" }}>
            {/* Mobile-only Battery Saver toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: '#4a3f35' }}>Battery saver</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input type="checkbox" checked={batterySaver} onChange={(e) => setBatterySaver(e.target.checked)} />
              </label>
            </div>
            {hasAccentBand && (
              <div 
                style={{ 
                  display: "flex",
                  gap: "6px",
                  marginBottom: "8px",
                  width: "100%"
                }}
              >
                <button
                  onClick={() => setActiveBandSelection('primary')}
                  style={{
                    background: activeBandSelection === 'primary' ? "#ffffff" : "transparent",
                    color: "#4a3f35",
                    border: activeBandSelection === 'primary' ? "1px solid rgba(139,115,85,0.35)" : "1px solid transparent",
                    borderRadius: "14px",
                    padding: "3px 6px",
                    fontSize: "10px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  Primary
                </button>
                <button
                  onClick={() => setActiveBandSelection('accent')}
                  style={{
                    background: activeBandSelection === 'accent' ? "#ffffff" : "transparent",
                    color: "#4a3f35",
                    border: activeBandSelection === 'accent' ? "1px solid rgba(139,115,85,0.35)" : "1px solid transparent",
                    borderRadius: "14px",
                    padding: "3px 6px",
                    fontSize: "10px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  Accent
                </button>
              </div>
            )}
          </div>
        )}

        {/* Band color options */}
        <div
          style={{
            maxHeight: showBandSelector ? (isMobile ? "60px" : "320px") : "0px",
            overflow: "hidden",
            transition: "max-height 0.3s ease",
            marginTop: isMobile ? "0" : "10px",
            display: "flex",
            flexDirection: isMobile ? "row" : "column",
            gap: isMobile ? "6px" : "0",
            alignItems: isMobile ? "center" : "stretch"
          }}
        >
          {bandOptions.map((band) => (
            <button
              key={band.name}
              onClick={() => handleColorSelection(band.name)}
              style={{
                ...(isMobile 
                  ? {
                      width: "30px",
                      height: "30px",
                      padding: 0,
                      margin: 0,
                      borderWidth: "1px"
                    }
                  : {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      padding: "10px 0",
                      margin: "8px 0"
                    }
                ),
                background: currentSelectedColor === band.name ? band.color : "transparent",
                color: currentSelectedColor === band.name ? "#fff" : "#4a3f35",
                border: `2px solid ${currentSelectedColor === band.name ? darkenColor(band.color) : "rgba(139,115,85,0.35)"}`,
                borderRadius: "10px",
                cursor: "pointer",
                transition: "all 0.3s ease"
              }}
            >
              {isMobile ? (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "4px",
                    background: band.color
                  }}
                />
              ) : (
                <>
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      background: band.color,
                      marginRight: "8px",
                      border: "1px solid rgba(255,255,255,0.8)"
                    }}
                  />
                  {band.name}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 3D Canvas */}
      <Canvas 
        dpr={computedDpr}
        frameloop="demand"
        camera={{ position: [22, 40, 23], fov: 50 }}
        gl={{ 
          powerPreference: 'high-performance',
          antialias: isIOS ? false : !lockedLowFps, // Turn off MSAA on iOS
          precision: (isSafari || isMobile) ? "mediump" : "highp",
          alpha: false,
          depth: true,
          stencil: false,
          premultipliedAlpha: false
        }}
        style={{ background: 'white' }}
        onCreated={(state) => {
          const { gl, scene } = state;
          // Force solid white background
          scene.background = new THREE.Color('#ffffff');
          if (isSafari) {
            const glContext = gl.getContext ? gl.getContext() : (gl as unknown as { context: WebGLRenderingContext }).context;
            if (glContext) {
              const originalGetShaderPrecisionFormat = glContext.getShaderPrecisionFormat.bind(glContext);
              glContext.getShaderPrecisionFormat = (shaderType: number, precisionType: number) => {
                const result = originalGetShaderPrecisionFormat(shaderType, precisionType);
                if (result === null) {
                  return { rangeMin: 0, rangeMax: 0, precision: 0 };
                }
                return result;
              };
            }
          }
        }}
      >
        <Suspense fallback={null}>
          <Environment 
            files="/studio.hdr" 
            background={false}
            environmentIntensity={effectiveEnvironmentIntensity}
            blur={0}
          />
          
          <PerformanceMonitor
            bounds={() => [50, 60]}
            ms={500}
            iterations={5}
            step={0.2}
            staticFactor={
              initialFps === null
                ? 1
                : initialFps < 30
                  ? 0.3
                  : initialFps < 50
                    ? 0.6
                    : 1
            }
          >
            <RingModel 
              key={selectedModel} 
              modelPath={`/3d/${category}/${selectedModel}.glb`} 
              selectedBandColor={selectedBandColor}
              selectedAccentBandColor={selectedAccentBandColor}
              onAccentBandDetected={handleAccentBandDetected}
              batterySaver={batterySaver}
              qualityTier={qualityTier}
            />
          </PerformanceMonitor>
        </Suspense>

        <OrbitControls 
          enablePan={false} 
          minDistance={15} 
          maxDistance={50} 
          enabled={cameraPannerComplete}
          enableDamping
          dampingFactor={0.05}
          onChange={() => invalidate()}
        />
        
        {showStats && <Stats className="stats-bottom-right" />}
        
        {!cameraPannerComplete && (
          <CameraPanner 
            preTestProgress={preTestProgress} 
            onComplete={() => setCameraPannerComplete(true)} 
          />
        )}
      </Canvas>

      {/* Bottom info bar */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "10px 0"
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          background: "rgba(255,255,255,0.9)",
          border: "1px solid rgba(139,115,85,0.15)",
          boxShadow: "0 8px 24px rgba(139,115,85,0.12)",
          borderRadius: "12px",
          padding: "8px 14px"
        }}>
          <span style={{ color: "#4a3f35", fontSize: "0.95em" }}>
            This is a render — the final ring may appear differently.
          </span>
        </div>
      </div>

      <Leva hidden={!showLeva} />

      {/* Loading overlay */}
      <CombinedLoader preTestProgress={preTestProgress} />

      {/* Stats positioning styles */}
      <style jsx global>{`
        .stats-bottom-right {
          position: fixed !important;
          bottom: 0 !important;
          right: 0 !important;
          left: auto !important;
          top: auto !important;
        }
      `}</style>
    </div>
  );
}