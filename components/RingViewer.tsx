"use client";

import { useEffect, useRef, Suspense } from "react";
import * as THREE from "three";
import { Canvas, useThree, useLoader } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  useGLTF,
  CubeCamera,
  Caustics,
  MeshRefractionMaterial
} from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useControls } from "leva";
import { RGBELoader } from "three-stdlib";

function Diamond(props: any) {
  const ref = useRef<THREE.Mesh>(null);
  const texture = useLoader(RGBELoader, "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/aerodynamics_workshop_1k.hdr");
  
  // Optional controls for tweaking material properties via leva
  const config = useControls({
    bounces: { value: 3, min: 0, max: 8, step: 1 },
    aberrationStrength: { value: 0.01, min: 0, max: 0.1, step: 0.01 },
    ior: { value: 2.75, min: 0, max: 10 },
    fresnel: { value: 1, min: 0, max: 1 },
    color: "white"
  });

  return (
    <CubeCamera resolution={256} frames={1} envMap={texture}>
      {(envMap) => (
        // <Caustics
        //   color={config.color}
        //   position={props.position}
        //   lightSource={[5, 5, -10]}
        //   worldRadius={0.1}
        //   ior={1.8}
        //   intensity={0.1}
        //   backside
        //   causticsOnly
        // >
          <mesh
            ref={ref}
            castShadow
            geometry={props.geometry}
            position={[0, 0, 0]}
            rotation={props.rotation}
            scale={props.scale}
          >
            <MeshRefractionMaterial 
              envMap={envMap} 
              {...config} 
              toneMapped={false}
              // thickness={1.5}
            />
          </mesh>
        // </Caustics>
      )}
    </CubeCamera>
  );
}

function RingModel() {
  const { nodes } = useGLTF("/ring.glb") as unknown as {
    nodes: {
      [key: string]: THREE.Mesh | THREE.Object3D;
    }
  };
  const ringRef = useRef<THREE.Group>(null!);

  if (!nodes) return null;

  // Find the band (the mesh with COLOR in its name)
  const bandNode = Object.values(nodes).find(
    node => node instanceof THREE.Mesh && node.name.includes('COLOR')
  ) as THREE.Mesh;

  // Find all diamond parts (meshes starting with PART0001)
  const gemNodes = Object.values(nodes).filter(
    node => node instanceof THREE.Mesh && node.name.startsWith('PART0001')
  ) as THREE.Mesh[];

  if (!bandNode?.geometry) {
    console.error("Failed to load ring band");
    return null;
  }

  return (
    <group ref={ringRef}>
      {/* Band material */}
      <mesh geometry={bandNode.geometry}>
        <meshStandardMaterial color="#FFD700" metalness={1} roughness={0.2} />
      </mesh>
      
      {/* Gems */}
      {gemNodes.map((gem, index) => (
        <Diamond
          key={index}
          geometry={gem.geometry}
          position={gem.position.toArray()}
          rotation={[gem.rotation.x, gem.rotation.y, gem.rotation.z]}
          scale={gem.scale.toArray()}
        />
      ))}
    </group>
  );
}

export default function RingViewer() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas camera={{ position: [0, 0, 2], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={2} shadow-mapSize={2048} />
        
        <Environment files="/studio.exr"  />

        <Suspense fallback={null}>
          <RingModel />
          <EffectComposer>
            <Bloom intensity={1.5} luminanceThreshold={0.9} kernelSize={3} />
          </EffectComposer>
        </Suspense>

        <OrbitControls enablePan={false} minDistance={15} maxDistance={50}  />
      </Canvas>
    </div>
  );
}