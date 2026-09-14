import { Bone, Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';

/** A fitted, deliberately block-built VR headset in the supplied head's axes. */
export function attachSteveHeadset(head: Bone, headBounds: Box3) {
  const object = new Group();
  object.name = 'Steve voxel VR headset';
  const size = headBounds.getSize(new Vector3());
  const center = headBounds.getCenter(new Vector3());
  const { x: width, y: height, z: depth } = size;
  const bottom = headBounds.min.y;
  const front = headBounds.max.z;
  const back = headBounds.min.z;
  const eyeY = bottom + height * 0.56;
  const parts: Mesh<BoxGeometry, MeshStandardMaterial>[] = [];
  const bounds = new Box3();

  const shell = new MeshStandardMaterial({ color: 0x202735, roughness: 0.76, metalness: 0.12 });
  const edge = new MeshStandardMaterial({ color: 0x414c60, roughness: 0.8, metalness: 0.08 });
  const strap = new MeshStandardMaterial({ color: 0x171b25, roughness: 1 });
  const glass = new MeshStandardMaterial({ color: 0x062e43, roughness: 0.34, metalness: 0.28 });
  const cyan = new MeshStandardMaterial({ color: 0x25d9ed, emissive: 0x12b8da, emissiveIntensity: 0.48, roughness: 0.45, metalness: 0.15 });
  const glint = new MeshStandardMaterial({ color: 0xc6ffff, emissive: 0x55cfff, emissiveIntensity: 0.32, roughness: 0.5 });

  const block = (name: string, dimensions: [number, number, number], position: [number, number, number], material: MeshStandardMaterial) => {
    const part = new Mesh(new BoxGeometry(...dimensions), material);
    part.name = name;
    part.position.set(...position);
    part.geometry.computeBoundingBox();
    bounds.union(part.geometry.boundingBox!.clone().translate(part.position));
    parts.push(part);
    object.add(part);
    return part;
  };

  // The rear gasket sits just clear of the face. Three adjoining boxes give
  // the housing stepped pixel corners without rounded or beveled geometry.
  block('face gasket', [width * 0.96, height * 0.35, depth * 0.055], [center.x, eyeY, front + depth * 0.045], strap);
  const shellZ = front + depth * 0.18;
  block('headset center housing', [width * 1.02, height * 0.43, depth * 0.23], [center.x, eyeY, shellZ], shell);
  for (const side of [-1, 1]) {
    block(`headset ${side < 0 ? 'right' : 'left'} stepped corner`, [width * 0.05, height * 0.31, depth * 0.23], [center.x + side * width * 0.535, eyeY, shellZ], shell);
  }

  const visorZ = shellZ + depth * 0.127;
  block('recessed pixel visor', [width * 0.94, height * 0.285, depth * 0.022], [center.x, eyeY, visorZ], glass);
  for (const side of [-1, 1]) {
    block(`cyan visor ${side < 0 ? 'right' : 'left'}`, [width * 0.365, height * 0.185, depth * 0.009], [center.x + side * width * 0.228, eyeY, visorZ + depth * 0.016], cyan);
    block(`visor pixel glint ${side < 0 ? 'right' : 'left'}`, [width * 0.09, height * 0.042, depth * 0.005], [center.x + side * width * 0.32, eyeY + height * 0.056, visorZ + depth * 0.023], glint);
    block(`tracking sensor ${side < 0 ? 'right' : 'left'}`, [width * 0.048, height * 0.047, depth * 0.014], [center.x + side * width * 0.476, eyeY - height * 0.152, shellZ + depth * 0.122], glass);
  }
  block('visor center bridge', [width * 0.035, height * 0.13, depth * 0.012], [center.x, eyeY - height * 0.02, visorZ + depth * 0.012], edge);
  block('upper pixel highlight', [width * 0.63, height * 0.025, depth * 0.012], [center.x, eyeY + height * 0.173, shellZ + depth * 0.122], edge);

  // The temple and crown bands stay outside the skin. Intentional intersections
  // only occur where the bands join the housing or one another.
  for (const side of [-1, 1]) {
    const templeX = center.x + side * width * 0.546;
    block(`temple band ${side < 0 ? 'right' : 'left'}`, [width * 0.055, height * 0.11, depth * 1.13], [templeX, eyeY, center.z + depth * 0.035], strap);
    block(`temple buckle ${side < 0 ? 'right' : 'left'}`, [width * 0.085, height * 0.17, depth * 0.15], [templeX, eyeY, front - depth * 0.16], edge);
  }
  block('back headband', [width * 1.147, height * 0.11, depth * 0.055], [center.x, eyeY, back - depth * 0.042], strap);
  const crownY = headBounds.max.y + height * 0.031;
  block('crown band', [width * 0.13, height * 0.055, depth * 1.135], [center.x, crownY, center.z + depth * 0.015], strap);
  const riserHeight = crownY - (eyeY + height * 0.17);
  block('front crown connector', [width * 0.13, riserHeight, depth * 0.055], [center.x, crownY - riserHeight / 2, front + depth * 0.055], strap);
  block('back crown connector', [width * 0.13, crownY - eyeY, depth * 0.055], [center.x, (crownY + eyeY) / 2, back - depth * 0.042], strap);

  head.add(object);
  object.userData.headsetStyle = 'Minecraft voxel VR';
  return {
    object,
    bounds,
    parts,
    /** Fingertips brush the exposed right crown, clear of visor and temple band. */
    getScratchTarget(time: number, target: Vector3) {
      target.set(
        center.x - width * 0.82,
        bottom + height * (0.98 + Math.sin(time * 10) * 0.03125),
        center.z + depth * (-0.1 + Math.cos(time * 10) * 0.03125),
      );
      return head.localToWorld(target);
    },
  };
}
