import { BoxGeometry, BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer } from 'three';
import { equipmentRippleImpacts, type EquipmentRipplePose } from './equipmentRippleMotion';

const sharedFragment = `
uniform vec2 uResolution;
vec2 screen() { return vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uResolution; }
vec3 backdrop(vec2 uv) {
  float haze = exp(-length((uv - vec2(.5, .64)) * vec2(1.3, 1.6)) * 3.);
  return vec3(.045, .043, .078) + vec3(.023, .012, .042) * haze;
}`;

// Both the columns and their floor tiles use the same birth time. The leading
// edge consists of growing geometry; the canvas itself is never clipped.
const assemblyShader = `
uniform float uReveal;
uniform float uReduced;
uniform float uStep;
uniform vec2 uViewport;
uniform mat4 uViewProjection;
float cellSeed(vec2 p) {
  return fract(sin(dot(floor(p / uStep), vec2(12.9898, 78.233))) * 43758.5453);
}
float cellAge(vec2 p) {
  vec4 projected = uViewProjection * vec4(p.x, 0., p.y, 1.);
  vec2 uv = projected.xy / projected.w * .5 + .5;
  float distance = length((uv - vec2(.5, .45)) * uViewport)
    / length(uViewport * vec2(.5, .55));
  float grain = mix(1., .2, smoothstep(28., 54., length(p)));
  float stagger = (cellSeed(p) * .08 + .025 * sin(p.x * .25) * cos(p.y * .23)) * grain;
  float arrival = clamp(distance * .72 + stagger, 0., .82);
  return mix(clamp((uReveal - arrival) / .18, 0., 1.), 1., uReduced);
}`;

const terrainVertex = `
${assemblyShader}
attribute vec2 aOffset;
uniform float uTravel;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying float vCrest;
varying float vSeed;
varying float vPresence;
float wave(vec2 p, vec2 origin, float at, float strength) {
  float age = uTravel - at;
  float d = length(p - origin) - max(0., age) * 68.;
  float crest = exp(-pow(d / 1.45, 2.));
  float echo = .44 * exp(-pow((d + 4.2) / 1.7, 2.));
  float last = .18 * exp(-pow((d + 8.4) / 2., 2.));
  return (crest + echo + last) * strength * smoothstep(0., .035, age) * exp(-max(0., age) * 1.1);
}
void main() {
  float seed = cellSeed(aOffset);
  float age = cellAge(aOffset);
  float growth = smoothstep(0., .70, age);
  float arrivalCrest = sin(age * 3.14159265) * (1. - uReduced);
  float pulse = 0.;
  ${equipmentRippleImpacts.map(impact => `pulse += wave(aOffset, vec2(${impact.x.toFixed(1)}, ${impact.z.toFixed(1)}), ${impact.at.toFixed(2)}, ${impact.strength.toFixed(2)});`).join('\n  ')}
  pulse *= 1. - uReduced;
  float terrain = .10 + .26 * seed * seed
    + .20 * pow(.5 + .5 * sin(aOffset.x * .34) * cos(aOffset.y * .29), 2.);
  float lift = pulse * (1.05 + seed * .42) * growth
    + arrivalCrest * (1.6 + seed * .9) * growth;
  vec3 p = position;
  p.xz *= growth;
  p.y = (p.y + .5) * (terrain * growth + lift);
  p.xz += aOffset;
  vNormal = normal; vWorld = p; vUv = uv;
  vCrest = pulse * growth + arrivalCrest * .75;
  vSeed = seed; vPresence = smoothstep(.05, .25, age);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
}`;

const terrainFragment = `
${sharedFragment}
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying float vCrest;
varying float vSeed;
varying float vPresence;
void main() {
  if (vPresence < .001) discard;
  vec2 uv = screen();
  float top = step(.5, vNormal.y);
  float light = .42 + .58 * max(0., dot(vNormal, normalize(vec3(-.4, 1., .7))));
  float edge = 1. - smoothstep(.015, .045, min(min(vUv.x, 1.-vUv.x), min(vUv.y, 1.-vUv.y)));
  vec3 color = mix(vec3(.052, .048, .10), vec3(.105, .084, .19), top) * light;
  color += vec3(.028, .021, .050) * vSeed * top;
  // The moving crest illuminates and lifts individual bars, then leaves them at rest.
  color += vec3(.29, .12, .59) * vCrest * (.24 + top * .76);
  color += vec3(.22, .16, .36) * edge * top * (.10 + vCrest * .8);
  float fog = smoothstep(28., 54., length(vWorld.xz));
  color = mix(color, backdrop(uv), fog);
  gl_FragColor = vec4(color, vPresence);
}`;

const floorFragment = `
${sharedFragment}
${assemblyShader}
uniform mat4 uInverseProjection;
uniform mat4 uCameraWorld;
void main() {
  vec2 uv = screen();
  vec4 viewRay = uInverseProjection * vec4(uv * vec2(2., -2.) + vec2(-1., 1.), 1., 1.);
  vec3 ray = (uCameraWorld * vec4(viewRay.xyz / viewRay.w, 0.)).xyz;
  vec3 origin = uCameraWorld[3].xyz;
  vec2 ground = (origin - ray * (origin.y / ray.y)).xz;
  vec2 cell = (floor(ground / uStep) + .5) * uStep;
  float age = cellAge(cell);
  // Floor tiles follow the rising columns and close their gaps as they settle.
  float growth = smoothstep(.25, .90, age);
  vec2 local = abs(ground - cell);
  float edge = max(local.x, local.y);
  float aa = max(fwidth(edge), .0001);
  float halfSize = uStep * .5 * growth + aa * 2. * step(.999, age);
  float alpha = (1. - smoothstep(halfSize - aa, halfSize + aa, edge)) * smoothstep(.35, .80, age);
  if (alpha < .001) discard;
  gl_FragColor = vec4(backdrop(uv), alpha);
}`;

const rainVertex = `
attribute vec4 aDrop;
uniform float uTravel;
uniform float uReduced;
varying float vLife;
void main() {
  float age = (uTravel - aDrop.z + .095) / .095;
  vLife = smoothstep(0., .15, age) * (1.-smoothstep(.88, 1., age)) * (1.-uReduced);
  vec3 p = position * vec3(.045, 1.3, .045);
  p += vec3(aDrop.x, .6 + 19. * (1. - clamp(age, 0., 1.) * clamp(age, 0., 1.)), aDrop.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
}`;
const rainFragment = `
${sharedFragment}
varying float vLife;
void main() {
  float alpha = vLife * .55;
  if (alpha < .001) discard;
  gl_FragColor = vec4(.66, .49, .93, alpha);
}`;

/** Pure scroll rendering: no timer, audio input, media, or independent animation loop. */
export function mountEquipmentRipple(element: HTMLElement) {
  const canvas = element.querySelector<HTMLCanvasElement>('[data-equipment-ripple-canvas]')!;
  const fallback = element.querySelector<HTMLElement>('[data-equipment-ripple-fallback]')!;
  const events = new AbortController();
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, .1, 180);
  const uniforms = {
    uResolution: { value: new Vector2(1, 1) },
    uViewport: { value: new Vector2(1, 1) },
    uViewProjection: { value: new Matrix4() },
    uInverseProjection: { value: new Matrix4() },
    uCameraWorld: { value: new Matrix4() },
    uStep: { value: 1 }, uReveal: { value: 0 },
    uTravel: { value: 0 }, uReduced: { value: 0 },
  };
  let renderer: WebGLRenderer | undefined, failed = false, lost = false, disposed = false;
  let state: { pose: EquipmentRipplePose; width: number; height: number; visible: boolean } | undefined;
  let lastKey = '', sizeKey = '';
  const geometries: Array<PlaneGeometry | InstancedBufferGeometry> = [];
  const materials: ShaderMaterial[] = [];
  const makeMaterial = (vertexShader: string, fragmentShader: string) => {
    const material = new ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, toneMapped: false });
    materials.push(material); return material;
  };
  function init(width: number) {
    if (renderer || failed || lost || disposed) return;
    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setClearColor(0x000000, 0);
      const plane = new PlaneGeometry(2, 2);
      geometries.push(plane);
      const back = new Mesh(plane, makeMaterial(`void main() { gl_Position = vec4(position.xy, 1., 1.); }`, floorFragment));
      back.material.depthTest = false; back.material.depthWrite = false; back.frustumCulled = false; back.renderOrder = -2;
      scene.add(back);
      const count = width <= 640 ? 96 : 144, span = 86, step = span / count;
      uniforms.uStep.value = step;
      const box = new BoxGeometry(step * .86, 1, step * .86);
      const grid = new InstancedBufferGeometry();
      grid.index = box.index!.clone();
      for (const [key, attribute] of Object.entries(box.attributes)) grid.setAttribute(key, (attribute as BufferAttribute).clone());
      box.dispose();
      const offsets = new Float32Array(count * count * 2);
      for (let z = 0; z < count; z++) for (let x = 0; x < count; x++) {
        const i = z * count + x;
        offsets[i * 2] = (x - (count - 1) / 2) * step;
        offsets[i * 2 + 1] = (z - (count - 1) / 2) * step;
      }
      grid.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 2));
      grid.instanceCount = count * count;
      geometries.push(grid);
      const terrain = new Mesh(grid, makeMaterial(terrainVertex, terrainFragment));
      terrain.frustumCulled = false; scene.add(terrain);
      const dropBox = new BoxGeometry(1, 1, 1), drops = new InstancedBufferGeometry();
      drops.index = dropBox.index!.clone();
      for (const [key, attribute] of Object.entries(dropBox.attributes)) drops.setAttribute(key, (attribute as BufferAttribute).clone());
      dropBox.dispose();
      drops.setAttribute('aDrop', new InstancedBufferAttribute(new Float32Array(equipmentRippleImpacts.flatMap(impact => [impact.x, impact.z, impact.at, impact.strength])), 4));
      drops.instanceCount = equipmentRippleImpacts.length; geometries.push(drops);
      const rain = new Mesh(drops, makeMaterial(rainVertex, rainFragment));
      rain.material.depthWrite = false; rain.frustumCulled = false; rain.renderOrder = 1; scene.add(rain);
    } catch (error) {
      failed = true; release(); console.warn('Showing the still equipment ripple background.', error);
    }
  }
  function release() {
    geometries.forEach(geometry => geometry.dispose()); geometries.length = 0;
    materials.forEach(material => material.dispose()); materials.length = 0;
    scene.clear(); renderer?.dispose(); renderer = undefined; sizeKey = ''; delete canvas.dataset.ready;
  }
  function draw() {
    if (!state || !state.visible || document.hidden || disposed || lost) return;
    const { width, height, pose } = state;
    init(width);
    if (!renderer || failed) return;
    const key = `${width}:${height}:${devicePixelRatio}`;
    if (key !== sizeKey) {
      sizeKey = key;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(2400000 / (width * height))));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.set(24, 27, 35); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      uniforms.uViewport.value.set(width, height);
      uniforms.uViewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse);
      uniforms.uCameraWorld.value.copy(camera.matrixWorld);
      renderer.getDrawingBufferSize(uniforms.uResolution.value);
    }
    uniforms.uTravel.value = pose.reduced ? 0 : pose.travel;
    uniforms.uReduced.value = Number(pose.reduced);
    uniforms.uReveal.value = pose.progress;
    renderer.render(scene, camera); canvas.dataset.ready = 'true';
  }
  document.addEventListener('visibilitychange', draw, { signal: events.signal });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true; delete canvas.dataset.ready;
  }, { signal: events.signal });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false; release(); lastKey = ''; draw();
  }, { signal: events.signal });
  return {
    update(pose: EquipmentRipplePose, width: number, height: number, visible: boolean) {
      if (disposed) return;
      state = { pose, width, height, visible };
      const key = `${visible}:${width}:${height}:${pose.progress}:${pose.travel}:${pose.reduced}:${devicePixelRatio}`;
      if (key === lastKey) return;
      lastKey = key;
      element.dataset.progress = pose.progress.toFixed(5);
      // Individual GPU instances build the scene over the still-visible equipment.
      element.style.opacity = pose.reduced ? String(pose.progress) : pose.progress > 0 ? '1' : '0';
      fallback.style.opacity = pose.reduced ? '1' : String(pose.progress);
      draw();
    },
    dispose() { disposed = true; events.abort(); release(); }
  };
}
