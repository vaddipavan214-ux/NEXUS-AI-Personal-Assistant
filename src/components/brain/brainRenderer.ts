import * as THREE from "three";
import { BrainState, BRAIN_STATE_COLORS } from "@/lib/types";

interface NeuralNode {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  region: "frontal" | "parietal" | "occipital" | "temporal" | "cerebellum" | "stem";
  hemisphere: -1 | 1; // -1: left, 1: right
  connections: number[];
  intensity: number;
}

interface SynapticImpulse {
  sourceNode: number;
  targetNode: number;
  progress: number;
  speed: number;
  color: THREE.Color;
}

export class BrainRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animId: number = 0;
  private running: boolean = false;

  // Visual Meshes
  private brainGroup: THREE.Group;
  private nodesGeometry!: THREE.BufferGeometry;
  private nodesMaterial!: THREE.PointsMaterial;
  private nodesPoints!: THREE.Points;

  private linesGeometry!: THREE.BufferGeometry;
  private linesMaterial!: THREE.LineBasicMaterial;
  private linesMesh!: THREE.LineSegments;

  private impulsesGeometry!: THREE.BufferGeometry;
  private impulsesMaterial!: THREE.PointsMaterial;
  private impulsesPoints!: THREE.Points;

  private ringsGroup: THREE.Group;

  // Data
  private nodes: NeuralNode[] = [];
  private impulses: SynapticImpulse[] = [];
  private lineIndices: number[] = [];

  // State
  private state: BrainState = "idle";
  private audioLevel: number = 0;
  private smoothAudioLevel: number = 0;
  private time: number = 0;
  private pointerX: number = 0;
  private pointerY: number = 0;
  private targetRotX: number = 0;
  private targetRotY: number = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();

    const width = canvas.clientWidth || 400;
    const height = canvas.clientHeight || 340;

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 0.3, 3.8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.brainGroup = new THREE.Group();
    this.ringsGroup = new THREE.Group();

    this.scene.add(this.brainGroup);
    this.scene.add(this.ringsGroup);

    this.initNeuralStructure();
    this.initHolographicRings();
    this.setupInteractivity();
  }

  /** Generate an anatomically proportioned human brain neural mesh */
  private initNeuralStructure() {
    const nodeCount = 1400;
    this.nodes = [];

    // Helper texture for soft glowing neural dots
    const dotTexture = this.createGlowingParticleTexture();

    // 1. Generate anatomical 3D brain point cloud with lobes and fissures
    let generated = 0;
    while (generated < nodeCount) {
      // Hemisphere selection
      const hemisphere: -1 | 1 = Math.random() > 0.5 ? 1 : -1;

      // Spatial distribution parameters
      const u = Math.random();
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      // Anatomical shape deformation for cerebral hemispheres
      // Frontal lobe is anterior (z > 0), Occipital is posterior (z < 0), Temporal is inferior
      let rX = 1.15;
      let rY = 0.95;
      let rZ = 1.35;

      // Cortical gyri & sulci mathematical folding formula
      const fold1 = Math.sin(theta * 7) * Math.cos(phi * 6) * 0.07;
      const fold2 = Math.cos(theta * 12) * Math.sin(phi * 10) * 0.04;
      const fold3 = Math.sin(theta * 18) * Math.cos(phi * 14) * 0.025;
      const cortexDisplacement = fold1 + fold2 + fold3;

      let x = Math.sin(phi) * Math.cos(theta) * rX;
      let y = Math.cos(phi) * rY;
      let z = Math.sin(phi) * Math.sin(theta) * rZ;

      // Longitudinal fissure (crease between left and right hemispheres)
      const fissureGap = 0.08;
      x = hemisphere * (Math.abs(x) * 0.88 + fissureGap);

      // Temporal lobe depression and lower curvature
      if (y < -0.1 && Math.abs(x) < 0.45 && z < 0.3 && z > -0.4) {
        y -= 0.12;
      }

      // Add cortex folding
      const rad = Math.sqrt(x * x + y * y + z * z);
      if (rad > 0.01) {
        const factor = (rad + cortexDisplacement) / rad;
        x *= factor;
        y *= factor;
        z *= factor;
      }

      // Cerebellum & Brainstem structure at the posterior-bottom
      let region: NeuralNode["region"] = "parietal";
      if (generated > nodeCount * 0.82) {
        // Cerebellum
        const cTheta = Math.random() * Math.PI * 2;
        const cPhi = Math.random() * Math.PI;
        x = hemisphere * (Math.abs(Math.cos(cTheta) * Math.sin(cPhi) * 0.55) + 0.03);
        y = -0.55 + Math.cos(cPhi) * 0.32;
        z = -0.65 + Math.sin(cTheta) * Math.sin(cPhi) * 0.42;
        region = "cerebellum";
      } else if (generated > nodeCount * 0.94) {
        // Brainstem
        x = (Math.random() - 0.5) * 0.18;
        y = -0.65 - Math.random() * 0.4;
        z = -0.1 + (Math.random() - 0.5) * 0.2;
        region = "stem";
      } else {
        // Determine cortical lobe
        if (z > 0.35) region = "frontal";
        else if (z < -0.35) region = "occipital";
        else if (y < -0.2) region = "temporal";
      }

      // Scale appropriately for camera view
      const scale = 0.95;
      x *= scale;
      y *= scale;
      z *= scale;

      this.nodes.push({
        x,
        y,
        z,
        baseX: x,
        baseY: y,
        baseZ: z,
        region,
        hemisphere,
        connections: [],
        intensity: Math.random() * 0.5 + 0.5,
      });

      generated++;
    }

    // 2. Build synaptic line connections between neighboring nodes
    const maxDistance = 0.26;
    const maxConnectionsPerNode = 4;
    const positions: number[] = [];
    const colors: number[] = [];

    const colorViolet = new THREE.Color("#8B5CF6");
    const colorCyan = new THREE.Color("#22D3EE");

    for (let i = 0; i < this.nodes.length; i++) {
      const nodeA = this.nodes[i];
      let connected = 0;

      for (let j = i + 1; j < this.nodes.length; j++) {
        const nodeB = this.nodes[j];
        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dz = nodeA.z - nodeB.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < maxDistance && connected < maxConnectionsPerNode) {
          nodeA.connections.push(j);
          nodeB.connections.push(i);
          this.lineIndices.push(i, j);

          positions.push(nodeA.x, nodeA.y, nodeA.z);
          positions.push(nodeB.x, nodeB.y, nodeB.z);

          const mixColor = colorViolet.clone().lerp(colorCyan, (nodeA.y + 1) * 0.5);
          colors.push(mixColor.r, mixColor.g, mixColor.b);
          colors.push(mixColor.r, mixColor.g, mixColor.b);

          connected++;
        }
      }
    }

    // Build Three.js Synapse Lines Mesh
    this.linesGeometry = new THREE.BufferGeometry();
    this.linesGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.linesGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    this.linesMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      linewidth: 1,
    });

    this.linesMesh = new THREE.LineSegments(this.linesGeometry, this.linesMaterial);
    this.brainGroup.add(this.linesMesh);

    // 3. Build Neural Nodes Point Cloud
    const nodePositions: number[] = [];
    const nodeColors: number[] = [];

    for (const node of this.nodes) {
      nodePositions.push(node.x, node.y, node.z);
      // Cyan on top/periphery, Electric violet on core
      const nodeColor = colorViolet.clone().lerp(colorCyan, (node.y + 0.8) / 1.6);
      nodeColors.push(nodeColor.r, nodeColor.g, nodeColor.b);
    }

    this.nodesGeometry = new THREE.BufferGeometry();
    this.nodesGeometry.setAttribute("position", new THREE.Float32BufferAttribute(nodePositions, 3));
    this.nodesGeometry.setAttribute("color", new THREE.Float32BufferAttribute(nodeColors, 3));

    this.nodesMaterial = new THREE.PointsMaterial({
      size: 0.05,
      map: dotTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.nodesPoints = new THREE.Points(this.nodesGeometry, this.nodesMaterial);
    this.brainGroup.add(this.nodesPoints);

    // 4. Action Potential Synaptic Impulses (Particles traversing neural pathways)
    const impulseCount = 80;
    this.impulses = [];
    for (let i = 0; i < impulseCount; i++) {
      const sourceNode = Math.floor(Math.random() * this.nodes.length);
      const connections = this.nodes[sourceNode].connections;
      const targetNode = connections.length > 0
        ? connections[Math.floor(Math.random() * connections.length)]
        : (sourceNode + 1) % this.nodes.length;

      this.impulses.push({
        sourceNode,
        targetNode,
        progress: Math.random(),
        speed: 0.4 + Math.random() * 0.7,
        color: Math.random() > 0.4 ? colorCyan : colorViolet,
      });
    }

    const impulsePositions = new Float32Array(impulseCount * 3);
    const impulseColors = new Float32Array(impulseCount * 3);

    for (let i = 0; i < impulseCount; i++) {
      const imp = this.impulses[i];
      const na = this.nodes[imp.sourceNode];
      impulsePositions[i * 3] = na.x;
      impulsePositions[i * 3 + 1] = na.y;
      impulsePositions[i * 3 + 2] = na.z;

      impulseColors[i * 3] = imp.color.r;
      impulseColors[i * 3 + 1] = imp.color.g;
      impulseColors[i * 3 + 2] = imp.color.b;
    }

    this.impulsesGeometry = new THREE.BufferGeometry();
    this.impulsesGeometry.setAttribute("position", new THREE.BufferAttribute(impulsePositions, 3));
    this.impulsesGeometry.setAttribute("color", new THREE.BufferAttribute(impulseColors, 3));

    this.impulsesMaterial = new THREE.PointsMaterial({
      size: 0.09,
      map: dotTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.impulsesPoints = new THREE.Points(this.impulsesGeometry, this.impulsesMaterial);
    this.brainGroup.add(this.impulsesPoints);
  }

  /** Concentric 3D Holographic Orbital Rings */
  private initHolographicRings() {
    // Ring 1: Equatorial Orbital Ring
    const ring1Geo = new THREE.RingGeometry(1.65, 1.66, 96);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#22D3EE"),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.rotation.x = Math.PI / 2.3;
    this.ringsGroup.add(ring1);

    // Ring 2: Tilted Cyan Meridian Ring with Dashes
    const ring2Geo = new THREE.BufferGeometry();
    const ring2Points: number[] = [];
    const segments = 120;
    const r = 1.82;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      ring2Points.push(Math.cos(a) * r, Math.sin(a) * r, 0);
    }
    ring2Geo.setAttribute("position", new THREE.Float32BufferAttribute(ring2Points, 3));
    const ring2Mat = new THREE.LineDashedMaterial({
      color: new THREE.Color("#8B5CF6"),
      dashSize: 0.12,
      gapSize: 0.06,
      transparent: true,
      opacity: 0.28,
    });
    const ring2 = new THREE.LineLoop(ring2Geo, ring2Mat);
    ring2.computeLineDistances();
    ring2.rotation.x = Math.PI / 3.2;
    ring2.rotation.y = Math.PI / 5;
    this.ringsGroup.add(ring2);

    // Ring 3: Outer Fine Latitude Ring
    const ring3Geo = new THREE.RingGeometry(2.02, 2.025, 128);
    const ring3Mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#A78BFA"),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.16,
    });
    const ring3 = new THREE.Mesh(ring3Geo, ring3Mat);
    ring3.rotation.x = Math.PI / 2.1;
    ring3.rotation.z = Math.PI / 6;
    this.ringsGroup.add(ring3);
  }

  /** Soft circular glowing particle sprite texture */
  private createGlowingParticleTexture(): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
      gradient.addColorStop(0.2, "rgba(34, 211, 238, 0.8)");
      gradient.addColorStop(0.6, "rgba(139, 92, 246, 0.2)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  /** Mouse and touch orbital parallax interaction */
  private setupInteractivity() {
    const onPointerMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      this.pointerX = x * 0.4;
      this.pointerY = y * 0.25;
    };

    window.addEventListener("mousemove", onPointerMove, { passive: true });
  }

  /* ---------------- Public Control API ---------------- */

  public setState(state: BrainState) {
    this.state = state;
  }

  public setAudioLevel(level: number) {
    this.audioLevel = Math.max(0, Math.min(1, level));
  }

  public start() {
    if (this.running) return;
    this.running = true;

    let lastTime = performance.now();

    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      this.time += dt;

      this.update(dt);
      this.render();

      this.animId = requestAnimationFrame(loop);
    };

    this.animId = requestAnimationFrame(loop);
  }

  public stop() {
    this.running = false;
    cancelAnimationFrame(this.animId);
  }

  public resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  /* ---------------- Animation Update Loop ---------------- */

  private update(dt: number) {
    // 1. Audio smoothing: fast attack, slow release
    const attack = 0.35;
    const release = 0.08;
    this.smoothAudioLevel += (this.audioLevel - this.smoothAudioLevel) * (this.audioLevel > this.smoothAudioLevel ? attack : release);

    // 2. State-driven dynamics
    let baseRotationSpeed = 0.22;
    let impulseSpeedMultiplier = 1.0;
    let pulseScale = 1.0;
    let lineOpacity = 0.28;
    let targetHue = BRAIN_STATE_COLORS[this.state].hex;

    switch (this.state) {
      case "listening":
        baseRotationSpeed = 0.35;
        impulseSpeedMultiplier = 1.4;
        pulseScale = 1.0 + this.smoothAudioLevel * 0.28;
        lineOpacity = 0.4 + this.smoothAudioLevel * 0.35;
        break;
      case "thinking":
        baseRotationSpeed = 0.65;
        impulseSpeedMultiplier = 2.8;
        pulseScale = 0.98 + Math.sin(this.time * 6) * 0.04;
        lineOpacity = 0.45;
        break;
      case "executing":
        baseRotationSpeed = 0.45;
        impulseSpeedMultiplier = 2.2;
        pulseScale = 1.05 + Math.sin(this.time * 4) * 0.03;
        lineOpacity = 0.5;
        break;
      case "speaking":
        baseRotationSpeed = 0.32;
        impulseSpeedMultiplier = 1.6;
        pulseScale = 1.02 + this.smoothAudioLevel * 0.22 + Math.sin(this.time * 8) * 0.02;
        lineOpacity = 0.35 + this.smoothAudioLevel * 0.3;
        break;
      case "interrupted":
        baseRotationSpeed = 0.1;
        impulseSpeedMultiplier = 0.2;
        pulseScale = 0.94;
        lineOpacity = 0.2;
        break;
      case "offline":
        baseRotationSpeed = 0.08;
        impulseSpeedMultiplier = 0.3;
        pulseScale = 0.92;
        lineOpacity = 0.12;
        break;
      case "idle":
      default:
        baseRotationSpeed = 0.18;
        impulseSpeedMultiplier = 1.0;
        pulseScale = 1.0 + Math.sin(this.time * 1.5) * 0.02;
        lineOpacity = 0.25;
        break;
    }

    // 3. Smooth orbital rotation with pointer parallax
    this.targetRotY += baseRotationSpeed * dt;
    this.brainGroup.rotation.y = this.targetRotY + this.pointerX;
    this.brainGroup.rotation.x = Math.sin(this.time * 0.6) * 0.08 + this.pointerY;

    // Rings counter-rotation
    this.ringsGroup.rotation.y = -this.targetRotY * 0.4;
    this.ringsGroup.rotation.z = Math.sin(this.time * 0.4) * 0.15;

    // Scale brain group with audio/state pulse
    this.brainGroup.scale.set(pulseScale, pulseScale, pulseScale);
    this.linesMaterial.opacity = lineOpacity;

    // 4. Update Synaptic Impulses (Particles traversing paths)
    const posAttr = this.impulsesGeometry.getAttribute("position") as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;

    for (let i = 0; i < this.impulses.length; i++) {
      const imp = this.impulses[i];
      imp.progress += imp.speed * impulseSpeedMultiplier * dt;

      if (imp.progress >= 1.0) {
        imp.progress = 0;
        imp.sourceNode = imp.targetNode;
        const conns = this.nodes[imp.sourceNode].connections;
        imp.targetNode = conns.length > 0
          ? conns[Math.floor(Math.random() * conns.length)]
          : (imp.sourceNode + 1) % this.nodes.length;
      }

      const na = this.nodes[imp.sourceNode];
      const nb = this.nodes[imp.targetNode];

      // Interpolate along synaptic path
      positions[i * 3] = na.x + (nb.x - na.x) * imp.progress;
      positions[i * 3 + 1] = na.y + (nb.y - na.y) * imp.progress;
      positions[i * 3 + 2] = na.z + (nb.z - na.z) * imp.progress;
    }

    posAttr.needsUpdate = true;
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
  }
}
