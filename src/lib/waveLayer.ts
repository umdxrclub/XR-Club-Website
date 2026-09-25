// Shared by the homepage and equipment wave compositions.
export const waveLayerGLSL = `
vec3 layer(vec3 underneath, vec3 fill, float distance, float aa, float shadow, float shadowWidth) {
  float shade = shadow * exp(-pow(max(-distance, 0.0) / shadowWidth, 2.0));
  return mix(underneath * (1.0 - shade), fill, smoothstep(-aa, aa, distance));
}`;
