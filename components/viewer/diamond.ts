import * as THREE from "three";

/**
 * Mobile-safe diamond rendering.
 *
 * drei's MeshRefractionMaterial ray-traces a BVH stored in integer textures
 * (usampler2D) with a 60-entry stack per pixel. On iOS Safari's ANGLE/Metal
 * WebGL backend that shader either fails silently or trips the GPU watchdog and
 * loses the context, which is why gems rendered black/blank on iPhone.
 *
 * This material uses the classic "distance cube map" technique instead:
 * once per gem we render the stone's own surface (normal + distance from its
 * centre) into a small RGBA8 cube map, then the fragment shader traces internal
 * reflections against that map with a handful of fixed-count loops. Only core
 * WebGL2 features are used: no float render targets, no integer textures, no
 * dynamic arrays.
 */

export type DiamondQuality = "high" | "low";

const captureVertex = /* glsl */ `
  uniform vec3 uCenter;
  varying vec3 vRel;
  void main() {
    vRel = position - uCenter;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const captureFragment = /* glsl */ `
  uniform float uRadius;
  varying vec3 vRel;
  void main() {
    // Flat facet normal, forced to point away from the gem's centre
    vec3 n = normalize(cross(dFdx(vRel), dFdy(vRel)));
    if (dot(n, vRel) < 0.0) n = -n;
    gl_FragColor = vec4(n * 0.5 + 0.5, clamp(length(vRel) / uRadius, 0.0, 1.0));
  }
`;

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
  uniform samplerCube uShape;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform float uIor;
  uniform float uEnvIntensity;
  uniform float uDispersion;
  uniform vec3 uColor;
  uniform mat3 uLocalToWorld;

  varying vec3 vLocalPos;
  varying vec3 vLocalView;

  vec3 envSample(vec3 localDir) {
    vec3 dir = normalize(uLocalToWorld * localDir);
    #ifdef ENV_CUBE
      return textureLod(envCube, dir, 0.0).rgb * uEnvIntensity;
    #else
      return textureLod(envMap, equirectUv(dir), 0.0).rgb * uEnvIntensity;
    #endif
  }

  vec4 shapeAt(vec3 rel) {
    vec4 s = texture(uShape, rel);
    return vec4(normalize(s.xyz * 2.0 - 1.0), s.w * uRadius);
  }

  // Distance along d from p (relative to centre) to the gem's inner surface.
  // Fixed-point iteration against the distance cube map, convex shapes converge fast.
  float traceExit(vec3 p, vec3 d) {
    float b = dot(p, d);
    float c0 = dot(p, p);
    float r = shapeAt(d).w;
    float t = -b + sqrt(max(b * b - c0 + r * r, 0.0));
    for (int i = 0; i < TRACE_STEPS; i++) {
      r = shapeAt(p + d * t).w;
      t = -b + sqrt(max(b * b - c0 + r * r, 0.0));
    }
    return t;
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
      float t = traceExit(p, d);
      vec3 hit = p + d * t;
      vec3 n = shapeAt(hit).xyz;
      vec3 outDir = refract(d, -n, ior);
      if (dot(outDir, outDir) > 0.0) {
        float fr = exitFresnel(dot(d, n), ior, f0);
        light += carry * (1.0 - fr) * envSample(outDir);
        carry *= fr;
      }
      d = reflect(d, -n);
      p = hit + d * (uRadius * 0.002);
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
  target: THREE.WebGLCubeRenderTarget;
  center: THREE.Vector3;
  radius: number;
}

/** Renders a gem's own surface into a cube map seen from its centre. */
export function captureGemShape(
  renderer: THREE.WebGLRenderer,
  geometry: THREE.BufferGeometry,
  resolution: number
): GemShape {
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position as THREE.BufferAttribute);
  const center = box.getCenter(new THREE.Vector3());
  let radius = 0;
  const pos = geometry.attributes.position;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    radius = Math.max(radius, tmp.fromBufferAttribute(pos, i).distanceTo(center));
  }
  radius = radius * 1.01 || 1;

  const target = new THREE.WebGLCubeRenderTarget(resolution, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
  });
  target.texture.colorSpace = THREE.NoColorSpace;

  const material = new THREE.ShaderMaterial({
    vertexShader: captureVertex,
    fragmentShader: captureFragment,
    uniforms: { uCenter: { value: center }, uRadius: { value: radius } },
    side: THREE.DoubleSide,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));
  const camera = new THREE.CubeCamera(radius * 0.001, radius * 4, target);
  camera.position.copy(center);

  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x808080, 1);
  camera.update(renderer, scene);
  renderer.setClearColor(prevClear, prevAlpha);
  material.dispose();

  return { target, center, radius };
}

export function createDiamondMaterial(shape: GemShape, quality: DiamondQuality) {
  const material = new THREE.ShaderMaterial({
    vertexShader: diamondVertex,
    fragmentShader: diamondFragment,
    defines: {
      BOUNCES: quality === "high" ? 5 : 3,
      TRACE_STEPS: quality === "high" ? 4 : 3,
      ...(quality === "high" ? { DISPERSION: "" } : {}),
    },
    uniforms: {
      envMap: { value: null },
      envCube: { value: null },
      uShape: { value: shape.target.texture },
      uCenter: { value: shape.center },
      uRadius: { value: shape.radius },
      uIor: { value: 2.42 },
      uEnvIntensity: { value: 1.6 },
      uDispersion: { value: 0.05 },
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
  envMap: THREE.Texture | null
) {
  inverse.copy(object.matrixWorld).invert();
  material.uniforms.uLocalCamera.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverse);
  material.uniforms.uLocalToWorld.value.setFromMatrix4(object.matrixWorld);
  const isCube = !!(envMap as THREE.CubeTexture | null)?.isCubeTexture;
  if (isCube !== "ENV_CUBE" in material.defines) {
    if (isCube) material.defines.ENV_CUBE = "";
    else delete material.defines.ENV_CUBE;
    material.needsUpdate = true;
  }
  material.uniforms.envMap.value = isCube ? null : envMap;
  material.uniforms.envCube.value = isCube ? envMap : null;
}
