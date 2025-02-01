"use client";

import { useEffect, useRef, Suspense } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

function DiamondMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0,
    metalness: 0,
    transmission: 1,
    ior: 2.42,
    envMapIntensity: 3,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    specularIntensity: 50,
    specularColor: new THREE.Color(0xffffff)
  });
}

function RingModel() {
  const { nodes } = useGLTF("/ring.glb") as unknown as {
    nodes: {
      band: THREE.Mesh;
      diamonds: THREE.Group & { children: THREE.Mesh[] };
    }
  };
  console.log(nodes);
  const ringRef = useRef<THREE.Group>(null!);

  return (
    <group ref={ringRef}>
      {/* Band material */}
      <mesh geometry={nodes.band.geometry}>
        <meshStandardMaterial
          color="#FFD700"
          metalness={1}
          roughness={0.2}
        />
      </mesh>
      
      {/* Diamonds */}
      {nodes.diamonds.children.map((diamond, index) => (
        <mesh
          key={index}
          geometry={(diamond as THREE.Mesh).geometry}
          material={DiamondMaterial()}
        />
      ))}
    </group>
  );
}

export default function RingViewer() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [0, 0, 2], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={2}
          shadow-mapSize={2048}
        />
        
        <Environment 
          files="/studio.exr"
          background
        />

        <Suspense fallback={null}>
          <RingModel />
          <EffectComposer>
            <Bloom
              intensity={1.5}
              luminanceThreshold={0.9}
              kernelSize={3}
            />
          </EffectComposer>
        </Suspense>

        <OrbitControls
          enablePan={false}
          minDistance={1}
          maxDistance={3}
          autoRotate
        />
      </Canvas>
    </div>
  );
}