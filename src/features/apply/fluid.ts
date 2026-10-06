// A GPU fluid simulation for the funding page's background: dye advected through a velocity field,
// with vorticity confinement and a Jacobi pressure solve, drawn with soft shading. Adapted from
// Pavel Dobryakov's WebGL-Fluid-Simulation (MIT; licence in public/scenes/apply/fluid-LICENSE.txt), tuned to the "Colorful Fluid"
// preset the club uses as a wallpaper: no bloom, shading on, slow dissipation, curl 30.

export type FluidOptions = {
  simResolution?: number;
  dyeResolution?: number;
  densityDissipation?: number;
  velocityDissipation?: number;
  pressure?: number;
  pressureIterations?: number;
  curl?: number;
  splatRadius?: number;
  shading?: boolean;
  /** Device pixels per CSS pixel for the display canvas; the dye keeps its own resolution. */
  pixelRatio?: number;
  /** Background behind the dye. */
  background?: [number, number, number];
  /** Called once the browser restores a lost GPU context; this simulation is finished, start another. */
  onRestore?: () => void;
};

export type Fluid = {
  /** A dab of dye and velocity at canvas CSS coordinates; velocity in CSS pixels per second. */
  splat(x: number, y: number, dx: number, dy: number, color?: [number, number, number], radius?: number): void;
  randomSplats(count: number, force?: number): void;
  setPaused(paused: boolean): void;
  /** Runs the simulation `steps` frames at once, for a still field that still looks like a fluid. */
  settle(steps: number): void;
  /** A solid rounded box (canvas CSS px) that dye and currents cannot enter, or null for none. */
  setObstacle(box: { x: number; y: number; width: number; height: number; radius: number } | null): void;
  /** Resolves after the first frame has been drawn. */
  readonly ready: Promise<void>;
  dispose(): void;
};

type Program = { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> };
type FBO = { texture: WebGLTexture; fbo: WebGLFramebuffer; width: number; height: number; texelSizeX: number; texelSizeY: number; attach(id: number): number };
type DoubleFBO = { width: number; height: number; texelSizeX: number; texelSizeY: number; read: FBO; write: FBO; swap(): void };

const vertexShader = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0); vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y); vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;
// highp throughout, as in the original: the vertex shader's texelSize uniform must match the fragment's precision.
const header = 'precision highp float; precision highp sampler2D; varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;';
const shaders = {
  copy: `${header} uniform sampler2D uTexture; void main () { gl_FragColor = texture2D(uTexture, vUv); }`,
  clear: `${header} uniform sampler2D uTexture; uniform float value; void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`,
  splat: `${header} uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
    void main () { vec2 p = vUv - point.xy; p.x *= aspectRatio; vec3 splat = exp(-dot(p, p) / radius) * color; vec3 base = texture2D(uTarget, vUv).xyz; gl_FragColor = vec4(base + splat, 1.0); }`,
  advection: `${header} uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 texelSize; uniform vec2 dyeTexelSize; uniform float dt; uniform float dissipation;
    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st = uv / tsize - 0.5; vec2 iuv = floor(st); vec2 fuv = fract(st);
      vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize); vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
      vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize); vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
      return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }
    void main () {
    #ifdef MANUAL_FILTERING
      vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize; vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize; vec4 result = texture2D(uSource, coord);
    #endif
      gl_FragColor = dissipation * result;
    }`,
  divergence: `${header} uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x; float R = texture2D(uVelocity, vR).x; float T = texture2D(uVelocity, vT).y; float B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) { L = -C.x; } if (vR.x > 1.0) { R = -C.x; } if (vT.y > 1.0) { T = -C.y; } if (vB.y < 0.0) { B = -C.y; }
      gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }`,
  curl: `${header} uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y; float R = texture2D(uVelocity, vR).y; float T = texture2D(uVelocity, vT).x; float B = texture2D(uVelocity, vB).x;
      gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
    }`,
  vorticity: `${header} uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
    void main () {
      float L = texture2D(uCurl, vL).x; float R = texture2D(uCurl, vR).x; float T = texture2D(uCurl, vT).x; float B = texture2D(uCurl, vB).x; float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L)); force /= length(force) + 0.0001; force *= curl * C; force.y *= -1.0;
      vec2 velocity = texture2D(uVelocity, vUv).xy + force * dt; velocity = min(max(velocity, -1000.0), 1000.0);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }`,
  pressure: `${header} uniform sampler2D uPressure; uniform sampler2D uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x; float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;
      float divergence = texture2D(uDivergence, vUv).x;
      gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
    }`,
  gradientSubtract: `${header} uniform sampler2D uPressure; uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x; float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;
      vec2 velocity = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }`,
  display: `${header} uniform sampler2D uTexture; uniform vec2 texelSize; uniform vec3 background;
    void main () {
      vec3 c = texture2D(uTexture, vUv).rgb;
    #ifdef SHADING
      vec3 lc = texture2D(uTexture, vL).rgb; vec3 rc = texture2D(uTexture, vR).rgb; vec3 tc = texture2D(uTexture, vT).rgb; vec3 bc = texture2D(uTexture, vB).rgb;
      float dx = length(rc) - length(lc); float dy = length(tc) - length(bc);
      vec3 n = normalize(vec3(dx, dy, length(texelSize)));
      c *= clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
    #endif
      float a = clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0);
      gl_FragColor = vec4(c + background * (1.0 - a), 1.0);
    }`,
};

/** A random bright hue at the simulation's working brightness. */
export function fluidColor(hue = Math.random()): [number, number, number] {
  const i = Math.floor(hue * 6), f = hue * 6 - i, q = 1 - f;
  const rgb = [[1, f, 0], [q, 1, 0], [0, 1, f], [0, q, 1], [f, 0, 1], [1, 0, q]][i % 6];
  return [rgb[0] * .15, rgb[1] * .15, rgb[2] * .15];
}

export function mountFluid(canvas: HTMLCanvasElement, options: FluidOptions = {}): Fluid | null {
  const config = {
    simResolution: 192, dyeResolution: 1024, densityDissipation: .985, velocityDissipation: .98, pressure: .79, pressureIterations: 18,
    curl: 30, splatRadius: .32, shading: true, pixelRatio: 1, background: [.039, .039, .039] as [number, number, number], ...options,
  };
  const attributes = { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' as const };
  const gl2 = canvas.getContext('webgl2', attributes) as WebGL2RenderingContext | null;
  const gl = (gl2 || canvas.getContext('webgl', attributes) || canvas.getContext('experimental-webgl', attributes)) as WebGLRenderingContext | null;
  if (!gl) return null;
  const isWebGL2 = !!gl2;
  let halfFloat: number, supportLinearFiltering: boolean;
  if (isWebGL2) {
    if (!gl2!.getExtension('EXT_color_buffer_float')) gl2!.getExtension('EXT_color_buffer_half_float');
    supportLinearFiltering = !!gl2!.getExtension('OES_texture_float_linear');
    halfFloat = gl2!.HALF_FLOAT;
  } else {
    const ext = gl.getExtension('OES_texture_half_float');
    supportLinearFiltering = !!gl.getExtension('OES_texture_half_float_linear');
    halfFloat = ext ? ext.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
  }
  gl.clearColor(0, 0, 0, 1);

  const supported = (internalFormat: number, format: number, type: number): boolean => {
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.deleteFramebuffer(fbo); gl.deleteTexture(texture);
    return ok;
  };
  const pick = (internalFormat: number, format: number, type: number): { internalFormat: number; format: number } | null => {
    if (supported(internalFormat, format, type)) return { internalFormat, format };
    if (!isWebGL2) return null;
    const g = gl2!;
    if (internalFormat === g.R16F) return pick(g.RG16F, g.RG, type);
    if (internalFormat === g.RG16F) return pick(g.RGBA16F, g.RGBA, type);
    return null;
  };
  const formats = isWebGL2
    ? { rgba: pick(gl2!.RGBA16F, gl.RGBA, halfFloat), rg: pick(gl2!.RG16F, gl2!.RG, halfFloat), r: pick(gl2!.R16F, gl2!.RED, halfFloat) }
    : { rgba: pick(gl.RGBA, gl.RGBA, halfFloat), rg: pick(gl.RGBA, gl.RGBA, halfFloat), r: pick(gl.RGBA, gl.RGBA, halfFloat) };
  // Velocity and pressure need signed values, so without renderable float textures there is no fluid: the page keeps
  // its plain dark background instead.
  if (!formats.rgba || !formats.rg || !formats.r) return null;

  const compile = (type: number, source: string, defines: string[] = []) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, defines.map(d => `#define ${d}\n`).join('') + source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader failed to compile');
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, vertexShader);
  const makeProgram = (fragment: string, defines: string[] = []): Program => {
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment, defines));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Program failed to link');
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const name = gl.getActiveUniform(program, i)!.name; uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  };
  // Everything inside a rounded box is cleared each frame, so the box reads as a solid object the fluid flows around.
  const obstacleShader = `
precision highp float; precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform vec4 rect;
uniform vec2 radius;
void main () {
  vec2 c = clamp(vUv, rect.xy + radius, rect.zw - radius);
  vec2 d = (vUv - c) / max(radius, vec2(1e-5));
  float inside = step(dot(d, d), 1.0);
  gl_FragColor = texture2D(uTexture, vUv) * (1.0 - inside);
}`;
  const programs = {
    obstacle: makeProgram(obstacleShader),
    copy: makeProgram(shaders.copy), clear: makeProgram(shaders.clear), splat: makeProgram(shaders.splat),
    advection: makeProgram(shaders.advection, supportLinearFiltering ? [] : ['MANUAL_FILTERING']),
    divergence: makeProgram(shaders.divergence), curl: makeProgram(shaders.curl), vorticity: makeProgram(shaders.vorticity),
    pressure: makeProgram(shaders.pressure), gradientSubtract: makeProgram(shaders.gradientSubtract),
    display: makeProgram(shaders.display, config.shading ? ['SHADING'] : []),
  };

  // One quad covers every pass.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  const blit = (target: FBO | null) => {
    if (target) { gl.viewport(0, 0, target.width, target.height); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); }
    else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  };

  const createFBO = (w: number, h: number, internalFormat: number, format: number, type: number, param: number): FBO => {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, fbo, width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; } };
  };
  const createDoubleFBO = (w: number, h: number, internalFormat: number, format: number, type: number, param: number): DoubleFBO => {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param), fbo2 = createFBO(w, h, internalFormat, format, type, param);
    return {
      width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h,
      get read() { return fbo1; }, set read(v) { fbo1 = v; }, get write() { return fbo2; }, set write(v) { fbo2 = v; },
      swap() { const t = fbo1; fbo1 = fbo2; fbo2 = t; },
    };
  };
  const resolution = (base: number) => {
    let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspect < 1) aspect = 1 / aspect;
    const min = Math.round(base), max = Math.round(base * aspect);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
  };
  const filtering = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
  let dye: DoubleFBO, velocity: DoubleFBO, divergence: FBO, curl: FBO, pressure: FBO & { swap(): void; read: FBO; write: FBO } | DoubleFBO;
  const deleteFBO = (f: FBO) => { gl.deleteTexture(f.texture); gl.deleteFramebuffer(f.fbo); };
  const resizeDouble = (target: DoubleFBO, w: number, h: number, internalFormat: number, format: number, type: number, param: number) => {
    if (target.width === w && target.height === h) return target;
    const next = createFBO(w, h, internalFormat, format, type, param);
    gl.useProgram(programs.copy.program); gl.uniform1i(programs.copy.uniforms.uTexture, target.read.attach(0)); blit(next);
    deleteFBO(target.read); deleteFBO(target.write);
    target.read = next; target.write = createFBO(w, h, internalFormat, format, type, param);
    target.width = w; target.height = h; target.texelSizeX = 1 / w; target.texelSizeY = 1 / h;
    return target;
  };
  const initFramebuffers = () => {
    const sim = resolution(config.simResolution), dyeRes = resolution(config.dyeResolution);
    const { rgba, rg, r } = formats;
    dye = dye ? resizeDouble(dye, dyeRes.width, dyeRes.height, rgba!.internalFormat, rgba!.format, halfFloat, filtering) : createDoubleFBO(dyeRes.width, dyeRes.height, rgba!.internalFormat, rgba!.format, halfFloat, filtering);
    velocity = velocity ? resizeDouble(velocity, sim.width, sim.height, rg!.internalFormat, rg!.format, halfFloat, filtering) : createDoubleFBO(sim.width, sim.height, rg!.internalFormat, rg!.format, halfFloat, filtering);
    if (divergence) { deleteFBO(divergence); deleteFBO(curl); deleteFBO((pressure as DoubleFBO).read); deleteFBO((pressure as DoubleFBO).write); }
    divergence = createFBO(sim.width, sim.height, r!.internalFormat, r!.format, halfFloat, gl.NEAREST);
    curl = createFBO(sim.width, sim.height, r!.internalFormat, r!.format, halfFloat, gl.NEAREST);
    pressure = createDoubleFBO(sim.width, sim.height, r!.internalFormat, r!.format, halfFloat, gl.NEAREST);
  };

  const resizeCanvas = () => {
    const ratio = Math.max(.5, Math.min(config.pixelRatio, 2));
    const w = Math.max(1, Math.round(canvas.clientWidth * ratio)), h = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width === w && canvas.height === h) return false;
    canvas.width = w; canvas.height = h;
    return true;
  };
  resizeCanvas();
  initFramebuffers();

  const step = (dt: number) => {
    gl.disable(gl.BLEND);
    const p = (q: Program) => { gl.useProgram(q.program); return q.uniforms; };
    let u = p(programs.curl);
    gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY); gl.uniform1i(u.uVelocity, velocity.read.attach(0)); blit(curl);
    u = p(programs.vorticity);
    gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY); gl.uniform1i(u.uVelocity, velocity.read.attach(0)); gl.uniform1i(u.uCurl, curl.attach(1));
    gl.uniform1f(u.curl, config.curl); gl.uniform1f(u.dt, dt); blit(velocity.write); velocity.swap();
    u = p(programs.divergence);
    gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY); gl.uniform1i(u.uVelocity, velocity.read.attach(0)); blit(divergence);
    const press = pressure as DoubleFBO;
    u = p(programs.clear);
    gl.uniform1i(u.uTexture, press.read.attach(0)); gl.uniform1f(u.value, config.pressure); blit(press.write); press.swap();
    u = p(programs.pressure);
    gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY); gl.uniform1i(u.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.pressureIterations; i++) { gl.uniform1i(u.uPressure, press.read.attach(1)); blit(press.write); press.swap(); }
    u = p(programs.gradientSubtract);
    gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY); gl.uniform1i(u.uPressure, press.read.attach(0)); gl.uniform1i(u.uVelocity, velocity.read.attach(1));
    blit(velocity.write); velocity.swap();
    u = p(programs.advection);
    gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!supportLinearFiltering) gl.uniform2f(u.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    const velocityId = velocity.read.attach(0);
    gl.uniform1i(u.uVelocity, velocityId); gl.uniform1i(u.uSource, velocityId); gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, config.velocityDissipation);
    blit(velocity.write); velocity.swap();
    if (!supportLinearFiltering) gl.uniform2f(u.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0)); gl.uniform1i(u.uSource, dye.read.attach(1)); gl.uniform1f(u.dissipation, config.densityDissipation);
    blit(dye.write); dye.swap();
  };
  const render = () => {
    gl.disable(gl.BLEND);
    const u = programs.display.uniforms;
    gl.useProgram(programs.display.program);
    gl.uniform2f(u.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    gl.uniform1i(u.uTexture, dye.read.attach(0));
    gl.uniform3f(u.background, config.background[0], config.background[1], config.background[2]);
    blit(null);
  };
  const splat = (x: number, y: number, dx: number, dy: number, color: [number, number, number] = fluidColor(), radius = config.splatRadius) => {
    const aspect = canvas.width / canvas.height;
    const u = programs.splat.uniforms;
    gl.useProgram(programs.splat.program);
    gl.uniform1i(u.uTarget, velocity.read.attach(0));
    gl.uniform1f(u.aspectRatio, aspect);
    gl.uniform2f(u.point, x / canvas.clientWidth, 1 - y / canvas.clientHeight);
    // Velocity is in texture units per second: screen deltas scaled to the simulation's range.
    const scale = 6000 / Math.max(canvas.clientWidth, canvas.clientHeight);
    gl.uniform3f(u.color, dx * scale * (aspect < 1 ? aspect : 1), -dy * scale * (aspect > 1 ? aspect : 1), 0);
    gl.uniform1f(u.radius, (aspect > 1 ? radius * aspect : radius) / 100);
    blit(velocity.write); velocity.swap();
    gl.uniform1i(u.uTarget, dye.read.attach(0));
    gl.uniform3f(u.color, color[0], color[1], color[2]);
    blit(dye.write); dye.swap();
  };

  let obstacle: { rect: [number, number, number, number]; radius: [number, number] } | null = null;
  const carve = () => {
    if (!obstacle) return;
    const u = programs.obstacle.uniforms;
    gl.useProgram(programs.obstacle.program);
    gl.uniform4f(u.rect, ...obstacle.rect); gl.uniform2f(u.radius, ...obstacle.radius);
    gl.uniform1i(u.uTexture, velocity.read.attach(0)); blit(velocity.write); velocity.swap();
    gl.uniform1i(u.uTexture, dye.read.attach(0)); blit(dye.write); dye.swap();
  };
  let frame = 0, last = performance.now(), paused = false, disposed = false;
  let resolveReady!: () => void;
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });
  const tick = (now: number) => {
    frame = 0;
    if (disposed) return;
    const dt = Math.min(.033, Math.max(0, (now - last) / 1000)); last = now;
    if (resizeCanvas()) initFramebuffers();
    if (!paused) { step(dt || .016); carve(); }
    render();
    resolveReady();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  // Losing the GPU context ends this simulation; asking the browser to restore it lets the caller start a new one.
  const lost = (event: Event) => { event.preventDefault(); halt(); };
  const restored = () => { canvas.removeEventListener('webglcontextrestored', restored); config.onRestore?.(); };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  const halt = () => {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame); canvas.removeEventListener('webglcontextlost', lost);
    resolveReady();
  };
  const dispose = () => {
    const live = !disposed && !gl.isContextLost();
    halt();
    canvas.removeEventListener('webglcontextrestored', restored);
    if (live) gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  return {
    splat(x, y, dx, dy, color, radius) { if (!disposed) splat(x, y, dx, dy, color, radius); },
    randomSplats(count, force = 1000) {
      if (disposed) return;
      for (let i = 0; i < count; i++) {
        const color = fluidColor().map(c => c * 10) as [number, number, number];
        splat(Math.random() * canvas.clientWidth, Math.random() * canvas.clientHeight, force * (Math.random() - .5) / 6, force * (Math.random() - .5) / 6, color);
      }
    },
    setPaused(value) { if (disposed) return; if (paused && !value) last = performance.now(); paused = value; },
    settle(steps) { if (disposed) return; if (resizeCanvas()) initFramebuffers(); for (let i = 0; i < steps; i++) { step(.016); carve(); } render(); },
    setObstacle(box) {
      if (!box) { obstacle = null; return; }
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      obstacle = { rect: [box.x / w, 1 - (box.y + box.height) / h, (box.x + box.width) / w, 1 - box.y / h], radius: [box.radius / w, box.radius / h] };
    },
    ready,
    dispose,
  };
}
