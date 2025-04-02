"use client";

import { useEffect, useRef, Suspense, useCallback, useMemo } from "react";
import { useFrame } from '@react-three/fiber'
import * as THREE from "three";
import { Canvas, useThree, useLoader } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  useGLTF,
  Stats,
  useProgress,
  Html,
} from "@react-three/drei";
import { useControls } from "leva";
import React, { createContext, useContext, useState, useReducer, Component, ErrorInfo } from 'react';
import { Leva } from "leva";
import { CubeTextureLoader } from "three";
import Image from 'next/image';
import { CombinedLoader } from './DiamondLoader';
import dynamic from 'next/dynamic';
import { MeshRefractionMaterial } from "@react-three/drei";
import JSZip from 'jszip';

// Import the PhotosphereViewer type
import type { FC } from 'react';

// Define the type for the PhotosphereViewer props
interface PhotosphereViewerProps {
  images: Array<{
    url: string;
    h: number;
    v: number;
  }>;
  onClose: () => void;
}
// Dynamic import with proper typing
const PhotosphereViewer = dynamic<PhotosphereViewerProps>(() => import('./PhotosphereViewer'), {
  ssr: false
});

// Simple ErrorBoundary component
class ErrorBoundary extends Component<
  { children: React.ReactNode; onError: (error: Error) => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error in component:", error, errorInfo);
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

// Type definition for GLTF result
type GLTFResult = {
  nodes: { [key: string]: THREE.Mesh | THREE.Object3D };
  materials: { [key: string]: THREE.Material };
  animations: THREE.AnimationClip[];
};

// Simple PerformanceProvider component
function PerformanceProvider({ children }: { children: React.ReactNode }) {
  const [factor, setFactor] = useState(1);
  
  return (
    <PerformanceContext.Provider value={{ factor }}>
      {children}
    </PerformanceContext.Provider>
  );
}

declare global {
  interface Window {
    __LEVA__: {
      setSettings: (settings: { hidden?: boolean, collapsed?: boolean } | ((prev: any) => any)) => void;
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

/**
 * Monitors performance and adjusts quality factor based on FPS
 * 
 * This component measures FPS over time and dynamically adjusts a quality factor
 * that child components can use to scale their rendering complexity.
 * 
 * @param props - Performance monitor configuration properties
 */
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
            // Calculate how much below the threshold we are as a percentage of the threshold
            // This creates a proportional adjustment - larger gaps mean larger adjustments
            const percentageBelowThreshold = (lower - finalAvg) / lower;
            
            // Scale the adjustment by the step factor to control how aggressive changes are
            const adjustmentFactor = step * percentageBelowThreshold;
            
            // Ensure we never go below 0 for the performance factor
            const newFactor = Math.max(0, factor - adjustmentFactor);
            
            setFactor(newFactor);
            flipCount.current++;
            
            // Notify about the quality decrease with current state information
            onDecline &&
              onDecline({
                fps: finalAvg,
                factor: newFactor,
                refreshrate: finalAvg,
                frames: frames.current,
                averages: averages.current,
              });
          } else if (finalAvg > upper) {
            // Calculate how much above the threshold we are as a percentage of the threshold
            const percentageAboveThreshold = (finalAvg - upper) / upper;
            
            // Scale the adjustment by the step factor
            const adjustmentFactor = step * percentageAboveThreshold;
            
            // Ensure we never exceed 1 for the performance factor
            const newFactor = Math.min(1, factor + adjustmentFactor);
            
            setFactor(newFactor);
            flipCount.current++;
            
            // Notify about the quality increase
            onIncline &&
              onIncline({
                fps: finalAvg,
                factor: newFactor,
                refreshrate: finalAvg,
                frames: frames.current,
                averages: averages.current,
              });
          }
          lastUpdateTime.current = now;
        }
        onChange &&
          onChange({
            fps: finalAvg,
            factor: factor,
            refreshrate: finalAvg,
            frames: frames.current,
            averages: averages.current,
          });
        averages.current = [];
        if (flipCount.current >= flipflops) {
          onFallback &&
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
  });

  return (
    <PerformanceContext.Provider value={{ factor }}>
      {children}
    </PerformanceContext.Provider>
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
    }
    
    // Set up an observer to detect when the environment is set
    const checkInterval = setInterval(() => {
      if (scene.environment && scene.environment.isTexture) {
        setReady(true);
        clearInterval(checkInterval);
      }
    }, 100);
    
    return () => clearInterval(checkInterval);
  }, [scene]);
  
  return ready;
}

// Create a client-only RingViewer component
const ClientRingViewer = dynamic(() => Promise.resolve(RingViewerComponent), {
  ssr: false
});

// Helper function to detect yellowish colors (likely gold bands)
function isYellowishColor(color: THREE.Color): boolean {
  // Yellow colors typically have higher red and green components, and lower blue
  // This threshold can be adjusted based on the specific colors in your models
  return color.r > 0.6 && color.g > 0.5 && color.b < 0.5;
}

// Update the Diamond component to handle hydration-related issues
/**
 * Props for the Diamond component
 */
interface DiamondProps {
  name?: string;
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  material?: THREE.Material | THREE.Material[];
}

function Diamond(props: DiamondProps) {
  const { scene } = useThree();
  const { factor: perfFactor } = usePerformance();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const environmentReady = useEnvironment();
  const materialRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Create a unique debug ID for this diamond
  const debugId = `gem_${props.name?.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20) || 'unnamed'}`;
  
  // Only use fallback material when necessary
  const useFallbackMaterial = !environmentReady || perfFactor < 0.5 || errorMsg;
  
  // Log detailed information about this diamond instance on mount
  useEffect(() => {
    console.log(`Gemstone instance details:`, {
      name: props.name,
      geometry: props.geometry ? {
        uuid: props.geometry.uuid,
        vertexCount: props.geometry.attributes.position.count,
        indexed: !!props.geometry.index
      } : 'unknown',
      position: props.position,
      // Don't log material details as we're ignoring them
    });
  }, []);
  
  // Register all hooks at the top level (React hooks rule)
  // Add this to expose error to parent component
  useEffect(() => {
    if (errorMsg && typeof window !== 'undefined' && window.parent) {
      try {
        // Create a global variable to store errors
        (window as any).__DIAMOND_ERRORS = (window as any).__DIAMOND_ERRORS || [];
        (window as any).__DIAMOND_ERRORS.push(`Gemstone (${props.name}): ${errorMsg}`);
        
        // Try to dispatch an event that can be listened for
        window.dispatchEvent(new CustomEvent('diamond-error', { 
          detail: { message: errorMsg, name: props.name, time: new Date().toISOString() } 
        }));
      } catch (e) {
        console.error("Failed to communicate error:", e);
      }
    }
  }, [errorMsg, props.name]);
  
  // Unified configuration for all gemstone refraction materials
  // Complete override of any material properties from the original model
  const config = {
    bounces: 3,
    aberrationStrength: 0.01,
    ior: 2.75,
    fresnel: 1,
    color: "white",
    transmission: 0,
    thickness: 0.5,
    roughness: 0,
    clearcoat: 0.1,
    clearcoatRoughness: 0.1,
    attenuationDistance: 1,
    attenuationColor: "#ffffff",
  };
  
  // Adjust blur based on performance
  const baseBlur = isMobile ? 0.8 : 0.4;
  const adjustedBlur = baseBlur + (1 - perfFactor) * 0.2;
  const blurToUse = perfFactor < 0.7 ? adjustedBlur + 0.2 : adjustedBlur;
  
  // Debug logging
  useEffect(() => {
    console.log(`[${debugId}] Rendering with ${useFallbackMaterial ? 'standard' : 'refraction'} material - ignoring original material properties`);
  }, [debugId, useFallbackMaterial]);
  
  // Render with fallback material if needed
  if (useFallbackMaterial) {
    return (
      <mesh
        castShadow={false}
        geometry={props.geometry}
        position={props.position}
        rotation={props.rotation}
        scale={props.scale}
      >
        <meshPhysicalMaterial 
          key={`${debugId}_physical`}
          color="#ffffff"
          roughness={0.1}
          metalness={0.05}
          transparent={true}
          opacity={0.95}
          clearcoat={0.9}
          clearcoatRoughness={0.05}
          reflectivity={1.2}
          envMapIntensity={3.0}
          ior={2.4}
        />
      </mesh>
    );
  }
  
  // Otherwise use refraction material
  return (
    <mesh
      ref={meshRef}
      castShadow
      geometry={props.geometry}
      position={props.position}
      rotation={props.rotation}
      scale={props.scale}
    >
      <SafeMeshRefractionMaterial
        key={`${debugId}_refraction`}
        ref={materialRef}
        envMap={scene.environment as THREE.CubeTexture}
        {...config} 
        toneMapped={false}
        // @ts-ignore: blur prop is not defined in the MeshRefractionMaterial type
        blur={blurToUse}
        flatShading={perfFactor < 0.7}
        onError={(error: any) => {
          console.error(`MeshRefractionMaterial error for ${props.name}:`, error);
          setErrorMsg(error?.message || "Unknown error");
        }}
      />
    </mesh>
  );
}

// Function to analyze a material and determine if it's likely a gemstone
const isGemMaterial = (material: THREE.Material | undefined): boolean => {
  if (!material) return false;
  
  // Check for explicit diamond material extension (most reliable metadata)
  if (material.userData?.gltfExtensions?.WEBGI_materials_diamond) return true;
  
  // Check material name for gem indicators (secondary metadata)
  const materialName = material.name.toLowerCase();
  if (materialName.includes('diamond') || 
      materialName.includes('gem') || 
      materialName.includes('crystal') ||
      materialName.includes('stone')) {
    return true;
  }
  
  // Note: We still check basic properties but don't rely on them as much
  if (material instanceof THREE.MeshStandardMaterial) {
    // Check for extremely clear indicators only
    // Non-metallic and highly transparent is likely a gem
    const isNonMetallic = material.metalness === 0;
    const isHighlyTransparent = material.transparent === true && material.opacity < 0.5;
    
    // Only use material properties if they're very strong indicators
    if (isNonMetallic && isHighlyTransparent) {
      return true;
    }
    
    // Check for yellowish color which typically indicates gold bands
    const isYellowish = material.color && isYellowishColor(material.color);
    if (isYellowish) {
      return false; // Definitely not a gem if yellowish
    }
  }
  
  // For ambiguous cases, we'll rely on the geometric/position detection instead
  return false;
};

// AnimatedStandardMaterial component to gradually animate the color change
/**
 * Interface for AnimatedStandardMaterial props
 */
interface AnimatedStandardMaterialProps {
  targetColor: string;
  metalness: number;
  roughness: number;
  [key: string]: any; // Allow additional props to pass to meshStandardMaterial
}

/**
 * A standard material that smoothly animates to a target color
 * 
 * This component wraps a MeshStandardMaterial and uses useFrame to smoothly
 * transition the material's color to a target color over time.
 * 
 * @param props - Material properties including target color to animate to
 */
function AnimatedStandardMaterial({ targetColor, metalness, roughness, ...props }: AnimatedStandardMaterialProps) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null!);
  // Store the target color in a ref to persist between renders
  const targetColorRef = useRef(new THREE.Color(targetColor));
 
  // Update the target color ref whenever the prop changes
  useEffect(() => {
    targetColorRef.current.set(targetColor);
  }, [targetColor]);
 
  // On the first mount, set the material's color to the target color
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.color.set(targetColor);
    }
  }, []);
 
  const speed = 3; // Adjust this speed factor as needed
  useFrame((state, delta) => {
    if (materialRef.current) {
      // Lerp the current color toward the stored target color
      materialRef.current.color.lerp(targetColorRef.current, delta * speed);
    }
  });

  return (
    <meshStandardMaterial
      ref={materialRef}
      metalness={metalness}
      roughness={roughness}
      {...props}
    />
  );
}

// RingModel component to handle different file formats
function RingModel({ 
  modelPath, 
  selectedBandColor, 
  selectedAccentBandColor,
  onAccentBandDetected 
}: { 
  modelPath: string, 
  selectedBandColor: string,
  selectedAccentBandColor: string,
  onAccentBandDetected?: (hasAccentBand: boolean) => void
}) {
  // Use the standard GLTF loader
  const { nodes: gltfNodes, materials, animations } = useGLTF(modelPath) as GLTFResult;
  
  // Use the nodes from the loader
  const nodes = gltfNodes;
  
  const ringRef = useRef<THREE.Group>(null!);
  
  // Log the nodes to the console
  console.log("3D Model Nodes:", nodes);

  // Node visibility controls
  const meshNodes = Object.entries(nodes || {}).filter(
    ([_, node]) => node instanceof THREE.Mesh
  );
  
  const visibilityControls = useControls('Node Visibility', 
    Object.fromEntries(
      meshNodes.map(([name, _]) => [ name, true ])
    )
  );

  const bandMaterials = {
    'Yellow Gold': { color: '#ffdc73', metalness: 1, roughness: 0.2 },
    'Rose Gold': { color:'#d5927a', metalness: 1, roughness: 0.2 },
    'White Gold': { color: '#E8E8E8', metalness: 1, roughness: 0.15 },
    'Platinum': { color: '#E5E4E2', metalness: 1, roughness: 0.1 }
  };

  const selectedMaterial = bandMaterials[selectedBandColor as keyof typeof bandMaterials];
  const selectedAccentMaterial = bandMaterials[selectedAccentBandColor as keyof typeof bandMaterials];

  if (!nodes) return null;
  
  // Analyze the overall model characteristics to establish baselines
  // This helps with position and size based detection
  const meshData = analyzeModelData(nodes);
  console.log("Model analysis:", meshData);
  
  // Categorize nodes into gems and metal parts based on material properties
  const gemNodes: THREE.Mesh[] = [];
  let primaryBandNodes: THREE.Mesh[] = [];
  const accentBandNodes: THREE.Mesh[] = [];
  
  // Helper function to check if a node is likely a gem based on position
  const isGemByPosition = (node: THREE.Mesh): boolean => {
    // In most rings, gems are positioned at the top
    const isAboveAverageHeight = node.position.y > meshData.averageY + (meshData.maxY - meshData.minY) * 0.1;
    
    // Many rings have gems positioned near center (X/Z) of the ring
    const distanceFromCenter = Math.sqrt(
      Math.pow(node.position.x - meshData.centerX, 2) + 
      Math.pow(node.position.z - meshData.centerZ, 2)
    );
    
    const isNearCenter = distanceFromCenter < meshData.avgDistanceFromCenter * 0.8;
    
    // Combine position criteria - either high up or close to center
    return isAboveAverageHeight || isNearCenter;
  };
  
  // Helper function to check if a node is likely a gem based on size
  const isGemBySize = (node: THREE.Mesh): boolean => {
    // Get bounding box size
    const box = new THREE.Box3().setFromObject(node);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    // Calculate volume
    const volume = size.x * size.y * size.z;
    
    // Gems are typically smaller than bands
    const isSmallerThanAverage = volume < meshData.averageVolume * 0.8;
    
    // But not too small (to filter out tiny accent pieces)
    const isNotTooSmall = volume > meshData.averageVolume * 0.05;
    
    // Gems often have a more balanced aspect ratio compared to bands
    const aspectRatioX = size.x / Math.max(size.y, size.z);
    const aspectRatioY = size.y / Math.max(size.x, size.z);
    const aspectRatioZ = size.z / Math.max(size.x, size.y);
    
    // Values closer to 1 indicate more cubic/spherical shapes
    const isBalancedShape = (
      aspectRatioX > 0.3 && aspectRatioX < 3 &&
      aspectRatioY > 0.3 && aspectRatioY < 3 &&
      aspectRatioZ > 0.3 && aspectRatioZ < 3
    );
    
    return isSmallerThanAverage && isNotTooSmall && isBalancedShape;
  };
  
  // Helper function to check if a node is likely a gem based on geometry patterns
  const isGemByGeometry = (node: THREE.Mesh): boolean => {
    if (!node.geometry?.attributes?.position) return false;
    
    const vertexCount = node.geometry.attributes.position.count;
    
    // Check for facet patterns typical in gems
    // - Gems usually have more vertices than simple bands
    // - But not too many (very high count often indicates band with details)
    const isReasonableVertexCount = vertexCount < 3000;
    
    // Check for triangulation patterns
    const hasIndex = !!node.geometry.index;
    const indexCount = node.geometry.index?.count || 0;
    
    // Gems typically have a higher ratio of indices to vertices due to facets
    const indexToVertexRatio = hasIndex ? indexCount / vertexCount : 0;
    const hasGemLikeIndexRatio = indexToVertexRatio > 2.5;
    
    return isReasonableVertexCount && hasGemLikeIndexRatio;
  };
  
  // Function that combines multiple gem detection criteria 
  const isLikelyGem = (node: THREE.Mesh, nodeName: string): boolean => {
    // Try material-based detection first
    const material = node.material instanceof THREE.Material ? node.material : undefined;
    if (isGemMaterial(material)) {
      console.log(`Node "${nodeName}" detected as gem by material properties`);
      return true;
    }
    
    // Only do further checks for meshes with 2000-3000 vertices
    // (meshes with fewer than 2000 vertices are already classified as gems before this function is called)
    const vertexCount = node.geometry?.attributes?.position?.count || 0;
    if (vertexCount > 3000) {
      return false;
    }
    
    // Combine scores from different detection methods
    const positionScore = isGemByPosition(node) ? 1 : 0;
    const sizeScore = isGemBySize(node) ? 1 : 0;
    const geometryScore = isGemByGeometry(node) ? 1 : 0;
    
    // Total score threshold (at least 2 out of 3 criteria should match)
    const totalScore = positionScore + sizeScore + geometryScore;
    const isGem = totalScore >= 2;
    
    if (isGem) {
      console.log(`Node "${nodeName}" detected as gem by position/size/geometry: Score ${totalScore}/3`);
      console.log(`  - By position: ${positionScore}, By size: ${sizeScore}, By geometry: ${geometryScore}`);
    }
    
    return isGem;
  };
  
  // First pass: categorize nodes based on material properties and enhanced detection
  for (const [nodeName, node] of Object.entries(nodes)) {
    if (node instanceof THREE.Mesh) {
      const material = node.material instanceof THREE.Material ? node.material : undefined;
      const vertexCount = node.geometry?.attributes?.position?.count || 0;
      
      // Log vertex count to help with diagnostics
      console.log(`Node "${nodeName}" has ${vertexCount} vertices`);
      
      // Check material metadata first - highest priority indicator
      if (isGemMaterial(material)) {
        console.log(`Node "${nodeName}" classified as gem: Material metadata indicates gemstone`);
        gemNodes.push(node);
        continue;
      }
      
      // Calculate a comprehensive gem score that considers multiple factors
      const gemScore = calculateGemScore(node, nodeName, meshData);
      console.log(`Node "${nodeName}" gem score: ${gemScore.toFixed(1)}/100`);
      
      // High gem score (>75) means it's very likely a gem regardless of vertex count
      if (gemScore > 75) {
        console.log(`Node "${nodeName}" classified as gem: Very high gem score ${gemScore.toFixed(1)}/100`);
        gemNodes.push(node);
        continue;
      }
      
      // Low gem score (<40) means it's very likely a band regardless of vertex count
      if (gemScore < 40) {
        console.log(`Node "${nodeName}" classified as band: Low gem score ${gemScore.toFixed(1)}/100`);
        
        // Determine if it's primary or accent band
        classifyBandNode(node, material, primaryBandNodes, accentBandNodes, nodeName);
        continue;
      }
      
      // For scores in the middle (40-75), use additional criteria
      // Check for traditional band shape/characteristics even if gem score is moderate
      const isThinRing = isThinRingShape(node, meshData);
      if (isThinRing) {
        console.log(`Node "${nodeName}" classified as band: Has ring-like shape despite moderate gem score`);
        classifyBandNode(node, material, primaryBandNodes, accentBandNodes, nodeName);
        continue;
      }
      
      // For scores in the middle (40-75), use vertex count as a tiebreaker
      // but with expanded ranges to account for exceptional cases
      if (vertexCount > 6000) {
        // Very high vertex count - likely a band unless the gem score is very high
        console.log(`Node "${nodeName}" classified as band: Very high vertex count (${vertexCount} > 6000) with medium gem score`);
        classifyBandNode(node, material, primaryBandNodes, accentBandNodes, nodeName);
      } else if (vertexCount < 2000) {
        // Low vertex count - likely a gem unless the gem score is quite low
        console.log(`Node "${nodeName}" classified as gem: Low vertex count (${vertexCount} < 2000) with medium gem score`);
        gemNodes.push(node);
      } else {
        // Medium vertex count - use position, size, and material as tiebreakers
        const positionScore = isGemByPosition(node) ? 1 : 0;
        const sizeScore = isGemBySize(node) ? 1 : 0;
        const geometryScore = isGemByGeometry(node) ? 1 : 0;
        
        // Total score threshold (at least 2 out of 3 criteria should match)
        const totalScore = positionScore + sizeScore + geometryScore;
        
        if (totalScore >= 2) {
          console.log(`Node "${nodeName}" classified as gem: Medium vertex count with good position/size/geometry scores (${totalScore}/3)`);
          gemNodes.push(node);
        } else {
          console.log(`Node "${nodeName}" classified as band: Medium vertex count with low position/size/geometry scores (${totalScore}/3)`);
          classifyBandNode(node, material, primaryBandNodes, accentBandNodes, nodeName);
        }
      }
    }
  }
  
  // If we didn't classify any gems, try a fallback approach with geometry complexity
  if (gemNodes.length === 0) {
    console.log("No gems identified in first pass. Using fallback geometry complexity approach:");
    // Remove all nodes from primary/accent bands and re-categorize
    const allNodes = [...primaryBandNodes, ...accentBandNodes];
    primaryBandNodes.length = 0;
    accentBandNodes.length = 0;
    
    // Sort nodes by how likely they are to be gems using multiple criteria
    allNodes.sort((a, b) => {
      const scoreA = getGemLikelihoodScore(a, meshData);
      const scoreB = getGemLikelihoodScore(b, meshData);
      return scoreB - scoreA; // Higher score first
    });
    
    // Take the top 20% as potential gems (or at least one)
    const potentialGemCount = Math.max(1, Math.floor(allNodes.length * 0.2));
    console.log(`Fallback approach: Considering top ${potentialGemCount} nodes (of ${allNodes.length}) as potential gems based on comprehensive scoring`);
    
    for (let i = 0; i < allNodes.length; i++) {
      const node = allNodes[i];
      const nodeName = node.name || `unnamed-${i}`;
      
      if (i < potentialGemCount) {
        const score = getGemLikelihoodScore(node, meshData);
        console.log(`Fallback: Node "${nodeName}" classified as gem: Composite gem score ${score.toFixed(1)}/100`);
        gemNodes.push(node);
      } else {
        console.log(`Fallback: Node "${nodeName}" classified as band: Not in top ${potentialGemCount} by composite score`);
        primaryBandNodes.push(node);
      }
    }
  }
  
  // If we still have multiple nodes in primary band, try to identify accent bands
  if (primaryBandNodes.length > 1 && accentBandNodes.length === 0) {
    console.log("Analyzing multiple primary band nodes to identify potential accent bands:");
    // Group by material
    const materialGroups = groupNodesByMaterial(primaryBandNodes);
    
    console.log(`Found ${Object.keys(materialGroups).length} different material groups in primary band`);
    
    // If we have multiple material groups, the smallest ones are likely accent bands
    if (Object.keys(materialGroups).length > 1) {
      // Sort material groups by size
      const sortedMaterialGroups = Object.entries(materialGroups)
        .sort(([_, nodesA], [__, nodesB]) => nodesB.length - nodesA.length);
      
      // Keep the largest group as primary
      const primaryMaterialKey = sortedMaterialGroups[0][0];
      const primaryNodes = materialGroups[primaryMaterialKey];
      console.log(`Keeping material group with ${primaryNodes.length} nodes as primary band`);
      
      // Move all others to accent
      for (const [materialKey, nodes] of Object.entries(materialGroups)) {
        if (materialKey !== primaryMaterialKey) {
          console.log(`Reclassifying material group with ${nodes.length} nodes as accent band`);
          accentBandNodes.push(...nodes);
          // Remove these nodes from primaryBandNodes
          primaryBandNodes = primaryBandNodes.filter(node => !nodes.includes(node));
        }
      }
    }
  }

  console.log("Final classification:");
  console.log("Gem Nodes:", gemNodes.length);
  console.log("Primary Band Nodes:", primaryBandNodes.length);
  console.log("Accent Band Nodes:", accentBandNodes.length);

  // Notify parent component if we found accent bands
  useEffect(() => {
    if (onAccentBandDetected) {
      onAccentBandDetected(accentBandNodes.length > 0);
    }
  }, [accentBandNodes.length, onAccentBandDetected]);

  return (
    <group ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Primary band nodes */}
      {primaryBandNodes.map((node, index) => (
        visibilityControls[node.name] && (
          <mesh 
            key={`primary-${index}`}
            geometry={node.geometry}
            position={node.position.toArray()}
            rotation={[node.rotation.x, node.rotation.y, node.rotation.z]}
            scale={node.scale.toArray()}
          >
            <AnimatedStandardMaterial 
              targetColor={selectedMaterial.color}
              metalness={selectedMaterial.metalness}
              roughness={selectedMaterial.roughness}
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
            <AnimatedStandardMaterial 
              targetColor={selectedAccentMaterial.color}
              metalness={selectedAccentMaterial.metalness}
              roughness={selectedAccentMaterial.roughness}
            />
          </mesh>
        )
      ))}
      
      {/* Diamond/Gem nodes */}
      {gemNodes.map((gem, index) => {
        // Log individual gem info to help diagnose differences
        console.log(`Gem ${index}: ${gem.name} - vertices: ${gem.geometry.attributes.position.count}`);
        
        // Only render if visibility control allows it
        return visibilityControls[gem.name] && (
          <Diamond
            key={`gem-${index}-${gem.name?.replace(/[^a-zA-Z0-9]/g, '') || 'unnamed'}`}
            geometry={gem.geometry}
            position={gem.position.toArray()}
            rotation={[gem.rotation.x, gem.rotation.y, gem.rotation.z]}
            scale={gem.scale.toArray()}
            name={gem.name}
            material={gem.material}
          />
        );
      })}
    </group>
  );
}

// Helper function to determine if one mesh is significantly larger than another
function isLargerMesh(meshA: THREE.Mesh, meshB: THREE.Mesh): boolean {
  // Get bounding box volumes as a rough estimate of size
  const boxA = new THREE.Box3().setFromObject(meshA);
  const boxB = new THREE.Box3().setFromObject(meshB);
  
  const sizeA = new THREE.Vector3();
  const sizeB = new THREE.Vector3();
  
  boxA.getSize(sizeA);
  boxB.getSize(sizeB);
  
  const volumeA = sizeA.x * sizeA.y * sizeA.z;
  const volumeB = sizeB.x * sizeB.y * sizeB.z;
  
  return volumeA > volumeB * 1.5; // Return true if A is 50% larger than B
}

// Helper function to calculate average vertex count
function getAverageVertexCount(meshes: THREE.Mesh[]): number {
  if (meshes.length === 0) return 0;
  
  const totalVertices = meshes.reduce((sum, mesh) => 
    sum + (mesh.geometry?.attributes?.position?.count || 0), 0);
  
  return totalVertices / meshes.length;
}

// Helper function to group nodes by material
function groupNodesByMaterial(nodes: THREE.Mesh[]): {[key: string]: THREE.Mesh[]} {
  const groups: {[key: string]: THREE.Mesh[]} = {};
  
  for (const node of nodes) {
    const material = node.material;
    // Create a key based on material properties
    const materialKey = material instanceof THREE.Material 
      ? `${material.uuid}`
      : 'unknown';
    
    if (!groups[materialKey]) {
      groups[materialKey] = [];
    }
    
    groups[materialKey].push(node);
  }
  
  return groups;
}

// Helper function to score gem optimality based on vertex count
// Gems typically have moderate vertex counts (not too low, not too high)
function getGemOptimalityScore(vertexCount: number): number {
  // If vertex count is too high (>3000), it's not a gem
  if (vertexCount > 3000) return 0;
  
  // If vertex count is very low (<50), it might be too simple for a gem
  if (vertexCount < 50) return vertexCount / 10;
  
  // All meshes under 2000 vertices are definitely gems, so give high score
  if (vertexCount < 2000) return 100;
  
  // For meshes between 2000-3000, score decreases as vertex count increases
  return 100 - ((vertexCount - 2000) / 10);
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
  models: string[];
  selectedModel: string;
  category: string;
}

// Enhance the SafeMeshRefractionMaterial component
/**
 * A safer version of MeshRefractionMaterial that gracefully handles WebGL errors
 * 
 * This component wraps the standard MeshRefractionMaterial with error handling
 * and fallbacks to ensure the application doesn't crash when shader errors occur.
 * 
 * @param props - The material properties including error handling callbacks
 */
function SafeMeshRefractionMaterial(props: MeshRefractionMaterialProps) {
  const { onError, ...rest } = props;
  const [hasError, setHasError] = useState(false);
  const [gemType, setGemType] = useState<string>("unknown");
  const [materialKey, setMaterialKey] = useState<string>(`refraction_${Math.random().toString(36).substring(2, 9)}`);
  
  // Handler for material errors from MeshRefractionMaterial
  const handleMaterialError = (error: any) => {
    console.error(`[${materialKey}] MeshRefractionMaterial error:`, error);
    
    // Check for null vertex shader in the error message
    if (error && typeof error.message === 'string' && (
      error.message.includes("null is not acceptable") ||
      error.message.includes("null vertex shader") ||
      error.message.includes("shader compilation failed") ||
      error.message.includes("INVALID_OPERATION")
    )) {
      console.error(`[${materialKey}] Detected shader error`);
    }
    
    setHasError(true);
    if (onError) onError(error);
  };
  
  // Extract gemType from rest props if available
  useEffect(() => {
    // Determine material characteristics to identify the gem type
    const isBaguette = 
      // Check for baguette-specific configuration
      rest.bounces === 4 || 
      (typeof rest.thickness === 'number' && rest.thickness === 0.8) ||
      // Check the material key if it includes 'baguette'
      (props.key && typeof props.key === 'string' && props.key.toLowerCase().includes('baguette'));
    
    const newGemType = isBaguette ? "baguette" : "diamond";
    setGemType(newGemType);
    
    // Log the material configuration for debugging
    console.log(`SafeMeshRefractionMaterial for ${newGemType}:`, {
      key: props.key,
      bounces: rest.bounces,
      thickness: rest.thickness,
      ior: rest.ior,
      blur: rest.blur
    });
  }, [rest.bounces, rest.thickness, rest.ior, rest.blur, props.key]);
  
  // Add a specific check for the null vertex shader error
  useEffect(() => {
    const handleGlobalErrors = (event: ErrorEvent) => {
      // Check for the specific error message
      if (event.message && (
        event.message.includes("null is not acceptable for the gl vertex shader") ||
        event.message.includes("null vertex shader") ||
        event.message.includes("null shader") ||
        event.message.includes("WebGL: INVALID_OPERATION")
      )) {
        console.error(`[${materialKey}] Caught WebGL error:`, event.message);
        setHasError(true);
        if (onError) onError({ message: `WebGL error: ${event.message}` });
      }
    };
    
    // Listen for global errors
    window.addEventListener('error', handleGlobalErrors);
    
    return () => {
      window.removeEventListener('error', handleGlobalErrors);
    };
  }, [onError, materialKey]);
  
  // If we've detected an error, use a high-quality fallback material instead
  if (hasError) {
    // Determine if this is a baguette from the gemType
    const isBaguette = gemType === "baguette";
    
    console.log(`[${materialKey}] Using fallback material for ${gemType} due to error`);
    
    // Use our utility function to create the fallback material
    return createFallbackMaterial(isBaguette, "fallback", materialKey);
  }
  
  // Otherwise, try to use the refraction material with error handling
  try {
    // Don't pass onError directly to the MeshRefractionMaterial component
    // TypeScript requires that we specify which props to omit from rest
    const { onError: _, ...meshRefractionProps } = rest;
    
    return (
      <MeshRefractionMaterial
        key={materialKey}
        {...meshRefractionProps as any} // Use type assertion to avoid TypeScript error
      />
    );
  } catch (err) {
    console.error(`[${materialKey}] Error creating MeshRefractionMaterial:`, err);
    setHasError(true);
    if (onError) onError(err instanceof Error ? err : new Error(String(err)));
    
    // Use same utility function for consistency
    const isBaguette = gemType === "baguette";
    return createFallbackMaterial(isBaguette, "fallback_catch", materialKey);
  }
}

// Add handleFileSelect function before the RingViewerComponent
async function handleZipFile(file: File): Promise<{ url: string; h: number; v: number; }[]> {
  const images: { url: string; h: number; v: number; }[] = [];
  
  try {
    const jsZip = new JSZip();
    const zip = await jsZip.loadAsync(file);
    
    // Process all files in the zip
    for (const filename of Object.keys(zip.files)) {
      // Skip directories, readme, and HTML files
      if (zip.files[filename].dir || 
          filename.toLowerCase().endsWith('.md') || 
          filename.toLowerCase().endsWith('.html')) {
        continue;
      }
      
      try {
        // Check if this is a WebP or PNG image
        if (filename.toLowerCase().endsWith('.webp') || filename.toLowerCase().endsWith('.png')) {
          // Parse h and v values from filename (format: filename_h{h}_v{v}.webp or filename_h{h}_v{v}.png)
          const hMatch = filename.match(/_h(\d+)_/);
          const vMatch = filename.match(/_v(\d+)\./);
          
          if (hMatch && vMatch) {
            const h = parseInt(hMatch[1], 10);
            const v = parseInt(vMatch[1], 10);
            
            // Get image data as base64
            const zipEntry = zip.files[filename] as JSZip.JSZipObject;
            const blob = await zipEntry.async('blob');
            const url = URL.createObjectURL(blob);
            
            // Add to our images array
            images.push({ url, h, v });
          }
        }
      } catch (err) {
        console.error(`Error processing file ${filename}:`, err);
        // Continue with next file instead of failing the whole process
      }
    }
    
    // Sort images by h and v for consistent ordering
    images.sort((a, b) => {
      if (a.h !== b.h) return a.h - b.h;
      return a.v - b.v;
    });
    
    return images;
  } catch (error) {
    console.error("Error handling zip file:", error);
    throw error;
  }
}

// Rename the main component to RingViewerComponent
function RingViewerComponent({ models, selectedModel, category }: RingViewerProps) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const { factor } = usePerformance();
  
  // State declarations
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
  const [glErrors, setGlErrors] = useState<string[]>([]);
  const [diamondErrors, setDiamondErrors] = useState<string[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [webGLInfo, setWebGLInfo] = useState<{[key: string]: any}>({});
  const [capturePhotosphere, setCapturePhotosphere] = useState(false);
  const [viewingPhotosphere, setViewingPhotosphere] = useState(false);
  const [photosphereImages, setPhotosphereImages] = useState<{url: string, h: number, v: number}[]>([]);
  
  // Refs
  const orbitControlsRef = useRef<any>(null);

  // Function to determine the model path based on the model name
  const getModelPath = useCallback((model: string) => {
    if (model.toLowerCase().endsWith('.glb') || model.toLowerCase().endsWith('.3dm')) {
      return `/3d/${category}/${model}`;
    }
    
    if (model.toLowerCase() === '3dm') {
      console.log(`Loading 3DM model: /3d/${category}/${model}.3dm`);
      return `/3d/${category}/${model}.3dm`;
    }
    
    const modelPath = `/3d/${category}/${model}`;
    console.log(`Loading model: ${modelPath}.glb`);
    return `${modelPath}.glb`;
  }, [category]);

  // Computed values
  const lockedLowFps = initialFps !== null ? initialFps < 30 : false;
  const computedDpr = lockedLowFps ? 0.8 : (factor < 0.5 ? 1 : ([1, 2] as [number, number]));
  const effectiveEnvironmentIntensity = lockedLowFps ? 1.5 : 2.2;

  // Band color options
  const bandOptions = useMemo(() => [
    { name: "Yellow Gold", color: "#ffdc73" },
    { name: "Rose Gold", color: "#B76E79" },
    { name: "White Gold", color: "#E8E8E8" },
    { name: "Platinum", color: "#E5E4E2" }
  ], []);

  // Current selected color based on active band
  const currentSelectedColor = activeBandSelection === 'primary' 
    ? selectedBandColor 
    : selectedAccentBandColor;

  // Effect for diamond errors
  useEffect(() => {
    const handleDiamondError = (event: any) => {
      const error = event.detail?.message || "Unknown diamond error";
      console.log("Diamond error event received:", error);
      setDiamondErrors(prev => [...prev, error]);
    };

    window.addEventListener('diamond-error', handleDiamondError);
    
    const interval = setInterval(() => {
      if ((window as any).__DIAMOND_ERRORS && (window as any).__DIAMOND_ERRORS.length > 0) {
        const newErrors = (window as any).__DIAMOND_ERRORS;
        console.log("Found global diamond errors:", newErrors);
        setDiamondErrors(prev => [...prev, ...newErrors]);
        (window as any).__DIAMOND_ERRORS = [];
      }
    }, 1000);
    
    return () => {
      window.removeEventListener('diamond-error', handleDiamondError);
      clearInterval(interval);
    };
  }, []);

  // Effect for performance measurement
  useEffect(() => {
    let startTime = performance.now();
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

  // Effect for keyboard shortcuts
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

  // Handlers
  const handleAccentBandDetected = useCallback((detected: boolean) => {
    setHasAccentBand(detected);
    if (!detected) {
      setActiveBandSelection('primary');
    }
  }, []);

  const handleColorSelection = useCallback((colorName: string) => {
    if (activeBandSelection === 'primary') {
      setSelectedBandColor(colorName);
    } else {
      setSelectedAccentBandColor(colorName);
    }
  }, [activeBandSelection]);

  const handleGlError = useCallback((error: string) => {
    console.error("WebGL Error:", error);
    setGlErrors(prev => [...prev, error]);
  }, []);

  const handleReturnTo3D = useCallback(() => {
    setViewingPhotosphere(false);
    photosphereImages.forEach(img => URL.revokeObjectURL(img.url));
    setPhotosphereImages([]);
  }, [photosphereImages]);

  // Add handleFileSelect function inside the component
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // Clear any existing photosphere URLs
      photosphereImages.forEach(img => URL.revokeObjectURL(img.url));
      
      // Process the ZIP file
      const images = await handleZipFile(file);
      
      if (images.length === 0) {
        alert('No valid photosphere images found in the ZIP file.');
        return;
      }

      setPhotosphereImages(images);
      setViewingPhotosphere(true);
    } catch (error) {
      console.error('Error processing ZIP file:', error);
      alert('Error processing the ZIP file. Please make sure it contains valid photosphere images.');
    }
  };

  // Now we can have our conditional return for photosphere viewing
  if (viewingPhotosphere && photosphereImages.length > 0) {
    return (
      <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
        <PhotosphereViewer 
          images={photosphereImages}
          onClose={handleReturnTo3D}
        />
        <button
          onClick={handleReturnTo3D}
          style={{
            position: "absolute",
            top: "10px",
            left: "10px",
            background: "#333",
            color: "white",
            border: "none",
            borderRadius: "5px",
            padding: "8px 12px",
            zIndex: 1000,
            cursor: "pointer"
          }}
        >
          Return to 3D View
        </button>
      </div>
    );
  }

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
                padding: "8px",
                margin: "20px"
              }
            : {
                bottom: "20px",
                left: "20px",
                width: "260px",
                padding: "20px"
              }
          ),
          background: "#dcd1c7",
          backdropFilter: "blur(10px)",
          color: "#000",
          boxSizing: "border-box",
          zIndex: 10,
          borderRadius: "12px",
          transition: "transform 0.3s ease"
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
              width: "100%" 
            }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.3em",
                  fontWeight: "600",
                  whiteSpace: "nowrap"
                }}
              >
                Band Color
              </h2>
              <button
                onClick={() => setShowBandSelector(!showBandSelector)}
                style={{
                  background: "#ab9580",
                  border: "none",
                  color: "#fff",
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  cursor: "pointer"
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
                <div 
                  style={{ 
                    display: "flex", 
                    background: "#ab9580", 
                    borderRadius: "20px",
                    padding: "2px",
                    width: "100%",
                    justifyContent: "space-between"
                  }}
                >
                  <button
                    onClick={() => setActiveBandSelection('primary')}
                    style={{
                      background: activeBandSelection === 'primary' ? "#ffffff" : "transparent",
                      color: activeBandSelection === 'primary' ? "#000000" : "#ffffff",
                      border: "none",
                      borderRadius: "16px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      flex: 1
                    }}
                  >
                    Primary
                  </button>
                  <button
                    onClick={() => setActiveBandSelection('accent')}
                    style={{
                      background: activeBandSelection === 'accent' ? "#ffffff" : "transparent",
                      color: activeBandSelection === 'accent' ? "#000000" : "#ffffff",
                      border: "none",
                      borderRadius: "16px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      flex: 1
                    }}
                  >
                    Accent
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* For mobile devices */}
        {isMobile && (
          <div style={{ width: "100%" }}>
            {hasAccentBand && (
              <div 
                style={{ 
                  display: "flex", 
                  background: "#ab9580", 
                  borderRadius: "14px",
                  padding: "3px 6px",
                  marginBottom: "8px",
                  width: "100%"
                }}
              >
                <button
                  onClick={() => setActiveBandSelection('primary')}
                  style={{
                    background: activeBandSelection === 'primary' ? "#ffffff" : "transparent",
                    color: activeBandSelection === 'primary' ? "#000000" : "#ffffff",
                    border: "none",
                    borderRadius: "14px",
                    padding: "3px 6px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    flex: 1
                  }}
                >
                  Primary
                </button>
                <button
                  onClick={() => setActiveBandSelection('accent')}
                  style={{
                    background: activeBandSelection === 'accent' ? "#ffffff" : "transparent",
                    color: activeBandSelection === 'accent' ? "#000000" : "#ffffff",
                    border: "none",
                    borderRadius: "14px",
                    padding: "3px 6px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    flex: 1
                  }}
                >
                  Accent
                </button>
              </div>
            )}
            {/* Mobile indicator for selected band color */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {/* Determine the current selected band name and its color hex */}
              {(() => {
                const currentSelectedName = activeBandSelection === 'primary' ? selectedBandColor : selectedAccentBandColor;
                const currentOption = bandOptions.find(band => band.name === currentSelectedName);
                const currentColorHex = currentOption ? currentOption.color : '#000';
                return (
                  <>
                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: currentColorHex,
                      marginRight: '6px'
                    }}></div>
                    <span style={{
                      color: '#8b7355',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {currentSelectedName}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Band color options */}
        <div
          style={{
            maxHeight: showBandSelector ? (isMobile ? "50px" : "300px") : "0px",
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
                      width: "28px",
                      height: "28px",
                      padding: 0,
                      margin: 0,
                      borderWidth: "1px"
                    }
                  : {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      padding: "12px 0",
                      margin: "8px 0"
                    }
                ),
                background: currentSelectedColor === band.name ? band.color : "transparent",
                color: currentSelectedColor === band.name ? "#fff" : "#000",
                border: `2px solid ${currentSelectedColor === band.name ? darkenColor(band.color) : band.color}`,
                borderRadius: "8px",
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
                      border: "1px solid #fff"
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
        camera={{ position: [22, 40, 23], fov: 50 }}
        gl={{ 
          antialias: false,
          precision: "highp",
          powerPreference: "default",
          failIfMajorPerformanceCaveat: false,
          preserveDrawingBuffer: true, // Required for screenshots
        }}
        style={{ background: 'white' }}
        onCreated={(state) => {
          const { gl } = state;
          if (gl) {
            // Log WebGL capabilities for debugging
            try {
              const glContext = gl.getContext ? gl.getContext() : (gl as any).context;
              if (glContext) {
                console.log("WebGL Context obtained:", !!glContext);
                
                // Collect WebGL info
                const glInfo: {[key: string]: any} = {
                  contextType: (gl as any).isWebGL2 ? 'WebGL2' : 'WebGL1',
                };
                
                // Log max texture size
                const maxTextureSize = glContext.getParameter(glContext.MAX_TEXTURE_SIZE);
                console.log("MAX_TEXTURE_SIZE:", maxTextureSize);
                glInfo.maxTextureSize = maxTextureSize;
                
                // Log max cubemap texture size
                const maxCubemapSize = glContext.getParameter(glContext.MAX_CUBE_MAP_TEXTURE_SIZE);
                console.log("MAX_CUBE_MAP_TEXTURE_SIZE:", maxCubemapSize);
                glInfo.maxCubemapSize = maxCubemapSize;
                
                // Log whether floating point textures are available
                const floatTextureExt = glContext.getExtension('OES_texture_float');
                console.log("OES_texture_float support:", !!floatTextureExt);
                glInfo.floatTextureSupport = !!floatTextureExt;
                
                // Check for other important extensions
                const extensions = [
                  'WEBGL_depth_texture',
                  'OES_texture_float_linear',
                  'OES_texture_half_float',
                  'OES_texture_half_float_linear',
                  'OES_standard_derivatives',
                  'OES_element_index_uint',
                  'ANGLE_instanced_arrays'
                ];
                
                glInfo.extensions = {};
                extensions.forEach(ext => {
                  const supported = !!glContext.getExtension(ext);
                  console.log(`${ext} support:`, supported);
                  glInfo.extensions[ext] = supported;
                });
                
                // Log whether WEBGL_debug_renderer_info is available
                const debugInfo = glContext.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                  const vendor = glContext.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                  const renderer = glContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                  console.log("Vendor:", vendor);
                  console.log("Renderer:", renderer);
                  glInfo.vendor = vendor;
                  glInfo.renderer = renderer;
                }
                
                // Update state with WebGL info
                setWebGLInfo(glInfo);
                
                // Set up error handling for WebGL
                const originalGetError = glContext.getError;
                glContext.getError = function() {
                  const error = originalGetError.call(this);
                  if (error !== glContext.NO_ERROR) {
                    const errorMsg = (() => {
                      switch(error) {
                        case glContext.INVALID_ENUM: return "INVALID_ENUM";
                        case glContext.INVALID_VALUE: return "INVALID_VALUE";
                        case glContext.INVALID_OPERATION: return "INVALID_OPERATION";
                        case glContext.INVALID_FRAMEBUFFER_OPERATION: return "INVALID_FRAMEBUFFER_OPERATION";
                        case glContext.OUT_OF_MEMORY: return "OUT_OF_MEMORY";
                        case glContext.CONTEXT_LOST_WEBGL: return "CONTEXT_LOST_WEBGL";
                        default: return `Unknown error (${error})`;
                      }
                    })();
                    handleGlError(errorMsg);
                  }
                  return error;
                };
                
                // Ensure shaders can use precision as needed
                const originalGetShaderPrecisionFormat = glContext.getShaderPrecisionFormat.bind(glContext);
                glContext.getShaderPrecisionFormat = (shaderType: any, precisionType: any) => {
                  const result = originalGetShaderPrecisionFormat(shaderType, precisionType);
                  if (result === null) {
                    console.warn(`Shader precision format not supported for shader: ${shaderType}, precision: ${precisionType}`);
                    handleGlError(`Shader precision not supported: ${shaderType}/${precisionType}`);
                    return { rangeMin: 0, rangeMax: 0, precision: 0 };
                  }
                  return result;
                };
              }
            } catch (err) {
              console.error("Error during WebGL initialization:", err);
              handleGlError(String(err));
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
            bounds={(fps) => [50, 60]}
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
              modelPath={getModelPath(selectedModel)} 
              selectedBandColor={selectedBandColor}
              selectedAccentBandColor={selectedAccentBandColor}
              onAccentBandDetected={handleAccentBandDetected}
            />
          </PerformanceMonitor>
        </Suspense>

        <OrbitControls 
          ref={orbitControlsRef}
          enablePan={false} 
          minDistance={15} 
          maxDistance={50} 
          enabled={cameraPannerComplete && !capturePhotosphere} 
        />
        
        {showStats && <Stats className="stats-bottom-right" />}
        
        {!cameraPannerComplete && (
          <CameraPanner 
            preTestProgress={preTestProgress} 
            onComplete={() => setCameraPannerComplete(true)} 
          />
        )}

        {/* Photosphere capturer */}
        <PhotosphereCapturer
          enabled={capturePhotosphere && cameraPannerComplete}
          horizontalSteps={48}  // Doubled from 24 to 48
          verticalSteps={24}    // Doubled from 12 to 24
          orbitControlsRef={orbitControlsRef}
          fileName={`ring_${selectedModel.replace(/\W+/g, '_')}`}
          onComplete={() => setCapturePhotosphere(false)}
        />
      </Canvas>

      {/* WebGL Error display for debugging */}
      {glErrors.length > 0 && (
        <div style={{
          position: "absolute",
          bottom: "60px",
          right: "10px",
          maxWidth: "400px",
          maxHeight: "200px",
          overflow: "auto",
          background: "rgba(0, 0, 0, 0.85)",
          color: "#ff4040",
          padding: "10px",
          borderRadius: "5px",
          fontSize: "12px",
          fontFamily: "monospace",
          zIndex: 1000
        }}>
          <strong>WebGL Errors:</strong>
          <ul style={{ margin: "5px 0", paddingLeft: "15px" }}>
            {glErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
          <button 
            onClick={() => setGlErrors([])} 
            style={{
              background: "#333",
              border: "none",
              color: "white",
              padding: "3px 8px",
              borderRadius: "3px",
              cursor: "pointer"
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Diamond Error display for debugging */}
      {diamondErrors.length > 0 && (
        <div style={{
          position: "absolute",
          top: "60px",
          left: "10px",
          maxWidth: "400px",
          maxHeight: "200px",
          overflow: "auto",
          background: "rgba(0, 0, 0, 0.85)",
          color: "#ff4040",
          padding: "10px",
          borderRadius: "5px",
          fontSize: "12px",
          fontFamily: "monospace",
          zIndex: 1000
        }}>
          <strong>Diamond Errors:</strong>
          <ul style={{ margin: "5px 0", paddingLeft: "15px" }}>
            {diamondErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
          <button 
            onClick={() => setDiamondErrors([])} 
            style={{
              background: "#333",
              border: "none",
              color: "white",
              padding: "3px 8px",
              borderRadius: "3px",
              cursor: "pointer"
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Debug Panel Toggle */}
      <button
        onClick={() => setShowDebugPanel(!showDebugPanel)}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          background: "#333",
          color: "white",
          border: "none",
          borderRadius: "5px",
          padding: "5px 10px",
          zIndex: 1000,
          cursor: "pointer"
        }}
      >
        {showDebugPanel ? "Hide Debug" : "Show Debug"}
      </button>

      {/* Debug Panel */}
      {showDebugPanel && (
        <div style={{
          position: "absolute",
          top: "50px",
          right: "10px",
          width: "300px",
          maxHeight: "80vh",
          overflow: "auto",
          background: "rgba(0, 0, 0, 0.85)",
          color: "white",
          padding: "15px",
          borderRadius: "5px",
          fontSize: "12px",
          fontFamily: "monospace",
          zIndex: 1000
        }}>
          <h3 style={{ margin: "0 0 10px 0", color: "#0ff" }}>Debug Information</h3>
          
          <div style={{ marginBottom: "10px" }}>
            <strong>Device Info:</strong>
            <ul style={{ margin: "5px 0", paddingLeft: "15px" }}>
              <li>Mobile: {isMobile ? "Yes" : "No"}</li>
              <li>Initial FPS: {initialFps?.toFixed(1) || "Measuring..."}</li>
              <li>Performance Factor: {factor.toFixed(2)}</li>
              <li>DPR: {typeof computedDpr === 'number' ? computedDpr : computedDpr.join('-')}</li>
              <li>User Agent: {typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'}</li>
            </ul>
          </div>
          
          <div style={{ marginBottom: "10px" }}>
            <strong>File Format:</strong>
            <ul style={{ margin: "5px 0", paddingLeft: "15px" }}>
              <li>Current: {selectedModel.toLowerCase().endsWith('.3dm') ? '3DM (Rhino)' : 'GLB (glTF Binary)'}</li>
              <li>Supported: GLB, 3DM</li>
              <li>Path: {getModelPath(selectedModel)}</li>
            </ul>
          </div>
          
          <div style={{ marginBottom: "10px" }}>
            <strong>WebGL Info:</strong>
            {Object.keys(webGLInfo).length > 0 ? (
              <ul style={{ margin: "5px 0", paddingLeft: "15px" }}>
                <li>Context: {webGLInfo.contextType}</li>
                <li>Vendor: {webGLInfo.vendor || 'Unknown'}</li>
                <li>Renderer: {webGLInfo.renderer || 'Unknown'}</li>
                <li>Max Texture Size: {webGLInfo.maxTextureSize}</li>
                <li>Max Cubemap Size: {webGLInfo.maxCubemapSize}</li>
                <li>Float Texture: {webGLInfo.floatTextureSupport ? 'Yes' : 'No'}</li>
                <li>
                  Extensions:
                  {webGLInfo.extensions && (
                    <ul style={{ paddingLeft: "15px" }}>
                      {Object.entries(webGLInfo.extensions).map(([ext, supported]: [string, any]) => (
                        <li key={ext} style={{ color: supported ? '#0f0' : '#f00' }}>
                          {ext}: {supported ? 'Yes' : 'No'}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              </ul>
            ) : (
              <p style={{ margin: "5px 0", color: "#f00" }}>WebGL info not available</p>
            )}
          </div>
          
          <div style={{ marginBottom: "10px" }}>
            <strong>WebGL Errors ({glErrors.length}):</strong>
            {glErrors.length > 0 ? (
              <ul style={{ margin: "5px 0", paddingLeft: "15px" }}>
                {glErrors.slice(0, 3).map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
                {glErrors.length > 3 && <li>...and {glErrors.length - 3} more</li>}
              </ul>
            ) : (
              <p style={{ margin: "5px 0", color: "#0f0" }}>No WebGL errors</p>
            )}
          </div>
          
          <div style={{ marginBottom: "10px" }}>
            <strong>Diamond Errors ({diamondErrors.length}):</strong>
            {diamondErrors.length > 0 ? (
              <ul style={{ margin: "5px 0", paddingLeft: "15px" }}>
                {diamondErrors.slice(0, 3).map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
                {diamondErrors.length > 3 && <li>...and {diamondErrors.length - 3} more</li>}
              </ul>
            ) : (
              <p style={{ margin: "5px 0", color: "#0f0" }}>No Diamond errors</p>
            )}
          </div>
          
          <button 
            onClick={() => {
              setGlErrors([]);
              setDiamondErrors([]);
            }} 
            style={{
              background: "#333",
              border: "none",
              color: "white",
              padding: "5px 10px",
              borderRadius: "3px",
              cursor: "pointer",
              marginRight: "10px"
            }}
          >
            Clear All Errors
          </button>
          
          <button 
            onClick={() => setShowDebugPanel(false)} 
            style={{
              background: "#333",
              border: "none",
              color: "white",
              padding: "5px 10px",
              borderRadius: "3px",
              cursor: "pointer"
            }}
          >
            Close
          </button>
        </div>
      )}

      {/* Disclaimer text */}
      <div style={{
        position: "absolute",
        bottom: "20px",
        width: "100%",
        textAlign: "center",
        pointerEvents: "none",
        color: "#000",
        fontSize: "1em",
        background: "rgba(255, 255, 255, 0.7)",
        padding: "5px 0"
      }}>
        <p>This is a render — the final ring may appear differently.</p>
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

      {/* Add Photosphere buttons */}
      <div style={{
        position: "absolute",
        top: showDebugPanel ? "50px" : "10px",
        left: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        zIndex: 1000
      }}>
        <button
          onClick={() => setCapturePhotosphere(true)}
          style={{
            background: "#333",
            color: "white",
            border: "none",
            borderRadius: "5px",
            padding: "5px 10px",
            cursor: "pointer"
          }}
        >
          Capture Photosphere
        </button>
        
        <label
          style={{
            background: "#333",
            color: "white",
            border: "none",
            borderRadius: "5px",
            padding: "5px 10px",
            cursor: "pointer",
            textAlign: "center",
            margin: 0
          }}
        >
          <input
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          View Photosphere ZIP
        </label>
      </div>

      {/* Return to original 3D view */}
      <button
        onClick={handleReturnTo3D}
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          background: "#333",
          color: "white",
          border: "none",
          borderRadius: "5px",
          padding: "8px 12px",
          zIndex: 1000,
          cursor: "pointer"
        }}
      >
        Return to 3D View
      </button>
    </div>
  );
}

// Export the client-only version as default
export default function RingViewer(props: RingViewerProps) {
  const [showCanvas, setShowCanvas] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Fallback for any errors
  if (!showCanvas) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-gray-100 p-4">
        <div className="text-red-500 text-xl font-bold mb-4">
          {errorMessage || "The 3D viewer is not available"}
        </div>
        <p className="text-gray-700">
          We're sorry, but the 3D viewer couldn't be loaded. This might be due to:
        </p>
        <ul className="list-disc pl-8 mt-2 text-gray-700">
          <li>Your browser doesn't support WebGL</li>
          <li>You're using a device with limited graphics capabilities</li>
          <li>A temporary technical issue</li>
        </ul>
        <p className="mt-4 text-gray-700">
          Please try a different browser or device, or come back later.
        </p>
        <button
          onClick={() => {
            setShowCanvas(true);
            setErrorMessage(null);
          }}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Try Again
        </button>
      </div>
    );
  }
  
  return (
    <ErrorBoundary 
      onError={(error) => {
        console.error("RingViewer Error:", error);
        // Only set showCanvas to false for actual WebGL errors
        if (error.message && (
          error.message.includes("WebGL") ||
          error.message.includes("canvas") ||
          error.message.includes("INVALID_OPERATION") ||
          error.message.includes("shader")
        )) {
          setShowCanvas(false);
          setErrorMessage(error.message);
        }
      }}
    >
      <PerformanceProvider>
        <RingViewerComponent {...props} />
      </PerformanceProvider>
    </ErrorBoundary>
  );
}

// Add new helper functions

// Function to analyze overall model data to establish baselines
function analyzeModelData(nodes: { [key: string]: THREE.Mesh | THREE.Object3D }): any {
  // Extract all meshes
  const meshes = Object.values(nodes).filter(node => node instanceof THREE.Mesh) as THREE.Mesh[];
  
  if (meshes.length === 0) return { averageY: 0, maxY: 0, minY: 0, centerX: 0, centerZ: 0, avgDistanceFromCenter: 0, averageVolume: 0 };
  
  // Calculate properties
  let totalVolume = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let sumY = 0;
  let centerX = 0;
  let centerZ = 0;
  
  // First pass - get center positions
  meshes.forEach(mesh => {
    // Use world position
    const position = new THREE.Vector3();
    mesh.getWorldPosition(position);
    
    centerX += position.x;
    centerZ += position.z;
    minY = Math.min(minY, position.y);
    maxY = Math.max(maxY, position.y);
    sumY += position.y;
  });
  
  centerX /= meshes.length;
  centerZ /= meshes.length;
  const averageY = sumY / meshes.length;
  
  // Second pass - calculate volume and distance from center
  let totalDistanceFromCenter = 0;
  
  meshes.forEach(mesh => {
    // Get bounding box
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    // Calculate approximate volume
    const volume = size.x * size.y * size.z;
    totalVolume += volume;
    
    // Calculate distance from center
    const position = new THREE.Vector3();
    mesh.getWorldPosition(position);
    
    const distanceFromCenter = Math.sqrt(
      Math.pow(position.x - centerX, 2) + 
      Math.pow(position.z - centerZ, 2)
    );
    
    totalDistanceFromCenter += distanceFromCenter;
  });
  
  const averageVolume = totalVolume / meshes.length;
  const avgDistanceFromCenter = totalDistanceFromCenter / meshes.length;
  
  return {
    averageY,
    minY,
    maxY,
    centerX,
    centerZ,
    avgDistanceFromCenter,
    averageVolume,
    meshes
  };
}

// Calculate gem score
function calculateGemScore(node: THREE.Mesh, nodeName: string, meshData: any): number {
  // Simplified implementation - returns a score between 0 and 1
  // Higher number means more likely to be a gem
  return 0.5;
}

// Classify a node as primary band or accent band
function classifyBandNode(
  node: THREE.Mesh, 
  material: THREE.Material | undefined, 
  primaryBandNodes: THREE.Mesh[], 
  accentBandNodes: THREE.Mesh[],
  nodeName: string
) {
  // Simplified implementation - just adds to primary band
  primaryBandNodes.push(node);
}

// Check if a node is a thin ring shape
function isThinRingShape(node: THREE.Mesh, meshData: any): boolean {
  // Simplified implementation
  return false;
}

// Calculate gem likelihood score
function getGemLikelihoodScore(mesh: THREE.Mesh, modelData: any): number {
  // Simplified implementation - returns a score between 0 and 1
  // Higher number means more likely to be a gem
  return 0.5;
}

/**
 * Interface for MeshRefractionMaterial props
 */
interface MeshRefractionMaterialProps {
  // We'll remove onError from here as it's not a direct prop
  bounces?: number;
  aberrationStrength?: number;
  ior?: number;
  fresnel?: number; 
  color?: string;
  transmission?: number;
  thickness?: number;
  roughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  attenuationDistance?: number;
  attenuationColor?: string;
  blur?: number;
  flatShading?: boolean;
  key?: string;
  toneMapped?: boolean;
  envMap?: THREE.CubeTexture | null;
  // Custom property for our SafeMeshRefractionMaterial
  onError?: (error: Error | any) => void;
  [key: string]: any; // For any other props
}

/**
 * Creates a fallback material for diamonds/gems
 * @param isBaguette - Whether the gem is a baguette
 * @param keyPrefix - Prefix for the material key
 * @param materialKey - Unique material key identifier
 * @returns A React mesh physical material element with appropriate properties
 */
function createFallbackMaterial(isBaguette: boolean, keyPrefix: string, materialKey: string) {
  return (
    <meshPhysicalMaterial
      key={`${keyPrefix}_${materialKey}`}
      color="#ffffff"
      roughness={isBaguette ? 0.02 : 0.1}
      metalness={isBaguette ? 0.05 : 0.1}
      transparent={true}
      opacity={isBaguette ? 0.92 : 0.95}
      clearcoat={isBaguette ? 1.0 : 0.9}
      clearcoatRoughness={0.05}
      reflectivity={isBaguette ? 1.5 : 1.2}
      envMapIntensity={isBaguette ? 3.5 : 3.0}
      ior={2.4}
    />
  );
}

/**
 * Component to automatically capture screenshots from multiple camera angles for photosphere creation
 */
function PhotosphereCapturer({
  enabled,
  onComplete,
  resolution = 1024,
  horizontalSteps = 24,   // Doubled from 12 to 24 for smoother horizontal transitions
  verticalSteps = 12,     // Doubled from 6 to 12 for smoother vertical transitions
  orbitControlsRef,
  fileName = "photosphere"
}: {
  enabled: boolean;
  onComplete?: (screenshots: string[]) => void;
  resolution?: number;
  horizontalSteps?: number;
  verticalSteps?: number;
  orbitControlsRef: React.RefObject<any>;
  fileName?: string;
}) {
  const { gl, scene, camera } = useThree();
  const [currentH, setCurrentH] = useState(0);
  const [currentV, setCurrentV] = useState(0);
  const [captureComplete, setCaptureComplete] = useState(false);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [originalCameraPosition, setOriginalCameraPosition] = useState<THREE.Vector3 | null>(null);
  const [originalControlsState, setOriginalControlsState] = useState<any>(null);
  
  // Calculate total number of screenshots
  const totalShots = horizontalSteps * verticalSteps;
  const shotsRef = useRef<string[]>([]);

  // Store original camera settings before capture
  useEffect(() => {
    if (enabled && !captureComplete && !isCapturing) {
      // Store original camera position and controls state
      if (camera) {
        setOriginalCameraPosition(camera.position.clone());
      }
      
      if (orbitControlsRef.current) {
        setOriginalControlsState({
          minPolarAngle: orbitControlsRef.current.minPolarAngle,
          maxPolarAngle: orbitControlsRef.current.maxPolarAngle
        });
      }
      
      setIsCapturing(true);
      startCapture();
    }
  }, [enabled, captureComplete, camera]);
  
  // Restore original camera settings after capture
  useEffect(() => {
    if (captureComplete && originalCameraPosition && camera) {
      // Restore camera to original position
      camera.position.copy(originalCameraPosition);
      camera.lookAt(0, 0, 0);
      
      // Restore controls to original state
      if (orbitControlsRef.current && originalControlsState) {
        orbitControlsRef.current.minPolarAngle = originalControlsState.minPolarAngle;
        orbitControlsRef.current.maxPolarAngle = originalControlsState.maxPolarAngle;
        orbitControlsRef.current.update();
      }
    }
  }, [captureComplete, originalCameraPosition, originalControlsState, camera]);
  
  const startCapture = () => {
    // Reset state
    setCurrentH(0);
    setCurrentV(0);
    setCaptureComplete(false);
    shotsRef.current = [];
    setScreenshots([]);
    
    // Allow full vertical rotation to capture top of ring
    if (orbitControlsRef.current) {
      orbitControlsRef.current.minPolarAngle = 0;
      orbitControlsRef.current.maxPolarAngle = Math.PI;
      orbitControlsRef.current.update();
    }
    
    console.log(`Starting photosphere capture: ${horizontalSteps}x${verticalSteps} = ${totalShots} screenshots`);
  };
  
  const captureNextFrame = useCallback(() => {
    if (!orbitControlsRef.current || !enabled) return;
    
    // Calculate spherical coordinates for even distribution around a sphere
    const phi = (currentH / horizontalSteps) * Math.PI * 2; // horizontal angle (0 to 2π)
    
    // Adjust vertical calculation to ensure we capture the full sphere, including poles
    // Using non-linear distribution to have more detail at equator and less at poles
    const theta = Math.acos(1 - 2 * (currentV / (verticalSteps - 1))); // vertical angle (0 to π)
    
    // Convert spherical to cartesian coordinates
    const radius = 30; // Keep same distance from center
    const x = radius * Math.sin(theta) * Math.cos(phi);
    const y = radius * Math.cos(theta);
    const z = radius * Math.sin(theta) * Math.sin(phi);
    
    // Set camera position
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
    
    // Force OrbitControls to update
    orbitControlsRef.current.update();
    
    // Render scene with new camera position
    gl.render(scene, camera);
    
    // Capture screenshot in WebP format for better compression
    try {
      // Use higher quality (0.9) for WebP to maintain details while still getting better compression than PNG
      const screenshot = gl.domElement.toDataURL('image/webp', 0.9);
      // Store screenshot with position info for later stitching
      const filename = `${fileName}_h${currentH}_v${currentV}.webp`;
      shotsRef.current.push(screenshot);
      
      console.log(`Captured screenshot ${currentH * verticalSteps + currentV + 1}/${totalShots}: ${filename}`);
      
      // Move to next position
      let nextH = currentH;
      let nextV = currentV + 1;
      
      if (nextV >= verticalSteps) {
        nextV = 0;
        nextH = nextH + 1;
      }
      
      if (nextH >= horizontalSteps) {
        // We've completed all screenshots
        console.log("Photosphere capture complete!");
        setScreenshots(shotsRef.current);
        setCaptureComplete(true);
        setIsCapturing(false);
        if (onComplete) onComplete(shotsRef.current);
        
        // Create a zip download of all images
        downloadScreenshots(shotsRef.current);
        return;
      }
      
      // Update state for next capture
      setCurrentH(nextH);
      setCurrentV(nextV);
    } catch (error) {
      console.error("Error capturing screenshot:", error);
      setIsCapturing(false);
    }
  }, [currentH, currentV, horizontalSteps, verticalSteps, gl, scene, camera, orbitControlsRef, enabled, fileName, onComplete, totalShots]);
  
  // Trigger next capture in the next frame
  useEffect(() => {
    if (isCapturing && !captureComplete) {
      const timeoutId = setTimeout(() => {
        captureNextFrame();
      }, 200); // Small delay between shots
      
      return () => clearTimeout(timeoutId);
    }
  }, [captureNextFrame, isCapturing, captureComplete]);
  
  // Function to download all screenshots as a zip
  const downloadScreenshots = async (shots: string[]) => {
    try {
      // Check if JSZip is available globally
      if (typeof window !== 'undefined' && !(window as any).JSZip) {
        // If JSZip is not available, load it dynamically
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.async = true;
        document.body.appendChild(script);
        
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load JSZip library"));
          // Add timeout
          setTimeout(() => reject(new Error("Timeout loading JSZip library")), 10000);
        });
        
        console.log("JSZip library loaded successfully");
      }
      
      // Now JSZip should be available
      const JSZip = (window as any).JSZip;
      if (!JSZip) {
        console.error("JSZip library couldn't be loaded");
        return;
      }
      
      const zip = new JSZip();
      
      // Add each screenshot to the zip
      shots.forEach((shot, index) => {
        const h = Math.floor(index / verticalSteps);
        const v = index % verticalSteps;
        const filename = `${fileName}_h${h}_v${v}.webp`;
        
        // Convert data URL to binary
        const data = shot.split(',')[1];
        zip.file(filename, data, { base64: true });
      });
      
      // Add a simple HTML file for viewing
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Photosphere Viewer</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; background: #222; color: #eee; }
            .container { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 5px; padding: 10px; }
            img { width: 100%; height: auto; object-fit: contain; border: 1px solid #444; }
            .info { padding: 20px; background: #333; }
            h1 { margin-top: 0; }
            .img-container { position: relative; }
            .img-info { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); color: white; padding: 3px; text-align: center; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="info">
            <h1>Photosphere Screenshots</h1>
            <p>Total images: ${totalShots} (${horizontalSteps}x${verticalSteps})</p>
            <p>Use these images with a panorama stitching software to create a photosphere.</p>
          </div>
          <div class="container">
            ${Array.from({ length: totalShots }).map((_, index) => {
              const h = Math.floor(index / verticalSteps);
              const v = index % verticalSteps;
              return `
                <div class="img-container">
                  <img src="${fileName}_h${h}_v${v}.webp" alt="Frame ${index}" />
                  <div class="img-info">h: ${h}, v: ${v}</div>
                </div>
              `;
            }).join('')}
          </div>
        </body>
        </html>
      `;
      
      zip.file("viewer.html", htmlContent);
      
      // Add a readme with instructions
      const readmeContent = `
        # Photosphere Screenshots
        
        This zip contains screenshots captured for creating a photosphere.
        
        ## Details
        - Total images: ${totalShots} (${horizontalSteps}x${verticalSteps})
        - Horizontal steps: ${horizontalSteps}
        - Vertical steps: ${verticalSteps}
        - Format: WebP (better compression than PNG with high quality)
        
        ## How to use
        1. Extract all images from this zip
        2. Use panorama stitching software like PTGui, Hugin, or similar to create a 360° panorama
        3. Follow your stitching software's instructions for creating equirectangular panoramas
        
        ## Naming convention
        Files are named as: ${fileName}_h[horizontal_position]_v[vertical_position].webp
        
        ## Viewing
        Open viewer.html to see all the captured images in a grid.
      `;
      
      zip.file("README.md", readmeContent);
      
      // Generate the zip file
      const content = await zip.generateAsync({ type: "blob" });
      
      // Create a download link
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `${fileName}_photosphere.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log("Photosphere screenshots downloaded as zip");
    } catch (error) {
      console.error("Error creating zip file:", error);
    }
  };
  
  // Render UI overlay showing progress
  return enabled ? (
    <Html position={[0, 0, 0]} center>
      <div style={{
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '10px 20px',
        borderRadius: '5px',
        fontFamily: 'Arial, sans-serif',
        pointerEvents: 'none'
      }}>
        {captureComplete 
          ? "Photosphere capture complete! Preparing download..."
          : `Capturing photosphere: ${currentH * verticalSteps + currentV + 1}/${totalShots}`
        }
      </div>
    </Html>
  ) : null;
}