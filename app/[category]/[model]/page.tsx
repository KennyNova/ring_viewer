import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import Link from "next/link";

// Dynamically import the client-side RingViewer
const RingViewer = dynamic(() => import("@/components/RingViewer"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      Loading RingViewer...
    </div>
  ),
});

export default function ModelViewerPage({
  params,
}: {
  params: { category: string; model: string };
}) {
  const { category, model } = params;

  // Both category and model must be provided or show a 404.
  if (!model || !category) {
    notFound();
  }

  // Use the model slug as is (avoid double .glb since RingViewer handles it)
  const selectedModel = model;

  return (
    <div className="min-h-screen" style={{ position: "relative" }}>
      <RingViewer
        models={[selectedModel]}
        selectedModel={selectedModel}
        category={category}
      />
      <div style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          zIndex: 20,
          display: "grid",
          gridTemplateColumns: "1fr",
          gridTemplateRows: "auto auto",
          gap: "10px",
          width: "200px"
        }}
      >
        <Link href="/" className="block">
          <button className="w-full"
            style={{
              background: "#D4AF37",
              color: "white",
              border: "none",
              borderRadius: "5px",
              padding: "10px 20px",
              cursor: "pointer"
            }}
          >
            Back to Dashboard
          </button>
        </Link>
        <Link href={`/${category}`} className="block">
          <button className="w-full"
            style={{
              background: "#D4AF37",
              color: "white",
              border: "none",
              borderRadius: "5px",
              padding: "10px 20px",
              cursor: "pointer"
            }}
          >
            Back to {category}
          </button>
        </Link>
      </div>
    </div>
  );
} 