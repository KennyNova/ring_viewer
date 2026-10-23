"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useLoader } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { classifyRing, type ClassifiedRing, type RingPart } from "./classify";
import { metalByName } from "./metals";
import Gem from "./Gem";
import type { DiamondQuality } from "./diamond";

interface RingModelProps {
  url: string;
  primaryMetal: string;
  accentMetal: string;
  quality: DiamondQuality;
  onAnalyzed?: (info: { hasAccent: boolean; gemCount: number; size: THREE.Box3 }) => void;
}

/** Standard material that eases toward a new metal colour instead of snapping. */
function MetalMaterial({ metal }: { metal: string }) {
  const ref = useRef<THREE.MeshStandardMaterial>(null!);
  const { color, roughness } = metalByName(metal);
  const target = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    target.set(color);
  }, [color, target]);

  useFrame((_, delta) => {
    ref.current?.color.lerp(target, Math.min(1, delta * 4));
  });

  return <meshStandardMaterial ref={ref} color={color} metalness={1} roughness={roughness} envMapIntensity={1} />;
}

function MetalParts({ parts, metal }: { parts: RingPart[]; metal: string }) {
  return (
    <>
      {parts.map((part) => (
        <mesh
          key={part.key}
          geometry={part.geometry}
          position={part.position}
          quaternion={part.quaternion}
          scale={part.scale}
        >
          <MetalMaterial metal={metal} />
        </mesh>
      ))}
    </>
  );
}

function ClassifiedModel({ ring, primaryMetal, accentMetal, quality, onAnalyzed }: Omit<RingModelProps, "url"> & { ring: ClassifiedRing }) {
  const groupRef = useRef<THREE.Group>(null!);

  // Centre stones get a sharp cube map; pavé/melee stones are tiny on screen.
  const largestGem = Math.max(0, ...ring.gems.map((g) => g.radius));
  const resolutionFor = (gem: RingPart) => {
    const isFeature = gem.radius > largestGem * 0.45;
    if (quality === "high") return isFeature ? 256 : 64;
    return isFeature ? 128 : 32;
  };

  useEffect(() => {
    groupRef.current.updateWorldMatrix(true, true);
    onAnalyzed?.({
      hasAccent: ring.accentMetal.length > 0,
      gemCount: ring.gems.length,
      size: new THREE.Box3().setFromObject(groupRef.current),
    });
  }, [ring, onAnalyzed]);

  return (
    <group ref={groupRef} quaternion={ring.uprighting}>
      <MetalParts parts={ring.primaryMetal} metal={primaryMetal} />
      <MetalParts parts={ring.accentMetal} metal={accentMetal} />
      {ring.gems.map((gem) => (
        <Gem key={gem.key} part={gem} quality={quality} resolution={resolutionFor(gem)} />
      ))}
    </group>
  );
}

function GLBModel(props: RingModelProps) {
  const { scene } = useGLTF(props.url);
  const ring = useMemo(() => classifyRing(scene), [scene]);
  return <ClassifiedModel {...props} ring={ring} />;
}

function OBJModel(props: RingModelProps) {
  const group = useLoader(OBJLoader, props.url);
  const ring = useMemo(() => classifyRing(group), [group]);
  return <ClassifiedModel {...props} ring={ring} />;
}

export default function RingModel(props: RingModelProps) {
  return props.url.toLowerCase().endsWith(".obj") ? <OBJModel {...props} /> : <GLBModel {...props} />;
}
