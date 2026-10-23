"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import JSZip from "jszip";

export async function handleZipFile(file: File): Promise<{ url: string; h: number; v: number; }[]> {
  const images: { url: string; h: number; v: number; }[] = [];
  
  try {
    const jsZip = new JSZip();
    const zip = await jsZip.loadAsync(file);
    
    // Process all files in the zip
    for (const filename of Object.keys(zip.files)) {
      // Skip directories, readme, and HTML files
      if (zip.files[filename].dir || 
          filename.toLowerCase().endsWith('.md') || 
          filename.toLowerCase().endsWith('.html')) {
        continue;
      }
      
      try {
        // Check if this is a WebP or PNG image
        if (filename.toLowerCase().endsWith('.webp') || filename.toLowerCase().endsWith('.png')) {
          // Parse h and v values from filename (format: filename_h{h}_v{v}.webp or filename_h{h}_v{v}.png)
          const hMatch = filename.match(/_h(\d+)_/);
          const vMatch = filename.match(/_v(\d+)\./);
          
          if (hMatch && vMatch) {
            const h = parseInt(hMatch[1], 10);
            const v = parseInt(vMatch[1], 10);
            
            // Get image data as base64
            const zipEntry = zip.files[filename] as JSZip.JSZipObject;
            const blob = await zipEntry.async('blob');
            const url = URL.createObjectURL(blob);
            
            // Add to our images array
            images.push({ url, h, v });
          }
        }
      } catch (err) {
        console.error(`Error processing file ${filename}:`, err);
        // Continue with next file instead of failing the whole process
      }
    }
    
    // Sort images by h and v for consistent ordering
    images.sort((a, b) => {
      if (a.h !== b.h) return a.h - b.h;
      return a.v - b.v;
    });
    
    return images;
  } catch (error) {
    console.error("Error handling zip file:", error);
    throw error;
  }
}

/**
 * Component to automatically capture screenshots from multiple camera angles for photosphere creation
 */
export function PhotosphereCapturer({
  enabled,
  onComplete,
  resolution = 1024,
  horizontalSteps = 24,   // Doubled from 12 to 24 for smoother horizontal transitions
  verticalSteps = 12,     // Doubled from 6 to 12 for smoother vertical transitions
  orbitControlsRef,
  fileName = "photosphere"
}: {
  enabled: boolean;
  onComplete?: (screenshots: string[]) => void;
  resolution?: number;
  horizontalSteps?: number;
  verticalSteps?: number;
  orbitControlsRef: React.RefObject<any>;
  fileName?: string;
}) {
  const { gl, scene, camera } = useThree();
  const [currentH, setCurrentH] = useState(0);
  const [currentV, setCurrentV] = useState(0);
  const [captureComplete, setCaptureComplete] = useState(false);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [originalCameraPosition, setOriginalCameraPosition] = useState<THREE.Vector3 | null>(null);
  const [originalControlsState, setOriginalControlsState] = useState<any>(null);
  
  // Calculate total number of screenshots
  const totalShots = horizontalSteps * verticalSteps;
  const shotsRef = useRef<string[]>([]);

  // Store original camera settings before capture
  useEffect(() => {
    if (enabled && !captureComplete && !isCapturing) {
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
      
      setIsCapturing(true);
      startCapture();
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
  
  const startCapture = () => {
    // Reset state
    setCurrentH(0);
    setCurrentV(0);
    setCaptureComplete(false);
    shotsRef.current = [];
    setScreenshots([]);
    
    // Allow full vertical rotation to capture top of ring
    if (orbitControlsRef.current) {
      orbitControlsRef.current.minPolarAngle = 0;
      orbitControlsRef.current.maxPolarAngle = Math.PI;
      orbitControlsRef.current.update();
    }
    
    console.log(`Starting photosphere capture: ${horizontalSteps}x${verticalSteps} = ${totalShots} screenshots`);
  };
  
  const captureNextFrame = useCallback(() => {
    if (!orbitControlsRef.current || !enabled) return;
    
    // Calculate spherical coordinates for even distribution around a sphere
    const phi = (currentH / horizontalSteps) * Math.PI * 2; // horizontal angle (0 to 2π)
    
    // Adjust vertical calculation to ensure we capture the full sphere, including poles
    // Using non-linear distribution to have more detail at equator and less at poles
    const theta = Math.acos(1 - 2 * (currentV / (verticalSteps - 1))); // vertical angle (0 to π)
    
    // Convert spherical to cartesian coordinates
    const radius = 30; // Keep same distance from center
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
    
    // Capture screenshot in WebP format for better compression
    try {
      // Use higher quality (0.9) for WebP to maintain details while still getting better compression than PNG
      const screenshot = gl.domElement.toDataURL('image/webp', 0.9);
      // Store screenshot with position info for later stitching
      const filename = `${fileName}_h${currentH}_v${currentV}.webp`;
      shotsRef.current.push(screenshot);
      
      console.log(`Captured screenshot ${currentH * verticalSteps + currentV + 1}/${totalShots}: ${filename}`);
      
      // Move to next position
      let nextH = currentH;
      let nextV = currentV + 1;
      
      if (nextV >= verticalSteps) {
        nextV = 0;
        nextH = nextH + 1;
      }
      
      if (nextH >= horizontalSteps) {
        // We've completed all screenshots
        console.log("Photosphere capture complete!");
        setScreenshots(shotsRef.current);
        setCaptureComplete(true);
        setIsCapturing(false);
        if (onComplete) onComplete(shotsRef.current);
        
        // Create a zip download of all images
        downloadScreenshots(shotsRef.current);
        return;
      }
      
      // Update state for next capture
      setCurrentH(nextH);
      setCurrentV(nextV);
    } catch (error) {
      console.error("Error capturing screenshot:", error);
      setIsCapturing(false);
    }
  }, [currentH, currentV, horizontalSteps, verticalSteps, gl, scene, camera, orbitControlsRef, enabled, fileName, onComplete, totalShots]);
  
  // Trigger next capture in the next frame
  useEffect(() => {
    if (isCapturing && !captureComplete) {
      const timeoutId = setTimeout(() => {
        captureNextFrame();
      }, 200); // Small delay between shots
      
      return () => clearTimeout(timeoutId);
    }
  }, [captureNextFrame, isCapturing, captureComplete]);
  
  // Function to download all screenshots as a zip
  const downloadScreenshots = async (shots: string[]) => {
    try {
      // Check if JSZip is available globally
      if (typeof window !== 'undefined' && !(window as any).JSZip) {
        // If JSZip is not available, load it dynamically
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.async = true;
        document.body.appendChild(script);
        
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load JSZip library"));
          // Add timeout
          setTimeout(() => reject(new Error("Timeout loading JSZip library")), 10000);
        });
        
        console.log("JSZip library loaded successfully");
      }
      
      // Now JSZip should be available
      const JSZip = (window as any).JSZip;
      if (!JSZip) {
        console.error("JSZip library couldn't be loaded");
        return;
      }
      
      const zip = new JSZip();
      
      // Add each screenshot to the zip
      shots.forEach((shot, index) => {
        const h = Math.floor(index / verticalSteps);
        const v = index % verticalSteps;
        const filename = `${fileName}_h${h}_v${v}.webp`;
        
        // Convert data URL to binary
        const data = shot.split(',')[1];
        zip.file(filename, data, { base64: true });
      });
      
      // Add a simple HTML file for viewing
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Photosphere Viewer</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; background: #222; color: #eee; }
            .container { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 5px; padding: 10px; }
            img { width: 100%; height: auto; object-fit: contain; border: 1px solid #444; }
            .info { padding: 20px; background: #333; }
            h1 { margin-top: 0; }
            .img-container { position: relative; }
            .img-info { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); color: white; padding: 3px; text-align: center; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="info">
            <h1>Photosphere Screenshots</h1>
            <p>Total images: ${totalShots} (${horizontalSteps}x${verticalSteps})</p>
            <p>Use these images with a panorama stitching software to create a photosphere.</p>
          </div>
          <div class="container">
            ${Array.from({ length: totalShots }).map((_, index) => {
              const h = Math.floor(index / verticalSteps);
              const v = index % verticalSteps;
              return `
                <div class="img-container">
                  <img src="${fileName}_h${h}_v${v}.webp" alt="Frame ${index}" />
                  <div class="img-info">h: ${h}, v: ${v}</div>
                </div>
              `;
            }).join('')}
          </div>
        </body>
        </html>
      `;
      
      zip.file("viewer.html", htmlContent);
      
      // Add a readme with instructions
      const readmeContent = `
        # Photosphere Screenshots
        
        This zip contains screenshots captured for creating a photosphere.
        
        ## Details
        - Total images: ${totalShots} (${horizontalSteps}x${verticalSteps})
        - Horizontal steps: ${horizontalSteps}
        - Vertical steps: ${verticalSteps}
        - Format: WebP (better compression than PNG with high quality)
        
        ## How to use
        1. Extract all images from this zip
        2. Use panorama stitching software like PTGui, Hugin, or similar to create a 360° panorama
        3. Follow your stitching software's instructions for creating equirectangular panoramas
        
        ## Naming convention
        Files are named as: ${fileName}_h[horizontal_position]_v[vertical_position].webp
        
        ## Viewing
        Open viewer.html to see all the captured images in a grid.
      `;
      
      zip.file("README.md", readmeContent);
      
      // Generate the zip file
      const content = await zip.generateAsync({ type: "blob" });
      
      // Create a download link
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `${fileName}_photosphere.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log("Photosphere screenshots downloaded as zip");
    } catch (error) {
      console.error("Error creating zip file:", error);
    }
  };
  
  // Render UI overlay showing progress
  return enabled ? (
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
          ? "Photosphere capture complete! Preparing download..."
          : `Capturing photosphere: ${currentH * verticalSteps + currentV + 1}/${totalShots}`
        }
      </div>
    </Html>
  ) : null;
}