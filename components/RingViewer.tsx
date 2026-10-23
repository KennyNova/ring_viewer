"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import SiteHeader, { MASINA } from "./SiteHeader";
import { CombinedLoader } from "./DiamondLoader";
import RingStage, { type RingAnalysis } from "./viewer/RingStage";
import { METALS, metalByName } from "./viewer/metals";
import { SCENES, sceneById } from "./viewer/scenes";
import { handleZipFile } from "./viewer/photosphere";
import type { DiamondQuality } from "./viewer/diamond";

interface PhotosphereViewerProps {
  images: Array<{ url: string; h: number; v: number }>;
  onClose: () => void;
}
const PhotosphereViewer = dynamic<PhotosphereViewerProps>(() => import("./PhotosphereViewer"), { ssr: false });

interface RingViewerProps {
  modelUrl: string;
  modelName: string;
  category: string;
}

const prettyCategory = (category: string) => category.replace(/([a-z])([A-Z])/g, "$1 $2");

/** Phones and tablets get fewer internal bounces and smaller gem maps. */
function detectQuality(): DiamondQuality {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const mobile = iOS || /Android|Mobi/i.test(ua) || window.innerWidth < 768;
  return mobile ? "low" : "high";
}

function IconRotate() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}

function IconZoom({ plus }: { plus: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M5 12h14" />
      {plus && <path d="M12 5v14" />}
    </svg>
  );
}

function IconReset() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}

export default function RingViewer({ modelUrl, modelName, category }: RingViewerProps) {
  const [quality, setQuality] = useState<DiamondQuality | null>(null);
  const [primaryMetal, setPrimaryMetal] = useState("Yellow Gold");
  const [accentMetal, setAccentMetal] = useState("White Gold");
  const [editing, setEditing] = useState<"primary" | "accent">("primary");
  const [hasAccent, setHasAccent] = useState(false);
  const [gemCount, setGemCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [interacted, setInteracted] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  // `sceneId` drives the UI and background immediately; `litScene` swaps the 3D lighting while the ring is faded out
  const [sceneId, setSceneId] = useState(SCENES[0].id);
  const [litScene, setLitScene] = useState(SCENES[0].id);
  const [sceneFade, setSceneFade] = useState(false);
  const [zoom, setZoom] = useState({ token: 0, dir: 1 as 1 | -1 });
  const [contextLost, setContextLost] = useState(false);
  const [debug, setDebug] = useState(false);
  const [rendererInfo, setRendererInfo] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [photosphere, setPhotosphere] = useState<{ url: string; h: number; v: number }[]>([]);

  useEffect(() => {
    setQuality(detectQuality());
    setDebug(new URLSearchParams(window.location.search).has("debug"));
    // Space toggles the internal tools (stats, photosphere capture)
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        setDebug((d) => !d);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleAnalyzed = useCallback(({ hasAccent, gemCount }: RingAnalysis) => {
    setHasAccent(hasAccent);
    if (!hasAccent) setEditing("primary");
    setGemCount(gemCount);
  }, []);
  const handleReady = useCallback(() => setReady(true), []);
  const handleInteract = useCallback(() => {
    // The showcase pauses itself on interaction and resumes after a few idle seconds
    setInteracted(true);
  }, []);
  const handleContextLost = useCallback(() => setContextLost(true), []);

  const selectScene = (id: string) => {
    if (id === sceneId) return;
    setSceneId(id);
    setSceneFade(true);
    setTimeout(() => {
      setLitScene(id);
      // Give the new environment a frame to render before fading the ring back in
      setTimeout(() => setSceneFade(false), 120);
    }, 260);
  };
  const scene = sceneById(sceneId);

  const activeMetal = editing === "primary" ? primaryMetal : accentMetal;
  const setActiveMetal = editing === "primary" ? setPrimaryMetal : setAccentMetal;

  const openPhotosphereZip = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const images = await handleZipFile(file);
      if (images.length === 0) return alert("No valid photosphere images found in the ZIP file.");
      setPhotosphere(images);
    } catch (error) {
      console.error("Error processing ZIP file:", error);
      alert("Error processing the ZIP file. Please make sure it contains valid photosphere images.");
    }
  };

  const closePhotosphere = () => {
    photosphere.forEach((img) => URL.revokeObjectURL(img.url));
    setPhotosphere([]);
  };

  if (photosphere.length > 0) {
    return (
      <div className="relative h-[100svh] w-screen">
        <PhotosphereViewer images={photosphere} onClose={closePhotosphere} />
        <button className="btn absolute left-4 top-4 z-10" onClick={closePhotosphere}>
          Back to 3D
        </button>
      </div>
    );
  }

  return (
    <>
      <SiteHeader compact back={{ href: `/${encodeURIComponent(category)}`, label: prettyCategory(category) }} />

      <main className="grid lg:h-[calc(100svh-77px)] lg:min-h-[560px] lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
        {/* Stage */}
        <section className="viewer-stage h-[62svh] lg:h-auto">
          {/* Out-of-focus surroundings for each scene, cross-faded */}
          {SCENES.map((s) => (
            <div
              key={s.id}
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: s.background, opacity: s.id === sceneId ? 1 : 0, transition: "opacity 0.8s ease" }}
            />
          ))}
          {quality && !contextLost && (
            <div
              className="absolute inset-0"
              style={{ opacity: sceneFade ? 0 : 1, transition: `opacity ${sceneFade ? 0.25 : 0.45}s ease` }}
            >
            <RingStage
              scene={sceneById(litScene)}
              modelUrl={modelUrl}
              modelName={modelName}
              primaryMetal={primaryMetal}
              accentMetal={accentMetal}
              quality={quality}
              autoRotate={autoRotate}
              resetToken={resetToken}
              zoom={zoom}
              debug={debug}
              capturingPhotosphere={capturing}
              onPhotosphereDone={() => setCapturing(false)}
              onAnalyzed={handleAnalyzed}
              onReady={handleReady}
              onUserInteract={handleInteract}
              onContextLost={handleContextLost}
              onRendererInfo={setRendererInfo}
            />
            </div>
          )}

          {contextLost && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
              <p className="display text-[18px]">The 3D view paused</p>
              <p className="max-w-xs text-[14px]" style={{ color: "var(--ink-soft)" }}>
                Your device needed the graphics memory back. Reload to keep exploring this ring.
              </p>
              <button className="btn" onClick={() => window.location.reload()}>
                Reload Viewer
              </button>
            </div>
          )}

          <CombinedLoader ready={ready || contextLost} />

          {/* Stage controls */}
          <div className="absolute bottom-4 right-4 z-10 flex gap-2">
            <button className="icon-btn" aria-label="Zoom out" onClick={() => setZoom((z) => ({ token: z.token + 1, dir: -1 }))}>
              <IconZoom plus={false} />
            </button>
            <button className="icon-btn" aria-label="Zoom in" onClick={() => setZoom((z) => ({ token: z.token + 1, dir: 1 }))}>
              <IconZoom plus />
            </button>
            <button
              className="icon-btn"
              aria-label={autoRotate ? "Pause showcase" : "Play showcase"}
              aria-pressed={autoRotate}
              onClick={() => setAutoRotate((r) => !r)}
            >
              <IconRotate />
            </button>
            <button className="icon-btn" aria-label="Reset view" onClick={() => setResetToken((t) => t + 1)}>
              <IconReset />
            </button>
          </div>
          <p
            className="eyebrow pointer-events-none absolute bottom-6 left-4 right-[188px] z-10 sm:left-6"
            style={{
              opacity: interacted ? 0 : 1,
              color: scene.tone === "dark" ? "rgba(255,255,255,0.75)" : undefined,
              transition: "opacity 0.6s ease, color 0.6s ease",
            }}
          >
            Drag to rotate · Scroll or pinch to zoom
          </p>

          {debug && (
            <div className="absolute left-4 top-4 z-10 flex max-w-[280px] flex-col gap-2 bg-white/90 p-3 text-[11px]">
              <p>Renderer: {rendererInfo}</p>
              <p>
                Quality: {quality} · Gems: {gemCount}
              </p>
              <button className="btn btn--outline !min-h-0 !py-2" onClick={() => setCapturing(true)}>
                Capture Photosphere
              </button>
              <label className="btn btn--outline !min-h-0 !py-2">
                <input type="file" accept=".zip" className="hidden" onChange={openPhotosphereZip} />
                View Photosphere ZIP
              </label>
            </div>
          )}
        </section>

        {/* Details */}
        <aside className="border-t px-5 py-8 sm:px-10 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:py-12" style={{ borderColor: "var(--line)" }}>
          <p className="eyebrow">{prettyCategory(category)} Collection</p>
          <h1 className="display mt-3 text-[28px] sm:text-[34px]">{/^\d/.test(modelName) ? `Style ${modelName}` : modelName}</h1>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Handcrafted to order by Masina Diamonds in Atlanta. Explore the design in every metal, then see it in
            person with one of our designers.
          </p>

          <div className="my-8 h-px" style={{ background: "var(--line)" }} />

          {hasAccent && (
            <div className="segmented mb-6" role="group" aria-label="Metal to customise">
              <button aria-pressed={editing === "primary"} onClick={() => setEditing("primary")}>
                Band
              </button>
              <button aria-pressed={editing === "accent"} onClick={() => setEditing("accent")}>
                Setting
              </button>
            </div>
          )}

          <p className="text-[12px] uppercase tracking-[0.2em]">
            Metal <span style={{ color: "var(--ink-muted)" }}>— {metalByName(activeMetal).name}</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-3">
            {METALS.map((metal) => (
              <div key={metal.name} className="flex w-[64px] flex-col items-center gap-2">
                <button
                  className="swatch"
                  aria-label={metal.name}
                  aria-pressed={activeMetal === metal.name}
                  onClick={() => setActiveMetal(metal.name)}
                >
                  <span style={{ background: `linear-gradient(135deg, #fff 0%, ${metal.swatch} 45%, ${metal.swatch} 70%, #fff 130%)` }} />
                </button>
                <span className="text-center text-[10px] uppercase leading-tight tracking-[0.12em]" style={{ color: "var(--ink-soft)" }}>
                  {metal.name}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-8 text-[12px] uppercase tracking-[0.2em]">
            See it at <span style={{ color: "var(--ink-muted)" }}>— {scene.name}</span>
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Viewing scene">
            {SCENES.map((s) => (
              <button
                key={s.id}
                className="scene-tile"
                aria-pressed={s.id === sceneId}
                title={s.blurb}
                onClick={() => selectScene(s.id)}
              >
                <span className="scene-tile__swatch" style={{ background: s.swatch }} />
                <span className="scene-tile__label">{s.name}</span>
              </button>
            ))}
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-y-3 text-[13px]">
            <dt style={{ color: "var(--ink-muted)" }}>Style</dt>
            <dd className="text-right">{modelName}</dd>
            <dt style={{ color: "var(--ink-muted)" }}>Collection</dt>
            <dd className="text-right">{prettyCategory(category)}</dd>
            {gemCount > 0 && (
              <>
                <dt style={{ color: "var(--ink-muted)" }}>Diamonds</dt>
                <dd className="text-right">{gemCount}</dd>
              </>
            )}
          </dl>

          <div className="mt-10 flex flex-col gap-3">
            <a href={MASINA.appointment} className="btn btn--block">
              Book Appointment
            </a>
            <a href={MASINA.builder} className="btn btn--outline btn--block">
              Custom Ring Builder
            </a>
          </div>

          <p className="mt-8 text-[12px] leading-relaxed" style={{ color: "var(--ink-muted)" }}>
            This is a 3D render. Colour, stone size and finish of the final piece may vary slightly.
          </p>
        </aside>
      </main>
    </>
  );
}
