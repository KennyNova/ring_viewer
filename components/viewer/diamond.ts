import * as THREE from "three";

/**
 * Mobile-safe diamond rendering.
 *
 * drei's MeshRefractionMaterial ray-traces a BVH stored in integer textures
 * (usampler2D) with a 60-entry stack per pixel. On iOS Safari's ANGLE/Metal
 * WebGL backend that shader either fails silently or trips the GPU watchdog and
 * loses the context, which is why gems rendered black/blank on iPhone.
 *
 * Every diamond cut (round, princess, cushion, emerald, oval, pear, marquise...) is a convex
 * solid bounded by flat facets. So instead of a general ray tracer we extract each stone's facet
 * planes once, store them in a small float texture, and the fragment shader finds where light
 * leaves the stone exactly: inside a convex solid, the exit is the nearest plane the ray is
 * heading towards. That is exact for any shape and gives crisp facets. (An earlier version
 * approximated the stone with a "distance from centre" cube map, which made every cut reflect
 * like a round brilliant and produced speckle noise.) Only core WebGL2 is used: float textures
 * read with texelFetch, and loops with a compile-time bound.
 */

export type DiamondQuality = "high" | "low";

const diamondVertex = /* glsl */ `
  uniform vec3 uLocalCamera;
  varying vec3 vLocalPos;
  varying vec3 vLocalView;
  void main() {
    vLocalPos = position;
    vLocalView = position - uLocalCamera;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const diamondFragment = /* glsl */ `
  #include <common>

  #ifdef ENV_CUBE
    uniform samplerCube envCube;
  #else
    uniform sampler2D envMap;
  #endif
  #ifdef STUDIO_ENV
    uniform samplerCube studioCube;
  #endif
  // One texel per facet plane: xyz = outward normal, w = distance from the stone's centre
  uniform highp sampler2D uPlanes;
  uniform int uPlaneCount;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform float uIor;
  uniform float uEnvIntensity;
  uniform float uDispersion;
  uniform vec3 uColor;
  uniform mat3 uLocalToWorld;
  uniform vec3 uLocalCamera;
  uniform float uContrast;
  uniform float uPivot;
  uniform float uSceneColor;
  uniform float uSceneLight;
  uniform float uObstruction;
  uniform float uObstructionCos;

  varying vec3 vLocalPos;
  varying vec3 vLocalView;

  float luma(vec3 c) {
    return max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-5);
  }

  // The light a diamond "sees" in a direction, shaped the way a real stone shows it.
  vec3 envSample(vec3 localDir) {
    vec3 dir = normalize(uLocalToWorld * localDir);
    #ifdef ENV_CUBE
      vec3 c = textureLod(envCube, dir, 0.0).rgb;
    #else
      vec3 c = textureLod(envMap, equirectUv(dir), 0.0).rgb;
    #endif
    float lum = luma(c);
    vec3 hue = c / lum;

    // 1. A diamond's brilliance comes from its cut and the bright sources it catches, so most of
    //    the brightness comes from a fixed studio reference and only a share from the scene.
    //    Otherwise a darker scene turns the stone smoky and a bright one turns it to glass.
    #ifdef STUDIO_ENV
      lum = mix(luma(textureLod(studioCube, dir, 0.0).rgb), lum, uSceneLight);
    #endif

    // 2. The viewer's head and the camera sit between the stone and whatever light is behind
    //    them, so light arriving from (roughly) the viewer's direction is dark. Bounced around
    //    inside the stone, that dark patch is what draws a real diamond's dark facets and arrows;
    //    without it the stone reads as evenly lit glass.
    vec3 toViewer = normalize(uLocalCamera - uCenter);
    float blocked = smoothstep(uObstructionCos - 0.07, uObstructionCos, dot(normalize(localDir), toViewer)) * uObstruction;
    lum *= 1.0 - blocked;

    // 3. Diamonds turn a few bright sources into sharp sparkle against dark facets, so expand
    //    contrast around a pivot: light sources get brighter, soft surroundings get darker.
    float shaped = uPivot * pow(lum / uPivot, uContrast);

    // 4. A colourless stone doesn't take on the room's colour overall; coloured light shows up
    //    in the sparkles. Pull the hue towards white so a scene tints the stone only gently.
    hue = mix(vec3(1.0), hue, uSceneColor);

    return hue * shaped * uEnvIntensity;
  }

  // Where a ray starting inside the stone at p (relative to the centre) heading along d leaves
  // it, and the outward normal of the facet it leaves through. Inside a convex solid that is the
  // nearest of the planes the ray is moving towards.
  float exitFacet(vec3 p, vec3 d, out vec3 normal) {
    float tMin = 1e20;
    normal = d;
    for (int i = 0; i < MAX_PLANES; i++) {
      if (i >= uPlaneCount) break;
      vec4 plane = texelFetch(uPlanes, ivec2(i, 0), 0);
      float approach = dot(plane.xyz, d);
      if (approach > 1e-6) {
        float t = (plane.w - dot(plane.xyz, p)) / approach;
        if (t < tMin) {
          tMin = t;
          normal = plane.xyz;
        }
      }
    }
    return max(tMin, 0.0);
  }

  float schlick(float cosTheta, float f0) {
    return f0 + (1.0 - f0) * pow(1.0 - clamp(cosTheta, 0.0, 1.0), 5.0);
  }

  // Reflectance when leaving the stone: Schlick evaluated at the transmitted (air-side) angle,
  // so light close to the critical angle mostly stays inside, which is where brilliance comes from
  float exitFresnel(float cosInside, float ior, float f0) {
    float sin2 = ior * ior * (1.0 - cosInside * cosInside);
    if (sin2 >= 1.0) return 1.0;
    return schlick(sqrt(1.0 - sin2), f0);
  }

  vec3 traceInside(vec3 p, vec3 d, float ior, float f0) {
    vec3 light = vec3(0.0);
    float carry = 1.0;
    for (int i = 0; i < BOUNCES; i++) {
      vec3 n;
      float t = exitFacet(p, d, n);
      vec3 hit = p + d * t;
      vec3 outDir = refract(d, -n, ior);
      if (dot(outDir, outDir) > 0.0) {
        float fr = exitFresnel(dot(d, n), ior, f0);
        light += carry * (1.0 - fr) * envSample(outDir);
        carry *= fr;
      }
      d = reflect(d, -n);
      // Step back inside so the next search doesn't immediately hit the same facet
      p = hit + d * (uRadius * 1e-4);
    }
    // Whatever is still bouncing around escapes along its last direction
    return light + carry * envSample(d);
  }

  void main() {
    vec3 v = normalize(vLocalView);
    vec3 n = normalize(cross(dFdx(vLocalPos), dFdy(vLocalPos)));
    if (dot(n, v) > 0.0) n = -n;

    float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
    float fresnel = schlick(dot(-v, n), f0);
    vec3 reflection = envSample(reflect(v, n));

    vec3 p = vLocalPos - uCenter;
    vec3 refracted;
    #ifdef DISPERSION
      float spread = uDispersion;
      refracted.r = traceInside(p, refract(v, n, 1.0 / (uIor - spread)), uIor - spread, f0).r;
      refracted.g = traceInside(p, refract(v, n, 1.0 / uIor), uIor, f0).g;
      refracted.b = traceInside(p, refract(v, n, 1.0 / (uIor + spread)), uIor + spread, f0).b;
    #else
      refracted = traceInside(p, refract(v, n, 1.0 / uIor), uIor, f0);
    #endif

    gl_FragColor = vec4(mix(refracted * uColor, reflection, fresnel), 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface GemShape {
  /** One RGBA float texel per facet plane: outward normal and distance from the centre */
  planes: THREE.DataTexture;
  planeCount: number;
  center: THREE.Vector3;
  radius: number;
}

/**
 * Every facet is checked at every internal bounce, so the count drives per-pixel cost. Real cuts
 * have roughly 57–150 facets; curved outlines (cushion, oval, pear) arrive as hundreds of thin
 * slivers that differ by fractions of a degree, so those get merged more loosely until under this.
 */
const MAX_FACETS = 160;

interface Facet {
  n: THREE.Vector3; // area-weighted sum of normals
  d: number; // area-weighted sum of offsets
  weight: number; // total area
}

/** Merges triangle planes whose normals and offsets agree within the given tolerances. */
function mergeFacets(triangles: { n: THREE.Vector3; d: number; area: number }[], angleDeg: number, offset: number) {
  const sameNormal = Math.cos(THREE.MathUtils.degToRad(angleDeg));
  const facets: (Facet & { unit: THREE.Vector3 })[] = [];
  for (const tri of triangles) {
    const match = facets.find((f) => f.unit.dot(tri.n) > sameNormal && Math.abs(f.d / f.weight - tri.d) < offset);
    if (match) {
      match.n.addScaledVector(tri.n, tri.area);
      match.d += tri.d * tri.area;
      match.weight += tri.area;
      match.unit.copy(match.n).normalize();
    } else {
      facets.push({ n: tri.n.clone().multiplyScalar(tri.area), d: tri.d * tri.area, weight: tri.area, unit: tri.n.clone() });
    }
  }
  return facets;
}

/**
 * Extracts a stone's facet planes from its mesh. Each triangle gives a plane (normal oriented
 * away from the centre); coplanar triangles, which make up one facet, are merged.
 */
export function buildGemShape(geometry: THREE.BufferGeometry): GemShape {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const center = box.getCenter(new THREE.Vector3());
  let radius = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) radius = Math.max(radius, v.fromBufferAttribute(pos, i).distanceTo(center));
  radius = radius || 1;

  const index = geometry.index;
  const triangleCount = index ? index.count / 3 : pos.count / 3;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const centroid = new THREE.Vector3();

  const triangles: { n: THREE.Vector3; d: number; area: number }[] = [];
  for (let t = 0; t < triangleCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0).sub(center);
    b.fromBufferAttribute(pos, i1).sub(center);
    c.fromBufferAttribute(pos, i2).sub(center);
    const n = new THREE.Vector3().subVectors(c, b).cross(edge.subVectors(a, b));
    const area = n.length();
    if (area < 1e-12) continue;
    n.divideScalar(area);
    centroid.copy(a).add(b).add(c).divideScalar(3);
    if (n.dot(centroid) < 0) n.negate();
    const d = n.dot(centroid);
    if (d <= 0) continue; // degenerate or through the centre: not a bounding facet
    triangles.push({ n, d, area });
  }
  // Big triangles first, so each facet is seeded by its dominant plane rather than a sliver
  triangles.sort((x, y) => y.area - x.area);

  let angle = 0.75;
  let facets = mergeFacets(triangles, angle, radius * 0.003);
  while (facets.length > MAX_FACETS && angle < 8) {
    angle *= 1.5;
    facets = mergeFacets(triangles, angle, radius * 0.003 * (angle / 0.75));
  }

  const planeCount = Math.max(1, facets.length);
  const data = new Float32Array(planeCount * 4);
  facets.forEach((f, i) => {
    const n = f.n.normalize();
    data.set([n.x, n.y, n.z, f.d / f.weight], i * 4);
  });
  const planes = new THREE.DataTexture(data, planeCount, 1, THREE.RGBAFormat, THREE.FloatType);
  planes.minFilter = THREE.NearestFilter;
  planes.magFilter = THREE.NearestFilter;
  planes.generateMipmaps = false;
  planes.needsUpdate = true;

  return { planes, planeCount, center, radius };
}

/** Loop bound for the shader, rounded up so stones with similar facet counts share a program. */
function maxPlanesFor(count: number) {
  let bound = 32;
  while (bound < count) bound *= 2;
  return bound;
}

export function createDiamondMaterial(shape: GemShape, quality: DiamondQuality) {
  const material = new THREE.ShaderMaterial({
    vertexShader: diamondVertex,
    fragmentShader: diamondFragment,
    defines: {
      BOUNCES: quality === "high" ? 5 : 3,
      MAX_PLANES: maxPlanesFor(shape.planeCount),
      ...(quality === "high" ? { DISPERSION: "" } : {}),
    },
    uniforms: {
      envMap: { value: null },
      envCube: { value: null },
      studioCube: { value: null },
      uPlanes: { value: shape.planes },
      uPlaneCount: { value: shape.planeCount },
      uCenter: { value: shape.center },
      uRadius: { value: shape.radius },
      // Values below were tuned by eye against renders of a round brilliant and an elongated
      // cushion in every scene.
      uIor: { value: 2.42 },
      uEnvIntensity: { value: 1.75 },
      // Share of the stone's brightness that follows the scene (the rest comes from the studio)
      uSceneLight: { value: 0.3 },
      // Share of the scene's colour that reaches the stone (mostly visible in the sparkles)
      uSceneColor: { value: 0.4 },
      // Diamond's red-to-blue refractive index spread is about 0.044; 0.05 on each side was
      // roughly double that and read as rainbow glass rather than fire
      uDispersion: { value: 0.03 },
      // Brightness contrast around uPivot: sparkle up, soft surroundings down
      uContrast: { value: 2.6 },
      uPivot: { value: 1.15 },
      // How dark the viewer's head/camera reads, and the cosine of its half-angle (0.905 ≈ 25°)
      uObstruction: { value: 0.97 },
      uObstructionCos: { value: 0.905 },
      uColor: { value: new THREE.Color("#ffffff") },
      uLocalCamera: { value: new THREE.Vector3() },
      uLocalToWorld: { value: new THREE.Matrix3() },
    },
  });
  return material;
}

const inverse = new THREE.Matrix4();

/** Keeps the per-object uniforms in sync; call from the mesh's onBeforeRender. */
export function updateDiamondUniforms(
  material: THREE.ShaderMaterial,
  object: THREE.Object3D,
  camera: THREE.Camera,
  envMap: THREE.Texture | null,
  studioEnv: THREE.Texture | null = null
) {
  inverse.copy(object.matrixWorld).invert();
  material.uniforms.uLocalCamera.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverse);
  material.uniforms.uLocalToWorld.value.setFromMatrix4(object.matrixWorld);
  const isCube = !!(envMap as THREE.CubeTexture | null)?.isCubeTexture;
  const hasStudio = !!(studioEnv as THREE.CubeTexture | null)?.isCubeTexture;
  if (isCube !== "ENV_CUBE" in material.defines || hasStudio !== "STUDIO_ENV" in material.defines) {
    if (isCube) material.defines.ENV_CUBE = "";
    else delete material.defines.ENV_CUBE;
    if (hasStudio) material.defines.STUDIO_ENV = "";
    else delete material.defines.STUDIO_ENV;
    material.needsUpdate = true;
  }
  material.uniforms.envMap.value = isCube ? null : envMap;
  material.uniforms.envCube.value = isCube ? envMap : null;
  material.uniforms.studioCube.value = hasStudio ? studioEnv : null;
}
