"use client";

import { useEffect, useRef, Suspense } from "react";
import { useFrame } from '@react-three/fiber'
import * as THREE from "three";
import { Canvas, useThree, useLoader } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  useGLTF,
  CubeCamera,
  Caustics,
  MeshRefractionMaterial,
  Stats,
  useProgress,
  Html,
  Sky,
  Backdrop
} from "@react-three/drei";
import { EffectComposer } from "@react-three/postprocessing";
import { useControls } from "leva";
import { RGBELoader } from "three-stdlib";
import React, { createContext, useContext, useState } from 'react';
import { Leva } from "leva";

declare global {
  interface Window {
    __LEVA__: {
      setSettings: (settings: { hidden?: boolean, collapsed?: boolean } | ((prev: any) => any)) => void;
    };
  }
}

const DiamondEnvMapContext = createContext<THREE.Texture | null>(null);

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
  children,
}: PerformanceMonitorProps) {
  const [factor, setFactor] = useState(initialFactor);
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
        
        // --- Adjust sampling interval dynamically ---
        if (finalAvg > upper) {
          // When performance is well above the upper bound, reduce sampling frequency
          sampleIntervalRef.current = Math.min(sampleIntervalRef.current * 1.5, ms * 4);
        } else if (finalAvg < lower) {
          // When performance is too low, increase sampling frequency for faster response
          sampleIntervalRef.current = Math.max(sampleIntervalRef.current / 1.5, ms / 2);
        }
        
        // --- Update the performance factor only if cooldown has passed ---
        if (now - lastUpdateTime.current >= cooldown) {
          if (finalAvg < lower) {
            // Scale the adjustment based on the relative difference
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

export function DiamondEnvMapProvider({
  children,
  resolution,
}: {
  children: React.ReactNode;
  resolution: number;
}) {
  return (
    <CubeCamera resolution={resolution} frames={1}>
      {(envMap) => (
        <DiamondEnvMapContext.Provider value={envMap}>
          {children}
        </DiamondEnvMapContext.Provider>
      )}
    </CubeCamera>
  );
}

export function useDiamondEnvMap() {
  return useContext(DiamondEnvMapContext);
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

function Diamond(props: any) {
  const { scene } = useThree();

  // Configuration for the refraction material remains unchanged.
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

  const [envMap, setEnvMap] = useState<THREE.Texture | null>(
    scene.environment || null
  );

  useFrame(() => {
    if (!envMap && scene.environment) {
      setEnvMap(scene.environment);
    }
  });

  if (!envMap) return null;
  
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const { factor: perfFactor } = usePerformance();
  const baseBlur = isMobile ? 0.8 : 0.4;
  const adjustedBlur = baseBlur + (1 - perfFactor) * 0.2;
  
  // NEW: Fallback for low performance devices. 
  // When perfFactor is below 0.5, use a simpler material and optionally disable shadows.
  if (perfFactor < 0.5) {
    return (
      <group>
        <mesh
          castShadow={false} // Disable shadows to improve performance further.
          geometry={props.geometry}
          position={props.position}
          rotation={props.rotation}
          scale={props.scale}
        >
          <meshStandardMaterial 
            color="#ccc"       // A simple, neutral color
            roughness={0.6}    // Adjust roughness as needed
            metalness={0.2}    // Lower metalness keeps it simple
          />
        </mesh>
      </group>
    );
  }
  
  return (
    <group>
      <mesh
        castShadow
        geometry={props.geometry}
        position={props.position}
        rotation={props.rotation}
        scale={props.scale}
      >
        <MeshRefractionMaterial as any
          envMap={envMap}
          {...config} 
          toneMapped={false}
          // @ts-ignore: blur prop is not defined in the MeshRefractionMaterial type
          blur={adjustedBlur}
          flatShading={perfFactor < 0.7} // Enable flat shading when performance is lower
        />
      </mesh>
    </group>
  );
}

function extractMeshes(node: THREE.Object3D, meshes: THREE.Mesh[] = []): THREE.Mesh[] {
  if ((node as THREE.Mesh).isMesh) {
    meshes.push(node as THREE.Mesh);
  }
  node.children.forEach(child => extractMeshes(child, meshes));
  return meshes;
}

// NEW: AnimatedStandardMaterial component to gradually animate the color change
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

function RingModel({ modelPath, selectedBandColor }: { modelPath: string, selectedBandColor: string }) {
  const gltf = useGLTF(modelPath) as unknown as { nodes: { [key: string]: THREE.Mesh | THREE.Object3D } };
  const { nodes } = gltf;
  const ringRef = useRef<THREE.Group>(null!);

  // Unchanged: visibility controls for each node
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
    'Rose Gold': { color: '#d1b0aa', metalness: 1, roughness: 0.2 },
    'White Gold': { color: '#E8E8E8', metalness: 1, roughness: 0.15 },
    'Platinum': { color: '#E5E4E2', metalness: 1, roughness: 0.1 }
  };

  // Removed the Leva controls for band material.
  // Instead, select the band material using the passed prop.
  const selectedMaterial = bandMaterials[selectedBandColor as keyof typeof bandMaterials];

  if (!nodes) return null;
  
  // Differentiate nodes based on the material's gltfExtensions.
  const bandNodes: THREE.Mesh[] = [];
  const gemNodes: THREE.Mesh[] = [];
  
  for (const [_, node] of Object.entries(nodes)) {
    if (node instanceof THREE.Mesh) {
      const material = node.material instanceof THREE.Material ? node.material : undefined;
      if (material?.userData?.gltfExtensions?.WEBGI_materials_diamond) {
        gemNodes.push(node);
      } else {
        bandNodes.push(node);
      }
    }
  }

  return (
    <group ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
      {bandNodes.map((node, index) => (
        visibilityControls[node.name] && (
          <mesh 
            key={index}
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
      
      {gemNodes.map((gem, index) => (
        visibilityControls[gem.name] && (
          <Diamond
            key={index}
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

interface RingViewerProps {
  models: string[];
  selectedModel: string;
  category: string;
}

export default function RingViewer({ models, selectedModel, category }: RingViewerProps) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const isSafari =
    typeof navigator !== "undefined" &&
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const { factor } = usePerformance();
  
  const [showLeva, setShowLeva] = useState(false);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setShowLeva(prev => !prev);
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // NEW: Add state for the selected band color
  const [selectedBandColor, setSelectedBandColor] = useState("Yellow Gold");

  // NEW: State to toggle band color selector visibility
  const [showBandSelector, setShowBandSelector] = useState(true);

  // NEW: Pre‑test to measure device performance (average FPS) before rendering the main scene,
  // also tracking a progress value (0 to 100).
  const [initialFps, setInitialFps] = useState<number | null>(null);
  const [preTestProgress, setPreTestProgress] = useState<number>(0);
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

  // Compute locked quality based solely on the pre-test result.
  const lockedLowFps = initialFps !== null ? initialFps < 30 : false;

  const quality = {
    dpr: factor < 0.5 ? 1 : ([1, 2] as [number, number]),
    shadowMapSize: factor < 0.5 ? 4 : 8,
    envMapResolution: factor < 0.5 ? 8 : 6,
  };

  // NEW: Lower render resolution based on the locked quality setting.
  const computedDpr = lockedLowFps ? 0.8 : quality.dpr;

  // NEW: Define band options with their respective colors
  const bandOptions = [
    { name: "Yellow Gold", color: "#ffdc73" },
    { name: "Rose Gold", color: "#B76E79" },
    { name: "White Gold", color: "#E8E8E8" },
    { name: "Platinum", color: "#E5E4E2" }
  ];

  // Hardcoded HDR settings: intensity 2.2 and blur 0
  const hdrIntensity = 2.2;
  const hdrBlur = 0;
  // NEW: Lower light intensity based on the locked quality setting.
  const effectiveEnvironmentIntensity = lockedLowFps ? 1.5 : hdrIntensity;

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      
      <div
        style={{
          position: "absolute",
          ...(isMobile 
            ? {
                top: "20px",
                right: "20px",
                transform: "translateX(0)"
              }
            : {
                bottom: "20px",
                left: "20px"
              }
          ),
          width: isMobile ? "90%" : "260px",
          maxWidth: isMobile ? "200px" : "260px",
          background: "#dcd1c7",
          backdropFilter: "blur(10px)",
          color: "#000",
          padding: isMobile ? "10px" : "20px",
          boxSizing: "border-box",
          zIndex: 10,
          borderRadius: "12px",
          transition: "transform 0.3s ease"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {!isMobile && (
            <>
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.5em",
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
            </>
          )}
        </div>
        <div
          style={{
            maxHeight: showBandSelector ? (isMobile ? "50px" : "300px") : "0px",
            overflow: "hidden",
            transition: "max-height 0.3s ease",
            marginTop: isMobile ? "0" : "20px",
            display: "flex",
            flexDirection: isMobile ? "row" : "column",
            gap: isMobile ? "10px" : "0",
            alignItems: isMobile ? "center" : "stretch"
          }}
        >
          {bandOptions.map((band) => (
            <button
              key={band.name}
              onClick={() => setSelectedBandColor(band.name)}
              style={{
                ...(isMobile 
                  ? {
                      width: "30px",
                      height: "30px",
                      padding: 0,
                      margin: 0
                    }
                  : {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      padding: "12px 0",
                      margin: "10px 0"
                    }
                ),
                background: selectedBandColor === band.name ? band.color : "transparent",
                color: selectedBandColor === band.name ? "#fff" : "#000",
                border: `2px solid ${selectedBandColor === band.name ? darkenColor(band.color) : band.color}`,
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

      {/* Unchanged: Canvas and its configuration */}
      <Canvas 
        dpr={computedDpr}
        camera={{ position: [22, 31, 23], fov: 50 }}
        gl={{ antialias: !lockedLowFps, precision: isSafari ? "mediump" : "highp" }}
        style={{ background: 'white' }}
        onCreated={(state) => {
          const { gl } = state;
          if (isSafari) {
            const glContext = gl.getContext ? gl.getContext() : (gl as any).context;
            if (glContext) {
              const originalGetShaderPrecisionFormat = glContext.getShaderPrecisionFormat.bind(glContext);
              glContext.getShaderPrecisionFormat = (shaderType: any, precisionType: any) => {
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
        <Environment 
          files="/studio.hdr" 
          background={false}
          environmentIntensity={effectiveEnvironmentIntensity}
          blur={hdrBlur}
        />

        <Suspense fallback={null}>
          <PerformanceMonitor
            bounds={(fps) => [50, 60]}
            ms={500}
            iterations={5}
            step={0.2}
          >
            <RingModel key={selectedModel} modelPath={`/3d/${category}/${selectedModel}.glb`} selectedBandColor={selectedBandColor} />
          </PerformanceMonitor>
        </Suspense>

        <OrbitControls enablePan={false} minDistance={15} maxDistance={50}  />
        
        <Stats />

      </Canvas>
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

      {/* NEW: Combined loader overlay */}
      <CombinedLoader preTestProgress={preTestProgress} />
    </div>
  );
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