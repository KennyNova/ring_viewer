import { useLoader, useThree } from '@react-three/fiber';
import { RGBELoader } from 'three-stdlib';
import * as THREE from 'three';
import { useEffect } from 'react';

export function PrecomputedEnvMap({ hdrPath }: { hdrPath: string }) {
  const { gl, scene } = useThree();
  const hdrEquirect = useLoader(RGBELoader, hdrPath);

  useEffect(() => {
    // Create and configure the PMREM generator.
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    pmremGenerator.compileEquirectangularShader();
    const envMap = pmremGenerator.fromEquirectangular(hdrEquirect).texture;
    
    // Set the environment map for the scene (or you could provide it to specific materials)
    scene.environment = envMap;
    
    // Optionally, set it as background if needed:
    // scene.background = envMap;
    
    // Always dispose of the PMREM generator once done.
    return () => {
      pmremGenerator.dispose();
    };
  }, [hdrEquirect, gl, scene]);

  return null;
} 