/**
 * Rebuild the self-contained star model with Node 24:
 *   node scripts/export-homepage-star.mjs
 *
 * Uses the same geometry as the homepage, with its original PNG embedded
 * byte-for-byte. Manual glTF packing avoids requiring a browser/canvas merely
 * to copy that existing image. No generated replacement artwork is involved.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStarModel } from '../src/scripts/starModel.ts';

const imagePath = new URL('../public/models/homepage-star.png', import.meta.url);
const outputPath = new URL('../public/models/homepage-star.glb', import.meta.url);
const png = readFileSync(imagePath);
const star = createStarModel(new THREE.Texture());
star.setDepth(1);
star.root.updateMatrixWorld(true);

const chunks = [];
const bufferViews = [];
const accessors = [];
let byteLength = 0;

function addBufferView(bytes, target) {
  const view = { buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength };
  if (target !== undefined) view.target = target;
  const index = bufferViews.push(view) - 1;
  chunks.push(Buffer.from(bytes));
  byteLength += bytes.byteLength;
  const padding = (4 - byteLength % 4) % 4;
  if (padding) {
    chunks.push(Buffer.alloc(padding));
    byteLength += padding;
  }
  return index;
}

function addAccessor(array, itemSize, target) {
  const componentType = array instanceof Float32Array ? 5126 : array instanceof Uint32Array ? 5125 : 5123;
  const type = itemSize === 1 ? 'SCALAR' : `VEC${itemSize}`;
  const min = Array(itemSize).fill(Infinity);
  const max = Array(itemSize).fill(-Infinity);
  for (let i = 0; i < array.length; i++) {
    assert(Number.isFinite(array[i]), 'All model coordinates must be finite.');
    const component = i % itemSize;
    min[component] = Math.min(min[component], array[i]);
    max[component] = Math.max(max[component], array[i]);
  }
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  return accessors.push({
    bufferView: addBufferView(bytes, target),
    byteOffset: 0,
    componentType,
    count: array.length / itemSize,
    type,
    min,
    max,
  }) - 1;
}

const materials = [
  {
    name: 'Original PNG colors — unlit front',
    pbrMetallicRoughness: {
      baseColorTexture: { index: 0 },
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0,
      roughnessFactor: 1,
    },
    alphaMode: 'BLEND',
    doubleSided: false,
    extensions: { KHR_materials_unlit: {} },
  },
  {
    name: 'Rounded iridescent back',
    pbrMetallicRoughness: {
      baseColorTexture: { index: 0 },
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0.55,
      roughnessFactor: 0.29,
    },
    alphaMode: 'OPAQUE',
    doubleSided: false,
    emissiveTexture: { index: 0 },
    emissiveFactor: [0.08, 0.08, 0.08],
    extensions: {
      KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.15 },
      KHR_materials_iridescence: {
        iridescenceFactor: 0.8,
        iridescenceIor: 1.35,
        iridescenceThicknessMinimum: 180,
        iridescenceThicknessMaximum: 480,
      },
    },
  },
];

const meshes = [];
const meshNodes = [];
const normalizedBounds = new THREE.Box3();
star.root.traverse((object) => {
  if (!(object instanceof THREE.Mesh)) return;
  const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
  const uv = geometry.getAttribute('uv');
  // The scene uses a conventional Three.js PNG texture (flipY=true), whereas
  // glTF images use a top-left origin (GLTFLoader sets flipY=false). Embed the
  // untouched PNG and invert V once so the loaded model matches the homepage.
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const indices = geometry.getIndex();
  assert(indices, 'Both star surfaces must use indexed triangles.');
  const meshIndex = meshes.length;
  meshes.push({
    name: object.name,
    primitives: [{
      attributes: {
        POSITION: addAccessor(position.array, 3, 34962),
        NORMAL: addAccessor(normal.array, 3, 34962),
        TEXCOORD_0: addAccessor(uv.array, 2, 34962),
      },
      indices: addAccessor(indices.array, 1, 34963),
      material: object.material instanceof THREE.MeshBasicMaterial ? 0 : 1,
      mode: 4,
    }],
  });
  meshNodes.push({ name: object.name, mesh: meshIndex });
  geometry.computeBoundingBox();
  normalizedBounds.union(geometry.boundingBox);
  geometry.dispose();
});

const imageBufferView = addBufferView(png);
const binary = Buffer.concat(chunks);
const gltf = {
  asset: { version: '2.0', generator: 'XR Club homepage star exporter' },
  scene: 0,
  scenes: [{ name: 'Homepage star', nodes: [0] }],
  nodes: [{ name: 'stolen-sponsor-star', children: meshNodes.map((_, index) => index + 1) }, ...meshNodes],
  meshes,
  materials,
  textures: [{ sampler: 0, source: 0 }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  images: [{ name: 'Original supplied star artwork', mimeType: 'image/png', bufferView: imageBufferView }],
  accessors,
  bufferViews,
  buffers: [{ byteLength: binary.byteLength }],
  extensionsUsed: ['KHR_materials_unlit', 'KHR_materials_clearcoat', 'KHR_materials_iridescence'],
  extensionsRequired: ['KHR_materials_unlit'],
  extras: {
    sourceImage: 'homepage-star.png',
    sourceImageDimensions: [351, 397],
    imageHeightUnits: 1,
    inflatedDepthUnits: 0.25,
    description: 'An inflated star traced from the supplied PNG, retaining the original unlit front colors and translucent halo.',
    rebuild: 'node scripts/export-homepage-star.mjs',
  },
};

const jsonBytes = Buffer.from(JSON.stringify(gltf));
const json = Buffer.alloc(Math.ceil(jsonBytes.byteLength / 4) * 4, 0x20);
jsonBytes.copy(json);
const glb = Buffer.alloc(12 + 8 + json.byteLength + 8 + binary.byteLength);
glb.writeUInt32LE(0x46546c67, 0);
glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(glb.byteLength, 8);
glb.writeUInt32LE(json.byteLength, 12);
glb.writeUInt32LE(0x4e4f534a, 16);
json.copy(glb, 20);
const binaryHeader = 20 + json.byteLength;
glb.writeUInt32LE(binary.byteLength, binaryHeader);
glb.writeUInt32LE(0x004e4942, binaryHeader + 4);
binary.copy(glb, binaryHeader + 8);
writeFileSync(outputPath, glb);

// Validate the written file independently of the packing cursors above.
const written = readFileSync(outputPath);
assert.equal(written.readUInt32LE(0), 0x46546c67);
assert.equal(written.readUInt32LE(4), 2);
assert.equal(written.readUInt32LE(8), written.byteLength);
assert.equal(written.readUInt32LE(16), 0x4e4f534a);
const jsonLength = written.readUInt32LE(12);
assert.equal(jsonLength % 4, 0);
const parsed = JSON.parse(written.subarray(20, 20 + jsonLength).toString());
const binHeader = 20 + jsonLength;
assert.equal(written.readUInt32LE(binHeader + 4), 0x004e4942);
const binLength = written.readUInt32LE(binHeader);
const binStart = binHeader + 8;
assert.equal(binStart + binLength, written.byteLength);
assert.equal(parsed.buffers[0].byteLength, binLength);
for (const view of parsed.bufferViews) {
  assert.equal(view.byteOffset % 4, 0);
  assert(view.byteOffset + view.byteLength <= binLength);
}
for (const accessor of parsed.accessors) {
  const components = accessor.type === 'SCALAR' ? 1 : Number(accessor.type.slice(3));
  const componentBytes = accessor.componentType === 5123 ? 2 : 4;
  const view = parsed.bufferViews[accessor.bufferView];
  assert.equal(accessor.count * components * componentBytes, view.byteLength);
}
for (const mesh of parsed.meshes) {
  const primitive = mesh.primitives[0];
  const vertexCount = parsed.accessors[primitive.attributes.POSITION].count;
  const indexAccessor = parsed.accessors[primitive.indices];
  assert.equal(indexAccessor.count % 3, 0);
  assert(indexAccessor.max[0] < vertexCount);
  assert.equal(parsed.accessors[primitive.attributes.NORMAL].count, vertexCount);
  assert.equal(parsed.accessors[primitive.attributes.TEXCOORD_0].count, vertexCount);
}
const storedImage = parsed.bufferViews[parsed.images[0].bufferView];
assert(png.equals(written.subarray(binStart + storedImage.byteOffset, binStart + storedImage.byteOffset + storedImage.byteLength)), 'Embedded PNG must remain byte-for-byte identical.');
assert(Math.abs(normalizedBounds.min.y + 0.5) < 1e-6);
assert(Math.abs(normalizedBounds.max.y - 0.5) < 1e-6);
assert(Math.abs(normalizedBounds.min.z + 0.125) < 1e-6);
assert(Math.abs(normalizedBounds.max.z - 0.125) < 1e-5);

console.log(JSON.stringify({
  file: fileURLToPath(outputPath),
  bytes: written.byteLength,
  meshes: parsed.meshes.length,
  vertices: parsed.meshes.reduce((sum, mesh) => sum + parsed.accessors[mesh.primitives[0].attributes.POSITION].count, 0),
  triangles: parsed.meshes.reduce((sum, mesh) => sum + parsed.accessors[mesh.primitives[0].indices].count / 3, 0),
  bounds: { min: normalizedBounds.min.toArray(), max: normalizedBounds.max.toArray() },
  embeddedOriginalPng: true,
  validation: 'passed',
}, null, 2));
