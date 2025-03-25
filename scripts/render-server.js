#!/usr/bin/env node

// This script creates a local server to render 3D models properly
const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const net = require('net');

// Server configuration
const PORT_RANGE = { start: 3500, end: 3600 }; // Try ports in this range
const app = express();
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const TEMP_DIR = path.join(process.cwd(), 'temp');

// Add custom MeshRefractionMaterial implementation for diamonds
// This replicates the @react-three/drei MeshRefractionMaterial functionality
// in vanilla Three.js without requiring React
const createRefractionMaterial = (envMap) => {
  // Load dependencies
  const threeRootPath = path.join(process.cwd(), 'node_modules/three');
  const dreiRootPath = path.join(process.cwd(), 'node_modules/@react-three/drei');
  
  // Get shader code from the drei package
  const vertexShaderPath = path.join(dreiRootPath, 'materials/MeshRefractionMaterial.js');
  const shaderCode = fs.readFileSync(vertexShaderPath, 'utf8');
  
  // Extract vertex and fragment shader code
  const vertexShaderMatch = shaderCode.match(/\/\*glsl\*\/`([\s\S]*?)`,\s*\/\*glsl\*\/`/);
  const fragmentShaderMatch = shaderCode.match(/\/\*glsl\*\/`([\s\S]*?)`\);/s);
  
  if (!vertexShaderMatch || !fragmentShaderMatch) {
    console.error('Failed to extract shader code from MeshRefractionMaterial');
    // Fallback to standard material
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      metalness: 0.05,
      roughness: 0.05,
      transmission: 0.95,
      transparent: true
    });
  }
  
  // Clean up shader code and prepare it for use
  const vertexShader = vertexShaderMatch[1]
    .replace('#include <color_pars_vertex>', '')
    .replace('#include <color_vertex>', '');
  
  let fragmentShader = fragmentShaderMatch[1]
    .replace('#include <color_pars_fragment>', '')
    .replace('#include <color_fragment>', '')
    .replace('precision highp isampler2D;', '')
    .replace('precision highp usampler2D;', '')
    .replace('${shaderStructs}', '')
    .replace('${shaderIntersectFunction}', '')
    .replace(/\${version[^}]+}/g, 'colorspace_fragment');
  
  // Create the custom material
  const material = new THREE.ShaderMaterial({
    uniforms: {
      envMap: { value: envMap },
      bounces: { value: 3 },
      ior: { value: 2.75 },
      fresnel: { value: 1.0 },
      aberrationStrength: { value: 0.01 },
      color: { value: new THREE.Color(0xffffff) },
      transmission: { value: 0.0 },
      thickness: { value: 0.5 },
      roughness: { value: 0.0 },
      clearcoat: { value: 0.1 },
      clearcoatRoughness: { value: 0.1 },
      attenuationDistance: { value: 1.0 },
      attenuationColor: { value: new THREE.Color(0xffffff) },
      resolution: { value: new THREE.Vector2(800, 800) },
      modelMatrix: { value: new THREE.Matrix4() },
      viewMatrixInverse: { value: new THREE.Matrix4() },
      projectionMatrixInverse: { value: new THREE.Matrix4() },
      opacity: { value: 1.0 }
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: true
  });
  
  // Return the fallback material if shader setup fails
  if (!material.vertexShader || !material.fragmentShader) {
    console.error('Failed to create refraction shader material');
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      metalness: 0.05,
      roughness: 0.05,
      transmission: 0.95,
      transparent: true
    });
  }
  
  return material;
};

// Function to create an optimized diamond material using Three.js MeshPhysicalMaterial
// as a fallback if the custom refraction shader fails
const createDiamondMaterial = (envMap) => {
  try {
    // First try to create the refraction material
    const refractionMaterial = createRefractionMaterial(envMap);
    
    // Return the refraction material
    return refractionMaterial;
  } catch (error) {
    console.error('Error creating refraction material:', error);
    
    // Fallback to a MeshPhysicalMaterial with diamond-like properties
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      metalness: 0.05,
      roughness: 0.02,
      transmission: 1.0, 
      transparent: true,
      opacity: 0.95,
      ior: 2.75, // Diamond's high index of refraction
      reflectivity: 1.0,
      thickness: 2.0,
      specularIntensity: 1.0,
      specularColor: new THREE.Color(0xffffff),
      envMap: envMap,
      envMapIntensity: 2.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.01,
      iridescence: 0.3,
      iridescenceIOR: 2.5,
      iridescenceThicknessRange: [100, 400],
      sheen: 0.1,
      sheenRoughness: 0.1,
      sheenColor: new THREE.Color(0xffffff),
      attenuationColor: new THREE.Color(0.8, 0.8, 1.0), // Slight blue shift
      attenuationDistance: 5.0 // Longer for more internal reflections
    });
  }
};

// Function to find an available port
const findAvailablePort = async () => {
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => {
        resolve(false);
      });
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port);
    });
  };
  
  for (let port = PORT_RANGE.start; port <= PORT_RANGE.end; port++) {
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }
  
  throw new Error(`No available ports found in range ${PORT_RANGE.start}-${PORT_RANGE.end}`);
};

// CORS middleware for local development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve static files from the public directory
app.use('/public', express.static(PUBLIC_DIR));

// Serve static files from the temp directory
app.use('/temp', express.static(TEMP_DIR));

// Serve Three.js libraries from node_modules
app.use('/three', (req, res, next) => {
  // Force JavaScript MIME type for .js files
  if (req.path.endsWith('.js')) {
    res.type('application/javascript');
  }
  next();
}, express.static(path.join(process.cwd(), 'node_modules/three')));

// Serve WASM files with correct MIME type
app.use('/three/examples/jsm/libs/draco/', (req, res, next) => {
  if (req.path.endsWith('.wasm')) {
    res.type('application/wasm');
  } else if (req.path.endsWith('.js')) {
    res.type('application/javascript');
  }
  next();
}, express.static(path.join(process.cwd(), 'node_modules/three/examples/jsm/libs/draco/')));

// Serve DRACO GLTF subdirectory files
app.use('/three/examples/jsm/libs/draco/gltf/', (req, res, next) => {
  if (req.path.endsWith('.wasm')) {
    res.type('application/wasm');
  } else if (req.path.endsWith('.js')) {
    res.type('application/javascript');
  }
  next();
}, express.static(path.join(process.cwd(), 'node_modules/three/examples/jsm/libs/draco/gltf/')));

// Serve HDR files with correct MIME type
app.use('/public', (req, res, next) => {
  if (req.path.endsWith('.hdr')) {
    res.type('application/octet-stream');
  } else if (req.path.endsWith('.exr')) {
    res.type('application/octet-stream');
  }
  next();
}, express.static(path.join(process.cwd(), 'public')));

// Create and serve HTML for rendering a specific model
app.get('/render/:category/:modelName', (req, res) => {
  const { category, modelName } = req.params;
  const modelPath = `/public/3d/${category}/${modelName}.glb`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ring Renderer</title>
  <style>
    body { margin: 0; padding: 0; overflow: hidden; background: white; }
    canvas { width: 100%; height: 100%; display: block; }
    #info { 
      position: absolute; 
      top: 10px; 
      left: 10px; 
      background: rgba(0,0,0,0.7); 
      color: white; 
      padding: 10px; 
      border-radius: 4px;
      font-family: Arial, sans-serif;
    }
  </style>
  <!-- Import Three.js ES modules -->
  <script type="importmap">
    {
      "imports": {
        "three": "/three/build/three.module.js",
        "three/addons/": "/three/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <div id="info">Loading ${category}/${modelName}...</div>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
    import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

    // Band color materials map
    const bandMaterials = {
      'Yellow Gold': { color: '#ffdc73', metalness: 1, roughness: 0.2 },
      'Rose Gold': { color: '#d5927a', metalness: 1, roughness: 0.2 },
      'White Gold': { color: '#E8E8E8', metalness: 1, roughness: 0.15 },
      'Platinum': { color: '#E5E4E2', metalness: 1, roughness: 0.1 }
    };

    // Default band color to use
    const defaultBandColor = 'Yellow Gold';
    const defaultAccentBandColor = 'White Gold';
    
    // Flag for completion
    window.renderComplete = false;
    console.log("Script started");

    // Set up scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    
    // Improved lighting for diamond sparkle
    // This is crucial for diamond appearance
    
    // Set up renderer with high quality settings
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      preserveDrawingBuffer: true,
      alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5; // Brighter exposure
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    console.log('Renderer created');
    
    // Set up camera with higher quality for diamond details
    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 10);
    
    // Add enhanced lighting setup specifically designed for diamond sparkle
    
    // Add enhanced lighting setup for better diamond sparkle
    // Main ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    // Create studio-style three-point lighting setup
    // Strong key light - main light source
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(5, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048; // Higher resolution shadows
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 50;
    keyLight.shadow.bias = -0.0001; // Reduce shadow artifacts
    scene.add(keyLight);
    
    // Fill light - softens shadows
    const fillLight = new THREE.DirectionalLight(0xfff8e8, 1.2); // Warm fill light
    fillLight.position.set(-3, 1, 5);
    scene.add(fillLight);
    
    // Rim light - creates edge highlights
    const rimLight = new THREE.DirectionalLight(0xe8f8ff, 1.5); // Cool rim light
    rimLight.position.set(0, 4, -6);
    scene.add(rimLight);
    
    // Strategic point lights specifically to create diamond facet reflections
    // These are critical for realistic diamond sparkle
    const diamondSparkles = [
      { position: [2, 4, 3], color: 0xffffff, intensity: 2.0, distance: 15 },
      { position: [-2, 3, 2], color: 0xfff8e8, intensity: 1.5, distance: 12 },
      { position: [0, 2, -3], color: 0xe8f8ff, intensity: 1.8, distance: 15 },
      { position: [3, -1, -2], color: 0xffffff, intensity: 1.2, distance: 10 },
      { position: [-3, -2, -3], color: 0xfff0e0, intensity: 1.0, distance: 8 }
    ];
    
    diamondSparkles.forEach(light => {
      const pointLight = new THREE.PointLight(light.color, light.intensity, light.distance);
      pointLight.position.set(...light.position);
      // Add subtle animation to some lights for dynamic sparkle
      if (Math.random() > 0.5) {
        const originalY = light.position[1];
        const originalZ = light.position[2];
        // Store original position for animation reference
        pointLight.userData = { 
          originalY, 
          originalZ, 
          phase: Math.random() * Math.PI * 2 
        };
      }
      scene.add(pointLight);
    });
    
    console.log('Enhanced lighting setup complete');
    
    // Set up controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1;
    console.log('Controls created');

    // Load environment map for reflections - crucial for diamond appearance
    let envMap = null;
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    // Load HDRI environment map 
    new RGBELoader()
      .setPath('/public/')
      .load('studio.hdr', function(texture) {
        envMap = pmremGenerator.fromEquirectangular(texture).texture;
        scene.environment = envMap;
        scene.background = new THREE.Color(0xffffff); // Keep white background
        
        texture.dispose();
        pmremGenerator.dispose();
        console.log('Environment map loaded');
      });
    
    // Set up Draco loader for compressed models
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/three/examples/jsm/libs/draco/gltf/');
    console.log('DRACOLoader initialized with path:', '/three/examples/jsm/libs/draco/gltf/');
    
    // Add listener for DRACO loader errors
    dracoLoader.manager.onError = function(url) {
      console.error('Error loading DRACO resource:', url);
    };
    
    // Load model
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    console.log('Starting to load model: "${modelPath}"');
    
    // Animation loop with post-processing for enhanced visuals
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      
      // Animate the point lights for dynamic diamond sparkle
      const time = Date.now() * 0.001; // Get time in seconds
      scene.traverse((object) => {
        // Check if this is a point light with animation data
        if (object.isPointLight && object.userData && object.userData.originalY !== undefined) {
          // Create subtle movement based on sine waves
          const phase = object.userData.phase || 0;
          const speed = 0.5 + Math.random() * 0.5; // Random speed for each light
          
          // Move in a small circular pattern
          object.position.y = object.userData.originalY + Math.sin(time * speed + phase) * 0.5;
          object.position.z = object.userData.originalZ + Math.cos(time * speed + phase) * 0.5;
          
          // Add subtle intensity variation
          object.intensity = object.userData.originalIntensity || 
                            (object.intensity * (0.9 + 0.2 * Math.sin(time * 2 + phase)));
          
          // Store original intensity on first run
          if (object.userData.originalIntensity === undefined) {
            object.userData.originalIntensity = object.intensity;
          }
        }
        
        // Update matrices for refraction materials
        // This is critical for the diamond refraction effect
        if (object.isMesh && object.material) {
          const material = object.material;
          // Check if this is a ShaderMaterial (our custom refraction material)
          if (material.type === 'ShaderMaterial' && material.uniforms) {
            // Update the matrices for the refraction calculation
            if (material.uniforms.modelMatrix) {
              material.uniforms.modelMatrix.value.copy(object.matrixWorld);
            }
            if (material.uniforms.viewMatrixInverse) {
              material.uniforms.viewMatrixInverse.value.copy(camera.matrixWorld);
            }
            if (material.uniforms.projectionMatrixInverse) {
              material.uniforms.projectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
            }
            if (material.uniforms.resolution) {
              material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
            }
          }
        }
      });
      
      renderer.render(scene, camera);
    }
    animate();
    console.log('Animation loop started');
    
    loader.load(
      "${modelPath}",
      function(gltf) {
        console.log('Model loaded successfully');
        
        try {
          // Process the loaded model
          const model = gltf.scene;
          
          // Categorize nodes into diamond, primary band, and accent band nodes
          const diamondNodes = [];
          const primaryBandNodes = [];
          const accentBandNodes = [];
          const materialNames = new Set();
          
          model.traverse(node => {
            if (node.isMesh) {
              const material = node.material;
              
              // Check if it's a diamond
              if (material?.userData?.gltfExtensions?.WEBGI_materials_diamond) {
                diamondNodes.push(node);
              } else {
                // Categorize metal nodes
                const materialName = material?.name || "";
                materialNames.add(materialName);
                
                // For materials with "Metal" in the name or node name with "MATERIAL=" 
                if (
                  materialName.includes("Metal") || 
                  node.name.includes("MATERIAL=") || 
                  (material?.type === "MeshPhysicalMaterial" || material?.type === "MeshStandardMaterial")
                ) {
                  // If it's the first metal material or it contains "1" or "primary", it's the primary band
                  if (
                    primaryBandNodes.length === 0 || 
                    materialName.includes("1") || 
                    materialName.toLowerCase().includes("primary") || 
                    node.name.includes("_1") || 
                    node.name.includes("primary")
                  ) {
                    primaryBandNodes.push(node);
                  } else {
                    // Otherwise, it's an accent band
                    accentBandNodes.push(node);
                  }
                } else {
                  // Default case: if we can't determine, assume it's part of the primary band
                  primaryBandNodes.push(node);
                }
              }
            }
          });
          
          console.log('Diamond Nodes:', diamondNodes.length);
          console.log('Primary Band Nodes:', primaryBandNodes.length);
          console.log('Accent Band Nodes:', accentBandNodes.length);
          
          // Apply materials to the bands
          const primaryMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(bandMaterials[defaultBandColor].color),
            metalness: bandMaterials[defaultBandColor].metalness,
            roughness: bandMaterials[defaultBandColor].roughness,
            envMapIntensity: 1.5
          });
          
          const accentMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(bandMaterials[defaultAccentBandColor].color),
            metalness: bandMaterials[defaultAccentBandColor].metalness,
            roughness: bandMaterials[defaultAccentBandColor].roughness,
            envMapIntensity: 1.5
          });
          
          // Apply materials to the primary band nodes
          primaryBandNodes.forEach(node => {
            node.material = primaryMaterial;
          });
          
          // Apply materials to the accent band nodes
          accentBandNodes.forEach(node => {
            node.material = accentMaterial;
          });
          
          // Apply enhanced diamond material to diamond nodes
          diamondNodes.forEach(node => {
            // Create an enhanced diamond material with optimized properties
            // These settings are critical for making diamonds look realistic and not like glass
            const refractionMaterial = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(0xffffff),
              metalness: 0.1,  // Slight metalness for more reflections
              roughness: 0.0,  // Perfectly polished
              transmission: 0.95, // High transmission but not 100% to allow some reflection
              transparent: true,
              opacity: 0.9,    // Slight transparency
              ior: 2.42,       // Accurate diamond IOR
              reflectivity: 1.0,
              thickness: 4.0,   // Deep internal reflections
              specularIntensity: 5.0, // Very high specular intensity for sparkle
              specularColor: new THREE.Color(1.0, 0.99, 0.98), // Slight warmth in specular
              envMap: envMap,
              envMapIntensity: 5.0, // Maximized reflections
              clearcoat: 1.0,
              clearcoatRoughness: 0.0, // Perfect clear coat
              attenuationColor: new THREE.Color(0.8, 0.85, 1.0), // Blue-white tint
              attenuationDistance: 2.0, // Tighter color control
              iridescence: 0.5, // Add iridescence effect
              iridescenceIOR: 2.0,
              iridescenceThicknessRange: [100, 800] // Wider range for more colors
            });
            
            // Add depth to the material to enhance internal reflections
            if (refractionMaterial.defines) {
              refractionMaterial.defines.DEPTH_PACKING = 3201; // RGBADepthPacking
            }
            
            // Try to create a custom refraction material if the environment map is ready
            if (envMap) {
              try {
                // Use the custom material if successfully created
                node.material = refractionMaterial;
                console.log('Applied custom refraction shader to diamond');
              } catch (error) {
                console.error('Error creating custom refraction shader:', error);
                // Fall back to the physical material
                node.material = refractionMaterial;
              }
            } else {
              // If environment map isn't ready, use standard material
              console.log('Environment map not ready, using standard material');
              node.material = refractionMaterial;
            }
          });
          
          // Center the model in the scene
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          
          // Reset model position to center
          gltf.scene.position.set(-center.x, -center.y, -center.z);
          
          // Resize model to fit view
          const maxDim = Math.max(size.x, size.y, size.z);
          if (maxDim > 0) {
            const scale = 5 / maxDim;
            gltf.scene.scale.set(scale, scale, scale);
          }
          
          // Position camera to get a good view of the ring
          camera.position.set(5, 5, 5);
          controls.update();
          
          // Add to scene
          scene.add(gltf.scene);
          
          // Flag as complete after a short delay to ensure model is fully rendered
          console.log('Setting render complete after delay');
          setTimeout(() => {
            window.renderComplete = true;
            document.getElementById('info').textContent = 'Render complete';
            console.log('Render complete flag set to true');
          }, 3000);
        } catch (err) {
          console.error('Error processing model:', err.message);
          document.getElementById('info').textContent = 'Error processing model: ' + err.message;
          window.renderComplete = true; // Set to true so we don't hang
        }
      },
      function(xhr) {
        if (xhr.lengthComputable) {
          const percent = xhr.loaded / xhr.total * 100;
          const percentText = Math.floor(percent) + '%';
          document.getElementById('info').textContent = 'Loading: ' + percentText;
          console.log('Loading progress: ' + percentText);
        } else {
          document.getElementById('info').textContent = 'Loading model...';
        }
      },
      function(error) {
        console.error('Error loading model:', error.message);
        document.getElementById('info').textContent = 'Error loading model: ' + error.message;
        window.renderComplete = true; // Set to true so we don't hang
      }
    );
  </script>
</body>
</html>
`;
  
  res.send(html);
});

// Log 404 errors
app.use((req, res, next) => {
  console.error(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).send('Not found');
});

// Start the server
let serverUrl;
let server;

const startServer = async () => {
  const port = await findAvailablePort();
  serverUrl = `http://localhost:${port}`;
  
  return new Promise((resolve) => {
    server = app.listen(port, () => {
      console.log(`Render server running at ${serverUrl}`);
      console.log(`Example: ${serverUrl}/render/Solitaire/386741F`);
      resolve(serverUrl);
    });
  });
};

// Export functionality to be used by the main script
module.exports = {
  serverUrl: async () => {
    if (!serverUrl) {
      return await startServer();
    }
    return serverUrl;
  },
  stopServer: () => {
    if (server) {
      server.close();
    }
  }
};

// If running directly (not imported), keep the server running
if (require.main === module) {
  console.log('Server started in standalone mode. Press Ctrl+C to stop.');
  startServer().catch(console.error);
} 