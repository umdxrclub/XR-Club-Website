import { Box3, Matrix4, Object3D, Vector3 } from 'three';

type BodyCollider = { name: string; box: Box3 };

/** Resolve the star against Steve's posed body volumes in his own coordinates. */
export function createStarCollisionSolver(character: Object3D, star: Object3D, half: Vector3) {
  const relative = new Matrix4();
  const inverse = new Matrix4();
  const vertex = new Vector3();
  const movement = new Vector3();
  const origin = new Vector3();
  const bounds = new Box3();
  const padding = 0.055;

  const measure = (depth: number) => {
    character.updateWorldMatrix(true, false);
    star.updateWorldMatrix(true, false);
    relative.multiplyMatrices(inverse.copy(character.matrixWorld).invert(), star.matrixWorld);
    bounds.makeEmpty();
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      vertex.set(x * half.x, y * half.y, z * half.z * depth).applyMatrix4(relative);
      bounds.expandByPoint(vertex);
    }
    return bounds;
  };

  const overlap = (box: Box3) => bounds.max.x > box.min.x - padding && bounds.min.x < box.max.x + padding
    && bounds.max.y > box.min.y - padding && bounds.min.y < box.max.y + padding
    && bounds.max.z > box.min.z - padding && bounds.min.z < box.max.z + padding;

  return {
    measure,
    avoidStatic(colliders: readonly BodyCollider[], depth = 0) {
      measure(depth);
      if (!colliders.some(({ box }) => overlap(box))) return 0;
      // While the star is still part of the page, move Steve behind its plane.
      // Binary search keeps the smallest safe offset continuous at contact.
      const originalZ = character.position.z;
      let lower = 0, upper = 0.04;
      for (let i = 0; i < 7; i++) {
        character.position.z = originalZ - upper;
        measure(depth);
        if (!colliders.some(({ box }) => overlap(box))) break;
        lower = upper;
        upper *= 2;
      }
      for (let i = 0; i < 12; i++) {
        const middle = (lower + upper) / 2;
        character.position.z = originalZ - middle;
        measure(depth);
        if (colliders.some(({ box }) => overlap(box))) lower = middle;
        else upper = middle;
      }
      character.position.z = originalZ - upper;
      character.updateMatrixWorld(true);
      return upper;
    },
    resolve(colliders: readonly BodyCollider[], depth: number) {
      measure(depth);
      let displacement = 0;
      for (const { box } of colliders) {
        if (!overlap(box)) continue;
        // Push away from the character's chest. Hands are solved after this,
        // so they follow the corrected prop instead of pulling through it.
        const push = box.max.z + padding - bounds.min.z;
        bounds.min.z += push;
        bounds.max.z += push;
        displacement += push;
      }
      if (displacement > 0) {
        character.localToWorld(movement.set(0, 0, displacement));
        character.getWorldPosition(origin);
        movement.sub(origin);
        star.getWorldPosition(vertex).add(movement);
        star.parent!.worldToLocal(vertex);
        star.position.copy(vertex);
        star.updateMatrixWorld(true);
      }
      return displacement;
    },
    intersects(colliders: readonly BodyCollider[], depth: number) {
      measure(depth);
      return colliders.some(({ box }) => bounds.intersectsBox(box));
    },
  };
}
