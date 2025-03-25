#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { spawn, execSync } = require('child_process');
const { fork } = require('child_process');

// Configuration
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const MODELS_DIR = path.join(PUBLIC_DIR, '3d');
const OUTPUT_DIR = path.join(PUBLIC_DIR, 'images');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const IMAGE_WIDTH = 800;
const IMAGE_HEIGHT = 800;
const TIMEOUT = 60000; // Increased timeout for model loading (60 seconds)

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

// Capture a single model with a completely fresh browser instance
const captureModelImage = async (model, serverUrl) => {
  if (model.exists) {
    console.log(`Skipping ${model.category}/${model.modelName} - image already exists`);
    return true;
  }
  
  console.log(`Rendering ${model.category}/${model.modelName}...`);
  
  // Start a fresh browser instance for each model
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-gpu-sandbox',
      // Add more memory for larger models
      '--js-flags=--max-old-space-size=4096'
    ]
  });
  
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: IMAGE_WIDTH, height: IMAGE_HEIGHT });
    
    // Add console logging from the browser to node
    page.on('console', (msg) => console.log(`Browser: ${msg.text()}`));
    page.on('pageerror', (err) => console.error(`Browser Error: ${err.message}`));
    
    // Go to the model URL on our render server
    const renderUrl = `${serverUrl}/render/${model.category}/${model.modelName}`;
    console.log(`Loading: ${renderUrl}`);
    await page.goto(renderUrl, { timeout: TIMEOUT });
    
    // Wait for the render to complete
    console.log('Waiting for render to complete...');
    const waitResult = await page.waitForFunction('window.renderComplete === true', { 
      timeout: TIMEOUT,
      polling: 500 
    }).catch((error) => {
      console.log(`Render timed out for ${model.category}/${model.modelName}: ${error.message}`);
      return null;
    });
    
    if (!waitResult) {
      console.log('Render timed out, capturing anyway after a short delay');
      
      // Try to execute script to debug what's happening
      const debugInfo = await page.evaluate(() => {
        return {
          renderComplete: window.renderComplete,
          hasThree: typeof THREE !== 'undefined',
          hasControls: typeof THREE.OrbitControls !== 'undefined',
          hasGLTFLoader: typeof THREE.GLTFLoader !== 'undefined'
        };
      }).catch(e => ({ error: e.message }));
      
      console.log('Debug info:', debugInfo);
      
      // Wait a bit longer before capturing to give it more time
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.log('Render completed successfully');
      // Still wait a bit to ensure the scene is fully rendered
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Take screenshot
    await page.screenshot({ path: model.outputPath, type: 'png' });
    
    console.log(`✅ Captured image for ${model.category}/${model.modelName}`);
    return true;
  } catch (error) {
    console.error(`Error capturing ${model.category}/${model.modelName}:`, error.message);
    
    // Try to capture anyway
    try {
      // Wait a bit more before trying final capture
      await new Promise(resolve => setTimeout(resolve, 5000));
      await page.screenshot({ path: model.outputPath, type: 'png' });
      console.log(`⚠️ Captured fallback image for ${model.category}/${model.modelName}`);
      return true;
    } catch (e) {
      console.error(`Failed to capture fallback:`, e.message);
      return false;
    }
  } finally {
    await browser.close();
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
  
  // Start the render server
  console.log('Starting render server...');
  const renderServer = fork(path.join(__dirname, 'render-server.js'), [], { silent: false });
  
  // Wait for the server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Import the server URL
  const renderServerModule = require('./render-server');
  const serverUrl = await renderServerModule.serverUrl();
  console.log(`Using render server at ${serverUrl}`);
  
  // Process models sequentially
  const modelsToProcess = models.filter(m => !m.exists);
  let successCount = 0;
  
  console.log(`Processing ${modelsToProcess.length} models sequentially...`);
  
  try {
    for (const model of modelsToProcess) {
      const success = await captureModelImage(model, serverUrl);
      if (success) successCount++;
      
      // Brief pause between models
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`🎉 Image generation complete! Generated ${successCount} of ${modelsToProcess.length} images.`);
  } finally {
    // Stop the render server
    console.log('Stopping render server...');
    renderServer.kill();
  }
};

// Run the script if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, findModels }; 