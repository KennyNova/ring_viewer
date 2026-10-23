"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import type { RingScene } from "./scenes";

/**
 * Lighting built from light panels instead of a photographed HDR, rendered once per scene into
 * the environment cube map that the metal and diamonds reflect.
 *
 * Polished metal only looks real when it reflects contrast: bright sources cut by darker areas.
 * A uniformly lit room (what the old studio.hdr was) makes gold read as flat yellow plastic.
 */
function Backdrop({ backdrop }: { backdrop: RingScene["backdrop"] }) {
  // Large inverted sphere graded from overhead, through the horizon, to below
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          top: { value: new THREE.Color(backdrop.top) },
          horizon: { value: new THREE.Color(backdrop.horizon) },
          bottom: { value: new THREE.Color(backdrop.bottom) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 top;
          uniform vec3 horizon;
          uniform vec3 bottom;
          varying vec3 vDir;
          void main() {
            float y = vDir.y;
            vec3 color = y > 0.0
              ? mix(horizon, top, smoothstep(0.0, 0.85, y))
              : mix(horizon, bottom, smoothstep(0.0, 0.5, -y));
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    [backdrop]
  );
  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh material={material} scale={50}>
      <sphereGeometry args={[1, 64, 32]} />
    </mesh>
  );
}

/** Each scene's exposure, applied to the renderer. */
function Exposure({ value }: { value: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
}

export default function SceneEnvironment({ scene }: { scene: RingScene }) {
  return (
    <>
      <Exposure value={scene.exposure} />
      {/* Keyed so a new scene re-renders the cube map (frames={1} only renders once otherwise) */}
      <Environment key={scene.id} resolution={512} frames={1} background={false}>
        <Backdrop backdrop={scene.backdrop} />
        {scene.lights.map((light, i) => (
          <Lightformer
            key={i}
            form={light.form}
            color={light.color ?? "#ffffff"}
            intensity={light.intensity}
            scale={light.scale}
            position={light.position}
          />
        ))}
      </Environment>
    </>
  );
}
