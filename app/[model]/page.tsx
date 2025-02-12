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
  params: { model: string };
}) {
  const { model } = params;

  // If no model provided, show a 404 page.
  if (!model) {
    notFound();
  }

  // Build the filename for the .glb file based on the route parameter.
  const selectedModel = `${model}.glb`;

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
      <RingViewer models={[selectedModel]} selectedModel={selectedModel} />
    </div>
  );
} 