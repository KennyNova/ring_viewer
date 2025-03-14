"use client";

import { useEffect, useRef, Suspense } from "react";
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
import React, { createContext, useContext, useState } from 'react';
import { Leva } from "leva";
import { CubeTextureLoader } from "three";
import Image from 'next/image';
import { CombinedLoader } from './DiamondLoader';

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
            onDecline &&
              onDecline({
                fps: finalAvg,
                factor: newFactor,
                refreshrate: finalAvg,
                frames: frames.current,
                averages: averages.current,
              });
          } else if (finalAvg > upper) {
            const adjustmentFactor = step * ((finalAvg - upper) / upper);
            const newFactor = Math.min(1, factor + adjustmentFactor);
            setFactor(newFactor);
            flipCount.current++;
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

function Diamond(props: any) {
  const { scene } = useThree();
  const { isOval = false } = props; 
  const { factor: perfFactor } = usePerformance();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const environmentReady = useEnvironment();
  const materialRef = useRef<any>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Add this to expose error to parent component
  useEffect(() => {
    if (errorMsg && typeof window !== 'undefined' && window.parent) {
      try {
        // Create a global variable to store errors
        (window as any).__DIAMOND_ERRORS = (window as any).__DIAMOND_ERRORS || [];
        (window as any).__DIAMOND_ERRORS.push(errorMsg);
        
        // Try to dispatch an event that can be listened for
        window.dispatchEvent(new CustomEvent('diamond-error', { 
          detail: { message: errorMsg, time: new Date().toISOString() } 
        }));
      } catch (e) {
        console.error("Failed to communicate error:", e);
      }
    }
  }, [errorMsg]);
  
  // Optimized configuration for the refraction material.
  const config = {
    bounces: isOval ? 1 : 3,
    aberrationStrength: isOval ? 0.0 : 0.01,
    ior: 2.75,
    fresnel: 1,
    color: "white",
    transmission: 0,
    thickness: isOval ? 0.3 : 0.5,
    roughness: 0,
    clearcoat: isOval ? 0 : 0.1,
    clearcoatRoughness: isOval ? 0 : 0.1,
    attenuationDistance: 1,
    attenuationColor: "#ffffff",
  };

  // Log any errors with the material
  useEffect(() => {
    if (materialRef.current) {
      const checkForErrors = () => {
        if (materialRef.current) {
          try {
            // Check if material was correctly initialized
            if (!materialRef.current.envMap) {
              console.error("MeshRefractionMaterial: Missing environment map");
              setErrorMsg("Missing environment map");
            }
            
            // Check WebGL context for errors
            const gl = materialRef.current.__r3f?.gl;
            if (gl) {
              const glError = gl.getError?.();
              if (glError !== gl.NO_ERROR && glError !== 0) {
                console.error(`WebGL Error: ${glError}`);
                setErrorMsg(`WebGL Error: ${glError}`);
              }
              
              // Check for specific iOS shader errors
              try {
                const glContext = gl.getContext ? gl.getContext() : (gl as any).context;
                if (glContext) {
                  // Try to create a simple test shader to check if shaders work at all
                  const testVertexShader = glContext.createShader(glContext.VERTEX_SHADER);
                  if (!testVertexShader) {
                    console.error("Failed to create test vertex shader");
                    setErrorMsg("Failed to create vertex shader");
                    return;
                  }
                  
                  const simpleVertexCode = `
                    attribute vec4 position;
                    void main() {
                      gl_Position = position;
                    }
                  `;
                  
                  glContext.shaderSource(testVertexShader, simpleVertexCode);
                  glContext.compileShader(testVertexShader);
                  
                  if (!glContext.getShaderParameter(testVertexShader, glContext.COMPILE_STATUS)) {
                    const error = glContext.getShaderInfoLog(testVertexShader);
                    console.error("Test vertex shader compilation failed:", error);
                    setErrorMsg(`Shader compilation test failed: ${error}`);
                  }
                  
                  // Clean up test shader
                  glContext.deleteShader(testVertexShader);
                }
              } catch (shaderErr) {
                console.error("Error testing shader compilation:", shaderErr);
              }
            }
            
            // Check if shader compilation failed
            if (materialRef.current.program) {
              const program = materialRef.current.program;
              console.log("Shader program status:", program);
            }
            
            // Check for shader compilation errors
            if (meshRef.current?.material) {
              // Use type assertion to access internal properties
              const material = meshRef.current.material as any;
              
              if (material.program) {
                if (!material.program.isCompiled) {
                  console.error("Shader failed to compile:", material.program.diagnostics);
                  setErrorMsg(`Shader compilation error: ${
                    material.program.diagnostics?.fragmentShader || 'Unknown'
                  }`);
                }
                
                // Log shader info if available
                if (material.fragmentShader) {
                  console.log("Fragment shader length:", material.fragmentShader.length);
                }
                
                // Check for null vertex shader specifically
                if (material.vertexShader === null || material.vertexShader === undefined) {
                  console.error("Null vertex shader detected");
                  setErrorMsg("Null vertex shader detected");
                }
              }
            }
          } catch (err) {
            console.error("Error in MeshRefractionMaterial:", err);
            setErrorMsg(err instanceof Error ? err.message : String(err));
          }
        }
      };
      
      // Check immediately and after a short delay
      checkForErrors();
      const timer = setTimeout(checkForErrors, 500);
      const timer2 = setTimeout(checkForErrors, 2000); // Another check after the material has had time to compile
      return () => {
        clearTimeout(timer);
        clearTimeout(timer2);
      };
    }
  }, []);

  // Always use standard material if environment is not ready or performance is too low
  if (!environmentReady || perfFactor < 0.5 || errorMsg) {
    // Log why we're falling back
    console.log(`Using fallback material because: ${!environmentReady ? 'Environment not ready' : 
      perfFactor < 0.5 ? 'Performance too low' : `Error: ${errorMsg}`}`);
      
    return (
      <mesh
        castShadow={false}
        geometry={props.geometry}
        position={props.position}
        rotation={props.rotation}
        scale={props.scale}
      >
        <meshStandardMaterial 
          color="#ccc"
          roughness={0.6}
          metalness={0.2}
        />
      </mesh>
    );
  }
  
  // Adjust blur based on performance
  const baseBlur = isMobile ? 0.8 : 0.4;
  const adjustedBlur = baseBlur + (1 - perfFactor) * 0.2;
  const blurToUse = perfFactor < 0.7 ? adjustedBlur + 0.2 : adjustedBlur;
  
  return (
    <mesh
      ref={meshRef}
      castShadow
      geometry={props.geometry}
      position={props.position}
      rotation={props.rotation}
      scale={props.scale}
      onUpdate={(self) => {
        // Log the mesh and material details when first updated
        console.log("Diamond mesh updated:", self);
        if (self.material) {
          console.log("Material assigned:", self.material);
        }
      }}
    >
      <SafeMeshRefractionMaterial
        ref={materialRef}
        envMap={scene.environment as THREE.CubeTexture}
        {...config} 
        toneMapped={false}
        // @ts-ignore: blur prop is not defined in the MeshRefractionMaterial type
        blur={blurToUse}
        flatShading={perfFactor < 0.7}
        onError={(error: any) => {
          console.error("MeshRefractionMaterial error:", error);
          setErrorMsg(error?.message || "Unknown error");
        }}
      />
    </mesh>
  );
}

// AnimatedStandardMaterial component to gradually animate the color change
function AnimatedStandardMaterial({ targetColor, metalness, roughness, ...props }: any) {
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
  const gltf = useGLTF(modelPath) as unknown as { nodes: { [key: string]: THREE.Mesh | THREE.Object3D } };
  const { nodes } = gltf;
  const ringRef = useRef<THREE.Group>(null!);

  // Log the nodes to the console
  console.log("3D Model Nodes:", nodes);

  // Node visibility controls
  const meshNodes = Object.entries(nodes).filter(
    ([_, node]) => node instanceof THREE.Mesh
  );
  
  const visibilityControls = useControls('Node Visibility', 
    Object.fromEntries(
      meshNodes.map(([name, _]) => [ name, true ])
    )
  );

  const bandMaterials = {
    'Yellow Gold': { color: '#ffdc73', metalness: 1, roughness: 0.2 },
    'Rose Gold': { color:'#d5927a', metalness: 1, roughness: 0.2 }, // Use the color from Leva
    'White Gold': { color: '#E8E8E8', metalness: 1, roughness: 0.15 },
    'Platinum': { color: '#E5E4E2', metalness: 1, roughness: 0.1 }
  };

  const selectedMaterial = bandMaterials[selectedBandColor as keyof typeof bandMaterials];
  const selectedAccentMaterial = bandMaterials[selectedAccentBandColor as keyof typeof bandMaterials];

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
      
      {/* Diamond nodes */}
      {diamondNodes.map((gem, index) => (
        visibilityControls[gem.name] && (
          <Diamond
            key={`diamond-${index}`}
            geometry={gem.geometry}
            position={gem.position.toArray()}
            rotation={[gem.rotation.x, gem.rotation.y, gem.rotation.z]}
            scale={gem.scale.toArray()}
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

// Import the needed component from @react-three/drei
import { MeshRefractionMaterial } from "@react-three/drei";

// Create a safer version of MeshRefractionMaterial that handles errors
function SafeMeshRefractionMaterial(props: any) {
  const { onError, ...rest } = props;
  const [hasError, setHasError] = useState(false);
  
  // Add a specific check for the null vertex shader error
  useEffect(() => {
    const handleGlobalErrors = (event: ErrorEvent) => {
      // Check for the specific error message
      if (event.message && (
        event.message.includes("null is not acceptable for the gl vertex shader") ||
        event.message.includes("null vertex shader") ||
        event.message.includes("null shader")
      )) {
        console.error("Caught null vertex shader error:", event.message);
        setHasError(true);
        if (onError) onError({ message: "Null vertex shader error detected" });
      }
    };
    
    // Listen for global errors
    window.addEventListener('error', handleGlobalErrors);
    
    return () => {
      window.removeEventListener('error', handleGlobalErrors);
    };
  }, [onError]);
  
  // If we've detected an error, use a standard material instead
  if (hasError) {
    return (
      <meshStandardMaterial
        color="#ccc"
        roughness={0.6}
        metalness={0.2}
      />
    );
  }
  
  // Otherwise, try to use the refraction material with error handling
  try {
    return (
      <MeshRefractionMaterial
        {...rest}
        onError={(error: any) => {
          console.error("MeshRefractionMaterial error:", error);
          
          // Check for null vertex shader in the error message
          if (error && typeof error.message === 'string' && (
            error.message.includes("null is not acceptable") ||
            error.message.includes("null vertex shader") ||
            error.message.includes("shader compilation failed")
          )) {
            console.error("Detected null vertex shader error");
          }
          
          setHasError(true);
          if (onError) onError(error);
        }}
      />
    );
  } catch (err) {
    console.error("Error creating MeshRefractionMaterial:", err);
    setHasError(true);
    if (onError) onError(err instanceof Error ? err : new Error(String(err)));
    
    return (
      <meshStandardMaterial
        color="#ccc"
        roughness={0.6}
        metalness={0.2}
      />
    );
  }
}

export default function RingViewer({ models, selectedModel, category }: RingViewerProps) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  
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
  
  // Add this to collect WebGL error information for debugging
  const [glErrors, setGlErrors] = useState<string[]>([]);
  const [diamondErrors, setDiamondErrors] = useState<string[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [webGLInfo, setWebGLInfo] = useState<{[key: string]: any}>({});

  // Listen for diamond errors
  useEffect(() => {
    const handleDiamondError = (event: any) => {
      const error = event.detail?.message || "Unknown diamond error";
      console.log("Diamond error event received:", error);
      setDiamondErrors(prev => [...prev, error]);
    };

    window.addEventListener('diamond-error', handleDiamondError);
    
    // Also check for global errors every second
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

  // Pre-test to measure device performance
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
  const computedDpr = lockedLowFps ? 0.8 : (factor < 0.5 ? 1 : ([1, 2] as [number, number]));
  const effectiveEnvironmentIntensity = lockedLowFps ? 1.5 : 2.2;

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

  // Handle WebGL errors
  const handleGlError = (error: string) => {
    console.error("WebGL Error:", error);
    setGlErrors(prev => [...prev, error]);
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
          antialias: !(lockedLowFps),
          precision: "highp",
          powerPreference: "low-power",
          failIfMajorPerformanceCaveat: false
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
              modelPath={`/3d/${category}/${selectedModel}.glb`} 
              selectedBandColor={selectedBandColor}
              selectedAccentBandColor={selectedAccentBandColor}
              onAccentBandDetected={handleAccentBandDetected}
            />
          </PerformanceMonitor>
        </Suspense>

        <OrbitControls 
          enablePan={false} 
          minDistance={15} 
          maxDistance={50} 
          enabled={cameraPannerComplete} 
        />
        
        {showStats && <Stats className="stats-bottom-right" />}
        
        {!cameraPannerComplete && (
          <CameraPanner 
            preTestProgress={preTestProgress} 
            onComplete={() => setCameraPannerComplete(true)} 
          />
        )}
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
    </div>
  );
}