"use client";

import RingStage, { type CameraAngle } from "./RingStage";
import { sceneById } from "./scenes";

/** Full-bleed still of one ring, screenshotted by scripts/generate-thumbnails.mjs. */
export default function CaptureView({
  modelUrl,
  angle,
  metal,
  sceneId,
}: {
  modelUrl: string;
  angle: CameraAngle;
  metal: string;
  sceneId: string;
}) {
  const scene = sceneById(sceneId);
  return (
    // Inline position: .viewer-stage sets position: relative after Tailwind's utilities
    <div className="viewer-stage" style={{ position: "fixed", inset: 0, background: scene.background }}>
      <RingStage
        modelUrl={modelUrl}
        modelName="capture"
        primaryMetal={metal}
        accentMetal="White Gold"
        quality="high"
        scene={scene}
        capture={angle}
      />
    </div>
  );
}
