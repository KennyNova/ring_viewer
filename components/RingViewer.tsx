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
  const { scene } = useThree();
  
  const config = useControls('Diamond', {
    bounces: { value: 3, min: 0, max: 8, step: 1 },
    aberrationStrength: { value: 0.01, min: 0, max: 0.1, step: 0.01 },
    ior: { value: 2.75, min: 0, max: 10 },
    fresnel: { value: 1, min: 0, max: 1 },
    color: "white",
    transmission: { value: 1, min: 0, max: 1 },
    thickness: { value: 0.5, min: 0, max: 2 },
    roughness: { value: 0, min: 0, max: 1 },
    clearcoat: { value: 0.1, min: 0, max: 1 },
    clearcoatRoughness: { value: 0.1, min: 0, max: 1 },
    attenuationDistance: { value: 1, min: 0, max: 10 },
    attenuationColor: "#ffffff"
  });

  return (
    <group>
      <CubeCamera resolution={256} frames={1}>
        {(envMap) => (
          <mesh
            ref={ref}
            castShadow
            geometry={props.geometry}
            position={props.position}
            rotation={props.rotation}
            scale={props.scale}
          >
            <MeshRefractionMaterial 
              envMap={envMap} 
              {...config} 
              toneMapped={false}
            />
          </mesh>
        )}
      </CubeCamera>
    </group>
  );
}

function RingModel() {
  const { nodes } = useGLTF("/ring.glb") as unknown as {
    nodes: {
      [key: string]: THREE.Mesh | THREE.Object3D;
    }
  };
  const ringRef = useRef<THREE.Group>(null!);

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

  const bandNode = Object.values(nodes).find(
    node => node instanceof THREE.Mesh && node.name.includes('COLOR')
  ) as THREE.Mesh;

  const gemNodes = Object.values(nodes).filter(
    node => node instanceof THREE.Mesh && node.name.startsWith('PART0001')
  ) as THREE.Mesh[];

  if (!bandNode?.geometry) {
    console.error("Failed to load ring band");
    return null;
  }

  const selectedMaterial = bandMaterials[bandConfig.material as keyof typeof bandMaterials];

  return (
    <group ref={ringRef}>
      <mesh geometry={bandNode.geometry}>
        <meshStandardMaterial {...selectedMaterial} />
      </mesh>
      
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
        
        <Environment files="/studio.exr" background />

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