import { BACKDROP_DEPTH, CAMERA_DISTANCE, SHARD_CUTS, prismPlanes, shards, type PrismPose } from './prismMotion';

const number = (n: number) => n.toFixed(7);
const vertex = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0., 1.); }`;

// Analytic ray tracing of convex glass pieces: each shard is the prism cut by
// planes, so entry and exit are exact and every edge stays sharp. The scene
// behind the glass is the captured sky, sampled in screen space.
const fragment = `#version 300 es
precision highp float;
precision highp int;
#define SHARDS ${shards.length}
#define CUTS ${SHARD_CUTS}
uniform vec2 uCenter;
uniform float uFocal;
uniform vec3 uCamPos;
uniform mat3 uCamera;
uniform mat3 uPrism;
uniform vec4 uCuts[SHARDS * CUTS];
uniform mat3 uShardRot[SHARDS];
uniform vec3 uShardMove[SHARDS];
uniform vec3 uShardCenter[SHARDS];
uniform sampler2D uBackground;
uniform vec4 uBackRect;
uniform float uPlane;
uniform vec3 uLight;
uniform float uAlpha;
uniform float uCrack;
uniform float uSupersample;
out vec4 outColor;

const float IOR = 1.52;
const float DISPERSION = .035;
const float F0 = .0426;
const vec4 PRISM[5] = vec4[5](${prismPlanes.map(p => `vec4(${p.n.map(number).join(',')},${number(p.d)})`).join(',')});

float fresnel(float cosine) {
  float m = 1. - cosine, m2 = m * m;
  return F0 + (1. - F0) * m2 * m2 * m;
}

vec3 sky(vec3 d) {
  vec3 zenith = vec3(.03, .30, .82), horizon = vec3(.56, .78, .97), ground = vec3(.36, .56, .76);
  vec3 c = mix(ground, mix(horizon, zenith, smoothstep(-.05, .7, d.y)), smoothstep(-.35, -.02, d.y));
  float sun = pow(max(dot(d, uLight), 0.), 60.);
  return c + vec3(1., .96, .86) * sun * .9;
}

// Crossing of shard i, in prism space. The entry tN may lie behind the origin
// when the ray starts inside; tF is the exit.
bool convex(int i, vec3 ro, vec3 rd, out float tN, out vec3 nN, out float tF, out vec3 nF) {
  mat3 rot = uShardRot[i];
  vec3 c = uShardCenter[i];
  vec3 p = (ro - c - uShardMove[i]) * rot + c;
  vec3 d = rd * rot;
  tN = -1e9; tF = 1e9; nN = vec3(0.); nF = vec3(0.);
  for (int k = 0; k < 5; k++) {
    vec4 pl = PRISM[k];
    float denom = dot(pl.xyz, d), dist = dot(pl.xyz, p) - pl.w;
    if (abs(denom) < 1e-7) { if (dist > 0.) return false; continue; }
    float t = -dist / denom;
    if (denom < 0.) { if (t > tN) { tN = t; nN = pl.xyz; } }
    else if (t < tF) { tF = t; nF = pl.xyz; }
  }
  for (int k = 0; k < CUTS; k++) {
    vec4 pl = uCuts[i * CUTS + k];
    float denom = dot(pl.xyz, d), dist = dot(pl.xyz, p) - pl.w;
    if (abs(denom) < 1e-7) { if (dist > 0.) return false; continue; }
    float t = -dist / denom;
    if (denom < 0.) { if (t > tN) { tN = t; nN = pl.xyz; } }
    else if (t < tF) { tF = t; nF = pl.xyz; }
  }
  nN = rot * nN; nF = rot * nF;
  return tN <= tF && tF > 0.;
}

bool contains(int i, vec3 point) {
  mat3 rot = uShardRot[i];
  vec3 c = uShardCenter[i];
  vec3 p = (point - c - uShardMove[i]) * rot + c;
  for (int k = 0; k < 5; k++) if (dot(PRISM[k].xyz, p) > PRISM[k].w) return false;
  for (int k = 0; k < CUTS; k++) { vec4 pl = uCuts[i * CUTS + k]; if (dot(pl.xyz, p) > pl.w) return false; }
  return true;
}

int touching(vec3 point) {
  for (int i = 0; i < SHARDS; i++) if (contains(i, point)) return i;
  return -1;
}

bool enter(vec3 ro, vec3 rd, out float t, out vec3 n, out int id) {
  t = 1e9; id = -1; n = vec3(0.);
  for (int i = 0; i < SHARDS; i++) {
    float tN, tF; vec3 nN, nF;
    if (convex(i, ro, rd, tN, nN, tF, nF) && tN > 0. && tN < t) { t = tN; n = nN; id = i; }
  }
  return id >= 0;
}

vec3 backdrop(vec3 q, vec3 d) {
  vec3 qw = uPrism * q, dw = uPrism * d;
  vec3 fwd = uCamera[2];
  float slope = dot(dw, fwd);
  if (slope < .03) return sky(dw);
  float depthQ = dot(qw - uCamPos, fwd);
  vec3 hit = qw + dw * max(0., (uPlane - depthQ) / slope);
  vec3 rel = hit - uCamPos;
  float depth = max(.01, dot(rel, fwd));
  vec2 s = uCenter + uFocal * vec2(dot(rel, uCamera[0]), dot(rel, uCamera[1])) / depth;
  vec2 uv = clamp((s - uBackRect.xy) / uBackRect.zw, 0., 1.);
  return texture(uBackground, vec2(uv.x, 1. - uv.y)).rgb;
}

// Dispersion follows the total bend, so undeviated rays stay clean.
vec3 disperse(vec3 q, vec3 o, vec3 rd) {
  vec3 bend = o - rd;
  vec3 r = normalize(rd + bend * (1. - DISPERSION)), b = normalize(rd + bend * (1. + DISPERSION));
  return vec3(backdrop(q, r).r, backdrop(q, o).g, backdrop(q, b).b);
}

// A thin bright line where the entry face meets its neighbours. Fracture
// edges only appear once the pieces begin to separate.
float edgeLine(int i, vec3 p, float t) {
  mat3 rot = uShardRot[i];
  vec3 s = (p - uShardCenter[i] - uShardMove[i]) * rot + uShardCenter[i];
  float a = 1e9, outer = 1e9, cut = 1e9;
  for (int k = 0; k < 5; k++) {
    float dist = abs(dot(PRISM[k].xyz, s) - PRISM[k].w);
    if (dist < a) { outer = min(outer, a); a = dist; } else outer = min(outer, dist);
  }
  for (int k = 0; k < CUTS; k++) {
    vec4 pl = uCuts[i * CUTS + k];
    if (dot(pl.xyz, pl.xyz) < .5) continue;
    float dist = abs(dot(pl.xyz, s) - pl.w);
    if (dist < a) { cut = min(cut, a); a = dist; } else cut = min(cut, dist);
  }
  float w = t / uFocal;
  return max(1. - smoothstep(w * .5, w * 1.6, outer), (1. - smoothstep(w * .5, w * 1.6, cut)) * uCrack);
}

vec3 glint(vec3 n, vec3 rd) {
  vec3 l = normalize(uLight * uPrism);
  vec3 h = normalize(l - rd);
  float nh = max(dot(n, h), 0.);
  return vec3(pow(nh, 400.) * 1.4 + pow(nh, 24.) * .05);
}

vec4 trace(vec2 px) {
  vec3 rdw = normalize(uCamera * vec3((px - uCenter) / uFocal, 1.));
  vec3 ro = uCamPos * uPrism, rd = rdw * uPrism;
  float t; vec3 n; int id;
  if (!enter(ro, rd, t, n, id)) return vec4(0.);
  vec3 p = ro + rd * t;
  float F = fresnel(clamp(-dot(rd, n), 0., 1.));
  vec3 color = F * sky(uPrism * reflect(rd, n)) + glint(n, rd) * mix(.35, 1., F);
  float through = 1. - F, thick = 0.;
  vec3 d = refract(rd, n, 1. / IOR), q = p;
  int cur = id;
  bool escaped = false;
  vec3 outDir = d;
  for (int k = 0; k < 8; k++) {
    float tN, tF; vec3 nN, nF;
    if (!convex(cur, q + d * 1e-4, d, tN, nN, tF, nF)) break;
    q += d * (tF + 2e-4); thick += tF;
    // Pieces still in contact pass the ray on without an interface.
    int next = touching(q + d * 1e-4);
    if (next >= 0) { cur = next; continue; }
    vec3 o = refract(d, -nF, IOR);
    if (dot(o, o) < .5) { d = reflect(d, nF); continue; }
    through *= 1. - fresnel(clamp(dot(o, nF), 0., 1.));
    float t2; vec3 n2; int id2;
    if (enter(q, o, t2, n2, id2)) {
      q += o * t2;
      through *= 1. - fresnel(clamp(-dot(o, n2), 0., 1.));
      d = refract(o, n2, 1. / IOR); cur = id2;
      continue;
    }
    outDir = o; escaped = true; break;
  }
  vec3 tint = exp(-thick * vec3(.07, .04, .012));
  color += through * tint * (escaped ? disperse(q, outDir, rd) : sky(uPrism * d));
  color = mix(color, vec3(1.), edgeLine(id, p, t) * .5);
  return vec4(color, 1.);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec4 c = trace(px);
  // Extra rays only where the image changes sharply: silhouettes, edges and seams.
  float change = fwidth(c.a) + max(fwidth(c.r), max(fwidth(c.g), fwidth(c.b)));
  if (uSupersample > .5 && change > .03) {
    c += trace(px + vec2(-.375, -.125)) + trace(px + vec2(.125, -.375)) + trace(px + vec2(.375, .125)) + trace(px + vec2(-.125, .375));
    c *= .2;
  }
  outColor = c * uAlpha;
}`;

export type PrismFrame = { width: number; height: number; ratio: number; pose: PrismPose; background: HTMLCanvasElement | null; supersample: boolean };

export function createPrismRenderer(canvas: HTMLCanvasElement) {
  let gl: WebGL2RenderingContext | null = null, program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null, texture: WebGLTexture | null = null;
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  let failed = false, lost = false, disposed = false, textureWidth = 0, textureHeight = 0;
  const events = new AbortController();
  const centers = new Float32Array(shards.flatMap(shard => shard.centroid));
  const cuts = new Float32Array(shards.flatMap(shard => shard.cuts));
  const rotations = new Float32Array(shards.length * 9), moves = new Float32Array(shards.length * 3);
  const names = ['uCenter', 'uFocal', 'uCamPos', 'uCamera', 'uPrism', 'uCuts', 'uShardRot', 'uShardMove', 'uShardCenter', 'uBackground', 'uBackRect', 'uPlane', 'uLight', 'uAlpha', 'uCrack', 'uSupersample'];

  function release() {
    if (gl) { gl.deleteBuffer(buffer); gl.deleteTexture(texture); gl.deleteProgram(program); }
    buffer = null; texture = null; program = null; textureWidth = textureHeight = 0;
    delete canvas.dataset.ready;
  }
  function init() {
    if (failed || lost || disposed) return false;
    gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) { failed = true; return false; }
    const shaders = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((type, i) => {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, i ? fragment : vertex); gl!.compileShader(shader); return shader;
    });
    program = gl.createProgram()!;
    shaders.forEach(shader => gl!.attachShader(program!, shader)); gl.linkProgram(program);
    const valid = shaders.every(shader => gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) && gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!valid) console.warn('Prism shader', shaders.map(shader => gl!.getShaderInfoLog(shader)).join('\n'), gl.getProgramInfoLog(program));
    shaders.forEach(shader => gl!.deleteShader(shader));
    if (!valid) { release(); failed = true; return false; }
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    for (const name of names) uniforms[name] = gl.getUniformLocation(program, name);
    gl.useProgram(program);
    gl.uniform4fv(uniforms.uCuts, cuts);
    gl.uniform3fv(uniforms.uShardCenter, centers);
    gl.uniform1f(uniforms.uPlane, CAMERA_DISTANCE + BACKDROP_DEPTH);
    gl.uniform3f(uniforms.uLight, -.48, .74, .47);
    gl.uniform1i(uniforms.uBackground, 0);
    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([12, 116, 235, 255]));
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    return true;
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true; program = null; buffer = null; texture = null; delete canvas.dataset.ready;
  }, { signal: events.signal });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; failed = false; }, { signal: events.signal });

  return {
    get available() { return !failed && !lost && !disposed; },
    ratio(width: number, height: number) {
      // Native density for crisp edges, bounded on very large screens.
      return Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(5000000 / Math.max(1, width * height))));
    },
    draw({ width, height, ratio, pose, background, supersample }: PrismFrame) {
      if (disposed || lost || (!program && !init())) return false;
      const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl!.viewport(0, 0, w, h);
      gl!.disable(gl!.SCISSOR_TEST);
      gl!.clearColor(0, 0, 0, 0); gl!.clear(gl!.COLOR_BUFFER_BIT);
      canvas.dataset.ready = 'true';
      const { bounds, region } = pose;
      if (bounds.width <= 0 || bounds.height <= 0 || pose.alpha <= 0) return true;
      gl!.enable(gl!.SCISSOR_TEST);
      gl!.scissor(Math.floor(bounds.x * ratio), Math.floor((height - bounds.y - bounds.height) * ratio), Math.ceil(bounds.width * ratio) + 1, Math.ceil(bounds.height * ratio) + 1);
      gl!.useProgram(program);
      if (background) {
        gl!.bindTexture(gl!.TEXTURE_2D, texture);
        if (background.width !== textureWidth || background.height !== textureHeight) {
          textureWidth = background.width; textureHeight = background.height;
          gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, background);
        } else gl!.texSubImage2D(gl!.TEXTURE_2D, 0, 0, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, background);
      }
      gl!.uniform2f(uniforms.uCenter, pose.center.x * ratio, (height - pose.center.y) * ratio);
      gl!.uniform1f(uniforms.uFocal, pose.focal * ratio);
      gl!.uniform3fv(uniforms.uCamPos, pose.camera.position);
      gl!.uniformMatrix3fv(uniforms.uCamera, false, [...pose.camera.right, ...pose.camera.up, ...pose.camera.forward]);
      gl!.uniformMatrix3fv(uniforms.uPrism, false, pose.prism);
      pose.pieces.forEach((piece, i) => { rotations.set(piece.rotation, i * 9); moves.set(piece.move, i * 3); });
      gl!.uniformMatrix3fv(uniforms.uShardRot, false, rotations);
      gl!.uniform3fv(uniforms.uShardMove, moves);
      gl!.uniform4f(uniforms.uBackRect, region.x * ratio, (height - region.y - region.height) * ratio, Math.max(1, region.width) * ratio, Math.max(1, region.height) * ratio);
      gl!.uniform1f(uniforms.uAlpha, pose.alpha);
      gl!.uniform1f(uniforms.uCrack, pose.timeline.fracture);
      gl!.uniform1f(uniforms.uSupersample, supersample ? 1 : 0);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      return true;
    },
    dispose() { disposed = true; events.abort(); release(); },
  };
}
