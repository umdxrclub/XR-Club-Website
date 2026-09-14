import {
  AnimationClip,
  Box3,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SkinnedMesh,
  Vector3,
} from 'three';

/** Fantasy butterfly: body pivot at the origin, forward +Z, maximum span 1. */
export function createButterflyRig(model: Object3D, clips: AnimationClip[] = []) {
  const body = model.getObjectByName('joint6_01');
  if (!body) throw new Error('Fantasy butterfly is missing its body joint');
  const clip = clips.find((candidate) => /flap|fly|flight/i.test(candidate.name)) ?? clips[0];
  const duration = clip?.duration ?? 1;
  const quaternionA = new Quaternion();
  const quaternionB = new Quaternion();
  const vectorA = new Vector3();
  const vectorB = new Vector3();
  const meshes: SkinnedMesh[] = [];
  model.traverse((node) => {
    if (node instanceof Mesh) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial) || !material.map || material.userData.butterflyCutout) continue;
        // Both supplied textures are RGB: their black atlas backgrounds have no
        // alpha. Key only near-black texels; saturated dark-blue wing detail is
        // preserved by using the strongest color channel rather than luminance.
        material.transparent = true;
        material.alphaTest = 0.04;
        material.depthWrite = false;
        material.forceSinglePass = true;
        const previousCompile = material.onBeforeCompile;
        material.onBeforeCompile = (shader, renderer) => {
          previousCompile.call(material, shader, renderer);
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            #ifdef USE_MAP
              float butterflyColorKey = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);
              diffuseColor.a *= smoothstep(0.0015, 0.008, butterflyColorKey);
            #endif`,
          );
        };
        material.customProgramCacheKey = () => 'fantasy-butterfly-cutout-v1';
        material.userData.butterflyCutout = true;
        material.needsUpdate = true;
      }
    }
    if (node instanceof SkinnedMesh) {
      node.frustumCulled = false;
      meshes.push(node);
    }
  });
  const tracks = (clip?.tracks ?? []).flatMap((track) => {
    const separator = track.name.lastIndexOf('.');
    const node = model.getObjectByName(track.name.slice(0, separator));
    const property = track.name.slice(separator + 1);
    if (!node || !['position', 'quaternion', 'scale'].includes(property)) return [];
    return [{
      node,
      property,
      first: track.InterpolantFactoryMethodLinear(),
      second: track.InterpolantFactoryMethodLinear(),
      travel: node === body && property === 'position',
    }];
  });

  function sample(firstTime: number, secondTime: number, blend: number, includeTravel = false) {
    for (const track of tracks) {
      if (track.travel && !includeTravel) continue;
      const first = track.first.evaluate(firstTime);
      const second = blend > 0 ? track.second.evaluate(secondTime) : first;
      if (track.property === 'quaternion') {
        quaternionA.fromArray(first);
        quaternionB.fromArray(second);
        track.node.quaternion.copy(quaternionA.slerp(quaternionB, blend));
      } else {
        vectorA.fromArray(first);
        vectorB.fromArray(second);
        vectorA.lerp(vectorB, blend);
        if (track.property === 'position') track.node.position.copy(vectorA);
        else track.node.scale.copy(vectorA);
      }
    }
  }

  sample(0, 0, 0, true);
  model.updateMatrixWorld(true);
  const root = new Group();
  root.name = 'Fantasy butterfly flight';
  const normalized = new Group();
  const centered = new Group();
  centered.position.copy(body.getWorldPosition(vectorA)).negate();
  normalized.quaternion.copy(body.getWorldQuaternion(quaternionA)).invert();
  centered.add(model);
  normalized.add(centered);
  root.add(normalized);

  function updateSkin() {
    root.parent?.updateWorldMatrix(true, false);
    // Refresh both the skin's bind inverse and the current bone matrices.
    root.updateMatrixWorld(true);
    for (const mesh of meshes) mesh.skeleton.update();
  }

  // Size against the entire flap, so opening wings cannot unexpectedly resize it.
  const sweptBounds = new Box3();
  const frameBounds = new Box3();
  for (let frame = 0; frame <= 32; frame++) {
    sample(duration * frame / 32, 0, 0);
    updateSkin();
    sweptBounds.union(frameBounds.setFromObject(root, true));
  }
  normalized.scale.setScalar(1 / (sweptBounds.max.x - sweptBounds.min.x));
  const overlap = Math.min(0.14, duration * 0.1);
  const usable = duration - overlap;

  function setTime(time: number) {
    // The source endpoints differ slightly in the trailing tails. Overlap them
    // gently while preserving the original full cycle duration.
    const phase = (((time % duration) + duration) % duration) / duration * usable;
    sample(
      overlap + phase,
      Math.max(0, phase - (usable - overlap)),
      MathUtils.smoothstep(phase, usable - overlap, usable),
    );
    updateSkin();
  }
  setTime(0);

  return {
    root,
    width: 1,
    duration,
    setTime,
    dispose() {
      root.removeFromParent();
    },
  };
}
