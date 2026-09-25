import { Mesh, PlaneGeometry, ShaderMaterial, TextureLoader, Vector2 } from 'three';
import type { LiquidOrigin } from '../projects/projectStoryMotion';
import { designPalette as ink } from './designPalette';

const shaderColor = (hex: string) => `vec3(${[1,3,5].map(i => (parseInt(hex.slice(i,i+2),16)/255).toFixed(6)).join(',')})`;

// Smooth Waves, Workshop 2566787975. The provided preset uses a 70 degree
// water-wave direction, scale 30, speed 1 and squared strength 0.1 * 0.1.
export async function createCleanWaves() {
  const texture = await new TextureLoader().loadAsync(`${import.meta.env.BASE_URL}scenes/clean-waves.webp`);
  const uniforms = { uTexture: { value: texture }, uTime: { value: 0 }, uOpacity: { value: 0 }, uResolution: { value: new Vector2(1600, 900) }, uOrigin: { value: new Vector2(.72, .46) }, uSeedRadius: { value: .005 } };
  const material = new ShaderMaterial({ uniforms, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform sampler2D uTexture; uniform float uTime; uniform float uOpacity; uniform vec2 uResolution; uniform vec2 uOrigin; uniform float uSeedRadius;
      float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      void main() {
        float aspect = uResolution.x / uResolution.y;
        vec2 crop = vec2(min(1.0, aspect / 1.7777778), min(1.0, 1.7777778 / aspect));
        vec2 uv = (vUv - 0.5) * crop * .96 + vec2(.5, .5 + (1.0 - crop.y) * .08);
        vec2 direction = vec2(-.93969262, .34202014);
        float distance = uTime + dot(uv, direction) * 30.0;
        uv += sin(distance) * vec2(direction.y, -direction.x) * .01;
        vec3 color = texture2D(uTexture, uv).rgb;
        float luminance = dot(color, vec3(.2126, .7152, .0722));
        color = mix(vec3(luminance), color, 1.12);
        float dust = 0.0;
        for (int i = 0; i < 8; i++) {
          float id = float(i) + 1.0;
          vec2 point = vec2(hash(id), fract(hash(id + 13.0) + uTime * .008));
          float pixelDistance = length((vUv - point) * uResolution);
          dust += (1.0 - smoothstep(.25, 1.4, pixelDistance)) * (.1 + .1 * sin(uTime + id));
        }
        color = mix(color, vec3(1.0, .03, .03), dust);
        vec2 delta = (vUv - uOrigin) * vec2(aspect, 1.0);
        // The period and the destination share one silhouette and one alpha edge.
        // Blend their colors inside it, so no second circle can leave a border.
        color = mix(${shaderColor(ink.dot)}, color, smoothstep(0.0, .02, uOpacity));
        float angle = atan(delta.y, delta.x);
        vec2 farCorner = max(uOrigin, 1.0 - uOrigin) * vec2(aspect, 1.0);
        float radius = mix(uSeedRadius, length(farCorner) * 1.13, uOpacity);
        float fluid = clamp((uOpacity - .005) / .115, 0.0, 1.0);
        fluid = fluid * fluid * fluid * (fluid * (fluid * 6.0 - 15.0) + 10.0);
        float ending = clamp((uOpacity - .75) / .25, 0.0, 1.0);
        ending = ending * ending * ending * (ending * (ending * 6.0 - 15.0) + 10.0);
        fluid *= 1.0 - ending;
        radius *= 1.0 + fluid * (.18 * sin(angle * 3.0 + uOpacity * 2.0) + .07 * sin(angle * 5.0 - uOpacity * 3.0) + .045 * sin(angle * 9.0 + uOpacity * 4.0));
        // A clean antialiased cut, without a lit rim or refractive halo.
        float edge = 1.0 / uResolution.y;
        float reveal = 1.0 - smoothstep(radius - edge, radius + edge, length(delta));
        if (uOpacity <= 0.0) reveal = 0.0;
        if (uOpacity >= .99999) reveal = 1.0;
        gl_FragColor = vec4(color, reveal);
      }
    ` });
  const mesh = new Mesh(new PlaneGeometry(2, 2), material); mesh.frustumCulled = false; mesh.renderOrder = -999;
  return { mesh, texture, update(time: number, width: number, height: number, opacity: number, origin: LiquidOrigin) {
    uniforms.uTime.value = time; uniforms.uResolution.value.set(width, height); uniforms.uOpacity.value = opacity;
    uniforms.uOrigin.value.set(origin.x, 1 - origin.y);
    uniforms.uSeedRadius.value = origin.radius / height;
    mesh.visible = opacity > 0;
  }, dispose() { texture.dispose(); material.dispose(); mesh.geometry.dispose(); } };
}
