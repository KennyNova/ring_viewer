#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const BASE_DIR = path.join(process.cwd());

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

const server = http.createServer((req, res) => {
  console.log(`Request: ${req.url}`);
  
  // Parse the URL and get the pathname
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;
  
  // Redirect root to a file listing
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    
    // Create a list of temp files
    const tempDir = path.join(BASE_DIR, 'temp');
    const files = fs.readdirSync(tempDir)
      .filter(file => file.endsWith('.html'))
      .sort((a, b) => 
        fs.statSync(path.join(tempDir, b)).mtime.getTime() - 
        fs.statSync(path.join(tempDir, a)).mtime.getTime()
      );
    
    let html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Temp Files</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; }
          ul { list-style-type: none; padding: 0; }
          li { margin-bottom: 10px; padding: 10px; background-color: #f5f5f5; border-radius: 4px; }
          a { color: #0066cc; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .date { color: #666; font-size: 0.8em; margin-left: 10px; }
        </style>
      </head>
      <body>
        <h1>Ring Viewer Temp Files</h1>
        <p>Click on a file to view the 3D ring model:</p>
        <ul>
    `;
    
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      const mtime = stats.mtime.toLocaleString();
      html += `<li><a href="/temp/${file}">${file}</a> <span class="date">${mtime}</span></li>`;
    });
    
    html += `
        </ul>
        <h2>3D Model Files</h2>
        <ul>
          <li><a href="/3d">Browse 3D models</a></li>
        </ul>
      </body>
    </html>
    `;
    
    res.end(html);
    return;
  }
  
  // Handle listing 3D model directories
  if (pathname === '/3d') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    
    const modelsDir = path.join(BASE_DIR, 'public/3d');
    const categories = fs.readdirSync(modelsDir)
      .filter(file => fs.statSync(path.join(modelsDir, file)).isDirectory());
    
    let html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>3D Models</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; }
          ul { list-style-type: none; padding: 0; }
          li { margin-bottom: 10px; padding: 10px; background-color: #f5f5f5; border-radius: 4px; }
          a { color: #0066cc; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>3D Model Categories</h1>
        <ul>
    `;
    
    categories.forEach(category => {
      html += `<li><a href="/3d/${category}">${category}</a></li>`;
    });
    
    html += `
        </ul>
        <p><a href="/">Back to temp files</a></p>
      </body>
    </html>
    `;
    
    res.end(html);
    return;
  }
  
  // Handle listing 3D models within a category
  if (pathname.match(/^\/3d\/[^\/]+$/)) {
    const category = pathname.split('/').pop();
    const categoryPath = path.join(BASE_DIR, 'public/3d', category);
    
    if (fs.existsSync(categoryPath) && fs.statSync(categoryPath).isDirectory()) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      
      const models = fs.readdirSync(categoryPath)
        .filter(file => file.endsWith('.glb'));
      
      let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${category} Models</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            ul { list-style-type: none; padding: 0; }
            li { margin-bottom: 10px; padding: 10px; background-color: #f5f5f5; border-radius: 4px; }
            a { color: #0066cc; text-decoration: none; }
            a:hover { text-decoration: underline; }
            .model-item { display: flex; align-items: center; }
            .model-link { flex: 1; }
            .view-button { 
              background-color: #0066cc; 
              color: white; 
              padding: 5px 10px; 
              border-radius: 4px;
              margin-left: 10px;
            }
          </style>
        </head>
        <body>
          <h1>${category} Models</h1>
          <ul>
      `;
      
      models.forEach(model => {
        const modelName = model.replace(/\.glb$/i, '');
        html += `
          <li class="model-item">
            <span class="model-link">${model}</span>
            <a href="/view-model?category=${category}&model=${modelName}" class="view-button">View in 3D</a>
          </li>
        `;
      });
      
      html += `
          </ul>
          <p><a href="/3d">Back to categories</a></p>
        </body>
      </html>
      `;
      
      res.end(html);
      return;
    }
  }
  
  // Handle view-model page
  if (pathname === '/view-model') {
    const params = new URLSearchParams(parsedUrl.query);
    const category = params.get('category');
    const modelName = params.get('model');
    
    if (category && modelName) {
      const modelPath = `/public/3d/${category}/${modelName}.glb`;
      
      // Create an HTML page to view the model
      const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>View ${modelName}</title>
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
      </head>
      <body>
        <div id="info">Loading...</div>
        <script type="module">
          // Import three.js modules directly with ES modules
          import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js';
          import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/loaders/GLTFLoader.js';
          import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/controls/OrbitControls.js';
          
          // Flag for completion
          window.renderComplete = false;

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
          const controls = new OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.autoRotate = true;
          controls.autoRotateSpeed = 1;
          
          // Load model
          const loader = new GLTFLoader();
          
          console.log('Starting to load model: ${modelPath}');
          
          loader.load(
            '${modelPath}',
            function(gltf) {
              console.log('Model loaded successfully');
              
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
                window.renderComplete = true;
                document.getElementById('info').textContent = 'Render complete';
                
                // Make info element fade out
                setTimeout(() => {
                  const info = document.getElementById('info');
                  info.style.transition = 'opacity 1s';
                  info.style.opacity = 0;
                }, 2000);
              }, 2000);
            },
            function(xhr) {
              const percent = Math.floor(xhr.loaded / xhr.total * 100);
              document.getElementById('info').textContent = 'Loading: ' + percent + '%';
            },
            function(error) {
              document.getElementById('info').textContent = 'Error loading model: ' + error.message;
              console.error('Error loading model:', error);
              
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
                window.renderComplete = true;
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
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }
  }
  
  // Map the pathname to a file in the project directory
  let filePath;
  
  if (pathname.startsWith('/temp/')) {
    // Serve files from the temp directory
    filePath = path.join(BASE_DIR, pathname);
  } else if (pathname.startsWith('/public/')) {
    // Serve files from the public directory
    filePath = path.join(BASE_DIR, pathname);
  } else {
    // Try to find the file in the project directory
    filePath = path.join(BASE_DIR, pathname.slice(1));
  }
  
  // Check if the file exists
  fs.stat(filePath, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // 404 Not Found
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        // 500 Server Error
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Server Error');
      }
      return;
    }
    
    // If it's a directory, redirect to the index page
    if (stats.isDirectory()) {
      res.writeHead(301, { 'Location': '/' });
      res.end();
      return;
    }
    
    // Read the file
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Server Error');
        return;
      }
      
      // Determine the content type
      const extname = path.extname(filePath);
      const contentType = MIME_TYPES[extname] || 'application/octet-stream';
      
      // Serve the file
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`View 3D models at http://localhost:${PORT}/3d`);
  console.log(`View temp render files at http://localhost:${PORT}/`);
}); 