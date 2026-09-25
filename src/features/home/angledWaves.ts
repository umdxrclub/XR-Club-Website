import { Mesh, PlaneGeometry, ShaderMaterial, Vector2 } from 'three';
import { waveLayerGLSL } from '../../lib/waveLayer';
import { waveAccent, waveAccentSpectrum, waveFrequency, waveLayers, waveSpeed } from './waveSettings';

export function createAngledWaves() {
  const uniforms = { uTime: { value: 0 }, uFill: { value: 1 }, uResolution: { value: new Vector2(1600, 900) } };
  const colors = waveAccentSpectrum.map(hex => `vec3(${[1,3,5].map(n => (parseInt(hex.slice(n,n+2),16)/255).toFixed(6)).join(',')})`);
  const spectrum = colors.slice(0,-1).map((color,i) => `if(t<${((i+1)/6).toFixed(8)}) return mix(${color},${colors[i+1]},smoothstep(0.0,1.0,t*6.0-${i.toFixed(1)}));`).join('\n');
  const layers = waveLayers.map((layer, index) => {
    const rgb = [1, 3, 5].map(start => (parseInt(layer.color.slice(start, start + 2), 16) / 255).toFixed(6));
    const phase = layer.phase.toFixed(3);
    const edgeFunction = index === waveAccent.layer ? 'orangeEdge' : 'wave';
    const edge = `${edgeFunction}(s, ${layer.boundary.toFixed(3)}, ${phase})`;
    // A tight contact shadow places the gray edge slightly above the orange.
    const shadow = index === waveAccent.layer + 1 ? '0.3, 0.008' : '0.45, 0.024';
    const fill = index === waveAccent.layer ? `mix(vec3(0.45), accentSpectrum(fract(s * 0.58 + uTime * 0.09 + 0.55)), painted)` : `vec3(${rgb.join(',')})`;
    return `color = layer(color, ${fill}, q - ${edge}, aa, ${shadow});`;
  }).join('\n');
  const material = new ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uFill;
      uniform vec2 uResolution;
      vec3 accentSpectrum(float t) {
        ${spectrum}
        return ${colors[0]};
      }
      float wave(float s, float boundary, float phase) {
        float time = uTime * ${waveSpeed.toFixed(2)};
        return boundary + 0.055 * sin(s * ${waveFrequency.toFixed(8)} + phase + time)
          + 0.014 * sin(s * 4.2 + phase * 0.7 - time * 0.45);
      }
      vec3 waveCurve(float s, float phase) {
        float time = uTime * ${waveSpeed.toFixed(2)};
        float frequency = ${waveFrequency.toFixed(8)};
        float a = s * frequency + phase + time;
        float b = s * 4.2 + phase * 0.7 - time * 0.45;
        return vec3(
          0.055 * sin(a) + 0.014 * sin(b),
          0.055 * frequency * cos(a) + 0.014 * 4.2 * cos(b),
          -0.055 * frequency * frequency * sin(a) - 0.014 * 4.2 * 4.2 * sin(b)
        );
      }
      vec2 orangeWidth(float s, float phase) {
        float frequency = ${waveFrequency.toFixed(8)};
        float angle = s * frequency + phase + uTime * ${waveSpeed.toFixed(2)};
        float bend = sin(angle);
        float range = ${(waveAccent.maxWidth - waveAccent.minWidth).toFixed(4)};
        return vec2(${waveAccent.minWidth.toFixed(4)} + range * bend * bend,
          2.0 * range * frequency * bend * cos(angle));
      }
      float orangeEdge(float s, float boundary, float phase) {
        float along = s;
        // Match the still SVG's perpendicular offset and gentle width change.
        for (int i = 0; i < 2; i++) {
          vec3 curve = waveCurve(along, phase);
          vec2 width = orangeWidth(along, phase);
          float normalLength = sqrt(1.0 + curve.y * curve.y);
          float tangentScale = 1.0 + width.x * curve.z / (normalLength * normalLength * normalLength)
            + width.y * curve.y / normalLength;
          along -= (along + width.x * curve.y / normalLength - s) / tangentScale;
        }
        vec3 curve = waveCurve(along, phase);
        return boundary + curve.x - orangeWidth(along, phase).x / sqrt(1.0 + curve.y * curve.y);
      }
      ${waveLayerGLSL}
      void main() {
        // Match the SVG's cover crop on both desktop and portrait screens.
        float scale = max(uResolution.x / 1600.0, uResolution.y / 900.0);
        vec2 p = (vec2(vUv.x, 1.0 - vUv.y) - 0.5) * uResolution / (900.0 * scale);
        float q = (p.x + p.y) * 0.70710678;
        float s = (p.x - p.y) * 0.70710678;
        float aa = 0.65 / (900.0 * scale);
        float reach = min(uResolution.x, uResolution.y) / (900.0 * scale) * 0.70710678 + 0.12;
        float painted = uFill >= 0.9999 ? 1.0 : uFill <= 0.0001 ? 0.0
          : smoothstep(-0.012, 0.012, s - mix(reach, -reach, uFill));
        vec3 color = vec3(0.0);
        ${layers}
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  // Draw the backdrop before the liquid reveal.
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return {
    mesh,
    update(time: number, width: number, height: number, fill = 1) {
      uniforms.uTime.value = time;
      uniforms.uResolution.value.set(width, height);
      uniforms.uFill.value = fill;
    },
  };
}
