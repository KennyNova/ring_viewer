"use client";

import { useEffect, useMemo, useRef } from "react";
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

  const { material, shape } = useMemo(() => {
    const shape = captureGemShape(gl, part.geometry, resolution);
    return { shape, material: createDiamondMaterial(shape, quality) };
  }, [gl, part.geometry, resolution, quality]);

  useEffect(
    () => () => {
      material.dispose();
      shape.target.dispose();
    },
    [material, shape]
  );

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
