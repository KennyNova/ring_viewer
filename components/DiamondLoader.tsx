import React from 'react';
import Image from 'next/image';
import { useProgress } from '@react-three/drei';

// Diamond loader component with filling animation
export function DiamondLoader({ progress }: { progress: number }) {
  // Calculate progress for each line (0-100)
  const lineProgress = Math.min(100, progress * 100); 
  
  // Define all diamond part SVGs
  const diamondParts = [
    { src: '/diamond/top.svg', alt: 'Diamond top line' },
    { src: '/diamond/top_left.svg', alt: 'Diamond top left line' },
    { src: '/diamond/top_right.svg', alt: 'Diamond top right line' },
    { src: '/diamond/middle_left.svg', alt: 'Diamond middle left line' },
    { src: '/diamond/middle_right.svg', alt: 'Diamond middle right line' },
    { src: '/diamond/middle_straight.svg', alt: 'Diamond middle straight line' },
    { src: '/diamond/bottom_middle_left.svg', alt: 'Diamond bottom middle left line' },
    { src: '/diamond/bottom_middle_right.svg', alt: 'Diamond bottom middle right line' },
    { src: '/diamond/bottom_left.svg', alt: 'Diamond bottom left line' },
    { src: '/diamond/bottom_right.svg', alt: 'Diamond bottom right line' }
  ];

  // Calculate how many parts should be filled based on progress
  const partsToFill = Math.ceil(lineProgress * diamondParts.length / 100);
  
  // Size for the container and images
  const containerSize = 180;
  const imageSize = 110;
  
  return (
    <div className="diamond-loader" style={{
      position: 'relative',
      width: `${containerSize}px`,
      height: `${containerSize}px`,
      margin: '20px 0',
    }}>
      <style>
        {`
          @keyframes pulse {
            0% { filter: drop-shadow(0 0 2px #0ff); }
            50% { filter: drop-shadow(0 0 8px #0ff); }
            100% { filter: drop-shadow(0 0 2px #0ff); }
          }
          
          .diamond-container {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: ${imageSize}px;
            height: ${imageSize}px;
            animation: pulse 2s ease-in-out infinite;
          }
          
          .diamond-part {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            transition: opacity 0.5s ease-in-out;
          }
          
          .diamond-part img {
            filter: invert(100%) sepia(100%) saturate(300%) hue-rotate(175deg) brightness(100%) !important;
          }
          
          .diamond-part-filled {
            opacity: 1;
          }
          
          .diamond-part-unfilled {
            opacity: 0.15;
          }
        `}
      </style>
      
      <div className="diamond-container">
        {diamondParts.map((part, index) => {
          // Determine if this part should be filled based on the current progress
          const isFilled = index < partsToFill;
          
          // For the currently filling part, calculate partial opacity
          let opacity = 0.15; // Default for unfilled parts
          if (isFilled) {
            opacity = 1; // Fully filled parts
          } else if (index === partsToFill) {
            // Calculate partial fill for the current part being filled
            const partProgress = (lineProgress - (partsToFill - 1) * (100 / diamondParts.length)) / (100 / diamondParts.length);
            opacity = 0.15 + (1 - 0.15) * partProgress;
          }
          
          return (
            <div 
              key={part.src}
              className={`diamond-part ${isFilled ? 'diamond-part-filled' : 'diamond-part-unfilled'}`}
              style={{ opacity }}
            >
              <Image
                src={part.src}
                alt={part.alt}
                width={imageSize}
                height={imageSize}
                style={{ objectFit: 'contain' }}
                priority={true}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Combined loader that uses DiamondLoader with progress from drei
export function CombinedLoader({ preTestProgress }: { preTestProgress: number }) {
  const { progress: modelProgress } = useProgress();
  // Combine both progress values. Adjust these weights as desired.
  const combined = 0.4 * preTestProgress + 0.6 * modelProgress;
  if (combined >= 100) return null;
  return (
    <div style={{
      position: "absolute",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0, 0, 0, 0.85)",
      zIndex: 9999,
      fontFamily: "sans-serif"
    }}>
      <DiamondLoader progress={combined / 100} />
      <div style={{
        color: "#0ff",
        fontSize: "0.7rem",
        letterSpacing: "2px",
        opacity: 0.8,
        fontWeight: 200,
        marginTop: "15px",
        textTransform: "uppercase",
        fontFamily: "monospace"
      }}>
        {combined.toFixed(0)}%
      </div>
    </div>
  );
} 