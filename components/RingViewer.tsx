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
  Stats
} from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useControls } from "leva";
import { RGBELoader } from "three-stdlib";
import React, { createContext, useContext, useState } from 'react';

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
  const cooldown = 1000;

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

function Diamond(props: any) {
  const ref = useRef<THREE.Mesh>(null);
  const { scene } = useThree();
  
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  
  const config = useControls('Diamond', {
    bounces: { value: 3, min: 0, max: 8, step: 1 },
    aberrationStrength: { value: 0.01, min: 0, max: 0.1, step: 0.01 },
    ior: { value: 2.75, min: 0, max: 10 },
    fresnel: { value: 1, min: 0, max: 1 },
    color: "white",
    transmission: { value: 0, min: 0, max: 1 },
    thickness: { value: 0.5, min: 0, max: 2 },
    roughness: { value: 0, min: 0, max: 1 },
    clearcoat: { value: 0.1, min: 0, max: 1 },
    clearcoatRoughness: { value: 0.1, min: 0, max: 1 },
    attenuationDistance: { value: 1, min: 0, max: 10 },
    attenuationColor: "#ffffff"
  });
  
  // Get the shared environment map from our provider
  const envMap = useDiamondEnvMap();
  // Get performance factor (1 means best performance)
  const { factor: perfFactor } = usePerformance();
  
  // Base blur value depends on mobile or desktop.
  const baseBlur = isMobile ? 0.8 : 0.4;
  // Adjust blur: if performance is lower (perfFactor near 0), add a bit more blur.
  const adjustedBlur = baseBlur + (1 - perfFactor) * 0.2;
  
  return (
    <group>
      <mesh
        ref={ref}
        castShadow
        geometry={props.geometry}
        position={props.position}
        rotation={props.rotation}
        scale={props.scale}
      >
        <MeshRefractionMaterial as any
          envMap={envMap!} 
          {...config} 
          toneMapped={false}
          // @ts-ignore: blur prop is not defined in the MeshRefractionMaterial type
          blur={adjustedBlur}
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

function RingModel() {
  const { nodes } = useGLTF("/ring.glb") as unknown as {
    nodes: {
      [key: string]: THREE.Mesh | THREE.Object3D;
    }
  };
  const ringRef = useRef<THREE.Group>(null!);

  // Add visibility controls for each node
  const meshNodes = Object.entries(nodes).filter(
    ([_, node]) => node instanceof THREE.Mesh
  );
  
  const visibilityControls = useControls('Node Visibility', 
    Object.fromEntries(
      meshNodes.map(([name, _]) => [
        name,
        true
      ])
    )
  );

  const bandMaterials = {
    'Yellow Gold': { color: '#FFD700', metalness: 1, roughness: 0.2 },
    'Rose Gold': { color: '#B76E79', metalness: 1, roughness: 0.2 },
    'White Gold': { color: '#E8E8E8', metalness: 1, roughness: 0.15 },
    'Platinum': { color: '#E5E4E2', metalness: 1, roughness: 0.1 }
  };

  const bandConfig = useControls('Band', {
    material: {
      options: Object.keys(bandMaterials)
    }
  });

  if (!nodes) return null;

  // Differentiate nodes based on the material's gltfExtensions.
  const bandNodes: THREE.Mesh[] = [];
  const gemNodes: THREE.Mesh[] = [];
  
  for (const [_, node] of Object.entries(nodes)) {
    if (node instanceof THREE.Mesh) {
      const material = node.material instanceof THREE.Material ? node.material : undefined;
      // Classify as diamond gem if the material has the WEBGI_materials_diamond extension.
      if (material?.userData?.gltfExtensions?.WEBGI_materials_diamond) {
        gemNodes.push(node);
      } else {
        bandNodes.push(node);
      }
    }
  }

  // Use the first band node as the primary ring band.
  const bandNode = bandNodes[0];
  if (!bandNode?.geometry) {
    console.error("Failed to load ring band");
    return null;
  }

  const selectedMaterial = bandMaterials[bandConfig.material as keyof typeof bandMaterials];

  return (
    <group ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
      {visibilityControls[bandNode.name] && (
        <mesh geometry={bandNode.geometry}>
          <meshStandardMaterial {...selectedMaterial} />
        </mesh>
      )}
      
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

export default function RingViewer() {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  // Detect Safari (exclude Chrome/Android)
  const isSafari =
    typeof navigator !== "undefined" &&
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const { factor } = usePerformance();
  
  // Scale quality based on performance factor
  const quality = {
    dpr: factor < 0.5 ? 1 : ([1, 2] as [number, number]),
    shadowMapSize: factor < 0.5 ? 1024 : 2048,
    envMapResolution: factor < 0.5 ? 128 : 256,
    bloomKernelSize: factor < 0.5 ? 1 : 3,
  };

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas 
        dpr={quality.dpr}
        camera={{ position: [0, -2, 0], fov: 50 }}
        gl={{ precision: isSafari ? "mediump" : "highp" }}  // Force lower precision on Safari to avoid shader errors
        onCreated={(state) => {
          const { gl } = state;
          if (isSafari) {
            // Access the underlying WebGL context
            const glContext = gl.getContext ? gl.getContext() : (gl as any).context;
            if (glContext) {
              const originalGetShaderPrecisionFormat = glContext.getShaderPrecisionFormat.bind(glContext);
              glContext.getShaderPrecisionFormat = (shaderType: any, precisionType: any) => {
                const result = originalGetShaderPrecisionFormat(shaderType, precisionType);
                if (result === null) {
                  // Return a dummy precision value to avoid errors
                  return { rangeMin: 0, rangeMax: 0, precision: 0 };
                }
                return result;
              };
            }
          }
        }}
      >
        <ambientLight intensity={0.15} />
        <directionalLight 
          position={[5, 5, 5]} 
          intensity={0.8} 
          shadow-mapSize={quality.shadowMapSize}
        />
        
        <Environment files="/studio.exr" background />

        <Suspense fallback={null}>
          <PerformanceMonitor
            bounds={(fps) => [50, 60]}
            ms={500}
            iterations={5}
            step={0.2}
          >
            <DiamondEnvMapProvider resolution={quality.envMapResolution}>
              <RingModel />
              {/* <EffectComposer>
                <Bloom 
                  intensity={isMobile ? 0.15 : 0.3} 
                  luminanceThreshold={0.95} 
                  luminanceSmoothing={0.9}
                  kernelSize={quality.bloomKernelSize}
                />
              </EffectComposer> */}
            </DiamondEnvMapProvider>
          </PerformanceMonitor>
        </Suspense>

        {!isMobile && <axesHelper args={[5]} />}
        <OrbitControls enablePan={false} minDistance={15} maxDistance={50} />
        
        <Stats />

      </Canvas>
    </div>
  );
}