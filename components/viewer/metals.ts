export interface Metal {
  name: string;
  /** Swatch colour shown in the UI */
  swatch: string;
  /**
   * PBR base colour for the 3D band: the metal's measured normal-incidence reflectance (F0),
   * written as sRGB hex. These look pale on their own; that is correct for metals, whose colour
   * comes from tinting the reflections rather than from a painted surface colour.
   */
  color: string;
  roughness: number;
}

export const METALS: Metal[] = [
  // 18k yellow gold, linear F0 ≈ (1.00, 0.77, 0.34)
  { name: "Yellow Gold", swatch: "#e3c47b", color: "#ffe29d", roughness: 0.08 },
  // 14k–18k rose gold, linear F0 ≈ (0.93, 0.58, 0.47)
  { name: "Rose Gold", swatch: "#dba08c", color: "#f6c9b5", roughness: 0.08 },
  // Rhodium-plated white gold, linear F0 ≈ (0.78, 0.77, 0.74)
  { name: "White Gold", swatch: "#e4e4e1", color: "#e3e2df", roughness: 0.06 },
  // Platinum, linear F0 ≈ (0.67, 0.65, 0.62): greyer and a touch softer than rhodium
  { name: "Platinum", swatch: "#cfd1d3", color: "#d7d4ce", roughness: 0.09 },
];

export const metalByName = (name: string) => METALS.find((m) => m.name === name) ?? METALS[0];
