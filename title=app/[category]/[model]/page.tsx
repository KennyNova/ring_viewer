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

  // Both category and model must be provided
  if (!model || !category) {
    notFound();
  }

  // Use the model slug as is (without appending ".glb" because RingViewer adds it)
  const selectedModel = model;

  return (
    <div className="min-h-screen">
      <div style={{ padding: "20px" }}>
        <Link href="/">
          <button
            style={{
              background: "#D4AF37",
              color: "white",
              border: "none",
              borderRadius: "5px",
              padding: "10px 20px",
              cursor: "pointer",
            }}
          >
            Back to Dashboard
          </button>
        </Link>
      </div>
      <RingViewer
        models={[selectedModel]}
        selectedModel={selectedModel}
        category={category}
      />
    </div>
  );
} 