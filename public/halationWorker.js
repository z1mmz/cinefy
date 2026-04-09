'use strict';

// ============================================================
// GLSL Shaders
// ============================================================

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Pass 1: Extract highlights with a soft knee using Rec.709 luminance
const FRAG_HIGHLIGHT = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_threshold;
uniform float u_knee;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float h = smoothstep(u_threshold, u_threshold + u_knee, luma);
  outColor = vec4(vec3(h * luma), 1.0);
}`;

// Pass 2/3: Separable Gaussian blur (97 taps, fixed loop for GL ES 3.00 compatibility)
// u_step is (1/width, 0) for horizontal, (0, 1/height) for vertical
const FRAG_BLUR = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_step;
uniform float u_sigma;
in vec2 v_uv;
out vec4 outColor;
void main() {
  float sigma = max(u_sigma, 0.5);
  float twoSq = 2.0 * sigma * sigma;
  vec4 acc = vec4(0.0);
  float wSum = 0.0;
  for (int i = -48; i <= 48; i++) {
    float w = exp(-float(i * i) / twoSq);
    acc += texture(u_tex, v_uv + float(i) * u_step) * w;
    wSum += w;
  }
  outColor = acc / wSum;
}`;

// Simple blit — used to downsample highlight mask to 1/4 resolution
const FRAG_COPY = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 outColor;
void main() { outColor = texture(u_tex, v_uv); }`;

// Pass 5: Combine tight + wide Gaussian with the original via screen blend.
// Screen blend (1-(1-a)(1-b)) brightens without clipping — physically correct for glow.
// Halation color [1.0, 0.12, 0.04] = deep red-orange matching CineStill 800T spectral data.
const FRAG_COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D u_orig;
uniform sampler2D u_tight;
uniform sampler2D u_wide;
uniform float u_intensity;
uniform float u_tightW;
uniform float u_wideW;
uniform vec3 u_color;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec4 orig  = texture(u_orig,  v_uv);
  float tight = texture(u_tight, v_uv).r;
  float wide  = texture(u_wide,  v_uv).r;
  float mask  = clamp(tight * u_tightW + wide * u_wideW, 0.0, 1.0);
  vec3  glow  = mask * u_color * u_intensity;
  vec3  res   = 1.0 - (1.0 - orig.rgb) * (1.0 - glow);
  outColor = vec4(res, orig.a);
}`;

// ============================================================
// WebGL2 Helpers
// ============================================================

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('Shader error: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

function makeProgram(gl, fragSrc) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Link error: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

function makeFBO(gl, w, h, float16) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (float16) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('FBO incomplete: ' + status);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, w, h };
}

// ============================================================
// WebGL2 Processing Path
// ============================================================

function processWebGL(imageData, params) {
  const W = imageData.width;
  const H = imageData.height;

  const canvas = new OffscreenCanvas(W, H);
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 unavailable');

  // Required for RGBA16F framebuffer rendering in WebGL2
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('EXT_color_buffer_float not supported');
  }

  const pHL   = makeProgram(gl, FRAG_HIGHLIGHT);
  const pBlur = makeProgram(gl, FRAG_BLUR);
  const pCopy = makeProgram(gl, FRAG_COPY);
  const pComp = makeProgram(gl, FRAG_COMPOSITE);

  // Full-screen triangle strip quad
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  function useAndDraw(prog, fbo, vw, vh) {
    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo || null);
    gl.viewport(0, 0, vw, vh);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function bindTex(prog, name, unit, t) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  }

  function uni1f(prog, name, v) { gl.uniform1f(gl.getUniformLocation(prog, name), v); }
  function uni2f(prog, name, x, y) { gl.uniform2f(gl.getUniformLocation(prog, name), x, y); }
  function uni3f(prog, name, x, y, z) { gl.uniform3f(gl.getUniformLocation(prog, name), x, y, z); }

  // Upload source image.
  // UNPACK_FLIP_Y_WEBGL=true ensures the image renders visually correct (canvas top → texture top).
  // readPixels will then return rows bottom-up, so we flip them after.
  const origTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, origTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  // Wide blur runs on a 4x downsampled texture for performance.
  // Sigma in pixels at the reduced resolution:
  const sw = Math.max(1, Math.floor(W / 4));
  const sh = Math.max(1, Math.floor(H / 4));
  const tightPx = (params.tightSigma / 100) * W;
  const widePx  = (params.wideSigma  / 100) * W / 4;

  const hlFBO    = makeFBO(gl, W,  H,  true);   // highlight mask (full res, float16)
  const wDnFBO   = makeFBO(gl, sw, sh, true);   // downsampled highlight (float16)
  const wTmpFBO  = makeFBO(gl, sw, sh, true);   // H-blur intermediate (float16)
  const wBlurFBO = makeFBO(gl, sw, sh, true);   // wide blur result (float16, bilinear-upsampled in composite)
  const tTmpFBO  = makeFBO(gl, W,  H,  true);   // tight H-blur intermediate (float16)
  const tBlurFBO = makeFBO(gl, W,  H,  true);   // tight blur result (float16)
  const resFBO   = makeFBO(gl, W,  H,  false);  // final composite (RGBA8 for readPixels)

  // Pass 1: Highlight extraction
  gl.useProgram(pHL);
  bindTex(pHL, 'u_tex', 0, origTex);
  uni1f(pHL, 'u_threshold', params.threshold);
  uni1f(pHL, 'u_knee', params.knee);
  useAndDraw(pHL, hlFBO.fbo, W, H);

  // Pass 2: Downsample highlight 4x for wide blur
  gl.useProgram(pCopy);
  bindTex(pCopy, 'u_tex', 0, hlFBO.tex);
  useAndDraw(pCopy, wDnFBO.fbo, sw, sh);

  // Pass 3a: Horizontal Gaussian (wide, on small texture)
  gl.useProgram(pBlur);
  bindTex(pBlur, 'u_tex', 0, wDnFBO.tex);
  uni2f(pBlur, 'u_step', 1.0 / sw, 0.0);
  uni1f(pBlur, 'u_sigma', widePx);
  useAndDraw(pBlur, wTmpFBO.fbo, sw, sh);

  // Pass 3b: Vertical Gaussian (wide)
  bindTex(pBlur, 'u_tex', 0, wTmpFBO.tex);
  uni2f(pBlur, 'u_step', 0.0, 1.0 / sh);
  useAndDraw(pBlur, wBlurFBO.fbo, sw, sh);

  // Pass 4a: Horizontal Gaussian (tight, full res)
  bindTex(pBlur, 'u_tex', 0, hlFBO.tex);
  uni2f(pBlur, 'u_step', 1.0 / W, 0.0);
  uni1f(pBlur, 'u_sigma', tightPx);
  useAndDraw(pBlur, tTmpFBO.fbo, W, H);

  // Pass 4b: Vertical Gaussian (tight)
  bindTex(pBlur, 'u_tex', 0, tTmpFBO.tex);
  uni2f(pBlur, 'u_step', 0.0, 1.0 / H);
  useAndDraw(pBlur, tBlurFBO.fbo, W, H);

  // Pass 5: Composite — screen blend original + double-Gaussian halation mask
  // wBlurFBO is at 1/4 resolution; WebGL bilinear sampling upscales it automatically.
  gl.useProgram(pComp);
  bindTex(pComp, 'u_orig',  0, origTex);
  bindTex(pComp, 'u_tight', 1, tBlurFBO.tex);
  bindTex(pComp, 'u_wide',  2, wBlurFBO.tex);
  uni1f(pComp, 'u_intensity', params.intensity);
  uni1f(pComp, 'u_tightW',    params.tightWeight);
  uni1f(pComp, 'u_wideW',     params.wideWeight);
  // CineStill 800T spectral: red dominant, trace green, near-zero blue
  uni3f(pComp, 'u_color',     1.0, 0.12, 0.04);
  useAndDraw(pComp, resFBO.fbo, W, H);

  // Read pixels. WebGL stores rows bottom-up, ImageData expects top-down → flip.
  gl.bindFramebuffer(gl.FRAMEBUFFER, resFBO.fbo);
  const raw = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);

  const out    = new Uint8ClampedArray(W * H * 4);
  const stride = W * 4;
  for (let y = 0; y < H; y++) {
    out.set(raw.subarray((H - 1 - y) * stride, (H - y) * stride), y * stride);
  }

  return new ImageData(out, W, H);
}

// ============================================================
// CPU Fallback (separable Gaussian + screen blend, pure JS)
// ============================================================

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function separableGaussian(src, dst, w, h, sigma) {
  // Cap radius at 32 for CPU performance (radius 32 = sigma ~10.7)
  const radius = Math.min(Math.ceil(sigma * 3), 32);
  const kLen = 2 * radius + 1;
  const kernel = new Float32Array(kLen);
  let kSum = 0;
  const twoSq = 2 * sigma * sigma;
  for (let i = 0; i < kLen; i++) {
    const d = i - radius;
    kernel[i] = Math.exp(-(d * d) / twoSq);
    kSum += kernel[i];
  }
  for (let i = 0; i < kLen; i++) kernel[i] /= kSum;

  const tmp = new Float32Array(w * h);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.max(0, Math.min(w - 1, x + k));
        acc += src[y * w + sx] * kernel[k + radius];
      }
      tmp[y * w + x] = acc;
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.max(0, Math.min(h - 1, y + k));
        acc += tmp[sy * w + x] * kernel[k + radius];
      }
      dst[y * w + x] = acc;
    }
  }
}

function processCPU(imageData, params) {
  const { data, width: W, height: H } = imageData;
  const n = W * H;

  // Extract highlight mask as floats using soft smoothstep knee
  const highlight = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4]     / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    highlight[i] = smoothstep(params.threshold, params.threshold + params.knee, luma) * luma;
  }

  const tightPx = (params.tightSigma / 100) * W;
  const widePx  = (params.wideSigma  / 100) * W;

  const tightBlur = new Float32Array(n);
  const wideBlur  = new Float32Array(n);
  separableGaussian(highlight, tightBlur, W, H, Math.max(0.5, tightPx));
  separableGaussian(highlight, wideBlur,  W, H, Math.max(0.5, widePx));

  // Composite: screen blend with CineStill 800T halation color
  const out = new Uint8ClampedArray(data.length);
  const [hR, hG, hB] = [1.0, 0.12, 0.04];

  for (let i = 0; i < n; i++) {
    const mask = Math.min(
      1,
      (tightBlur[i] * params.tightWeight + wideBlur[i] * params.wideWeight) * params.intensity
    );
    const oR = data[i * 4]     / 255;
    const oG = data[i * 4 + 1] / 255;
    const oB = data[i * 4 + 2] / 255;
    out[i * 4]     = Math.round((1 - (1 - oR) * (1 - mask * hR)) * 255);
    out[i * 4 + 1] = Math.round((1 - (1 - oG) * (1 - mask * hG)) * 255);
    out[i * 4 + 2] = Math.round((1 - (1 - oB) * (1 - mask * hB)) * 255);
    out[i * 4 + 3] = data[i * 4 + 3];
  }

  return new ImageData(out, W, H);
}

// ============================================================
// Worker Message Handler
// ============================================================

onmessage = function (e) {
  const { imageData, params } = e.data;
  postMessage({ type: 'progress', value: 0 });

  try {
    let result;
    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        result = processWebGL(imageData, params);
      } catch (webglErr) {
        console.warn('WebGL2 failed, using CPU fallback:', webglErr.message);
        result = processCPU(imageData, params);
      }
    } else {
      result = processCPU(imageData, params);
    }
    postMessage({ type: 'result', imageData: result });
  } catch (err) {
    postMessage({ type: 'error', message: err.message });
  }
};
