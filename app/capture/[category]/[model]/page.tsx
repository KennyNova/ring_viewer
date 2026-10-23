import { notFound } from "next/navigation";
import CaptureView from "@/components/viewer/CaptureView";
import { findModelUrl } from "@/lib/getModels";
import { CAPTURE_ANGLES } from "@/lib/thumbnails";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default function CapturePage({
  params,
  searchParams,
}: {
  params: { category: string; model: string };
  searchParams: { angle?: string; metal?: string; scene?: string };
}) {
  const modelUrl = findModelUrl(decodeURIComponent(params.category), decodeURIComponent(params.model));
  if (!modelUrl) notFound();
  const angle = CAPTURE_ANGLES.find((a) => a === searchParams.angle) ?? "hero";

  return (
    <CaptureView
      modelUrl={modelUrl}
      angle={angle}
      metal={searchParams.metal ?? "Yellow Gold"}
      sceneId={searchParams.scene ?? "showroom"}
    />
  );
}
