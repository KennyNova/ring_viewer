import React, { useState, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface PhotosphereViewerProps {
  images: Array<{
    url: string;
    h: number;
    v: number;
  }>;
  onClose: () => void;
}

function ImageDisplay({ images }: { images: PhotosphereViewerProps['images'] }) {
  const { camera } = useThree();
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [nextImage, setNextImage] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0);
  const currentTextureRef = React.useRef<THREE.Texture | null>(null);
  const nextTextureRef = React.useRef<THREE.Texture | null>(null);
  const currentMeshRef = React.useRef<THREE.Mesh>(null);
  const nextMeshRef = React.useRef<THREE.Mesh>(null);
  const transitionInProgress = React.useRef(false);
  const groupRef = React.useRef<THREE.Group>(null);
  const targetZoom = React.useRef(1);
  const currentZoom = React.useRef(1);
  
  // Add texture cache to store preloaded textures
  const textureCache = React.useRef<Map<string, THREE.Texture>>(new Map());
  // Keep track of last camera position to determine movement direction
  const lastCameraPosition = React.useRef<THREE.Vector3>(new THREE.Vector3());
  // Track camera velocity for prediction
  const cameraVelocity = React.useRef<THREE.Vector3>(new THREE.Vector3());
  // Track preloading status
  const preloadingInProgress = React.useRef<Set<string>>(new Set());
  // Maximum cache size - increased to handle more images
  const MAX_CACHE_SIZE = 24;

  // Function to preload an image and store in cache
  const preloadImage = (url: string) => {
    // Skip if already in cache or currently preloading
    if (textureCache.current.has(url) || preloadingInProgress.current.has(url)) {
      return;
    }
    
    preloadingInProgress.current.add(url);
    
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (texture) => {
        // Add to cache if not full
        if (textureCache.current.size >= MAX_CACHE_SIZE) {
          // Remove oldest entry (first key) if cache is full
          const firstKey = textureCache.current.keys().next().value;
          if (firstKey) { // Add null check for TypeScript
            const texture = textureCache.current.get(firstKey);
            if (texture && firstKey !== currentImage && firstKey !== nextImage) {
              texture.dispose();
              textureCache.current.delete(firstKey);
            }
          }
        }
        
        textureCache.current.set(url, texture);
        preloadingInProgress.current.delete(url);
      },
      undefined, // onProgress callback not needed
      (error) => {
        console.error("Error preloading texture:", error);
        preloadingInProgress.current.delete(url);
      }
    );
  };

  // Function to predict which images will be needed next based on camera movement
  const predictNextImages = () => {
    if (!camera || images.length === 0) return;
    
    // Calculate camera movement velocity
    const currentPosition = camera.position.clone();
    cameraVelocity.current.subVectors(currentPosition, lastCameraPosition.current);
    lastCameraPosition.current.copy(currentPosition);
    
    // Calculate current camera spherical coordinates
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    // Convert current camera position to spherical coordinates
    const phi = Math.atan2(camera.position.z, camera.position.x);
    const theta = Math.acos(camera.position.y / camera.position.length());
    
    // Convert to the same units as our image coordinates
    // Adjust for 24 horizontal positions (0-23) and 12 vertical positions (0-11)
    const currentH = ((phi / (Math.PI * 2)) * 24 + 24) % 24;
    const currentV = (theta / Math.PI) * 12;
    
    // Convert velocity to h,v space to predict direction
    const spherical = new THREE.Spherical().setFromVector3(cameraVelocity.current);
    const phiVelocity = spherical.phi;
    const thetaVelocity = spherical.theta;
    
    // Predict h,v movement direction
    const hVelocity = (phiVelocity / (Math.PI * 2)) * 24;
    const vVelocity = (thetaVelocity / Math.PI) * 12;
    
    // Find images in predicted direction (weighted by distance and alignment with camera movement)
    const candidateImages = images.map(img => {
      // Calculate base distance - handling wraparound for horizontal position
      const dh = Math.min(Math.abs(img.h - currentH), 24 - Math.abs(img.h - currentH));
      const dv = Math.abs(img.v - currentV);
      const distance = Math.sqrt(dh * dh + dv * dv);
      
      // Calculate direction alignment with camera movement
      const deltaH = ((img.h - currentH + 24) % 24) > 12 ? (img.h - currentH - 24) : (img.h - currentH);
      const deltaV = img.v - currentV;
      
      // Higher score for images in direction of movement
      const directionAlignment = 
        (Math.sign(hVelocity) === Math.sign(deltaH) ? 1.5 : -0.2) + 
        (Math.sign(vVelocity) === Math.sign(deltaV) ? 1.5 : -0.2);
      
      // Calculate score - lower is better
      // Images in the direction of camera movement get priority
      let score = distance / (directionAlignment + 1.1);
      
      // If very close to an image, prioritize adjacent images for smoother transitions
      if (distance < 1) {
        // Find adjacent images
        const isAdjacent = (
          (Math.abs(deltaH) <= 1 || Math.abs(deltaH) >= 23) && // Adjacent horizontally (including wraparound)
          Math.abs(deltaV) <= 1                                // Adjacent vertically
        );
        
        if (isAdjacent) {
          score *= 0.5; // Boost priority for adjacent images
        }
      }
      
      return { img, score, url: img.url };
    });
    
    // Sort by score and preload top candidates
    candidateImages.sort((a, b) => a.score - b.score);
    
    // Preload the best candidates (up to 8) - increased from 5 to handle more transition points
    const preloadLimit = 8;
    candidateImages.slice(0, preloadLimit).forEach(candidate => {
      preloadImage(candidate.url);
    });
  };

  // Function to find the closest image based on camera position
  const findClosestImage = () => {
    if (!camera || images.length === 0) return null;

    // Convert camera position to spherical coordinates
    const phi = Math.atan2(camera.position.z, camera.position.x);
    const theta = Math.acos(camera.position.y / camera.position.length());

    // Convert to the same units as our image coordinates
    // Updated to match the 24 horizontal steps and 12 vertical steps
    const h = ((phi / (Math.PI * 2)) * 24 + 24) % 24;
    const v = (theta / Math.PI) * 12;

    // Find the closest image
    let closestImage = images[0];
    let minDistance = Infinity;

    images.forEach(img => {
      // Calculate distance with wraparound handling for horizontal position
      const dh = Math.min(Math.abs(img.h - h), 24 - Math.abs(img.h - h));
      const dv = Math.abs(img.v - v);
      const distance = Math.sqrt(dh * dh + dv * dv);

      if (distance < minDistance) {
        minDistance = distance;
        closestImage = img;
      }
    });

    return closestImage.url;
  };

  // Update current image based on camera position and make images face camera
  useFrame((state, delta) => {
    // Preload prediction logic - run every frame for responsive preloading
    predictNextImages();
    
    // Existing image selection logic
    if (!transitionInProgress.current) {
      const closestImage = findClosestImage();
      if (closestImage !== currentImage && closestImage !== nextImage) {
        setNextImage(closestImage);
        transitionInProgress.current = true;
        setOpacity(0);
      }
    }

    // Update zoom with smooth transition
    if (currentZoom.current !== targetZoom.current) {
      const zoomDelta = (targetZoom.current - currentZoom.current) * delta * 4;
      currentZoom.current += zoomDelta;
    }

    // Make the group face the camera
    if (groupRef.current) {
      // Calculate the direction from the group to the camera
      const direction = new THREE.Vector3();
      camera.getWorldPosition(direction);
      direction.sub(groupRef.current.position);

      // Create a rotation matrix that looks at the camera
      const lookMatrix = new THREE.Matrix4();
      lookMatrix.lookAt(
        direction,
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 1, 0)
      );

      // Convert the matrix to a quaternion and apply it
      const quaternion = new THREE.Quaternion();
      quaternion.setFromRotationMatrix(lookMatrix);
      groupRef.current.quaternion.copy(quaternion);

      // Adjust the scale based on distance and zoom level
      const distance = direction.length();
      const scale = distance * 0.4 * currentZoom.current;
      groupRef.current.scale.set(scale, scale, scale);
    }

    // Update camera FOV based on zoom level
    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFOV = 50 / currentZoom.current;
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, delta * 4);
      camera.updateProjectionMatrix();
    }
  });

  // Handle wheel events for zoom
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const zoomDelta = event.deltaY * -0.001;
      targetZoom.current = THREE.MathUtils.clamp(
        targetZoom.current + zoomDelta,
        0.5,  // minimum zoom
        4.0   // maximum zoom
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Use + and - keys for zoom
      if (event.key === '+' || event.key === '=') {
        targetZoom.current = THREE.MathUtils.clamp(
          targetZoom.current + 0.1,
          0.5,
          4.0
        );
      } else if (event.key === '-' || event.key === '_') {
        targetZoom.current = THREE.MathUtils.clamp(
          targetZoom.current - 0.1,
          0.5,
          4.0
        );
      }
    };

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      window.addEventListener('keydown', handleKeyDown);
      
      return () => {
        canvas.removeEventListener('wheel', handleWheel);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, []);

  // Adjust aspect ratio based on screen dimensions
  useEffect(() => {
    const updateAspectRatio = () => {
      if (currentMeshRef.current && nextMeshRef.current) {
        const viewportAspect = window.innerWidth / window.innerHeight;
        
        // Use a standard 16:9 aspect ratio as base but adjust for viewport
        const aspectRatio = Math.min(16/9, viewportAspect); 
        
        // Update meshes with new geometry
        const width = 10; // Base width
        const height = width / aspectRatio;
        
        if (currentMeshRef.current.geometry) {
          currentMeshRef.current.geometry.dispose();
        }
        currentMeshRef.current.geometry = new THREE.PlaneGeometry(width, height);
        
        if (nextMeshRef.current.geometry) {
          nextMeshRef.current.geometry.dispose();
        }
        nextMeshRef.current.geometry = new THREE.PlaneGeometry(width, height);
      }
    };
    
    // Call initially
    updateAspectRatio();
    
    // Set up resize listener
    window.addEventListener('resize', updateAspectRatio);
    return () => window.removeEventListener('resize', updateAspectRatio);
  }, [currentImage, nextImage]); // Re-run when images change
  
  // Modified image transition logic to use cache
  useEffect(() => {
    if (nextImage && nextImage !== currentImage) {
      let texture: THREE.Texture | undefined;
      
      // Check if the texture is in the cache
      if (textureCache.current.has(nextImage)) {
        texture = textureCache.current.get(nextImage)!;
        nextTextureRef.current = texture;
        
        // Start transition immediately
        let startTime = performance.now();
        const duration = 300;
        
        function animate() {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          
          // Smooth easing function
          const eased = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          
          setOpacity(eased);
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            setCurrentImage(nextImage);
            if (currentTextureRef.current) {
              currentTextureRef.current.dispose();
            }
            currentTextureRef.current = nextTextureRef.current;
            transitionInProgress.current = false;
          }
        }
        
        requestAnimationFrame(animate);
      } else {
        // Fall back to loading if not in cache
        const loader = new THREE.TextureLoader();
        loader.load(nextImage, (loadedTexture) => {
          textureCache.current.set(nextImage, loadedTexture);
          nextTextureRef.current = loadedTexture;
          
          // Start transition after load
          let startTime = performance.now();
          const duration = 300;
          
          function animate() {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Smooth easing function
            const eased = progress < 0.5 
              ? 2 * progress * progress 
              : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            
            setOpacity(eased);
            
            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              setCurrentImage(nextImage);
              if (currentTextureRef.current) {
                currentTextureRef.current.dispose();
              }
              currentTextureRef.current = nextTextureRef.current;
              transitionInProgress.current = false;
            }
          }
          
          requestAnimationFrame(animate);
        });
      }
    }
  }, [nextImage, currentImage]);

  // Initial image load
  useEffect(() => {
    const firstImage = findClosestImage();
    if (firstImage) {
      const loader = new THREE.TextureLoader();
      loader.load(firstImage, (texture) => {
        currentTextureRef.current = texture;
        setCurrentImage(firstImage);
      });
    }

    // Pre-cache a few nearby images to improve initial experience
    setTimeout(() => {
      if (camera && images.length > 0) {
        predictNextImages();
      }
    }, 500);

    return () => {
      // Dispose current and next textures
      if (currentTextureRef.current) currentTextureRef.current.dispose();
      if (nextTextureRef.current) nextTextureRef.current.dispose();
      
      // Dispose all cached textures
      textureCache.current.forEach(texture => {
        texture.dispose();
      });
      textureCache.current.clear();
    };
  }, [images.length]);

  if (!currentImage || !currentTextureRef.current) return null;

  // Use a responsive aspect ratio based on image dimensions
  const aspectRatio = 16/9; // Default aspect ratio if we can't determine from texture
  
  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Current image mesh */}
      <mesh ref={currentMeshRef}>
        <planeGeometry args={[10, 10 / aspectRatio]} />
        <meshBasicMaterial 
          map={currentTextureRef.current}
          side={THREE.DoubleSide}
          transparent={true}
          opacity={1 - opacity}
        />
      </mesh>

      {/* Next image mesh (for transition) */}
      {nextImage && nextTextureRef.current && (
        <mesh ref={nextMeshRef}>
          <planeGeometry args={[10, 10 / aspectRatio]} />
          <meshBasicMaterial 
            map={nextTextureRef.current}
            side={THREE.DoubleSide}
            transparent={true}
            opacity={opacity}
          />
        </mesh>
      )}
    </group>
  );
}

const PhotosphereViewer: React.FC<PhotosphereViewerProps> = ({ images, onClose }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#000',
      position: 'relative'
    }}>
      <Canvas
        camera={{ position: [30, 0, 0], fov: 45 }}
        style={{ background: 'black' }}
      >
        <ImageDisplay images={images} />
        <OrbitControls 
          enableZoom={true}
          enablePan={false}
          minDistance={15}
          maxDistance={45}
          rotateSpeed={0.5}
          zoomSpeed={0.5}
          maxPolarAngle={Math.PI} // Allow viewing top of ring
          minPolarAngle={0}       // Allow viewing bottom of ring
          // Ensure proper initial target
          target={[0, 0, 0]}
        />
      </Canvas>
      
      <button 
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          border: '1px solid white',
          borderRadius: '4px',
          padding: '8px 16px',
          cursor: 'pointer',
          zIndex: 1000
        }}
      >
        Return to 3D View
      </button>
      
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        background: 'rgba(0,0,0,0.6)',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '4px',
        fontSize: '14px'
      }}>
        Zoom: Mouse wheel or +/- keys
      </div>
    </div>
  );
};

export default PhotosphereViewer; 