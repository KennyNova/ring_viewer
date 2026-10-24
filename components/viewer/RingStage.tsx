"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, Stats } from "@react-three/drei";
import SceneEnvironment from "./SceneEnvironment";
import { SCENES, type RingScene } from "./scenes";
import RingModel from "./RingModel";
import { PhotosphereCapturer } from "./photosphere";
import type { DiamondQuality } from "./diamond";

export interface Framing {
  center: THREE.Vector3;
  radius: number;
  floor: number;
}

export interface RingAnalysis {
  hasAccent: boolean;
  gemCount: number;
}

/** Camera directions (from the ring's centre) used for the live view and the thumbnails. */
export const CAMERA_ANGLES = {
  // Three-quarter view from slightly above, so the head and centre stone face the camera
  hero: new THREE.Vector3(0.78, 0.42, 0.46).normalize(),
  // Looking down onto the centre stone's table
  top: new THREE.Vector3(0.22, 0.92, 0.32).normalize(),
};
export type CameraAngle = keyof typeof CAMERA_ANGLES;

function framedDistance(camera: THREE.PerspectiveCamera, framing: Framing, padding: number) {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const aspectFov = camera.aspect < 1 ? 2 * Math.atan(Math.tan(fov / 2) * camera.aspect) : fov;
  return (framing.radius / Math.sin(aspectFov / 2)) * padding;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Glides the camera to the framed position with a fixed-length tween, then gets out of the way.
 * Any drag cancels the tween immediately so the user never fights the animation.
 */
function CameraRig({
  framing,
  resetToken,
  controlsRef,
}: {
  framing: Framing;
  resetToken: number;
  controlsRef: React.MutableRefObject<any>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const tween = useRef<{ from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number } | null>(null);

  useEffect(() => {
    const distance = framedDistance(camera, framing, 1.15);
    const to = framing.center.clone().addScaledVector(CAMERA_ANGLES.hero, distance);
    const intro = resetToken === 0;
    if (intro) {
      const above = CAMERA_ANGLES.hero.clone().setY(1.6).normalize();
      camera.position.copy(framing.center).addScaledVector(above, distance * 1.6);
    }
    tween.current = { from: camera.position.clone(), to, start: performance.now(), duration: intro ? 1600 : 900 };

    const controls = controlsRef.current;
    if (!controls) return;
    controls.target.copy(framing.center);
    controls.minDistance = distance * 0.3;
    controls.maxDistance = distance * 2;
    const cancel = () => (tween.current = null);
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [framing, resetToken, camera, controlsRef]);

  // Runs after OrbitControls' own update, so the tween has the final say while it is active
  useFrame(() => {
    const t = tween.current;
    if (!t) return;
    const k = Math.min(1, (performance.now() - t.start) / t.duration);
    camera.position.lerpVectors(t.from, t.to, easeOutCubic(k));
    camera.lookAt(framing.center);
    if (k === 1) tween.current = null;
  });

  return null;
}

/**
 * Renders at reduced resolution while the ring is being moved and at full resolution when it is
 * still. Each switch resizes the drawing buffer once; a brief CSS blur that fades away hides the
 * change in sharpness. (Easing the pixel ratio in many small steps stuttered, because every step
 * reallocates the buffer.)
 */
function DprSwitch({ controlsRef, max, min }: { controlsRef: React.MutableRefObject<any>; max: number; min: number }) {
  const setDpr = useThree((s) => s.setDpr);
  const gl = useThree((s) => s.gl);
  const sharp = useRef(true);
  const dragging = useRef(false);
  const lastMotion = useRef(0);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const start = () => {
      dragging.current = true;
      lastMotion.current = performance.now();
    };
    const end = () => {
      dragging.current = false;
      lastMotion.current = performance.now();
    };
    const wheel = () => (lastMotion.current = performance.now());
    controls.addEventListener("start", start);
    controls.addEventListener("end", end);
    gl.domElement.addEventListener("wheel", wheel, { passive: true });
    return () => {
      controls.removeEventListener("start", start);
      controls.removeEventListener("end", end);
      gl.domElement.removeEventListener("wheel", wheel);
      clearTimeout(clearTimer.current);
    };
  }, [controlsRef, gl]);

  const switchTo = (dpr: number, blurPx: number, fadeMs: number) => {
    const canvas = gl.domElement;
    setDpr(dpr);
    canvas.style.transition = "none";
    canvas.style.filter = `blur(${blurPx}px)`;
    void canvas.offsetWidth; // commit the blurred state before animating away from it
    canvas.style.transition = `filter ${fadeMs}ms cubic-bezier(0.33, 0, 0.2, 1)`;
    canvas.style.filter = "blur(0px)";
    clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      canvas.style.transition = "";
      canvas.style.filter = "";
    }, fadeMs + 50);
  };

  useFrame(() => {
    const moving = dragging.current || performance.now() - lastMotion.current < 250;
    if (moving && sharp.current) {
      sharp.current = false;
      switchTo(min, .6, 220);
    } else if (!moving && !sharp.current) {
      sharp.current = true;
      switchTo(max, .3, 650);
    }
  });
  return null;
}

const SHOWCASE_IDLE_MS = 6000;
const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * Slow "product film" camera move: orbits the ring while gently tilting, dollying and panning
 * between the stone and the band. It starts after the intro glide, pauses the moment the user
 * touches the ring, and eases back in from wherever they left the camera after a few idle seconds.
 */
function CinematicRig({
  framing,
  enabled,
  resetToken,
  controlsRef,
}: {
  framing: Framing;
  enabled: boolean;
  resetToken: number;
  controlsRef: React.MutableRefObject<any>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const shot = useRef<{ start: number; from: THREE.Spherical; target: THREE.Vector3 } | null>(null);
  const resumeAt = useRef(0);
  const interacting = useRef(false);
  const tmp = useMemo(() => ({ offset: new THREE.Vector3(), spherical: new THREE.Spherical(), target: new THREE.Vector3() }), []);

  // Wait for the intro glide (or the reset glide) to finish before rolling
  useEffect(() => {
    shot.current = null;
    resumeAt.current = performance.now() + (resetToken === 0 ? 1700 : 1000);
  }, [framing, resetToken]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const start = () => {
      interacting.current = true;
      shot.current = null;
    };
    const end = () => {
      interacting.current = false;
      resumeAt.current = performance.now() + SHOWCASE_IDLE_MS;
    };
    // OrbitControls can miss its "end" (e.g. released outside the window), so any release counts
    const release = () => interacting.current && end();
    controls.addEventListener("start", start);
    controls.addEventListener("end", end);
    gl.domElement.addEventListener("wheel", end, { passive: true });
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      controls.removeEventListener("start", start);
      controls.removeEventListener("end", end);
      gl.domElement.removeEventListener("wheel", end);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [controlsRef, gl]);

  useEffect(() => {
    if (!enabled) shot.current = null;
  }, [enabled]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!enabled || interacting.current || !controls) return;
    const now = performance.now();
    if (!shot.current) {
      if (now < resumeAt.current) return;
      tmp.offset.copy(camera.position).sub(controls.target);
      shot.current = { start: now, from: new THREE.Spherical().setFromVector3(tmp.offset), target: controls.target.clone() };
    }

    const { from } = shot.current;
    const t = (now - shot.current.start) / 1000;
    // Everything blends in over the first few seconds so the move starts from rest
    const w = smoothstep(t / 3.5);
    const preferredDistance = framedDistance(camera, framing, 1.15);
    const preferredPhi = Math.acos(CAMERA_ANGLES.hero.y);

    // Orbit: angular speed ramps up linearly over 3.5s, then holds
    const ramp = 3.5;
    const travel = t < ramp ? (t * t) / (2 * ramp) : t - ramp / 2;
    const theta = from.theta + 0.17 * travel;
    // Tilt: drift between a lower profile view and looking down into the stone
    const phi = THREE.MathUtils.lerp(from.phi, preferredPhi + 0.2 * Math.sin(t * 0.19), w);
    // Dolly: breathe in and out around the framed distance
    const radius = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(from.radius, preferredDistance * (1 + 0.12 * Math.sin(t * 0.14 + 0.6)), w),
      controls.minDistance,
      controls.maxDistance
    );
    // Pan: let the focus wander between the band and the head
    tmp.target.copy(framing.center);
    tmp.target.y += framing.radius * 0.2 * Math.sin(t * 0.11);
    tmp.target.lerpVectors(shot.current.target, tmp.target, w);

    tmp.spherical.set(radius, phi, theta);
    controls.target.copy(tmp.target);
    camera.position.copy(tmp.target).add(tmp.offset.setFromSpherical(tmp.spherical));
    camera.lookAt(tmp.target);
  });

  return null;
}

/** Smoothly dollies the camera in or out each time a zoom button is pressed. */
function ZoomRig({ zoom, controlsRef }: { zoom: { token: number; dir: 1 | -1 } | undefined; controlsRef: React.MutableRefObject<any> }) {
  const camera = useThree((s) => s.camera);
  const tween = useRef<{ from: number; to: number; start: number } | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!zoom || zoom.token === 0 || !controls) return;
    // Lets the intro glide and auto-rotate hand over to the user
    controls.dispatchEvent({ type: "start" });
    controls.dispatchEvent({ type: "end" });
    const from = camera.position.distanceTo(controls.target);
    const to = THREE.MathUtils.clamp(from * (zoom.dir > 0 ? 0.72 : 1 / 0.72), controls.minDistance, controls.maxDistance);
    tween.current = { from, to, start: performance.now() };
  }, [zoom, camera, controlsRef]);

  useFrame(() => {
    const t = tween.current;
    const controls = controlsRef.current;
    if (!t || !controls) return;
    const k = Math.min(1, (performance.now() - t.start) / 350);
    const distance = THREE.MathUtils.lerp(t.from, t.to, easeOutCubic(k));
    const offset = camera.position.clone().sub(controls.target).setLength(distance);
    camera.position.copy(controls.target).add(offset);
    if (k === 1) tween.current = null;
  });
  return null;
}

/** Places the camera once for a still image and flags the page as ready for the screenshot. */
function CaptureCamera({ framing, angle }: { framing: Framing; angle: CameraAngle }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const frames = useRef(0);

  useEffect(() => {
    // The bounding sphere is loose around a ring, so frame tighter than the live view
    const distance = framedDistance(camera, framing, angle === "top" ? 0.88 : 0.94);
    camera.position.copy(framing.center).addScaledVector(CAMERA_ANGLES[angle], distance);
    camera.lookAt(framing.center);
  }, [camera, framing, angle]);

  useFrame(() => {
    // Give shadows and gem maps a few frames to settle before the screenshot
    if (++frames.current === 12) (window as any).__ringReady = true;
  });
  return null;
}

interface RingStageProps {
  modelUrl: string;
  modelName: string;
  primaryMetal: string;
  accentMetal: string;
  quality: DiamondQuality;
  /** Where the ring is being viewed; drives lighting and exposure. Defaults to the showroom. */
  scene?: RingScene;
  /** Still-image mode for thumbnails: no controls, fixed camera. */
  capture?: CameraAngle;
  autoRotate?: boolean;
  resetToken?: number;
  zoom?: { token: number; dir: 1 | -1 };
  debug?: boolean;
  capturingPhotosphere?: boolean;
  onPhotosphereDone?: () => void;
  onAnalyzed?: (analysis: RingAnalysis) => void;
  onReady?: () => void;
  onUserInteract?: () => void;
  onContextLost?: () => void;
  onRendererInfo?: (info: string) => void;
}

export default function RingStage({
  modelUrl,
  modelName,
  primaryMetal,
  accentMetal,
  quality,
  scene = SCENES[0],
  capture,
  autoRotate = false,
  resetToken = 0,
  zoom,
  debug,
  capturingPhotosphere = false,
  onPhotosphereDone,
  onAnalyzed,
  onReady,
  onUserInteract,
  onContextLost,
  onRendererInfo,
}: RingStageProps) {
  const [framing, setFraming] = useState<Framing | null>(null);
  const controlsRef = useRef<any>(null);
  const maxDpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, quality === "high" ? 2 : 1.75);

  const handleAnalyzed = useCallback(
    ({ hasAccent, gemCount, size }: { hasAccent: boolean; gemCount: number; size: THREE.Box3 }) => {
      const sphere = size.getBoundingSphere(new THREE.Sphere());
      setFraming({ center: sphere.center, radius: sphere.radius, floor: size.min.y });
      onAnalyzed?.({ hasAccent, gemCount });
    },
    [onAnalyzed]
  );

  useEffect(() => {
    if (framing) onReady?.();
  }, [framing, onReady]);

  return (
    <Canvas
      dpr={capture ? 2 : maxDpr}
      camera={{ position: [0, 60, 40], fov: 35, near: 0.5, far: 1000 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        // Photosphere capture reads pixels right after an explicit render, so no need to preserve
        preserveDrawingBuffer: !!capture,
      }}
      onCreated={({ gl }) => {
        // Khronos PBR Neutral keeps product colours true; ACES pushed gold towards orange
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onContextLost?.();
        });
        const ctx = gl.getContext();
        const info = ctx.getExtension("WEBGL_debug_renderer_info");
        onRendererInfo?.(info ? String(ctx.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown");
      }}
    >
      <Suspense fallback={null}>
        <SceneEnvironment scene={scene} />
        <RingModel
          url={modelUrl}
          primaryMetal={primaryMetal}
          accentMetal={accentMetal}
          quality={quality}
          onAnalyzed={handleAnalyzed}
        />
        {framing && scene.shadowOpacity > 0 && (
          <ContactShadows
            position={[framing.center.x, framing.floor - 0.05, framing.center.z]}
            scale={framing.radius * 4}
            blur={2.4}
            far={framing.radius}
            opacity={scene.shadowOpacity}
            resolution={512}
            frames={1}
          />
        )}
      </Suspense>

      {capture ? (
        framing && <CaptureCamera framing={framing} angle={capture} />
      ) : (
        <>
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enablePan={false}
            enableDamping
            dampingFactor={0.1}
            rotateSpeed={0.7}
            zoomSpeed={0.8}
            onStart={onUserInteract}
          />
          {framing && <CameraRig framing={framing} resetToken={resetToken} controlsRef={controlsRef} />}
          {framing && (
            <CinematicRig framing={framing} enabled={autoRotate} resetToken={resetToken} controlsRef={controlsRef} />
          )}
          <ZoomRig zoom={zoom} controlsRef={controlsRef} />
          <DprSwitch controlsRef={controlsRef} max={maxDpr} min={Math.max(0.75, maxDpr * 0.6)} />
          {debug && <Stats />}
          <PhotosphereCapturer
            enabled={capturingPhotosphere}
            horizontalSteps={24}
            verticalSteps={12}
            orbitControlsRef={controlsRef}
            fileName={`ring_${modelName.replace(/\W+/g, "_")}`}
            onComplete={() => onPhotosphereDone?.()}
          />
        </>
      )}
    </Canvas>
  );
}
