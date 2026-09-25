import { equipmentLayout } from './equipmentMotion';

export type Vector3 = [number, number, number];
const sub = (a: Vector3, b: Vector3): Vector3 => a.map((v, i) => v - b[i]) as Vector3;
const mul = (a: Vector3, n: number): Vector3 => a.map(v => v * n) as Vector3;
const cross = (a: Vector3, b: Vector3): Vector3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const EQUIPMENT_CARD_REST = { yaw: -14, pitch: 6, roll: -1.8 };

/** Rigid card rotation: roll, pitch, then yaw. */
export function equipmentCardAxes(card: { yaw: number; pitch: number; roll: number }) {
  const yaw = card.yaw * Math.PI / 180, pitch = card.pitch * Math.PI / 180, roll = card.roll * Math.PI / 180;
  const rotate = (x: number, y: number): Vector3 => {
    const rx = x*Math.cos(roll) - y*Math.sin(roll), ry = x*Math.sin(roll) + y*Math.cos(roll);
    const py = ry*Math.cos(pitch), pz = ry*Math.sin(pitch);
    return [rx*Math.cos(yaw) + pz*Math.sin(yaw), py, -rx*Math.sin(yaw) + pz*Math.cos(yaw)];
  };
  const axisX = rotate(1, 0), axisY = rotate(0, 1);
  return { axisX, axisY, normal: cross(axisX, axisY) };
}

export const dot = (a: Vector3, b: Vector3) => a.reduce((sum, v, i) => sum + v * b[i], 0);

export type EquipmentCamera = {
  position: Vector3; right: Vector3; down: Vector3; forward: Vector3;
  screenX: number; screenY: number; focal: number; width: number; height: number;
};

export function projectEquipmentPoint(point: Vector3, camera: EquipmentCamera) {
  const delta = sub(point, camera.position);
  const depth = dot(delta, camera.forward);
  const ratio = camera.focal / Math.max(1, depth);
  return { x: camera.screenX + dot(delta, camera.right) * ratio,
    y: camera.screenY + dot(delta, camera.down) * ratio, depth };
}

/** Fixed perspective keeps the equipment carousel as the final scene. */
export function createEquipmentCamera(width: number, height: number, layout = equipmentLayout(width, height)): EquipmentCamera {
  return {
    position: [0, 0, 1600], right: [1, 0, 0], down: [0, 1, 0], forward: [0, 0, -1],
    screenX: layout.centerX, screenY: layout.centerY, focal: 1600, width, height,
  };
}

/** Perspective projection of a rigid carousel card. */
export function equipmentCardMatrix(camera: EquipmentCamera, card: { x: number; y: number; z: number; yaw: number; pitch: number; roll: number }, width: number, height: number) {
  const { axisX: u, axisY: v } = equipmentCardAxes(card);
  const center: Vector3 = [card.x, card.y, card.z];
  const anchor = sub(sub(sub(center, mul(u,width/2)), mul(v,height/2)), camera.position);
  const column = (point: Vector3) => {
    const depth = dot(point,camera.forward);
    return [(camera.screenX*depth + camera.focal*dot(point,camera.right))/camera.focal,
      (camera.screenY*depth + camera.focal*dot(point,camera.down))/camera.focal, 0, depth/camera.focal];
  };
  return `matrix3d(${[...column(u),...column(v),0,0,1,0,...column(anchor)].map(n=>n.toFixed(9)).join(',')})`;
}
