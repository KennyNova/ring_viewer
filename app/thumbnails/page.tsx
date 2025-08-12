import dynamic from 'next/dynamic';
import Link from 'next/link';

// Import ThumbnailGenerator with client-side rendering only
const ThumbnailGenerator = dynamic(() => import('@/components/ThumbnailGenerator'), { ssr: false });

export default function ThumbnailsPage() {
  return (
    <div className="page-container">
      <div style={{
        display: "flex",
        justifyContent: "center",
        marginBottom: "40px",
        backgroundColor: "#ffffff",
        padding: "20px 0",
      }}>
        <Link href="/">
          <img
            src="//masinadiamonds.com/cdn/shop/files/366327210_768017625324629_3600285306584146928_n_1.jpg?v=1697432446&width=380"
            alt="Masina Diamonds"
            style={{ width: "200px", height: "auto", objectFit: "contain" }}
          />
        </Link>
      </div>
      
      <div className="title-container">
        <h1 className="title-text">
          Thumbnail Management
        </h1>
      </div>
      
      <div style={{
        textAlign: 'center',
        marginBottom: '2rem',
      }}>
        <p>Generate thumbnails for rings that don't have them.</p>
        <Link href="/">
          <button style={{
            backgroundColor: '#D4AF37',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            padding: '10px 20px',
            cursor: 'pointer',
            marginTop: '1rem',
          }}>
            Back to Home
          </button>
        </Link>
      </div>
      
      <ThumbnailGenerator />
    </div>
  );
} 