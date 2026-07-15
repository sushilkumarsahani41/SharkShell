/* ═══════════════════════════════════════════════════════════════
   SharkShell Landing — 3D hero
   A slowly rotating particle globe with animated SSH "connection
   arcs" (every server, one terminal). Three.js is lazy-loaded from
   CDN; the scene is skipped entirely on reduced-motion, save-data,
   small screens, or missing WebGL — the CSS radial glow remains as
   the fallback.
   ═══════════════════════════════════════════════════════════════ */

const canvas = document.getElementById('heroCanvas');

const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = navigator.connection && navigator.connection.saveData;
const smallScreen = innerWidth < 768;
const hasWebGL = (() => {
    try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
})();

if (canvas && hasWebGL && !prefersReducedMotion && !saveData && !smallScreen) {
    init().catch(() => { /* CDN or WebGL failure — CSS fallback stays */ });
}

async function init() {
    const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js');

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0.4, 7.2);

    const globe = new THREE.Group();
    scene.add(globe);
    globe.position.y = 1.1;

    const GREEN = new THREE.Color('#22c55e');
    const CYAN = new THREE.Color('#22d3ee');
    const INDIGO = new THREE.Color('#6366f1');
    const RADIUS = 2.6;

    /* ── particle sphere (Fibonacci lattice) ── */
    const COUNT = 900;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const nodes = [];
    for (let i = 0; i < COUNT; i++) {
        const y = 1 - (i / (COUNT - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const theta = golden * i;
        const p = new THREE.Vector3(
            Math.cos(theta) * r * RADIUS,
            y * RADIUS,
            Math.sin(theta) * r * RADIUS
        );
        nodes.push(p);
        positions.set([p.x, p.y, p.z], i * 3);
        const c = Math.random() < 0.12 ? GREEN : (Math.random() < 0.3 ? CYAN : INDIGO);
        colors.set([c.r, c.g, c.b], i * 3);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    /* soft round sprite so points don't render as hard squares */
    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = spriteCanvas.height = 64;
    const ctx = spriteCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const sprite = new THREE.CanvasTexture(spriteCanvas);

    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
        size: 0.055,
        map: sprite,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }));
    globe.add(points);

    /* faint wireframe shell for depth */
    const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(RADIUS * 0.995, 2),
        new THREE.MeshBasicMaterial({ color: INDIGO, wireframe: true, transparent: true, opacity: 0.05 })
    );
    globe.add(shell);

    /* ── animated connection arcs ── */
    const ARC_COUNT = 10;
    const ARC_SEGMENTS = 64;
    const arcs = [];

    function makeArc() {
        const a = nodes[Math.floor(Math.random() * nodes.length)];
        const b = nodes[Math.floor(Math.random() * nodes.length)];
        if (a.distanceTo(b) < RADIUS * 0.6) return makeArc();
        const mid = a.clone().add(b).multiplyScalar(0.5).normalize()
            .multiplyScalar(RADIUS * (1.25 + Math.random() * 0.45));
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const pts = curve.getPoints(ARC_SEGMENTS);
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
            color: Math.random() < 0.5 ? GREEN : CYAN,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const line = new THREE.Line(geo, mat);
        line.geometry.setDrawRange(0, 0);
        globe.add(line);
        return { line, t: -Math.random() * 2, speed: 0.35 + Math.random() * 0.4 };
    }
    for (let i = 0; i < ARC_COUNT; i++) arcs.push(makeArc());

    function resetArc(arc) {
        globe.remove(arc.line);
        arc.line.geometry.dispose();
        arc.line.material.dispose();
        const fresh = makeArc();
        arc.line = fresh.line;
        arc.t = fresh.t;
        arc.speed = fresh.speed;
    }

    /* ── sizing ── */
    function resize() {
        const { clientWidth: w, clientHeight: h } = canvas;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    resize();
    addEventListener('resize', resize, { passive: true });

    /* ── subtle pointer parallax ── */
    let targetX = 0, targetY = 0;
    addEventListener('pointermove', (e) => {
        targetX = (e.clientX / innerWidth - 0.5) * 0.25;
        targetY = (e.clientY / innerHeight - 0.5) * 0.15;
    }, { passive: true });

    /* ── render loop (paused off-screen / hidden tab) ── */
    let running = true;
    new IntersectionObserver(([entry]) => { running = entry.isIntersecting; })
        .observe(canvas);
    document.addEventListener('visibilitychange', () => {
        running = document.visibilityState === 'visible';
    });

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
        if (!running) return;
        const dt = Math.min(clock.getDelta(), 0.05);

        globe.rotation.y += dt * 0.06;
        globe.rotation.x += (targetY - globe.rotation.x) * 0.04;
        globe.rotation.y += (targetX - 0) * 0.001;

        for (const arc of arcs) {
            arc.t += dt * arc.speed;
            if (arc.t < 0) continue;
            const head = arc.t % 2;               // 0→1 draw, 1→2 fade
            if (head <= 1) {
                arc.line.geometry.setDrawRange(0, Math.floor(head * ARC_SEGMENTS) + 1);
                arc.line.material.opacity = Math.min(head * 3, 0.55);
            } else {
                arc.line.material.opacity = Math.max(0.55 * (2 - head) * 2, 0);
                if (head > 1.5 && arc.line.material.opacity <= 0.01) resetArc(arc);
            }
        }
        renderer.render(scene, camera);
    });
}
