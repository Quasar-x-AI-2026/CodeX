import React, { useEffect, useRef } from "react";
import controllers, { AvatarPose } from "./utils/controllers";
import { onAvatar } from "../ws/avatar";
import { sendMessage } from "../ws/socket";
import useSession from "../state/session";
import { computeControlsFromLandmarks } from "./utils/landmarks";

type AvatarCanvasProps = {
  width?: number;
  height?: number;
  pixelRatio?: number;
  meshScale?: number;

  debug?: (msg: string, ...args: unknown[]) => void;
};

export default function AvatarCanvas({ width = 480, height = 480, pixelRatio = window.devicePixelRatio || 1, meshScale = 2.4, debug }: AvatarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const targetPoseRef = useRef<AvatarPose>(controllers.getPose());
  const drawPoseRef = useRef<AvatarPose>(controllers.getPose());
  const lastUpdateRef = useRef<number>(Date.now());
  const subscriptionRef = useRef<(() => void) | null>(null);
  const sessionId = useSession((s) => s.sessionId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) {
      console.warn("WebGL not supported, falling back to Canvas 2D");
      return;
    }

    const ratio = pixelRatio;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Initialize WebGL renderer
    const renderer = new WebGLAvatarRenderer(gl, width, height);

    const photoRef = { current: null as HTMLImageElement | null } as { current: HTMLImageElement | null };
    const photoSizeRef = { current: { w: 0, h: 0 } } as { current: { w: number; h: number } };
    const landmarksRef = { current: null as Array<{ x: number; y: number; z?: number } > | null } as { current: Array<{ x: number; y: number; z?: number } > | null };

    subscriptionRef.current = controllers.subscribe((p) => {
      targetPoseRef.current = p;
      lastUpdateRef.current = Date.now();
    });

    const offNet = onAvatar((p) => {
      try {
        try { console.debug && console.debug("AvatarCanvas: onAvatar payload", p); } catch (e) { }

        
        if (Array.isArray((p as any).landmarks)) {
          try {
            landmarksRef.current = (p as any).landmarks.slice(0);
            const c = computeControlsFromLandmarks(landmarksRef.current as any);
            controllers.updateControls({ headYaw: c.headYaw, headPitch: c.headPitch, mouthOpen: c.mouthOpen, eyeBlink: c.eyeBlink } as any);
            try { console.debug && console.debug("AvatarCanvas: received landmarks -> controls", c); } catch (e) {}
          } catch (e) {
            console.warn("AvatarCanvas: failed to process landmarks", e);
          }
        }

        if ((p as any).photo) {
          try {
            const dataUrl = (p as any).photo;
            const w = (p as any).w || 0;
            const h = (p as any).h || 0;
            let img = photoRef.current;
            if (!img) {
              img = new Image();
              photoRef.current = img;
              img.onload = () => {
                try { console.debug && console.debug("AvatarCanvas: photo loaded", img?.width, img?.height); } catch (e) {}
                renderer.updateTexture(img);
              };
              img.onerror = (e) => {
                console.warn("AvatarCanvas: failed to load photo", e);
              };
            }
            img.src = dataUrl;
            photoSizeRef.current = { w, h };
            try { console.debug && console.debug("AvatarCanvas: stored photo", w, h); } catch (e) {}
          } catch (e) {
            console.warn("AvatarCanvas: failed to process photo payload", e);
          }
        }

        
        try {
          controllers.updateControls(p);
          try { console.debug && console.debug("AvatarCanvas: lastValidPose", controllers.getLastValidPose()); } catch (e) {}
        } catch (e) {}

        
        try {
          const last = controllers.getLastValidPose();
          if (last) {
            targetPoseRef.current = last;
            
            drawPoseRef.current = { ...last } as any;
            lastUpdateRef.current = Date.now();
            try { console.debug && console.debug("AvatarCanvas: applied immediate pose", last); } catch (e) {}
          }
        } catch (e) {
          
        }
      } catch (e) {
        console.warn("AvatarCanvas: failed to apply network avatar payload", e);
      }
    });

    tryRequestState();

    function tryRequestState(attempts = 6) {
      const sid = sessionId;
      if (!sid) return;
      try {
        const ok = sendMessage({ type: "request-state", sessionId: sid });
        if (!ok && attempts > 0) {
          setTimeout(() => tryRequestState(attempts - 1), 200);
        }
      } catch (e) {
        if (attempts > 0) setTimeout(() => tryRequestState(attempts - 1), 200);
      }
    }

    let lastTime = performance.now();

    function step(now: number) {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;


      const target = targetPoseRef.current;
      const draw = drawPoseRef.current;


      const SMOOTH_SEC = 0.06;
      const alpha = 1 - Math.exp(-dt / SMOOTH_SEC);


      draw.rotation.x = lerp(draw.rotation.x, target.rotation.x, alpha);
      draw.rotation.y = lerp(draw.rotation.y, target.rotation.y, alpha);
      draw.rotation.z = lerp(draw.rotation.z, target.rotation.z, alpha);

      draw.morph.mouthOpen = lerp(draw.morph.mouthOpen, target.morph.mouthOpen, alpha);
      draw.morph.eyeBlink = lerp(draw.morph.eyeBlink, target.morph.eyeBlink, alpha);
      draw.t = Date.now();


      renderer.render(draw, landmarksRef.current, meshScale);

      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {

      if (subscriptionRef.current) subscriptionRef.current();
      subscriptionRef.current = null;
      try { offNet(); } catch (e) { /* ignore */ }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      renderer.dispose();
    };

  }, [canvasRef, width, height, pixelRatio, sessionId]);

  return <canvas ref={canvasRef} />;
}


function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha;
}

// WebGL Avatar Renderer
class WebGLAvatarRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private uvBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private vertexCount = 0;
  private width: number;
  private height: number;

  constructor(gl: WebGLRenderingContext, width: number, height: number) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.initShaders();
    this.initBuffers();
  }

  private initShaders() {
    const gl = this.gl;
    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      uniform mat3 u_matrix;
      varying vec2 v_texCoord;

      void main() {
        gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
        v_texCoord = a_texCoord;
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      uniform sampler2D u_texture;
      varying vec2 v_texCoord;

      void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
      }
    `;

    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) return;

    this.program = gl.createProgram();
    if (!this.program) return;

    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Shader program linking failed:', gl.getProgramInfoLog(this.program));
      return;
    }
  }

  private createShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  private initBuffers() {
    const gl = this.gl;

    // For now, use a simple quad. In a full implementation, you'd use
    // the actual face mesh triangulation with all 468 landmarks
    const positions = [
      -0.5, -0.5,
       0.5, -0.5,
       0.5,  0.5,
      -0.5,  0.5,
    ];

    const uvs = [
      0, 1,
      1, 1,
      1, 0,
      0, 0,
    ];

    const indices = [
      0, 1, 2,
      0, 2, 3,
    ];

    this.vertexCount = indices.length;

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    this.uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  }

  updateTexture(image: HTMLImageElement) {
    const gl = this.gl;

    if (this.texture) {
      gl.deleteTexture(this.texture);
    }

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  render(pose: AvatarPose, landmarks: Array<{ x: number; y: number; z?: number }> | null, meshScale: number) {
    const gl = this.gl;
    if (!this.program) return;

    gl.clearColor(0.9, 0.9, 0.9, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    // Always try to render with texture if available, otherwise render fallback
    if (this.texture) {
      this.renderTexturedQuad(gl, pose);
    } else {
      this.renderFallback(gl, pose);
    }
  }

  private renderTexturedQuad(gl: WebGLRenderingContext, pose: AvatarPose) {
    // Set up attributes
    const positionLocation = gl.getAttribLocation(this.program, 'a_position');
    const texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // Set up texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const textureLocation = gl.getUniformLocation(this.program, 'u_texture');
    gl.uniform1i(textureLocation, 0);

    // Create transformation matrix
    const matrixLocation = gl.getUniformLocation(this.program, 'u_matrix');

    // Scale and position the face
    const scale = Math.min(this.width, this.height) * 0.4 / this.width;
    const centerX = 0;
    const centerY = 0;

    // Apply pose transformations
    const rotationY = pose.rotation.y * 0.3;
    const rotationX = pose.rotation.x * 0.2;

    const matrix = [
      Math.cos(rotationY) * scale, -Math.sin(rotationY) * scale, centerX,
      Math.sin(rotationY) * scale, Math.cos(rotationY) * scale, centerY,
      0, 0, 1
    ];

    gl.uniformMatrix3fv(matrixLocation, false, matrix);

    // Draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.vertexCount, gl.UNSIGNED_SHORT, 0);
  }

  private renderFallback(gl: WebGLRenderingContext, pose: AvatarPose) {
    // Render a simple colored ellipse as fallback when no texture is available
    // For now, we'll just clear to a skin color
    gl.clearColor(0.96, 0.87, 0.70, 1); // Skin color
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  dispose() {
    const gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.uvBuffer) gl.deleteBuffer(this.uvBuffer);
    if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
  }
}
