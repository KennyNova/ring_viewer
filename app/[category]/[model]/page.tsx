import { notFound } from "next/navigation";
import RingViewer from "@/components/RingViewer";
import SimilarRings from "@/components/SimilarRings";
import { findModelUrl, getSimilarRings } from "@/lib/getModels";
import { thumbnailFor } from "@/lib/thumbnails";

export const dynamic = "force-dynamic";

export default function ModelViewerPage({ params }: { params: { category: string; model: string } }) {
  const category = decodeURIComponent(params.category);
  const model = decodeURIComponent(params.model);
  const modelUrl = findModelUrl(category, model);
  if (!modelUrl) notFound();

  const similar = getSimilarRings(category, model).map((ring) => ({
    ...ring,
    thumbnail: thumbnailFor(ring.category, ring.slug),
  }));

  return (
    <>
      {/* Remount per ring so state (metals, camera) resets when browsing between rings */}
      <RingViewer key={modelUrl} modelUrl={modelUrl} modelName={model} category={category} />
      <SimilarRings rings={similar} category={category} />
    </>
  );
}
