#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

// Configuration
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const OUTPUT_DIR = path.join(PUBLIC_DIR, 'images');
const IMAGE_WIDTH = 800;
const IMAGE_HEIGHT = 800;
const TIMEOUT = 60000; // Increased timeout for model loading (60 seconds)

// Test a specific model
async function testRender() {
  // Use a different model for testing
  const category = 'Solitaire';
  const modelName = '386741F'; // Testing with the original Solitaire model
  const outputPath = path.join(OUTPUT_DIR, category, `${modelName}.png`);

  // Delete any existing image to force re-render
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Deleted existing image: ${outputPath}`);
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
    
    // Go to the model URL on our render server
    const renderUrl = `${serverUrl}/render/${category}/${modelName}`;
    console.log(`Loading page: ${renderUrl}`);
    
    await page.goto(renderUrl, { timeout: TIMEOUT });
    
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
            hasControls: typeof THREE.OrbitControls !== 'undefined',
            hasGLTFLoader: typeof THREE.GLTFLoader !== 'undefined',
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
    
    // Stop the render server
    console.log('Stopping render server...');
    renderServer.kill();
  }
}

// Run the test
testRender().catch(console.error); 