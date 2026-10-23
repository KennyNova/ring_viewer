import * as THREE from "three";

export interface RingPart {
  key: string;
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  /** Bounding radius in world units, used to size gem cube maps. */
  radius: number;
}

export interface ClassifiedRing {
  gems: RingPart[];
  /** Metal parts grouped by source material; the biggest group is the primary band. */
  primaryMetal: RingPart[];
  accentMetal: RingPart[];
  /** Rotation that stands the ring upright with its stones on top. */
  uprighting: THREE.Quaternion;
}

const GEM_NAME = /diamond|gem|stone|crystal|brilliant/i;

function isGemMaterial(material: THREE.Material | undefined) {
  if (!material) return false;
  // Masina's GLBs are exported from WebGi/Rhino, which tags stones explicitly
  if (material.userData?.gltfExtensions?.WEBGI_materials_diamond) return true;
  return GEM_NAME.test(material.name);
}

function toPart(mesh: THREE.Mesh, index: number): RingPart {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  mesh.matrixWorld.decompose(position, quaternion, scale);
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  const radius = (mesh.geometry.boundingSphere?.radius ?? 1) * Math.max(scale.x, scale.y, scale.z);
  return { key: `${index}-${mesh.uuid}`, geometry: mesh.geometry, position, quaternion, scale, radius };
}

export function classifyRing(root: THREE.Object3D): ClassifiedRing {
  root.updateMatrixWorld(true);

  const gems: RingPart[] = [];
  const metalGroups = new Map<string, { parts: RingPart[]; vertices: number }>();
  let index = 0;

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const part = toPart(mesh, index++);

    if (isGemMaterial(material) || GEM_NAME.test(mesh.name)) {
      gems.push(part);
      return;
    }

    const groupKey = material?.uuid ?? "default";
    const group = metalGroups.get(groupKey) ?? { parts: [], vertices: 0 };
    group.parts.push(part);
    group.vertices += mesh.geometry.attributes.position.count;
    metalGroups.set(groupKey, group);
  });

  const groups = [...metalGroups.values()].sort((a, b) => b.vertices - a.vertices);
  const primaryMetal = groups[0]?.parts ?? [];
  const accentMetal = groups.slice(1).flatMap((g) => g.parts);
  return { gems, primaryMetal, accentMetal, uprighting: uprightRotation(gems, [...primaryMetal, ...accentMetal]) };
}

function boundsOf(parts: RingPart[]) {
  const box = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  for (const part of parts) {
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    matrix.compose(part.position, part.quaternion, part.scale);
    box.union(part.geometry.boundingBox!.clone().applyMatrix4(matrix));
  }
  return box;
}

/**
 * Exports differ in up-axis (WebGi GLBs are Y-up, raw Rhino OBJs are Z-up), so rather than
 * trusting the file we turn the ring so its stones sit on top: the axis pointing from the
 * ring's centre towards the gems becomes +Y.
 */
function uprightRotation(gems: RingPart[], metal: RingPart[]) {
  const rotation = new THREE.Quaternion();
  if (gems.length === 0 || metal.length === 0) return rotation;

  const ringCenter = boundsOf([...gems, ...metal]).getCenter(new THREE.Vector3());
  const toGems = boundsOf(gems).getCenter(new THREE.Vector3()).sub(ringCenter);
  const axes = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
  ];
  const up = axes.reduce((best, axis) => (axis.dot(toGems) > best.dot(toGems) ? axis : best));
  return rotation.setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
}
