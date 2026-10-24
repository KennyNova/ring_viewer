"use client";

import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { RingPart } from "./classify";
import {
  captureGemShape,
  createDiamondMaterial,
  updateDiamondUniforms,
  type DiamondQuality,
} from "./diamond";

interface GemProps {
  part: RingPart;
  quality: DiamondQuality;
  /** Cube map edge length; small melee stones get away with very little. */
  resolution: number;
}

export default function Gem({ part, quality, resolution }: GemProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const meshRef = useRef<THREE.Mesh>(null!);
  const [material, setMaterial] = useState<THREE.ShaderMaterial | null>(null);

  // The shape map and material are created in the effect that also disposes them, not in useMemo.
  // React Strict Mode (dev) mounts, unmounts and remounts every component; with useMemo the
  // remount reused the render target the first unmount had just disposed, which comes back empty
  // and left every stone looking flat grey in `npm run dev` (production was unaffected).
  useEffect(() => {
    const shape = captureGemShape(gl, part.geometry, resolution);
    const next = createDiamondMaterial(shape, quality);
    setMaterial(next);
    return () => {
      next.dispose();
      shape.target.dispose();
    };
  }, [gl, part.geometry, resolution, quality]);

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
        updateDiamondUniforms(material, meshRef.current, camera, scene.environment)
      }
    />
  );
}
