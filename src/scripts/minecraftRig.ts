import {
  AnimationClip,
  Bone,
  Box3,
  Euler,
  Group,
  MathUtils,
  Matrix4,
  Object3D,
  Quaternion,
  SkinnedMesh,
  Vector3,
} from 'three';
import { attachSteveHeadset } from './steveHeadset';

export type SteveSide = 'left' | 'right';

export type SteveBodyCollider = {
  name: 'head' | 'torso' | 'left-thigh' | 'left-shin' | 'right-thigh' | 'right-shin';
  box: Box3;
};

type BonePose = {
  bone: Bone;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
};

type Limb = { upper: Bone; lower: Bone; hand: Bone };

/**
 * Controls the supplied Sketchfab Steve rig. The returned root is 2.4 units
 * tall, grounded at y=0 and faces +Z. Call updateWalk before applying gestures.
 * Hand targets and elbow poles are world coordinates; sides are anatomical.
 */
export function createSteveRig(model: Object3D, clip?: AnimationClip) {
  const root = new Group();
  root.name = 'Steve performance';
  const normalized = new Group();
  normalized.add(model);
  root.add(normalized);

  function joint(name: string): Bone {
    const found = model.getObjectByName(name);
    if (!(found instanceof Bone)) throw new Error(`Steve rig is missing ${name}`);
    return found;
  }

  const head = joint('Bone010_06');
  const torso = joint('Bone_04');
  const pelvis = joint('_rootJoint');
  const legs = [
    { upper: joint('Bone006_00'), lower: joint('Bone007_01'), hand: joint('Bone007_end_011') },
    { upper: joint('Bone008_02'), lower: joint('Bone009_03'), hand: joint('Bone009_end_012') },
  ];
  const arms = {
    left: {
      upper: joint('Bone002_09'),
      lower: joint('Bone005_010'),
      hand: joint('Bone005_end_015'),
    },
    right: {
      upper: joint('Bone003_07'),
      lower: joint('Bone004_08'),
      hand: joint('Bone004_end_014'),
    },
  };

  // This FBX export's inverse bind transforms do not describe an upright idle.
  // Keep the imported skin binding and author the idle on its existing joints.
  for (const name of ['Bone006_00', 'Bone008_02']) {
    const thigh = joint(name);
    thigh.rotation.set(-Math.PI / 2, 0, 0);
    thigh.position.y = 0;
    thigh.position.z = 0.2131258;
  }
  joint('Bone007_01').quaternion.identity();
  joint('Bone009_03').quaternion.identity();
  torso.rotation.set(Math.PI / 2, 0, 0);
  joint('Bone001_05').quaternion.identity();
  head.quaternion.identity();
  arms.right.upper.rotation.set(Math.PI, 0, 0.36933);
  arms.right.lower.rotation.set(0, 0, -0.36933);
  arms.left.upper.rotation.set(Math.PI, 0, -0.37736);
  arms.left.lower.rotation.set(0, 0, 0.37736);

  const poses: BonePose[] = [];
  const meshes: SkinnedMesh[] = [];
  model.traverse((node) => {
    if (node instanceof Bone) {
      poses.push({
        bone: node,
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
      });
    }
    if (node instanceof SkinnedMesh) {
      node.frustumCulled = false;
      meshes.push(node);
    }
  });
  const poseByName = new Map(poses.map((pose) => [pose.bone.name, pose]));
  function updateMatrices() {
    root.parent?.updateWorldMatrix(true, false);
    // SkinnedMesh overrides updateMatrixWorld to refresh bindMatrixInverse.
    // updateWorldMatrix alone would double-apply the normalization scale.
    root.updateMatrixWorld(true);
  }
  function updateSkeletons() {
    updateMatrices();
    for (const mesh of meshes) mesh.skeleton.update();
  }
  updateSkeletons();
  const bounds = new Box3().setFromObject(model, true);
  const height = 2.4;
  const scale = height / (bounds.max.y - bounds.min.y);
  normalized.scale.setScalar(scale);
  normalized.position.set(
    -(bounds.min.x + bounds.max.x) * 0.5 * scale,
    -bounds.min.y * scale,
    -(bounds.min.z + bounds.max.z) * 0.5 * scale,
  );
  const floorOffset = normalized.position.y;
  updateSkeletons();

  // Sample the original LINEAR walk tracks directly. This remains deterministic
  // when a paused preview repeatedly evaluates the same time after an IK pass.
  const tracks = (clip?.tracks ?? []).flatMap((track) => {
    const separator = track.name.lastIndexOf('.');
    const pose = poseByName.get(track.name.slice(0, separator));
    const property = track.name.slice(separator + 1);
    if (!pose || !['position', 'quaternion', 'scale'].includes(property)) return [];
    return [{ pose, property, interpolant: track.InterpolantFactoryMethodLinear() }];
  });

  const vertex = new Vector3();
  const soles: { mesh: SkinnedMesh; index: number }[] = [];
  const bodyColliders: SteveBodyCollider[] = [
    { name: 'head', box: new Box3() },
    { name: 'torso', box: new Box3() },
    { name: 'left-thigh', box: new Box3() },
    { name: 'left-shin', box: new Box3() },
    { name: 'right-thigh', box: new Box3() },
    { name: 'right-shin', box: new Box3() },
  ];
  const colliderByBone = new Map([
    ['Bone010_06', bodyColliders[0]],
    ['Bone_04', bodyColliders[1]],
    ['Bone001_05', bodyColliders[1]],
    ['Bone008_02', bodyColliders[2]],
    ['Bone009_03', bodyColliders[3]],
    ['Bone006_00', bodyColliders[4]],
    ['Bone007_01', bodyColliders[5]],
  ]);
  const bodyVertices: { mesh: SkinnedMesh; index: number; collider: SteveBodyCollider }[] = [];
  const armSamples: Record<SteveSide, { mesh: SkinnedMesh; index: number; world: Vector3 }[]> = {
    left: [],
    right: [],
  };
  const armVertices: Record<SteveSide, Vector3[]> = { left: [], right: [] };
  const armSideByBone = new Map<string, SteveSide>([
    ['Bone002_09', 'left'],
    ['Bone005_010', 'left'],
    ['Bone003_07', 'right'],
    ['Bone004_08', 'right'],
  ]);
  const colliderWorldToRoot = new Matrix4();
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute('position');
    const skinIndices = mesh.geometry.getAttribute('skinIndex');
    const skinWeights = mesh.geometry.getAttribute('skinWeight');
    for (let index = 0; index < positions.count; index++) {
      mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
      root.worldToLocal(vertex);
      if (vertex.y < 0.1) soles.push({ mesh, index });
      // Classify once, but skin each included vertex in its current pose when
      // queried. Arms remain free for intentional contact with the carried prop.
      let dominant = 0;
      for (let component = 1; component < 4; component++) {
        if (skinWeights.getComponent(index, component) > skinWeights.getComponent(index, dominant)) {
          dominant = component;
        }
      }
      const bone = mesh.skeleton.bones[skinIndices.getComponent(index, dominant)];
      const collider = colliderByBone.get(bone.name);
      if (collider) bodyVertices.push({ mesh, index, collider });
      const armSide = armSideByBone.get(bone.name);
      if (armSide) {
        const world = new Vector3();
        armSamples[armSide].push({ mesh, index, world });
        armVertices[armSide].push(world);
      }
    }
  }

  // Locate the eyes on the supplied head's front face in bone-local space.
  const headBounds = new Box3();
  for (const entry of bodyVertices) {
    if (entry.collider.name !== 'head') continue;
    entry.mesh.getVertexPosition(entry.index, vertex).applyMatrix4(entry.mesh.matrixWorld);
    headBounds.expandByPoint(head.worldToLocal(vertex));
  }
  const eyeOffset = new Vector3(
    (headBounds.min.x + headBounds.max.x) * 0.5,
    MathUtils.lerp(headBounds.min.y, headBounds.max.y, 0.67),
    headBounds.max.z,
  );
  const gazeStart = new Quaternion();
  const headset = attachSteveHeadset(head, headBounds);
  const headsetToRoot = new Matrix4();
  const headsetCollider = new Box3();

  const sampledPosition = new Vector3();
  const sampledQuaternion = new Quaternion();
  const gestureEuler = new Euler();
  const gestureQuaternion = new Quaternion();
  const shoulderPosition = new Vector3();
  const elbowPosition = new Vector3();
  const handPosition = new Vector3();
  const direction = new Vector3();
  const bendDirection = new Vector3();
  const polePosition = new Vector3();
  const elbowTarget = new Vector3();
  const handTarget = new Vector3();
  const currentDirection = new Vector3();
  const desiredDirection = new Vector3();
  const parentQuaternion = new Quaternion();
  const worldQuaternion = new Quaternion();
  const rotationDelta = new Quaternion();
  const initialUpper = new Quaternion();
  const initialLower = new Quaternion();
  const footTargets = [new Vector3(), new Vector3()];
  const crouchOffset = new Vector3();
  const crouchPosition = new Vector3();
  const crouchPole = new Vector3();

  function aimBone(bone: Bone, child: Bone, target: Vector3) {
    bone.getWorldPosition(vertex);
    child.getWorldPosition(currentDirection).sub(vertex).normalize();
    desiredDirection.copy(target).sub(vertex).normalize();
    if (!currentDirection.lengthSq() || !desiredDirection.lengthSq()) return;
    rotationDelta.setFromUnitVectors(currentDirection, desiredDirection);
    bone.getWorldQuaternion(worldQuaternion);
    bone.parent!.getWorldQuaternion(parentQuaternion).invert();
    bone.quaternion.copy(parentQuaternion).multiply(rotationDelta).multiply(worldQuaternion);
    bone.updateWorldMatrix(false, true);
  }

  function groundSoles() {
    updateSkeletons();
    let lowest = Infinity;
    for (const { mesh, index } of soles) {
      mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
      root.worldToLocal(vertex);
      lowest = Math.min(lowest, vertex.y);
    }
    if (Number.isFinite(lowest)) normalized.position.y -= lowest;
    updateMatrices();
  }

  function solveLimb(limb: Limb, target: Vector3, blend: number, pole: Vector3) {
    initialUpper.copy(limb.upper.quaternion);
    initialLower.copy(limb.lower.quaternion);
    limb.upper.getWorldPosition(shoulderPosition);
    limb.lower.getWorldPosition(elbowPosition);
    limb.hand.getWorldPosition(handPosition);
    const upperLength = shoulderPosition.distanceTo(elbowPosition);
    const lowerLength = elbowPosition.distanceTo(handPosition);
    direction.copy(target).sub(shoulderPosition);
    const distance = MathUtils.clamp(
      direction.length(),
      Math.abs(upperLength - lowerLength) + 0.0001,
      upperLength + lowerLength - 0.0001,
    );
    if (direction.lengthSq() < 0.0000001) direction.set(0, -1, 0);
    direction.normalize();
    bendDirection.copy(pole).sub(shoulderPosition);
    bendDirection.addScaledVector(direction, -bendDirection.dot(direction));
    if (bendDirection.lengthSq() < 0.000001) {
      bendDirection.set(0, 0, 1).addScaledVector(direction, -direction.z);
      if (bendDirection.lengthSq() < 0.000001) {
        bendDirection.set(1, 0, 0).addScaledVector(direction, -direction.x);
      }
    }
    bendDirection.normalize();
    const along = (upperLength * upperLength + distance * distance - lowerLength * lowerLength)
      / (2 * distance);
    const outward = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    elbowTarget.copy(shoulderPosition).addScaledVector(direction, along)
      .addScaledVector(bendDirection, outward);
    handTarget.copy(shoulderPosition).addScaledVector(direction, distance);
    aimBone(limb.upper, limb.lower, elbowTarget);
    aimBone(limb.lower, limb.hand, handTarget);
    limb.upper.quaternion.slerp(initialUpper, 1 - blend);
    limb.lower.quaternion.slerp(initialLower, 1 - blend);
    limb.upper.updateWorldMatrix(false, true);
  }

  return {
    root,
    height,
    headset: headset.object,
    getHeadScratchTarget(time: number, target = new Vector3()) {
      updateMatrices();
      return headset.getScratchTarget(time, target);
    },
    /** Weight 0 is the authored idle; weight 1 is the supplied walk cycle. */
    updateWalk(time: number, weight: number) {
      const blend = MathUtils.clamp(weight, 0, 1);
      for (const pose of poses) {
        pose.bone.position.copy(pose.position);
        pose.bone.quaternion.copy(pose.quaternion);
        pose.bone.scale.copy(pose.scale);
      }
      const duration = clip?.duration || 1;
      const sampleTime = ((time % duration) + duration) % duration;
      if (blend > 0) {
        for (const { pose, property, interpolant } of tracks) {
          const value = interpolant.evaluate(sampleTime);
          if (property === 'quaternion') {
            sampledQuaternion.set(value[0], value[1], value[2], value[3]);
            pose.bone.quaternion.slerp(sampledQuaternion, blend);
          } else {
            sampledPosition.set(value[0], value[1], value[2]);
            if (property === 'position') pose.bone.position.lerp(sampledPosition, blend);
            else pose.bone.scale.lerp(sampledPosition, blend);
          }
        }
      }
      normalized.position.y = floorOffset;
      groundSoles();
    },
    /** Bend both knees while keeping the feet planted; apply before torso/IK. */
    setCrouch(amount: number) {
      const bend = MathUtils.clamp(amount, 0, 1);
      if (bend === 0) return;
      updateMatrices();
      legs.forEach((leg, index) => leg.hand.getWorldPosition(footTargets[index]));
      // Move the pelvis down and slightly back, then solve the knees forward.
      // Moving the scene root would push straight legs beneath the floor.
      root.localToWorld(crouchOffset.set(0, -0.45 * bend, -0.08 * bend));
      root.getWorldPosition(crouchPosition);
      crouchOffset.sub(crouchPosition);
      pelvis.getWorldPosition(crouchPosition).add(crouchOffset);
      pelvis.parent!.worldToLocal(crouchPosition);
      pelvis.position.copy(crouchPosition);
      updateMatrices();
      legs.forEach((leg, index) => {
        root.getWorldQuaternion(worldQuaternion);
        crouchPole.set(index === 0 ? -0.08 : 0.08, 0, 1)
          .applyQuaternion(worldQuaternion);
        leg.upper.getWorldPosition(crouchPosition);
        crouchPole.add(crouchPosition);
        solveLimb(leg, footTargets[index], 1, crouchPole);
      });
      groundSoles();
    },
    setHead(pitch = 0, yaw = 0, roll = 0) {
      gestureQuaternion.setFromEuler(gestureEuler.set(pitch, yaw, roll, 'YXZ'));
      head.quaternion.multiply(gestureQuaternion);
      head.updateWorldMatrix(true, true);
    },
    /** Aim from the eyes at a world-space target after the authored head pose. */
    lookAtHead(target: Vector3, weight: number) {
      const blend = MathUtils.clamp(weight, 0, 1);
      if (blend === 0) return;
      head.updateWorldMatrix(true, true);
      gazeStart.copy(head.quaternion);
      const roll = gestureEuler.setFromQuaternion(gazeStart, 'YXZ').z;
      head.parent!.getWorldQuaternion(parentQuaternion).invert();
      // Recompute the eye position as the head turns around its neck pivot.
      for (let iteration = 0; iteration < 10; iteration++) {
        vertex.copy(eyeOffset).applyMatrix4(head.matrixWorld);
        desiredDirection.copy(target).sub(vertex);
        if (desiredDirection.lengthSq() < 0.000001) break;
        desiredDirection.normalize();
        head.getWorldQuaternion(worldQuaternion);
        currentDirection.set(0, 0, 1).applyQuaternion(worldQuaternion);
        rotationDelta.setFromUnitVectors(currentDirection, desiredDirection);
        head.quaternion.copy(parentQuaternion).multiply(rotationDelta).multiply(worldQuaternion);
        gestureEuler.setFromQuaternion(head.quaternion, 'YXZ').z = roll;
        head.quaternion.setFromEuler(gestureEuler);
        head.updateWorldMatrix(false, true);
      }
      gestureEuler.setFromQuaternion(head.quaternion, 'YXZ');
      gestureEuler.x = MathUtils.clamp(gestureEuler.x, -0.65, 1.2);
      gestureEuler.y = MathUtils.clamp(gestureEuler.y, -1.25, 1.25);
      gestureEuler.z = roll;
      gestureQuaternion.setFromEuler(gestureEuler);
      head.quaternion.copy(gazeStart).slerp(gestureQuaternion, blend);
      head.updateWorldMatrix(false, true);
    },
    setTorso(pitch = 0, roll = 0) {
      gestureQuaternion.setFromEuler(gestureEuler.set(pitch, 0, roll));
      torso.quaternion.multiply(gestureQuaternion);
      torso.updateWorldMatrix(true, true);
    },
    /** Positive X is Steve's left side. Optional pole chooses the elbow bend. */
    reachHand(side: SteveSide, target: Vector3, weight = 1, pole?: Vector3) {
      const blend = MathUtils.clamp(weight, 0, 1);
      if (blend === 0) return;
      const arm = arms[side];
      updateMatrices();
      arm.upper.getWorldPosition(shoulderPosition);
      if (pole) polePosition.copy(pole);
      else {
        root.getWorldQuaternion(worldQuaternion);
        polePosition.set(side === 'left' ? 1 : -1, -0.35, 0.35)
          .applyQuaternion(worldQuaternion).add(shoulderPosition);
      }
      solveLimb(arm, target, blend, polePosition);
    },
    getHandPosition(side: SteveSide, target = new Vector3()) {
      updateMatrices();
      return arms[side].hand.getWorldPosition(target);
    },
    /**
     * Current posed body bounds in root-local coordinates. The array and boxes
     * are reused on every call; copy boxes before retaining or modifying them.
     */
    getBodyColliders(): readonly SteveBodyCollider[] {
      updateSkeletons();
      colliderWorldToRoot.copy(root.matrixWorld).invert();
      for (let index = 0; index < bodyColliders.length; index++) {
        bodyColliders[index].box.makeEmpty();
      }
      for (let index = 0; index < bodyVertices.length; index++) {
        const entry = bodyVertices[index];
        entry.mesh.getVertexPosition(entry.index, vertex)
          .applyMatrix4(entry.mesh.matrixWorld).applyMatrix4(colliderWorldToRoot);
        entry.collider.box.expandByPoint(vertex);
      }
      // The worn housing and straps move with the skull and participate in
      // prop avoidance, so the carried star cannot pass through the visor.
      headsetToRoot.multiplyMatrices(colliderWorldToRoot, head.matrixWorld);
      headsetCollider.copy(headset.bounds).applyMatrix4(headsetToRoot);
      bodyColliders[0].box.union(headsetCollider);
      return bodyColliders;
    },
    /** Posed arm vertices in world space; the array and vectors are reused. */
    getArmVertices(side: SteveSide): readonly Vector3[] {
      updateSkeletons();
      const samples = armSamples[side];
      for (let index = 0; index < samples.length; index++) {
        const sample = samples[index];
        sample.mesh.getVertexPosition(sample.index, sample.world)
          .applyMatrix4(sample.mesh.matrixWorld);
      }
      return armVertices[side];
    },
    dispose() {
      root.removeFromParent();
    },
  };
}
