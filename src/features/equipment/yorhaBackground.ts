// Geometry reconstructed from the supplied YoRHa artwork. Grain and distortion
// timings follow the scene's filmgrain/vhs shaders; ornaments are omitted.
export const yorhaColors = { paper: '#c6c1ab', grid: '#cbc6b0', line: '#777568' };
export const yorhaLines = [
  [-220, -138, 870, 952], [0, 0, 1093, 1095], [92, -3, 1047, 952],
  [1462, 338, 2770, 1646], [1506, 482, 2656, 1632], [1684, 482, 2800, 1598],
];
export const yorhaCircles = [[-48, -48, 616], [-48, -48, 636], [2560, 1440, 590], [2560, 1440, 610]];

const vertex = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0., 1.); }`;
const number = (n: number) => n.toFixed(1);
const fragment = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec2 uView;
uniform float uTime;
out vec4 outputColor;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 v = b - a;
  return length(p - a - v * clamp(dot(p - a, v) / dot(v, v), 0., 1.));
}
// Integrate each 3-of-5-pixel grid cell over a screen pixel to avoid moire.
float integral(float x) { return floor(x) * .6 + clamp(fract(x) - .4, 0., .6); }
float gridAxis(float x, float footprint) {
  float w = max(footprint, .0001);
  return (integral(x + w * .5) - integral(x - w * .5)) / w;
}
void main() {
  vec2 uv = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uResolution;
  float scale = max(uView.x / 2560., uView.y / 1440.);
  vec2 p = (uv - .5) * uView / scale + vec2(1280., 720.);
  // Source VHS settings: strength .16, distortion 1.01, speed .82, width .81.
  float sweep = 1. - smoothstep(0., .0081, abs(fract(uTime * .82) - uv.y));
  p.x += pow(max(0., sin(uTime)), 4.) * 1.01 * .02 * .16 * 2560. * sweep;
  vec2 cell = p / 5.;
  float grid = gridAxis(cell.x, fwidth(cell.x)) * gridAxis(cell.y + .4, fwidth(cell.y));
  vec3 color = mix(vec3(198.,193.,171.), vec3(203.,198.,176.), grid) / 255.;
  float distance = 10000.;
  ${yorhaLines.map(([x1, y1, x2, y2]) => `distance = min(distance, segment(p, vec2(${number(x1)},${number(y1)}), vec2(${number(x2)},${number(y2)})));`).join('\n  ')}
  ${yorhaCircles.map(([x, y, r]) => `distance = min(distance, abs(length(p - vec2(${number(x)},${number(y)})) - ${number(r)}));`).join('\n  ')}
  float aa = max(length(fwidth(p)) * .5, .35);
  float line = 1. - smoothstep(1.6 - aa, 1.6 + aa, distance);
  color = mix(color, vec3(119.,117.,104.) / 255., line * .18);
  // Source grain settings: scale 14.95, exponent .67, strength .05.
  // Two counter-moving noise samples retain the fine analog texture.
  float t = fract(uTime);
  vec2 grainUV = uv * vec2(uView.x / uView.y, 1.);
  float noise = hash(floor((grainUV + t) * 14.95 * 128.))
    * hash(floor((grainUV - t * 2.5) * 14.95 * .52 * 128.));
  float grain = pow(noise, .67) - .3586;
  color += grain * .05 * .45;
  outputColor = vec4(color, 1.);
}`;

export function mountYorhaBackground(canvas: HTMLCanvasElement) {
  let gl: WebGL2RenderingContext | null = null;
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null;
  let resolution: WebGLUniformLocation | null = null, view: WebGLUniformLocation | null = null, time: WebGLUniformLocation | null = null;
  let active = false, reduced = false, disposed = false, failed = false, lost = false;
  let width = 1, height = 1, frame = 0, elapsed = 0, last = 0;
  const events = new AbortController();
  function release() {
    if (gl) { gl.deleteBuffer(buffer); gl.deleteProgram(program); }
    buffer = null; program = null; delete canvas.dataset.ready;
  }
  function init() {
    if (failed || lost || disposed) return false;
    gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) { failed = true; return false; }
    const shaders = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((type, i) => {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, i ? fragment : vertex); gl!.compileShader(shader); return shader;
    });
    program = gl.createProgram()!;
    shaders.forEach(shader => gl!.attachShader(program!, shader)); gl.linkProgram(program);
    const valid = shaders.every(shader => gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) && gl.getProgramParameter(program, gl.LINK_STATUS);
    shaders.forEach(shader => gl!.deleteShader(shader));
    if (!valid) { release(); failed = true; return false; }
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    resolution = gl.getUniformLocation(program, 'uResolution'); view = gl.getUniformLocation(program, 'uView'); time = gl.getUniformLocation(program, 'uTime');
    return true;
  }
  function draw() {
    if (!program && !init()) return;
    // Render at native display density, bounded only by the GPU's supported size.
    const maximum = gl!.getParameter(gl!.MAX_VIEWPORT_DIMS) as Int32Array;
    const ratio = Math.min(window.devicePixelRatio || 1, maximum[0] / width, maximum[1] / height);
    const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h; gl!.viewport(0, 0, w, h);
    }
    gl!.useProgram(program); gl!.uniform2f(resolution, w, h); gl!.uniform2f(view, width, height);
    gl!.uniform1f(time, reduced ? 0 : elapsed); gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    canvas.dataset.ready = 'true';
  }
  function tick(now: number) {
    frame = 0;
    if (!active || reduced || document.hidden || disposed || failed || lost) return;
    if (!last || now - last >= 1000 / 24) {
      elapsed += last ? Math.min((now - last) / 1000, .1) : 0; last = now; draw();
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (active && !document.hidden && !disposed && !lost) {
      draw();
      if (!reduced && !frame && !failed) { last = 0; frame = requestAnimationFrame(tick); }
    }
    if ((!active || document.hidden || reduced) && frame) { cancelAnimationFrame(frame); frame = 0; }
  }
  document.addEventListener('visibilitychange', sync, { signal: events.signal });
  window.addEventListener('resize', sync, { passive: true, signal: events.signal });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0;
    program = null; buffer = null; delete canvas.dataset.ready;
  }, { signal: events.signal });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; failed = false; sync(); }, { signal: events.signal });
  return {
    update(visible: boolean, w: number, h: number, reduceMotion: boolean) {
      const changed = active !== visible || width !== w || height !== h || reduced !== reduceMotion;
      active = visible; width = Math.max(1, w); height = Math.max(1, h); reduced = reduceMotion;
      if (changed) sync();
    },
    dispose() { disposed = true; cancelAnimationFrame(frame); events.abort(); release(); }
  };
}
