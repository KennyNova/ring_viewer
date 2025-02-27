
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

  // Track successful model loading
  useEffect(() => {
    if (category && model) {
      const checkSuccess = setInterval(() => {
        // If we have at least one diamond and one band, consider it a success
        const diamondNodes = document.querySelectorAll('.diamond-material');
        const bandNodes = document.querySelectorAll('.band-material');
        
        if (diamondNodes.length > 0 && bandNodes.length > 0) {
          successRef.current = true;
          window.modelLoadSuccess = true;
          clearInterval(checkSuccess);
          
          // Give it a bit more time to render completely before signaling ready
          setTimeout(() => {
            window.rendererReady = true;
            setReady(true);
          }, 1000);
        }
      }, 500);
      
      return () => clearInterval(checkSuccess);
    }
  }, [category, model]);
  
  // Log what's happening for debugging
  useEffect(() => {
    if (category && model) {
      console.log('Render page received:', { category, model });
    }
  }, [category, model]);

  // For RingViewer, we need to handle the model name WITHOUT .glb
  // because RingViewer will add it internally
  const cleanModelName = (name) => {
    // Remove .glb extension if present
    return name ? name.toString().replace(/\.glb$/i, '') : '';
  };

  // Hide UI elements we don't want in the image
  const hideUIStyles = {
    '.band-color-controls': 'display: none !important',
    '.controls-container': 'display: none !important',
    '.bottom-text': 'display: none !important',
    '.diamond-color-controls': 'display: none !important',
    '.bottom-right-controls': 'display: none !important',
    '.leva-container': 'display: none !important',
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
    