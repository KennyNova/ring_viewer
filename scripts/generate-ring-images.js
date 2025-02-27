#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { spawn, execSync } = require('child_process');

// Configuration
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const MODELS_DIR = path.join(PUBLIC_DIR, '3d');
const OUTPUT_DIR = path.join(PUBLIC_DIR, 'images');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const IMAGE_WIDTH = 800;
const IMAGE_HEIGHT = 800;
const SERVER_PORT = 3003;
const TIMEOUT = 20000; // Reduced timeout to avoid hanging

// Ensure output directories exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Find all GLB models
const findModels = () => {
  const models = [];
  
  if (!fs.existsSync(MODELS_DIR)) {
    console.error(`Models directory not found: ${MODELS_DIR}`);
    return models;
  }

  const categories = fs.readdirSync(MODELS_DIR).filter(file => 
    fs.statSync(path.join(MODELS_DIR, file)).isDirectory()
  );

  categories.forEach(category => {
    const categoryPath = path.join(MODELS_DIR, category);
    const categoryOutputPath = path.join(OUTPUT_DIR, category);
    
    if (!fs.existsSync(categoryOutputPath)) {
      fs.mkdirSync(categoryOutputPath, { recursive: true });
    }
    
    const files = fs.readdirSync(categoryPath).filter(file => file.endsWith('.glb'));
    
    files.forEach(file => {
      const modelName = file.replace(/\.glb$/i, '');
      const outputPath = path.join(categoryOutputPath, `${modelName}.png`);
      models.push({
        category,
        modelName,
        outputPath,
        exists: fs.existsSync(outputPath)
      });
    });
  });

  return models;
};

// Create a specialized HTML file for rendering a single model
const createRenderHtml = (category, modelName) => {
  const modelPath = `/3d/${category}/${modelName}.glb`;
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ring Renderer</title>
  <style>
    body { margin: 0; padding: 0; overflow: hidden; background: white; }
    canvas { width: 100%; height: 100%; display: block; }
    #info { display: none; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.150.0/examples/js/loaders/GLTFLoader.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.150.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
  <div id="info">Loading...</div>
  <script>
    // Flag for completion
    let renderComplete = false;

    // Set up scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    
    // Set up camera
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 10);
    
    // Set up renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight2.position.set(-1, -1, -1);
    scene.add(directionalLight2);
    
    // Set up controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1;
    
    // Load model
    const loader = new THREE.GLTFLoader();
    
    loader.load(
      '${modelPath}',
      function(gltf) {
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
        
        // Position camera to get a good view
        camera.position.set(5, 5, 5);
        controls.update();
        
        // Add to scene
        scene.add(gltf.scene);
        
        // Flag as complete after a short delay to ensure model is fully rendered
        setTimeout(() => {
          renderComplete = true;
          document.getElementById('info').textContent = 'Render complete';
        }, 2000);
      },
      function(xhr) {
        document.getElementById('info').textContent = 'Loading: ' + Math.floor(xhr.loaded / xhr.total * 100) + '%';
      },
      function(error) {
        document.getElementById('info').textContent = 'Error loading model: ' + error.message;
        // Create a fallback object
        const geometry = new THREE.TorusGeometry(2, 0.5, 16, 100);
        const material = new THREE.MeshStandardMaterial({ 
          color: 0xffd700,
          metalness: 1.0,
          roughness: 0.1
        });
        const ring = new THREE.Mesh(geometry, material);
        scene.add(ring);
        
        setTimeout(() => {
          renderComplete = true;
        }, 1000);
      }
    );
    
    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
  </script>
</body>
</html>
  `;
  
  const htmlPath = path.join(TEMP_DIR, `render-${category}-${modelName}.html`);
  fs.writeFileSync(htmlPath, htmlContent);
  return htmlPath;
};

// Capture a single model with a completely fresh browser instance
const captureModelImage = async (model) => {
  if (model.exists) {
    console.log(`Skipping ${model.category}/${model.modelName} - image already exists`);
    return true;
  }
  
  console.log(`Rendering ${model.category}/${model.modelName}...`);
  
  // Create a standalone HTML file
  const htmlPath = createRenderHtml(model.category, model.modelName);
  
  // Start a fresh browser instance for each model
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security'
    ]
  });
  
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: IMAGE_WIDTH, height: IMAGE_HEIGHT });
    
    // Go to the file URL
    const fileUrl = `file://${htmlPath}`;
    console.log(`Loading: ${fileUrl}`);
    await page.goto(fileUrl, { timeout: TIMEOUT });
    
    // Wait for the render to complete
    await page.waitForFunction('window.renderComplete === true', { 
      timeout: TIMEOUT,
      polling: 500 
    }).catch(() => {
      console.log('Render timed out, capturing anyway');
    });
    
    // Always wait a fixed amount of time
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Take screenshot
    await page.screenshot({ path: model.outputPath, type: 'png' });
    
    console.log(`✅ Captured image for ${model.category}/${model.modelName}`);
    return true;
  } catch (error) {
    console.error(`Error capturing ${model.category}/${model.modelName}:`, error.message);
    
    // Try to capture anyway
    try {
      await page.screenshot({ path: model.outputPath, type: 'png' });
      console.log(`⚠️ Captured fallback image for ${model.category}/${model.modelName}`);
      return true;
    } catch (e) {
      console.error(`Failed to capture fallback:`, e.message);
      return false;
    }
  } finally {
    await browser.close();
    // Clean up after ourselves (but keep the HTML for debugging)
  }
};

// Check if we should skip in CI environment
const shouldSkipInCI = () => {
  return process.env.CI === 'true' || process.env.VERCEL === '1';
};

// Main function
const main = async () => {
  // Skip in CI environments
  if (shouldSkipInCI()) {
    console.log('CI environment detected, skipping image generation');
    return;
  }
  
  // Find all models
  const models = findModels();
  console.log(`Found ${models.length} models to process`);
  
  if (models.length === 0) {
    console.log('No models found. Exiting.');
    return;
  }
  
  // Count existing images
  const existingCount = models.filter(m => m.exists).length;
  console.log(`${existingCount} models already have images, ${models.length - existingCount} need to be generated`);
  
  // Skip if all images exist
  if (existingCount === models.length) {
    console.log('All images already exist. Skipping generation.');
    return;
  }
  
  // Process models sequentially - ONE BROWSER PER MODEL
  const modelsToProcess = models.filter(m => !m.exists);
  let successCount = 0;
  
  console.log(`Processing ${modelsToProcess.length} models sequentially...`);
  
  for (const model of modelsToProcess) {
    const success = await captureModelImage(model);
    if (success) successCount++;
    
    // Brief pause between models
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`🎉 Image generation complete! Generated ${successCount} of ${modelsToProcess.length} images.`);
  
  // Clean up temp files (optional)
  if (!process.env.KEEP_TEMP) {
    console.log('Cleaning up temporary files...');
    fs.readdirSync(TEMP_DIR).forEach(file => {
      if (file.startsWith('render-') && file.endsWith('.html')) {
        fs.unlinkSync(path.join(TEMP_DIR, file));
      }
    });
  }
};

// Run the script if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, findModels }; 