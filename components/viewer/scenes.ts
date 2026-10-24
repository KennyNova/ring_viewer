/**
 * Places someone would actually look down at their ring, each with the light it would have.
 *
 * A scene has two halves that must agree:
 *  - `lights` + `backdrop`: what the metal and diamonds reflect (rendered into the environment
 *    cube map from light panels; nothing is downloaded)
 *  - `background`: the out-of-focus surroundings drawn behind the canvas in CSS, like a photo
 *    taken with shallow depth of field
 * Positions are around the ring at the origin; the default camera looks in from +X/+Z, slightly above.
 */

export interface SceneLight {
  form: "rect" | "ring" | "circle";
  color?: string;
  intensity: number;
  scale: number | [number, number, number];
  position: [number, number, number];
}

export interface RingScene {
  id: string;
  name: string;
  blurb: string;
  /** Gradient on the surrounding sphere: overhead, horizon, below */
  backdrop: { top: string; horizon: string; bottom: string };
  lights: SceneLight[];
  /**
   * How much of this scene's own lighting reaches the ring, 0 to 1. The neutral studio lighting is
   * always on underneath; the scene's backdrop, lights and exposure are blended in by this amount,
   * so a place gives the ring a hint of its mood without turning the metal and stones into its colour.
   * Defaults to DEFAULT_SCENE_INFLUENCE. The showroom is the base, so it ignores this.
   */
  influence?: number;
  exposure: number;
  /** Soft ground shadow; only the showroom has a surface under the ring */
  shadowOpacity: number;
  /** Real photograph of the place, blurred behind the canvas so the ring stays the focus */
  photo: string;
  /** CSS background behind the canvas; shows while the photo loads and in thumbnail captures */
  background: string;
  /** Small preview for the scene picker (full-size bokeh doesn't scale down) */
  swatch: string;
  /** Text and controls over the stage need to stay legible */
  tone: "light" | "dark";
}

/** Soft out-of-focus highlights, positioned deterministically so the page doesn't jump on reload. */
function bokeh(colors: string[], count: number, seed: number, maxSize = 70) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: count }, (_, i) => {
    const color = colors[i % colors.length];
    const x = Math.round(rand() * 100);
    const y = Math.round(rand() * 100);
    const r = Math.round(maxSize * (0.35 + rand() * 0.65));
    return `radial-gradient(circle at ${x}% ${y}%, ${color} 0, ${color} ${Math.round(r * 0.45)}px, transparent ${r}px)`;
  }).join(", ");
}

// Shared studio rig: also used for the catalogue thumbnails
const SHOWROOM_LIGHTS: SceneLight[] = [
  // Large overhead softbox: the broad, soft top highlight on the band
  { form: "rect", intensity: 2.4, scale: [9, 6, 1], position: [0, 9, 0] },
  // Tall key strip on the camera side: the long crisp streak down the shank
  { form: "rect", intensity: 7, scale: [1.1, 12, 1], position: [7, 1.5, 4] },
  // Fill strip opposite, dimmer, so the far side keeps some shape
  { form: "rect", intensity: 3.2, scale: [1.1, 12, 1], position: [-7, 1.5, 2.5] },
  // Horizontal rim strip behind: separates the head from the band
  { form: "rect", intensity: 3, scale: [12, 1, 1], position: [0, 2.5, -8] },
  // Ring light above the camera: round catchlights in the stones and prongs
  { form: "ring", intensity: 4, scale: 3.5, position: [3, 7, 6] },
  // Small hard spot for scintillation in the diamonds
  { form: "circle", intensity: 14, scale: 0.8, position: [-3, 8, 4] },
  // Black flags: the dark bands that give polished metal its edges and depth
  { form: "rect", color: "#000000", intensity: 1, scale: [3, 14, 1], position: [-5, 0, 7] },
  { form: "rect", color: "#000000", intensity: 1, scale: [14, 2.5, 1], position: [0, -1, -7] },
  // Warm low bounce card so undersides aren't dead black
  { form: "rect", color: "#f1e7dc", intensity: 1, scale: [16, 16, 1], position: [0, -8, 0] },
];

export const SCENES: RingScene[] = [
  {
    id: "showroom",
    photo: "/scenes/showroom.jpg",
    name: "Showroom",
    blurb: "Our Atlanta studio lighting",
    backdrop: { top: "#f4f2ef", horizon: "#d3cfca", bottom: "#8a8681" },
    lights: SHOWROOM_LIGHTS,
    exposure: 1,
    shadowOpacity: 0.35,
    background: "radial-gradient(120% 90% at 50% 35%, #ffffff 0%, #f6f3ef 60%, #ece6de 100%)",
    swatch: "radial-gradient(120% 90% at 50% 35%, #ffffff 0%, #f1ede8 60%, #e4ddd3 100%)",
    tone: "light",
  },
  {
    id: "window",
    photo: "/scenes/window.jpg",
    name: "Morning Window",
    blurb: "Soft daylight by the window",
    backdrop: { top: "#eef2f6", horizon: "#cfd6dc", bottom: "#6d7075" },
    lights: [
      // The window: a big cool panel to one side, crossed by its frame
      { form: "rect", color: "#f3f7ff", intensity: 6, scale: [6, 8, 1], position: [8, 3, 2] },
      { form: "rect", color: "#2b2b2b", intensity: 1, scale: [0.3, 8, 1], position: [7.5, 3, 1.9] },
      { form: "rect", color: "#2b2b2b", intensity: 1, scale: [6, 0.3, 1], position: [7.5, 3, 1.9] },
      // Ceiling and the room's warm walls
      { form: "rect", intensity: 1.3, scale: [10, 10, 1], position: [0, 9, 0] },
      { form: "rect", color: "#fff1e2", intensity: 1.1, scale: [10, 8, 1], position: [-8, 1, 0] },
      { form: "rect", color: "#fbf3ea", intensity: 0.9, scale: [16, 16, 1], position: [0, -8, 0] },
      // Dark furniture on the room side keeps an edge on the metal
      { form: "rect", color: "#1c1c1c", intensity: 1, scale: [2.5, 10, 1], position: [-6, 2, 6] },
    ],
    exposure: 1,
    shadowOpacity: 0,
    background: [
      "radial-gradient(70% 90% at 92% 30%, rgba(255,255,255,0.95), rgba(255,255,255,0) 70%)",
      bokeh(["rgba(255,255,255,0.55)", "rgba(226,236,246,0.5)"], 10, 7, 90),
      "linear-gradient(100deg, #dfe4e9 0%, #eef0ef 45%, #f8f7f3 100%)",
    ].join(", "),
    swatch: "radial-gradient(60% 90% at 90% 30%, #ffffff, rgba(255,255,255,0) 70%), linear-gradient(100deg, #d8dee4 0%, #eef0ef 50%, #f8f7f3 100%)",
    tone: "light",
  },
  {
    id: "golden",
    photo: "/scenes/golden.jpg",
    name: "Golden Hour",
    blurb: "Low warm sun outdoors",
    backdrop: { top: "#6f6a9a", horizon: "#f0a060", bottom: "#2a1a12" },
    lights: [
      // The sun, low and warm, plus its glow along the horizon
      { form: "circle", color: "#ffb469", intensity: 16, scale: 1.2, position: [8, 1.2, 3] },
      { form: "rect", color: "#ffcf99", intensity: 2, scale: [18, 1.4, 1], position: [0, 0.8, -8] },
      // Cool sky overhead and warm ground bounce
      { form: "rect", color: "#b8c7ff", intensity: 1.4, scale: [14, 12, 1], position: [0, 9, -2] },
      { form: "rect", color: "#6b4430", intensity: 0.6, scale: [16, 16, 1], position: [0, -8, 0] },
      // Trees and buildings in silhouette, plus a darker cloud bank overhead
      { form: "rect", color: "#000000", intensity: 1, scale: [3, 12, 1], position: [-6, 1, 5] },
      { form: "rect", color: "#120c0a", intensity: 1, scale: [18, 2, 1], position: [0, -0.6, -7] },
      { form: "rect", color: "#2a2440", intensity: 1, scale: [8, 3, 1], position: [-2, 7, -5] },
    ],
    exposure: 1.05,
    shadowOpacity: 0,
    background: [
      bokeh(["rgba(255,214,150,0.55)", "rgba(255,180,120,0.45)", "rgba(255,240,210,0.5)"], 16, 11),
      "radial-gradient(60% 50% at 85% 62%, rgba(255,206,140,0.85), rgba(255,206,140,0) 70%)",
      "linear-gradient(180deg, #d6c5e2 0%, #f4cdb0 42%, #efa36c 72%, #8b573c 100%)",
    ].join(", "),
    swatch: "radial-gradient(circle at 72% 55%, rgba(255,220,160,0.8) 0, rgba(255,220,160,0.8) 3px, transparent 8px), radial-gradient(circle at 30% 35%, rgba(255,200,140,0.6) 0, rgba(255,200,140,0.6) 2px, transparent 6px), linear-gradient(180deg, #b8a8cc 0%, #f1c4a0 45%, #ec9a62 75%, #6e4430 100%)",
    tone: "light",
  },
  {
    id: "dinner",
    photo: "/scenes/dinner.jpg",
    name: "Candlelit Dinner",
    blurb: "Warm candles across the table",
    backdrop: { top: "#2a1d15", horizon: "#5a3d28", bottom: "#140d09" },
    lights: [
      // Candle flames: small, intense and warm, which is what makes diamonds sparkle at dinner
      { form: "circle", color: "#ffb35c", intensity: 22, scale: 0.5, position: [4, 1.5, 5] },
      { form: "circle", color: "#ffa64d", intensity: 18, scale: 0.45, position: [-3, 1.2, 6] },
      { form: "circle", color: "#ffbd6e", intensity: 16, scale: 0.4, position: [6, 1, -3] },
      { form: "circle", color: "#ffb35c", intensity: 16, scale: 0.4, position: [-6, 1.4, -2] },
      { form: "circle", color: "#ffc477", intensity: 14, scale: 0.35, position: [1, 2, 7] },
      // Pendant lamp over the table
      { form: "rect", color: "#ffcf9a", intensity: 2.5, scale: [3, 3, 1], position: [0, 9, 2] },
      // Warm tablecloth bounce and a dim rim from the room behind
      { form: "rect", color: "#a8683a", intensity: 0.9, scale: [12, 12, 1], position: [0, -6, 0] },
      { form: "rect", color: "#ffd9a8", intensity: 1.2, scale: [10, 0.8, 1], position: [0, 3, -8] },
    ],
    exposure: 1.35,
    shadowOpacity: 0,
    background: [
      bokeh(["rgba(255,176,90,0.55)", "rgba(255,200,120,0.45)", "rgba(255,150,70,0.4)"], 14, 23, 60),
      "radial-gradient(ellipse at 50% 120%, #4a2e1c 0%, #1b130e 60%, #0e0a08 100%)",
    ].join(", "),
    swatch: "radial-gradient(circle at 28% 40%, rgba(255,176,90,0.8) 0, rgba(255,176,90,0.8) 3px, transparent 8px), radial-gradient(circle at 68% 30%, rgba(255,200,120,0.7) 0, rgba(255,200,120,0.7) 2px, transparent 6px), radial-gradient(circle at 55% 70%, rgba(255,150,70,0.6) 0, rgba(255,150,70,0.6) 2px, transparent 6px), radial-gradient(ellipse at 50% 120%, #4a2e1c 0%, #1b130e 60%, #0e0a08 100%)",
    tone: "dark",
  },
  {
    id: "city",
    photo: "/scenes/city.jpg",
    name: "City Night",
    blurb: "Neon and street lights",
    backdrop: { top: "#262c46", horizon: "#343a68", bottom: "#0c0e1a" },
    lights: [
      // Neon signs either side and a warm street lamp overhead
      { form: "rect", color: "#ff4fa3", intensity: 8, scale: [0.6, 10, 1], position: [-7, 2, 3] },
      { form: "rect", color: "#4fd8ff", intensity: 8, scale: [0.6, 10, 1], position: [7, 2, -2] },
      { form: "circle", color: "#ffd7a0", intensity: 10, scale: 2.4, position: [2, 8, 4] },
      // Lit shop window across the street
      { form: "rect", color: "#f2f4ff", intensity: 3, scale: [8, 2.5, 1], position: [0, 1, -8] },
      // Lit windows in the buildings behind
      { form: "rect", color: "#ffe2b0", intensity: 2.2, scale: [1, 1, 1], position: [-3, 3, -8] },
      { form: "rect", color: "#ffe2b0", intensity: 2.2, scale: [1, 1, 1], position: [-1, 4.5, -8] },
      { form: "rect", color: "#ffe2b0", intensity: 2.2, scale: [1, 1, 1], position: [2, 3.5, -8] },
      { form: "rect", color: "#c9d8ff", intensity: 1.6, scale: [1, 1, 1], position: [4, 5, -8] },
    ],
    exposure: 1.35,
    shadowOpacity: 0,
    background: [
      bokeh(["rgba(255,79,163,0.4)", "rgba(79,216,255,0.38)", "rgba(255,207,138,0.45)"], 18, 5, 55),
      "linear-gradient(180deg, #0a0e1f 0%, #151a33 60%, #0b0c14 100%)",
    ].join(", "),
    swatch: "radial-gradient(circle at 25% 35%, rgba(255,79,163,0.7) 0, rgba(255,79,163,0.7) 3px, transparent 8px), radial-gradient(circle at 70% 55%, rgba(79,216,255,0.7) 0, rgba(79,216,255,0.7) 3px, transparent 8px), radial-gradient(circle at 50% 25%, rgba(255,207,138,0.7) 0, rgba(255,207,138,0.7) 2px, transparent 6px), linear-gradient(180deg, #0a0e1f 0%, #1a2040 60%, #0b0c14 100%)",
    tone: "dark",
  },
  {
    id: "beach",
    photo: "/scenes/beach.jpg",
    name: "Beach Day",
    blurb: "Bright sun, sea and sand",
    backdrop: { top: "#bcd5ec", horizon: "#e8eef0", bottom: "#e6d2ad" },
    lights: [
      // Hard midday sun: crisp highlights and strong fire in the stones
      { form: "circle", color: "#fff6e0", intensity: 30, scale: 1.2, position: [4, 9, 3] },
      // Sky dome, bright sand underneath and the sea on the horizon
      { form: "rect", color: "#cfe0f2", intensity: 1.6, scale: [16, 16, 1], position: [0, 10, 0] },
      { form: "rect", color: "#f0dcb8", intensity: 2.4, scale: [16, 16, 1], position: [0, -8, 0] },
      { form: "rect", color: "#9cc8e0", intensity: 1.5, scale: [18, 1, 1], position: [0, 0.5, -9] },
      // Umbrella edge and your own shadow side: the dark that keeps metal from washing out
      { form: "rect", color: "#1a1a1a", intensity: 1, scale: [10, 1.5, 1], position: [0, 6, -6] },
      { form: "rect", color: "#1a1a1a", intensity: 1, scale: [2, 10, 1], position: [-7, 2, 4] },
    ],
    exposure: 0.95,
    shadowOpacity: 0,
    background: [
      "radial-gradient(40% 35% at 78% 12%, rgba(255,252,240,0.95), rgba(255,252,240,0) 70%)",
      bokeh(["rgba(255,255,255,0.45)"], 8, 31, 50),
      "linear-gradient(180deg, #8fbde8 0%, #cfe3f1 46%, #a9d3e0 50%, #e9e2cf 58%, #eadbbf 72%, #dcc39b 100%)",
    ].join(", "),
    swatch: "radial-gradient(35% 40% at 78% 15%, rgba(255,252,240,0.95), rgba(255,252,240,0) 70%), linear-gradient(180deg, #8fbde8 0%, #cfe3f1 45%, #a9d3e0 50%, #e9e2cf 58%, #dcc39b 100%)",
    tone: "light",
  },
];

export const sceneById = (id: string) => SCENES.find((s) => s.id === id) ?? SCENES[0];

/** The studio rig every scene is layered on top of. */
export const BASE_SCENE = SCENES[0];

export const DEFAULT_SCENE_INFLUENCE = 0.3;

export const sceneInfluence = (scene: RingScene) =>
  scene.id === BASE_SCENE.id ? 0 : Math.min(1, Math.max(0, scene.influence ?? DEFAULT_SCENE_INFLUENCE));
