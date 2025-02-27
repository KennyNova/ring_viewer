#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Configuration
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const MODELS_DIR = path.join(PUBLIC_DIR, '3d');
const OUTPUT_DIR = path.join(PUBLIC_DIR, 'images');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const IMAGE_WIDTH = process.env.PI_MODE ? 400 : 800;
const IMAGE_HEIGHT = process.env.PI_MODE ? 400 : 800;

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
} else {
  // Clean up existing temp files
  fs.readdirSync(TEMP_DIR).forEach(file => {
    if (file.startsWith('temp-') && file.endsWith('.html')) {
      fs.unlinkSync(path.join(TEMP_DIR, file));
    }
  });
}

// Find all GLB models
const findModels = () => {
  const models = [];
  
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

// Create a simple HTML template with just a stylized ring icon and text
const createSimpleTemplate = (category, modelName) => {
  // Format the model name for display (replace hyphens with spaces, capitalize)
  const displayName = modelName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ring Preview</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      font-family: Arial, sans-serif;
    }
    .container {
      text-align: center;
      padding: 20px;
      background: white;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
      width: 80%;
      max-width: 500px;
    }
    .ring-icon {
      margin: 20px auto;
      width: 120px;
      height: 120px;
      position: relative;
    }
    .ring-circle {
      position: absolute;
      top: 10px;
      left: 10px;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      border: 15px solid #FFD700;
      box-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
    }
    .gem {
      position: absolute;
      top: 15px;
      left: 45px;
      width: 30px;
      height: 30px;
      background: radial-gradient(ellipse at center, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.2) 100%);
      border-radius: 3px;
      transform: rotate(45deg);
      box-shadow: 0 0 10px rgba(255,255,255,0.8);
    }
    .category {
      color: #666;
      font-size: 18px;
      margin-bottom: 5px;
    }
    .model-name {
      color: #333;
      font-size: 26px;
      font-weight: bold;
      margin-top: 5px;
    }
    .sparkle {
      position: absolute;
      background: white;
      border-radius: 50%;
      animation: twinkle 1.5s infinite;
    }
    .sparkle:nth-child(1) {
      width: 8px;
      height: 8px;
      top: 20px;
      left: 35px;
      animation-delay: 0s;
    }
    .sparkle:nth-child(2) {
      width: 6px;
      height: 6px;
      top: 15px;
      right: 40px;
      animation-delay: 0.3s;
    }
    .sparkle:nth-child(3) {
      width: 5px;
      height: 5px;
      bottom: 30px;
      left: 40px;
      animation-delay: 0.6s;
    }
    .sparkle:nth-child(4) {
      width: 4px;
      height: 4px;
      bottom: 20px;
      right: 45px;
      animation-delay: 0.9s;
    }
    @keyframes twinkle {
      0% { opacity: 0; }
      50% { opacity: 1; }
      100% { opacity: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="ring-icon">
      <div class="ring-circle"></div>
      <div class="gem"></div>
      <div class="sparkle"></div>
      <div class="sparkle"></div>
      <div class="sparkle"></div>
      <div class="sparkle"></div>
    </div>
    <div class="category">${category}</div>
    <div class="model-name">${displayName}</div>
  </div>
</body>
</html>
  `;
  
  const tempHtmlPath = path.join(TEMP_DIR, `temp-${category}-${modelName}.html`);
  fs.writeFileSync(tempHtmlPath, htmlContent);
  return tempHtmlPath;
};

// Capture screenshot of the simple template
const captureSimpleImage = async (browser, model) => {
  if (model.exists) {
    console.log(`Skipping ${model.category}/${model.modelName} - image already exists`);
    return true;
  }
  
  console.log(`Generating image for ${model.category}/${model.modelName}...`);
  
  const htmlPath = createSimpleTemplate(model.category, model.modelName);
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: IMAGE_WIDTH, height: IMAGE_HEIGHT });
    await page.goto(`file://${htmlPath}`, { timeout: 10000 });
    
    // Wait for all animations to stabilize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Take screenshot
    await page.screenshot({ path: model.outputPath, type: 'png' });
    console.log(`✅ Created image for ${model.category}/${model.modelName}`);
    
    return true;
  } catch (error) {
    console.error(`Error generating image for ${model.category}/${model.modelName}:`, error.message);
    return false;
  } finally {
    await page.close();
  }
};

// Main function
const main = async () => {
  const models = findModels();
  console.log(`Found ${models.length} models`);
  
  const modelsToProcess = models.filter(m => !m.exists);
  console.log(`${modelsToProcess.length} models need images`);
  
  if (modelsToProcess.length === 0) {
    console.log('No images to generate. Exiting.');
    return;
  }
  
  // Launch browser with minimal resource usage
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-accelerated-2d-canvas',
      '--single-process'
    ]
  });
  
  try {
    let successCount = 0;
    
    // Process one model at a time
    for (const model of modelsToProcess) {
      const success = await captureSimpleImage(browser, model);
      if (success) successCount++;
      
      // Add a delay between models for resource-constrained environments
      if (process.env.PI_MODE) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`Completed! Generated ${successCount} of ${modelsToProcess.length} images.`);
  } finally {
    await browser.close();
    
    // Clean up temp files
    fs.readdirSync(TEMP_DIR).forEach(file => {
      if (file.startsWith('temp-') && file.endsWith('.html')) {
        fs.unlinkSync(path.join(TEMP_DIR, file));
      }
    });
  }
};

// Run script
main().catch(console.error); 