"use client";

import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { RingPart } from "./classify";
import { buildGemShape, createDiamondMaterial, updateDiamondUniforms, type DiamondQuality } from "./diamond";

interface GemProps {
  part: RingPart;
  quality: DiamondQuality;
}

export default function Gem({ part, quality }: GemProps) {
  const scene = useThree((s) => s.scene);
  const meshRef = useRef<THREE.Mesh>(null!);
  const [material, setMaterial] = useState<THREE.ShaderMaterial | null>(null);

  // The facet texture and material are created in the effect that also disposes them, not in
  // useMemo: React Strict Mode (dev) mounts, unmounts and remounts every component, and with
  // useMemo the remount reused GPU resources the first unmount had already disposed.
  useEffect(() => {
    const shape = buildGemShape(part.geometry);
    const next = createDiamondMaterial(shape, quality);
    setMaterial(next);
    return () => {
      next.dispose();
      shape.planes.dispose();
    };
  }, [part.geometry, quality]);

  if (!material) return null;

  return (
    <mesh
      ref={meshRef}
      geometry={part.geometry}
      position={part.position}
      quaternion={part.quaternion}
      scale={part.scale}
      material={material}
      onBeforeRender={(_renderer, _scene, camera) =>
        updateDiamondUniforms(
          material,
          meshRef.current,
          camera,
          scene.environment,
          (scene.userData.gemStudio as THREE.Scene | undefined)?.environment ?? null
        )
      }
    />
  );
}
