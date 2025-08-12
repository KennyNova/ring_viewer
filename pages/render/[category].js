import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

// Import RingViewer without SSR
const RingViewer = dynamic(() => import('../../components/RingViewer'), { ssr: false });

export default function RenderPage() {
  const router = useRouter();
  const { category, model } = router.query;
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const successRef = useRef(false);
  
  // Handle WebGL context loss
  useEffect(() => {
    const handleContextLoss = () => {
      console.log('WebGL context lost, attempting to capture anyway');
      if (!ready) {
        window.rendererReady = true;
        setReady(true);
      }
    };
    
    window.addEventListener('webglcontextlost', handleContextLoss);
    return () => window.removeEventListener('webglcontextlost', handleContextLoss);
  }, [ready]);
  
  // Notify when render is complete
  useEffect(() => {
    if (category && model) {
      // Set a staged timeout to ensure we get a screenshot even if loading takes too long
      const timeout1 = setTimeout(() => {
        console.log('Initial timeout reached, model may not be fully loaded');
      }, 2500);
      
      const timeout2 = setTimeout(() => {
        console.log('Final timeout reached, forcing completion');
        window.rendererReady = true;
        setReady(true);
      }, 5000);
      
      return () => {
        clearTimeout(timeout1);
        clearTimeout(timeout2);
      };
    }
  }, [category, model]);
  
  // Auto-notify when model appears to be loaded
  useEffect(() => {
    if (typeof window !== 'undefined' && category && model && !successRef.current) {
      // Check for successful render every 500ms
      const checkInterval = setInterval(() => {
        const canvas = document.querySelector('canvas');
        if (canvas && !loading) {
          console.log('Canvas detected, marking renderer as ready');
          window.rendererReady = true;
          successRef.current = true;
          setReady(true);
          clearInterval(checkInterval);
        }
      }, 500);
      
      return () => clearInterval(checkInterval);
    }
  }, [category, model, loading]);
  
  // CSS to hide UI elements for clean screenshots
  const hideUIStyles = {
    '.leva-c-lfRhqk': 'display: none !important;',  // Hide Leva UI panel
    '.stats-bottom-right': 'display: none !important;', // Hide stats
    'button': 'display: none !important;', // Hide all buttons
    'div[style*="position: absolute"]': 'display: none !important;', // Hide positioned UI elements
    'p[style*="position: absolute"]': 'display: none !important;', // Hide positioned text
    'label': 'display: none !important;', // Hide labels
    '[data-leva-id]': 'display: none !important;', // Hide Leva components
  };

  // Simple styles to optimize for screenshot
  return (
    <div style={{ width: '100vw', height: '100vh', background: 'white', overflow: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: Object.entries(hideUIStyles).map(([selector, rule]) => `${selector} { ${rule} }`).join('\n') }} />
      
      {category && model ? (
        <>
          <div id="debug" style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            zIndex: 1000, 
            display: 'none' // Hide in production, enable for debug
          }}>
            Category: {category}<br />
            Model: {cleanModelName(model)}
          </div>
          
          <RingViewer 
            models={[cleanModelName(model)]} 
            selectedModel={cleanModelName(model)}
            category={category}
            hideControls={true}
            autoRotate={true}
          />
          
          <div id="status" data-ready={ready} style={{ display: 'none' }}>
            {ready ? 'ready' : 'loading'}
          </div>
        </>
      ) : (
        <div>Loading...</div>
      )}
    </div>
  );
}

// Helper function to clean model name
function cleanModelName(modelName) {
  if (!modelName) return '';
  
  // If it already ends with .glb, return as is
  if (modelName.toLowerCase().endsWith('.glb')) {
    return modelName;
  }
  
  // Otherwise return as is (without adding extension)
  return modelName;
}
    