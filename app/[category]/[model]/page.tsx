import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import Link from "next/link";
import RingViewer from "@/components/RingViewer";

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
          <button className="w-full md-gradient-btn" style={{ padding: "10px 20px" }}>
            Back to Dashboard
          </button>
        </Link>
        <Link href={`/${category}`} className="block">
          <button className="w-full md-gradient-btn" style={{ padding: "10px 20px" }}>
            Back to {category}
          </button>
        </Link>
      </div>
    </div>
  );
} 