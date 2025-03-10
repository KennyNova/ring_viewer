'use client';

import { useRouter } from 'next/navigation';
import HoverableDiv from './HoverableDiv';

export default function RandomRingButton() {
  const router = useRouter();

  const handleClick = () => {
    // Append a random query parameter to force a fresh fetch
    router.push(`/random-ring?rnd=${Date.now()}`);
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      marginTop: '30px'
    }}>
      <div onClick={handleClick} style={{ cursor: 'pointer' }}>
        <HoverableDiv
          style={{
            backgroundColor: '#D4AF37',
            padding: '15px 30px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(139,115,85,0.2)'
          }}
        >
          <p
            style={{
              margin: '0',
              textAlign: 'center',
              color: '#ffffff',
              fontSize: 'clamp(1rem, 3vw, 1.5rem)',
              fontWeight: '500',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            View Random Ring
          </p>
        </HoverableDiv>
      </div>
    </div>
  );
} 