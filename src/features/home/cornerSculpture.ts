import {
  LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene,
  ShaderMaterial, TextureLoader, Vector4, type Texture, type WebGLRenderer,
} from 'three';
import source from '../../../public/scenes/home-folds/source.json';

// The supplied preset selects the "dark 4k" foreground in Workshop 2531810451.
// Evaluate its painted layer waves and final diagonal wave in reverse order
// to sample the composed displacement in one draw.
export function createCornerSculpture(root: HTMLElement, renderer: WebGLRenderer) {
  const element = root.querySelector<HTMLElement>('[data-home-sculpture]');
  if (!element) return null;
  const scene = new Scene(), camera = new OrthographicCamera(0, 1, 1, 0, .01, 20);
  camera.position.z = 5;
  const { crop } = source, aspect = crop.width / crop.height;
  const uniforms = {
    uTexture: { value: null as Texture | null },
    uMasks: { value: null as Texture | null },
    uTime: { value: 0 },
    uCrop: { value: new Vector4(crop.left / source.width,
      (source.height - crop.top - crop.height) / source.height,
      crop.width / source.width, crop.height / source.height) },
  };
  const material = new ShaderMaterial({
    uniforms, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D uTexture, uMasks;
      uniform float uTime;
      uniform vec4 uCrop;
      float maskAt(vec2 uv, vec2 tile) {
        vec2 pixel = clamp(uv, 0., 1.) * vec2(1919., 1079.) + .5;
        return texture2D(uMasks, tile + pixel / vec2(3840., 2160.)).r;
      }
      void main() {
        vec2 uv = uCrop.xy + vUv * uCrop.zw;
        vec2 direction = vec2(-.6507913, -.7592567);
        uv += sin(uTime * .75 + dot(uv, direction) * 14.86)
          * vec2(direction.y, -direction.x) * .0036;
        uv.x += sin(uTime * 1.25 + uv.y * 4.96) * .0016 * maskAt(uv, vec2(.5, 0.));
        uv.x += sin(uTime * 2.48 + uv.y * 4.96) * .0016 * maskAt(uv, vec2(0., 0.));
        uv.x += sin(uTime * 2.24 + uv.y * 4.96) * .0025 * maskAt(uv, vec2(.5, .5));
        uv.x += sin(uTime * 2. + uv.y * 4.96) * .0016 * maskAt(uv, vec2(0., .5));
        vec2 sampleUv = (uv - uCrop.xy) / uCrop.zw;
        if (any(lessThan(sampleUv, vec2(0.))) || any(greaterThan(sampleUv, vec2(1.)))) discard;
        gl_FragColor = texture2D(uTexture, sampleUv);
      }
    `,
  });
  const mesh = new Mesh(new PlaneGeometry(aspect, 1), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const listeners = new AbortController();
  let size = parseFloat(element.style.getPropertyValue('--sculpture-size')) || 300;
  let lastWidth = 0, lastHeight = 0, ready = false, disposed = false;
  const textures: Texture[] = [];
  root.addEventListener('xr:sculpture-layout', event => {
    size = Math.max(1, (event as CustomEvent<{ size: number }>).detail.size);
    lastWidth = 0;
  }, { signal: listeners.signal });
  return {
    async compile() {
      const loader = new TextureLoader();
      const load = async (name: string) => {
        const texture = await loader.loadAsync(`${import.meta.env.BASE_URL}scenes/home-folds/${name}`);
        if (disposed) texture.dispose(); else textures.push(texture);
        return texture;
      };
      try {
        const [art, masks] = await Promise.all([load('folds.webp'), load('motion-masks.png')]);
        if (disposed) return;
        // The atlas is data, not color; no mipmaps or alpha premultiplication.
        masks.generateMipmaps = false; masks.minFilter = LinearFilter;
        uniforms.uTexture.value = art; uniforms.uMasks.value = masks;
        renderer.initTexture(art); renderer.initTexture(masks);
        await renderer.compileAsync(scene, camera);
        if (disposed) return;
        ready = true; root.classList.add('has-corner-sculpture');
      } catch (error) {
        if (!disposed) console.warn('Showing the still corner artwork.', error);
      }
    },
    render(width: number, height: number, background: number, time: number) {
      if (!ready || background >= 1) return;
      if (width !== lastWidth || height !== lastHeight) {
        lastWidth = width; lastHeight = height;
        camera.right = width; camera.top = height; camera.updateProjectionMatrix();
        mesh.scale.setScalar(size);
        mesh.position.set((aspect / 2 - .22) * size, (.5 - .13) * size, 0);
      }
      uniforms.uTime.value = time;
      const oldAuto = renderer.autoClear;
      renderer.autoClear = false; renderer.render(scene, camera); renderer.autoClear = oldAuto;
    },
    dispose() {
      disposed = true; ready = false; listeners.abort();
      textures.forEach(texture => texture.dispose());
      mesh.geometry.dispose(); material.dispose();
      root.classList.remove('has-corner-sculpture');
    },
  };
}
