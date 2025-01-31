"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {EffectComposer}  from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { Suspense, useState, useMemo } from "react";
import {
  Mesh,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  FrontSide,
  Color,
  Vector3,
  DoubleSide,
  Vector2,
  OctahedronGeometry,
} from "three";
import { useGLTF } from "@react-three/drei";

interface RingGLTF {
  nodes: {
    [key: string]: Mesh;
  };
  materials: {
    [key: string]: MeshStandardMaterial;
  };
}

// Add color mapping for different band options
const bandColors = {
  gold: { color: "#FFD700", metalness: 1, roughness: 0.2 },
  "rose gold": { color: "#B76E79", metalness: 1, roughness: 0.2 },
  "white gold": { color: "#E8E8E8", metalness: 1, roughness: 0.2 },
  platinum: { color: "#E5E4E2", metalness: 1, roughness: 0.25 },
};

function Ring({ selectedColor = "gold" }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#CCCCCC");

    // Camera setup
    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.OrthographicCamera(
      -5 * aspect,
      5 * aspect,
      5,
      -5,
      0.1,
      100
    );
    camera.position.set(0, 0, 10);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // Lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 10, 10);
    scene.add(light);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Band material
    const bandMaterial = new THREE.MeshStandardMaterial({
      ...bandColors[selectedColor as keyof typeof bandColors],
    });

    // Diamond material and geometry
    const diamondGeometry = new THREE.OctahedronGeometry(2, 3);
    const diamondMaterial = new THREE.MeshPhysicalMaterial({
      color: "#CFD3D9",
      roughness: 0,
      metalness: 0,
      transmission: 1,
      ior: 2.42,
      thickness: 0.5,
    });

    const diamond = new THREE.Mesh(diamondGeometry, diamondMaterial);
    scene.add(diamond);

    // Post-processing
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1,
      0.995,
      0.5
    );
    composer.addPass(bloomPass);

    // Animation loop
    const animate = () => {
      composer.render();
      requestAnimationFrame(animate);
    };

    animate();

    // Handle window resize
    const handleResize = () => {
      const aspect = window.innerWidth / window.innerHeight;
      camera.left = -5 * aspect;
      camera.right = 5 * aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, [selectedColor]);

  return <div ref={mountRef} className="w-screen h-screen" />;
}

export default function RingViewer() {
  const [selectedColor, setSelectedColor] = useState<string>("gold");

  return (
    <div className="fixed inset-0 min-h-screen bg-[#CCCCCC]">
      <div className="absolute top-4 left-4 z-10 flex gap-2 bg-white/80 p-3 rounded-lg">
        {Object.entries(bandColors).map(([color, properties]) => (
          <button
            key={color}
            onClick={() => setSelectedColor(color)}
            className={`w-8 h-8 rounded-full transition-transform hover:scale-110 relative group ${
              selectedColor === color ? "ring-2 ring-blue-500 ring-offset-2" : ""
            }`}
            style={{
              background: properties.color,
            }}
          >
            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-sm text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {color.charAt(0).toUpperCase() + color.slice(1)}
            </span>
          </button>
        ))}
      </div>
      <Ring selectedColor={selectedColor} />
    </div>
  );
}