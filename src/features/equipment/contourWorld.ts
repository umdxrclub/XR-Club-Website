import type { EquipmentCamera } from './equipmentCamera';

const vertexSource = `#version 300 es
in vec2 aPosition;
void main(){ gl_Position=vec4(aPosition,0.,1.); }`;
const fragmentSource = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uViewSize;
uniform vec2 uScreen;
uniform float uFocal;
uniform vec3 uCameraPosition;
uniform vec3 uCameraRight;
uniform vec3 uCameraDown;
uniform vec3 uCameraForward;
out vec4 outputColor;
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float field(vec2 p){float n=0.;float a=.55;for(int i=0;i<4;i++){n+=noise(p)*a;p=mat2(.8,-.6,.6,.8)*p*2.03+3.7;a*=.48;}return n;}
void main(){
 vec2 pixel=vec2(gl_FragCoord.x/uResolution.x,1.-gl_FragCoord.y/uResolution.y)*uViewSize;
 vec3 ray=normalize(uCameraForward+uCameraRight*((pixel.x-uScreen.x)/uFocal)+uCameraDown*((pixel.y-uScreen.y)/uFocal));
 // A fixed world behind the opening: the foreground aperture never moves the field.
 float distance=(-1800.-uCameraPosition.z)/min(-.01,ray.z);
 vec3 hit=uCameraPosition+ray*distance;
 vec2 uv=hit.xy/(min(uViewSize.x,uViewSize.y)*2.);
 vec2 p=uv*3.1;
 float t=uTime*.065;
 p+=.6*vec2(noise(p*.65+vec2(t,0.)),noise(p*.65+vec2(7.,t*.8)));
 float bands=field(p+vec2(t*.13,-t*.10))*15.;
 float edge=abs(fract(bands)-.5);
 float aa=max(fwidth(bands),.014);
 float line=1.-smoothstep(aa*.32,aa*1.15,edge);
 float spark=pow(max(0.,sin(p.x*5.2+p.y*3.3-uTime*.22)),34.)
   *pow(max(0.,sin(p.y*7.1-p.x*2.8+uTime*.13)),8.);
 float light=line*(.105+spark*.895);
 outputColor=vec4(vec3(light),1.);
}`;

/** A small, lazy GPU field; no video decoding or large animated image. */
export function mountContourWorld(canvas: HTMLCanvasElement) {
  let gl: WebGL2RenderingContext | null = null, program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let resolution: WebGLUniformLocation | null = null, timeUniform: WebGLUniformLocation | null = null;
  const cameraUniforms: Record<string, WebGLUniformLocation | null> = {};
  let camera: EquipmentCamera | undefined, cameraKey = '';
  let active = false, reduced = false, frame = 0, width = 1, height = 1, time = 0, enter = 0, last = 0, disposed = false, failed = false, lost = false;
  const events = new AbortController();
  function init() {
    if (failed || lost || disposed) return false;
    gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) { failed = true; return false; }
    const shaders = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((type, i) => {
      const shader = gl!.createShader(type)!; gl!.shaderSource(shader, i ? fragmentSource : vertexSource); gl!.compileShader(shader); return shader;
    });
    program = gl.createProgram()!; shaders.forEach(shader => gl!.attachShader(program!, shader)); gl.linkProgram(program);
    const valid = shaders.every(shader => gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) && gl.getProgramParameter(program, gl.LINK_STATUS);
    shaders.forEach(shader => gl!.deleteShader(shader));
    if (!valid) { gl.deleteProgram(program); program = null; failed = true; return false; }
    gl.useProgram(program); buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    resolution = gl.getUniformLocation(program, 'uResolution'); timeUniform = gl.getUniformLocation(program, 'uTime'); for (const name of ['uViewSize','uScreen','uFocal','uCameraPosition','uCameraRight','uCameraDown','uCameraForward']) cameraUniforms[name] = gl.getUniformLocation(program, name);
    canvas.dataset.ready = 'true'; return true;
  }
  function draw() {
    if (!program && !init()) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
    const w = Math.round(width * ratio), h = Math.round(height * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl!.viewport(0, 0, w, h); }
    gl!.useProgram(program); gl!.uniform2f(resolution, w, h); gl!.uniform1f(timeUniform, reduced ? 0 : time); gl!.uniform2f(cameraUniforms.uViewSize, width, height);
    gl!.uniform2f(cameraUniforms.uScreen, camera?.screenX ?? width/2, camera?.screenY ?? height*.57);
    gl!.uniform1f(cameraUniforms.uFocal, camera?.focal ?? 1600);
    for (const [name, value] of Object.entries({
      uCameraPosition: camera?.position ?? [0,0,1600], uCameraRight: camera?.right ?? [1,0,0],
      uCameraDown: camera?.down ?? [0,1,0], uCameraForward: camera?.forward ?? [0,0,-1]
    })) gl!.uniform3fv(cameraUniforms[name], value);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }
  function tick(now: number) {
    frame = 0;
    if (!active || reduced || document.hidden || disposed || lost || failed) return;
    if (!last || now - last >= 32) { time += last ? Math.min((now - last) / 1000, .08) : 0; last = now; draw(); }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (active && !document.hidden) { draw(); if (!reduced && !frame && !failed && !lost) { last = 0; frame = requestAnimationFrame(tick); } }
    if ((!active || document.hidden || reduced) && frame) { cancelAnimationFrame(frame); frame = 0; }
  }
  document.addEventListener('visibilitychange', sync, { signal: events.signal });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; program = null; buffer = null; delete canvas.dataset.ready; }, { signal: events.signal });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; failed = false; program = null; if (active) sync(); }, { signal: events.signal });
  return {
    update(visible: boolean, w: number, h: number, reduceMotion: boolean, progress: number, nextCamera?: EquipmentCamera) {
      const key = nextCamera ? [...nextCamera.position,...nextCamera.right,...nextCamera.down,...nextCamera.forward,nextCamera.screenX,nextCamera.screenY,nextCamera.focal].map(n=>n.toFixed(5)).join(':') : '';
      const changed = active !== visible || width !== w || height !== h || reduced !== reduceMotion || enter !== progress || key !== cameraKey;
      active = visible; width = w; height = h; reduced = reduceMotion; enter = progress; camera = nextCamera; cameraKey = key;
      if (changed) sync();
    },
    dispose() { disposed = true; cancelAnimationFrame(frame); events.abort(); if (gl) { gl.deleteBuffer(buffer); gl.deleteProgram(program); } delete canvas.dataset.ready; }
  };
}
