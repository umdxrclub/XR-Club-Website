import { waveLayerGLSL } from '../../lib/waveLayer';
import { equipmentWaveBase, equipmentWaveFrequency, equipmentWaveLayers, equipmentWaveSpeed } from './equipmentWaveSettings';

const rgb = (hex: string) => `vec3(${[1, 3, 5].map(i => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(6)).join(',')})`;
const vertex = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0., 1.); }`;
const fragment = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec2 uView;
uniform float uTime;
out vec4 outputColor;
${waveLayerGLSL}
float wave(float s, float boundary, float phase) {
  float time = uTime * ${equipmentWaveSpeed.toFixed(5)};
  // Broad, near-horizontal curves frame a quiet center for the equipment.
  return boundary + .16 * sin(s * 1.55 + phase * .4 + time)
    + .018 * sin(s * ${equipmentWaveFrequency.toFixed(8)} + phase * .5 - time * .35);
}
void main() {
  vec2 uv = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uResolution;
  float scale = max(uView.x / 1600., uView.y / 1000.);
  vec2 p = (uv - .5) * uView / (1000. * scale);
  float q = dot(p, vec2(.16, .9871170143));
  float s = dot(p, vec2(-.9871170143, .16));
  vec3 color = ${rgb(equipmentWaveBase)};
  ${equipmentWaveLayers.map(fold => `{
    float d = q - wave(s, ${fold.boundary.toFixed(5)}, ${fold.phase.toFixed(5)});
    float aa = max(fwidth(d) * .65, .00005);
    vec3 fill = ${rgb(fold.color)};
    fill *= 1. - .012 * exp(-max(d, 0.) / .12);
    fill += vec3(.006) * exp(-pow((d - .006) / .008, 2.));
    color = layer(color, fill, d, aa, .032, .020);
  }`).join('\n  ')}
  // Sub-pixel dithering keeps the pale gradients clean on 8-bit displays.
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
  outputColor = vec4(clamp(color + (grain - .5) / 255., 0., 1.), 1.);
}`;


export function mountEquipmentWaves(canvas: HTMLCanvasElement) {
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
    if (!last || now - last >= 1000 / 30) {
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
