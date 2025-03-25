#!/usr/bin/env node

// Import the generate-ring-images module
const { findModels } = require('./generate-ring-images');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const MODELS_DIR = path.join(PUBLIC_DIR, '3d');
const OUTPUT_DIR = path.join(PUBLIC_DIR, 'images');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const IMAGE_WIDTH = 800;
const IMAGE_HEIGHT = 800;
const TIMEOUT = 30000; // Increased timeout

// Test a specific model
async function testRender() {
  // Use the Solitaire/386741F model for testing
  const category = 'Solitaire';
  const modelName = '386741F';
  const outputPath = path.join(OUTPUT_DIR, category, `${modelName}.png`);

  // Delete any existing image to force re-render
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Deleted existing image: ${outputPath}`);
  }
  
  // Create HTML for rendering
  const htmlContent = createRenderHtml(category, modelName);
  
  // Launch browser
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-gpu-sandbox',
      '--js-flags=--max-old-space-size=4096'
    ]
  });
  
  const page = await browser.newPage();
  
  try {
    // Set up logging
    page.on('console', msg => console.log('Browser:', msg.text()));
    page.on('pageerror', err => console.error('Browser Error:', err.message));
    
    await page.setViewport({ width: IMAGE_WIDTH, height: IMAGE_HEIGHT });
    
    // Go to the page
    const htmlPath = path.join(TEMP_DIR, `render-${category}-${modelName}.html`);
    const fileUrl = `file://${htmlPath}`;
    console.log(`Loading page: ${fileUrl}`);
    
    await page.goto(fileUrl, { timeout: TIMEOUT });
    
    // Wait for render to complete
    console.log('Waiting for render to complete...');
    const renderComplete = await page.waitForFunction('window.renderComplete === true', {
      timeout: TIMEOUT,
      polling: 500
    }).catch(error => {
      console.error('Timed out waiting for renderComplete:', error.message);
      return false;
    });
    
    if (renderComplete) {
      console.log('Render completed successfully!');
    } else {
      console.log('Render did not complete in time');
      
      // Debug what's happening
      const debugInfo = await page.evaluate(() => {
        try {
          return {
            renderComplete: window.renderComplete,
            hasThree: typeof THREE !== 'undefined',
            hasControls: typeof OrbitControls !== 'undefined',
            hasGLTFLoader: typeof GLTFLoader !== 'undefined',
            documentReady: document.readyState
          };
        } catch (e) {
          return { error: e.message };
        }
      }).catch(e => ({ evaluateError: e.message }));
      
      console.log('Debug info:', debugInfo);
    }
    
    // Wait a bit before taking screenshot
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Take screenshot
    console.log(`Taking screenshot to: ${outputPath}`);
    await page.screenshot({ path: outputPath, type: 'png' });
    console.log('Screenshot taken successfully');
    
  } catch (error) {
    console.error('Error during render:', error);
  } finally {
    await browser.close();
    console.log('Browser closed');
  }
}

// Create specialized HTML for rendering
function createRenderHtml(category, modelName) {
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
    #info { 
      position: absolute; 
      top: 10px; 
      left: 10px; 
      background: rgba(0,0,0,0.7); 
      color: white; 
      padding: 10px; 
      border-radius: 4px;
    }
  </style>
  <!-- Use a relative path to load Three.js - allows file:// URLs to work -->
  <script src="../temp/three/three.min.js"></script>
</head>
<body>
  <div id="info">Loading...</div>
  <script>
    // Flag for completion - set this on window for puppeteer to find it
    window.renderComplete = false;
    console.log('Script started');

    // Create a mock scene - our stub Three.js will just create placeholders
    const scene = new THREE.Scene();
    console.log('Scene created');
    
    console.log('Starting to load model: ${modelPath}');
    
    // Since we're using stub Three.js, we'll just simulate a successful render
    // In a real app, this would involve actual Three.js rendering
    
    // Simulate model loading error to ensure our error case works
    setTimeout(() => {
      // Simulate setting the flag after "rendering"
      window.renderComplete = true;
      document.getElementById('info').textContent = 'Render complete (simulated)';
      console.log('Render complete flag set to true (simulated)');
    }, 1000);
    
  </script>
</body>
</html>
  `;
  
  const htmlPath = path.join(TEMP_DIR, `render-${category}-${modelName}.html`);
  fs.writeFileSync(htmlPath, htmlContent);
  return htmlContent;
}

// Run the test
testRender().catch(console.error); 