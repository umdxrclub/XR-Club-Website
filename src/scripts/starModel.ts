import * as THREE from 'three';

// The coordinates and silhouette come from the supplied partners Sponsors.png.
// Keep the whole image rectangle (including its translucent halo) on the front:
// changing only depth lets the original artwork become a solid object in place.
const IMAGE_WIDTH = 351;
const IMAGE_HEIGHT = 397;
const CENTER_X = 160;
const CENTER_Y = 195;
const HALF_DEPTH = 0.125;
const FRONT_COLUMNS = 160;
const FRONT_ROWS = 180;

// Opaque-outline distances in pixels, sampled counterclockwise every 1.875°
// from the image's rightward ray. They preserve the source's asymmetry rather
// than replacing it with a generic four-point star.
const OUTLINE_RADII = [
  175.25, 177.5, 178.75, 178.25, 178, 175.75, 173.75, 169.5, 165, 160, 153.75, 149, 142.25, 136.75, 132.25, 126.25,
  122.75, 118.25, 113.5, 109, 105.75, 103, 103, 103.25, 105.25, 107.5, 111, 113, 116.5, 119.75, 123.25, 127.75,
  132, 136.75, 141.25, 146.5, 152.75, 158.5, 164, 170.5, 175.75, 179, 183, 184.75, 186, 185.25, 183.75, 182.5,
  179.5, 175.5, 170.75, 166.25, 160.75, 156.5, 151, 145.25, 140.25, 135.25, 129.25, 126.25, 121.5, 117.5, 114.25, 111.25,
  109, 106.5, 103.25, 102, 99.25, 98.5, 96.25, 95.75, 94, 93.75, 93.25, 92.25, 92.5, 92.75, 93, 94.75,
  97, 99, 102.75, 105.25, 108.25, 112, 116.5, 119.5, 124.75, 127.75, 131, 135.25, 138.5, 141, 143.75, 145.5,
  146.5, 147.5, 146.75, 146, 144.5, 142.25, 140, 136, 131.75, 128, 122.75, 118, 114, 110, 106.25, 102.75,
  99, 95.5, 94.25, 93.5, 95, 96.25, 97.75, 99.25, 101, 104.5, 106.75, 109.5, 112.5, 116.25, 119.5, 124,
  128.75, 134.25, 139, 144, 150.25, 157.5, 163.25, 168.75, 175.25, 179, 184, 187, 189, 190.25, 189.75, 189.5,
  188.25, 185.5, 181.75, 178.25, 172.25, 166.5, 161.25, 154.5, 148.75, 143.5, 138.25, 134, 129.25, 124.75, 120.75, 117.5,
  114.75, 112.25, 108.75, 107.25, 104.25, 102.75, 100.75, 99.25, 98.25, 97.25, 96.25, 95.25, 95, 95.25, 95.5, 97,
  98.75, 102.5, 105, 110, 113.5, 119, 124, 129, 135, 141, 146.25, 152.5, 158.75, 164.25, 169.75, 172.5,
];

function outlineRadius(angle: number) {
  const count = OUTLINE_RADII.length;
  const sample = ((angle / (Math.PI * 2)) * count + count) % count;
  const index = Math.floor(sample);
  const t = sample - index;
  const a = OUTLINE_RADII[(index - 1 + count) % count];
  const b = OUTLINE_RADII[index];
  const c = OUTLINE_RADII[(index + 1) % count];
  const d = OUTLINE_RADII[(index + 2) % count];
  // A continuous contour avoids facets along the rounded colored edge.
  return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
}

function createFrontGeometry() {
  const geometry = new THREE.PlaneGeometry(IMAGE_WIDTH / IMAGE_HEIGHT, 1, FRONT_COLUMNS, FRONT_ROWS);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const pixelX = position.getX(i) * IMAGE_HEIGHT + IMAGE_WIDTH / 2;
    const pixelY = IMAGE_HEIGHT / 2 - position.getY(i) * IMAGE_HEIGHT;
    const dx = pixelX - CENTER_X;
    const dy = CENTER_Y - pixelY;
    const radius = Math.hypot(dx, dy);
    const contour = outlineRadius(Math.atan2(dy, dx));
    const fraction = Math.min(1, radius / contour);
    // A pillow profile; all X/Y positions and UVs remain exactly unchanged.
    // The translucent fringe stays on the equator of the rounded object.
    position.setZ(i, HALF_DEPTH * Math.sqrt(Math.max(0, 1 - fraction * fraction)));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createBackGeometry(frontGeometry: THREE.BufferGeometry) {
  const segments = 384;
  const rings = 36;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const frontPositions = frontGeometry.getAttribute('position');
  const frontHeight = (pixelX: number, pixelY: number) => {
    const gridX = pixelX / IMAGE_WIDTH * FRONT_COLUMNS;
    const gridY = pixelY / IMAGE_HEIGHT * FRONT_ROWS;
    const column = Math.min(FRONT_COLUMNS - 1, Math.floor(gridX));
    const row = Math.min(FRONT_ROWS - 1, Math.floor(gridY));
    const u = gridX - column;
    const v = gridY - row;
    const topLeft = row * (FRONT_COLUMNS + 1) + column;
    const bottomLeft = topLeft + FRONT_COLUMNS + 1;
    const a = frontPositions.getZ(topLeft);
    const b = frontPositions.getZ(bottomLeft);
    const c = frontPositions.getZ(bottomLeft + 1);
    const d = frontPositions.getZ(topLeft + 1);
    // Match PlaneGeometry's actual triangle interpolation, not the analytic
    // pillow function: its grid straddles the contour and has nonzero depth
    // there. Joining the rear edge to this surface closes the side-view seam.
    return u + v <= 1
      ? a * (1 - u - v) + b * v + d * u
      : b * (1 - u) + d * (1 - v) + c * (u + v - 1);
  };

  // Build the rear hemisphere from its image-derived equator to its pole.
  for (let ring = 0; ring < rings; ring++) {
    const latitude = (ring / rings) * Math.PI / 2;
    const radialScale = Math.cos(latitude);
    for (let segment = 0; segment < segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      const radius = outlineRadius(angle) * radialScale;
      const pixelX = CENTER_X + Math.cos(angle) * radius;
      const pixelY = CENTER_Y - Math.sin(angle) * radius;
      positions.push(
        (pixelX - IMAGE_WIDTH / 2) / IMAGE_HEIGHT,
        (IMAGE_HEIGHT / 2 - pixelY) / IMAGE_HEIGHT,
        ring === 0 ? frontHeight(pixelX, pixelY) : -HALF_DEPTH * Math.sin(latitude),
      );
      uvs.push(pixelX / IMAGE_WIDTH, 1 - pixelY / IMAGE_HEIGHT);
    }
  }
  const pole = positions.length / 3;
  positions.push((CENTER_X - IMAGE_WIDTH / 2) / IMAGE_HEIGHT, (IMAGE_HEIGHT / 2 - CENTER_Y) / IMAGE_HEIGHT, -HALF_DEPTH);
  uvs.push(CENTER_X / IMAGE_WIDTH, 1 - CENTER_Y / IMAGE_HEIGHT);

  for (let ring = 0; ring < rings - 1; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      const a = ring * segments + segment;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + segment;
      const d = (ring + 1) * segments + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  for (let segment = 0; segment < segments; segment++) {
    const current = (rings - 1) * segments + segment;
    const next = (rings - 1) * segments + (segment + 1) % segments;
    indices.push(current, pole, next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export interface StarModel {
  /** One complete PNG-height unit; +Z is the front of the supplied artwork. */
  root: THREE.Group;
  /** Conservative opaque-body extents, excluding the soft image halo. */
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
  /** 0 is the original flat artwork; 1 is the fully inflated solid star. */
  setDepth: (amount: number) => void;
  /** Opaque pillow volume, for validating skin contact independently of the halo. */
  containsPoint: (point: THREE.Vector3, depth: number) => boolean;
}

export function createStarModel(texture: THREE.Texture): StarModel {
  texture.colorSpace = THREE.SRGBColorSpace;
  const root = new THREE.Group();
  root.name = 'stolen-sponsor-star';
  const shell = new THREE.Group();
  shell.name = 'star-depth-morph';
  root.add(shell);

  const frontGeometry = createFrontGeometry();
  const front = new THREE.Mesh(frontGeometry, new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    toneMapped: false,
    side: THREE.FrontSide,
    // Discard only effectively empty pixels; retain the PNG's soft white halo.
    alphaTest: 0.00001,
    depthWrite: true,
  }));
  front.name = 'original-artwork-front';
  const back = new THREE.Mesh(createBackGeometry(frontGeometry), new THREE.MeshPhysicalMaterial({
    map: texture,
    metalness: 0.55,
    roughness: 0.29,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    iridescence: 0.8,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 480],
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 0.08,
    envMapIntensity: 1.2,
  }));
  back.name = 'rounded-iridescent-star-back';
  shell.add(front, back);

  const setDepth = (amount: number) => {
    const depth = THREE.MathUtils.clamp(amount, 0, 1);
    shell.scale.z = depth;
    back.visible = depth > 0.0001;
  };
  setDepth(0);

  return {
    root,
    halfWidth: 0.413,
    halfHeight: 0.476,
    halfDepth: HALF_DEPTH,
    setDepth,
    containsPoint(point, depth) {
      if (depth < 0.001) return false;
      const dx = point.x * IMAGE_HEIGHT + IMAGE_WIDTH / 2 - CENTER_X;
      const dy = point.y * IMAGE_HEIGHT + CENTER_Y - IMAGE_HEIGHT / 2;
      const fraction = Math.hypot(dx, dy) / outlineRadius(Math.atan2(dy, dx));
      if (fraction >= 0.985) return false;
      const thickness = HALF_DEPTH * depth * Math.sqrt(1 - fraction * fraction);
      return Math.abs(point.z) < thickness - 0.004;
    },
  };
}
