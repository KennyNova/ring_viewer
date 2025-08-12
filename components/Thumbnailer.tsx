import { useRef, useState, useEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Component to capture a single well-positioned thumbnail of a ring
 */
function Thumbnailer({
  enabled,
  onComplete,
  orbitControlsRef,
  category,
  model,
  onError
}: {
  enabled: boolean;
  onComplete?: (success: boolean) => void;
  orbitControlsRef: React.RefObject<any>;
  category: string;
  model: string;
  onError?: (error: string) => void;
}) {
  const { gl, scene, camera } = useThree();
  const [captureComplete, setCaptureComplete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [originalCameraPosition, setOriginalCameraPosition] = useState<THREE.Vector3 | null>(null);
  const [originalControlsState, setOriginalControlsState] = useState<any>(null);
  
  // Store original camera settings before capture
  useEffect(() => {
    if (enabled && !captureComplete && !isSaving) {
      // Store original camera position and controls state
      if (camera) {
        setOriginalCameraPosition(camera.position.clone());
      }
      
      if (orbitControlsRef.current) {
        setOriginalControlsState({
          minPolarAngle: orbitControlsRef.current.minPolarAngle,
          maxPolarAngle: orbitControlsRef.current.maxPolarAngle
        });
      }
      
      setIsSaving(true);
      captureAndSaveThumbnail();
    }
  }, [enabled, captureComplete, camera]);
  
  // Restore original camera settings after capture
  useEffect(() => {
    if (captureComplete && originalCameraPosition && camera) {
      // Restore camera to original position
      camera.position.copy(originalCameraPosition);
      camera.lookAt(0, 0, 0);
      
      // Restore controls to original state
      if (orbitControlsRef.current && originalControlsState) {
        orbitControlsRef.current.minPolarAngle = originalControlsState.minPolarAngle;
        orbitControlsRef.current.maxPolarAngle = originalControlsState.maxPolarAngle;
        orbitControlsRef.current.update();
      }
    }
  }, [captureComplete, originalCameraPosition, originalControlsState, camera]);
  
  const captureAndSaveThumbnail = useCallback(async () => {
    if (!orbitControlsRef.current || !enabled) return;

    try {
      // Set camera to a good position for thumbnail capturing
      // This position shows the ring from a slightly elevated front view
      const radius = 30;
      
      // Position the camera at a nice angle for thumbnails
      // Phi around -0.35 radians (front-right view) 
      // Theta around 1.2 radians (slightly elevated)
      const phi = -0.35;
      const theta = 1.2;

      // Convert spherical to cartesian coordinates
      const x = radius * Math.sin(theta) * Math.cos(phi);
      const y = radius * Math.cos(theta);
      const z = radius * Math.sin(theta) * Math.sin(phi);
      
      // Set camera position
      camera.position.set(x, y, z);
      camera.lookAt(0, 0, 0);
      
      // Force OrbitControls to update
      orbitControlsRef.current.update();
      
      // Render scene with new camera position
      gl.render(scene, camera);
      
      // Capture screenshot in PNG format for best quality
      const screenshot = gl.domElement.toDataURL('image/png', 1.0);

      // Remove extension from model name if needed
      const modelName = model.replace(/\.(glb|3dm)$/, '');
      
      // Save the screenshot to the server
      const response = await fetch('/api/save-thumbnail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category,
          model: modelName,
          imageData: screenshot,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save thumbnail');
      }
      
      console.log('Thumbnail saved successfully:', result.path);
      
      // Mark as complete
      setCaptureComplete(true);
      setIsSaving(false);
      if (onComplete) onComplete(true);
    } catch (error) {
      console.error('Error capturing or saving thumbnail:', error);
      setIsSaving(false);
      if (onError) onError(error instanceof Error ? error.message : String(error));
      if (onComplete) onComplete(false);
    }
  }, [gl, scene, camera, orbitControlsRef, enabled, category, model, onComplete, onError]);
  
  // Render UI overlay showing progress
  return enabled && isSaving ? (
    <Html position={[0, 0, 0]} center>
      <div style={{
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '10px 20px',
        borderRadius: '5px',
        fontFamily: 'Arial, sans-serif',
        pointerEvents: 'none'
      }}>
        {captureComplete 
          ? "Thumbnail saved successfully!"
          : "Capturing thumbnail..."
        }
      </div>
    </Html>
  ) : null;
}

export default Thumbnailer; 