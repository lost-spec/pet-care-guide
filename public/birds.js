/**
 * birds.js — decorative animated background.
 *
 * Draws birds, drifting clouds and falling leaves on a single full-screen
 * canvas that sits behind all content (`pointer-events: none`, `z-index: -1`).
 *
 * Performance / accessibility contract:
 *  - one rAF loop, no per-frame allocations
 *  - device pixel ratio capped at 2
 *  - fewer objects on small screens
 *  - pauses when the tab is hidden, resumes without a time jump
 *  - honours prefers-reduced-motion (renders one static frame, no loop)
 *  - colours are read from CSS custom properties so dark mode stays legible
 */
(function () {
  'use strict';

  var canvas = document.createElement('canvas');
  canvas.id = 'bird-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var COLORS = {
    body: ['--green-900', '--green-700', '--green-500'],
    wing: ['--green-700', '--green-500', '--green-300'],
    beak: ['--amber-400', '--peach-400', '--amber-300'],
    cloud: 'rgba(255,255,255,0.55)',
    leaf: ['--green-700', '--green-500', '--green-300', '--amber-400']
  };

  var LIMITS = {
    desktop: { birds: 5, clouds: 3, leaves: 10 },
    mobile: { birds: 2, clouds: 2, leaves: 5 },
    mobileBreakpoint: 768
  };

  var W = 0, H = 0, dpr = 1;
  var birds = [], clouds = [], leaves = [];
  var rafId = null;
  var lastTs = 0;
  var running = false;
  var pointerX = null, pointerY = null;
  var birdOffsetX = 0, birdOffsetY = 0;
  var pointerEase = 0.06;

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var schemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  var palette = resolvePalette();

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v && v.trim() ? v.trim() : fallback;
  }

  function resolvePalette() {
    var p = {
      body: COLORS.body.map(function (v) { return cssVar(v, '#2d6a4f'); }),
      wing: COLORS.wing.map(function (v) { return cssVar(v, '#40916c'); }),
      beak: COLORS.beak.map(function (v) { return cssVar(v, '#e8a33d'); }),
      leaf: COLORS.leaf.map(function (v) { return cssVar(v, '#95d5b2'); })
    };
    p.cloud = schemeQuery.matches ? 'rgba(214,238,226,0.30)' : COLORS.cloud;
    p.eye = schemeQuery.matches ? '#f6fff8' : '#12291f';
    return p;
  }

  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  /* ---------- sizing ---------------------------------------------------- */
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    buildScene();
  }

  function limits() {
    return W < LIMITS.mobileBreakpoint ? LIMITS.mobile : LIMITS.desktop;
  }

  function buildScene() {
    var cfg = limits();
    var i;

    birds.length = 0;
    for (i = 0; i < cfg.birds; i++) birds.push(makeBird());

    clouds.length = 0;
    for (i = 0; i < cfg.clouds; i++) clouds.push(makeCloud());

    leaves.length = 0;
    for (i = 0; i < cfg.leaves; i++) leaves.push(makeLeaf());
  }

  function makeBird() {
    var depth = rand(1, 3);            // 1 = far/small, 3 = near/large
    var dir = Math.random() < 0.5 ? -1 : 1;
    // pixels per SECOND. Nearer birds (higher depth) travel faster, which
    // reads as parallax. ~25-70 px/s crosses a screen in 20-55s.
    var speed = rand(25, 48) * (4 - depth) * 0.55;
    var size = rand(9, 15) * (depth * 0.6);
    var y = rand(H * 0.08, H * 0.62);

    return {
      x: dir > 0 ? rand(-W * 0.2, -20) : rand(W, W * 1.2),
      baseY: y,
      y: y,
      dir: dir,
      depth: depth,
      size: size,
      speed: speed,
      // flap ~2.5–4.5 Hz, expressed as radians per second
      flapRate: rand(9, 15),
      flapPhase: rand(0, Math.PI * 2),
      bobRate: rand(0.25, 0.6),
      bobAmp: rand(6, 22) * depth * 0.6,
      body: pick(palette.body),
      wing: pick(palette.wing),
      beak: pick(palette.beak),
      alpha: 0.45 + (1 / depth) * 0.3
    };
  }

  function makeCloud() {
    var scale = rand(0.6, 1.5);
    return {
      x: rand(-W * 0.1, W),
      y: rand(H * 0.04, H * 0.38),
      depth: rand(1, 2.4),
      scale: scale,
      speed: rand(7, 18),
      alpha: rand(0.35, 0.7),
      puffs: [
        { dx: -0.5, dy: 0.06, r: 0.42 },
        { dx: 0, dy: -0.12, r: 0.6 },
        { dx: 0.52, dy: 0.08, r: 0.46 },
        { dx: 0.18, dy: 0.18, r: 0.36 }
      ]
    };
  }

  function makeLeaf() {
    return {
      x: rand(0, W),
      y: rand(-H, H),
      vy: rand(10, 26),
      drift: rand(-8, 8),
      swayRate: rand(0.5, 1.4),
      swayAmp: rand(6, 20),
      phase: rand(0, Math.PI * 2),
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-0.7, 0.7),
      size: rand(5, 11),
      color: pick(palette.leaf),
      alpha: rand(0.25, 0.55)
    };
  }

  /* ---------- update ---------------------------------------------------- */
  function update(dt, t) {
    var i, b, c, l, edge;

    for (i = 0; i < birds.length; i++) {
      b = birds[i];
      b.x += b.speed * b.dir * dt;
      b.y = b.baseY + Math.sin(t * b.bobRate + b.flapPhase) * b.bobAmp;

      edge = b.size * 3;
      if (b.dir > 0 && b.x > W + edge) {
        b.x = -edge;
        b.baseY = rand(H * 0.08, H * 0.62);
      } else if (b.dir < 0 && b.x < -edge) {
        b.x = W + edge;
        b.baseY = rand(H * 0.08, H * 0.62);
      }
    }

    for (i = 0; i < clouds.length; i++) {
      c = clouds[i];
      c.x += c.speed * dt;
      if (c.x - 140 * c.scale > W) {
        c.x = -160 * c.scale;
        c.y = rand(H * 0.04, H * 0.38);
      }
    }

    for (i = 0; i < leaves.length; i++) {
      l = leaves[i];
      l.y += l.vy * dt;
      l.x += (l.drift + Math.sin(t * l.swayRate + l.phase) * l.swayAmp) * dt;
      l.rot += l.rotSpeed * dt;

      if (l.y > H + 20) {
        l.y = -20;
        l.x = rand(0, W);
        l.rot = rand(0, Math.PI * 2);
      }
      if (l.x < -30) l.x = W + 20;
      else if (l.x > W + 30) l.x = -20;
    }

    // ease pointer parallax toward the cursor
    if (pointerX !== null) {
      var tx = (pointerX / W - 0.5) * 2;
      var ty = (pointerY / H - 0.5) * 2;
      birdOffsetX += (tx * 26 - birdOffsetX) * pointerEase;
      birdOffsetY += (ty * 18 - birdOffsetY) * pointerEase;
    }
  }

  /* ---------- draw ------------------------------------------------------ */
  function drawClouds() {
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      ctx.save();
      ctx.globalAlpha = c.alpha / c.depth;
      ctx.fillStyle = palette.cloud;
      for (var p = 0; p < c.puffs.length; p++) {
        var puff = c.puffs[p];
        ctx.beginPath();
        ctx.arc(
          c.x + puff.dx * 120 * c.scale,
          c.y + puff.dy * 120 * c.scale,
          puff.r * 110 * c.scale,
          0, Math.PI * 2
        );
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawLeaves() {
    for (var i = 0; i < leaves.length; i++) {
      var l = leaves[i];
      ctx.save();
      ctx.globalAlpha = l.alpha;
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.moveTo(0, -l.size * 0.55);
      ctx.quadraticCurveTo(l.size * 0.62, 0, 0, l.size * 0.55);
      ctx.quadraticCurveTo(-l.size * 0.62, 0, 0, -l.size * 0.55);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBirds(t) {
    for (var i = 0; i < birds.length; i++) {
      var b = birds[i];
      var flap = Math.sin(t * b.flapRate + b.flapPhase);
      var lift = Math.abs(flap);              // 0 = wings down, 1 = wings up
      var s = b.size;

      ctx.save();
      ctx.globalAlpha = b.alpha;
      ctx.translate(
        b.x + birdOffsetX / b.depth,
        b.y + birdOffsetY / b.depth
      );
      ctx.scale(b.dir, 1);

      // far wing (behind body)
      drawWing(b.wing, -s * 0.46, -lift * s * 0.34, s, 0.55);

      // body
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.62, s * 0.36, 0, 0, Math.PI * 2);
      ctx.fillStyle = b.body;
      ctx.fill();

      // head + beak
      ctx.beginPath();
      ctx.arc(s * 0.6, -s * 0.16, s * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = b.body;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(s * 0.84, -s * 0.2);
      ctx.lineTo(s * 1.22, -s * 0.08);
      ctx.lineTo(s * 0.84, s * 0.02);
      ctx.closePath();
      ctx.fillStyle = b.beak;
      ctx.fill();

      // eye
      ctx.beginPath();
      ctx.arc(s * 0.68, -s * 0.22, s * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = palette.eye;
      ctx.fill();

      // tail
      ctx.beginPath();
      ctx.moveTo(-s * 0.55, 0);
      ctx.lineTo(-s * 1.15, -s * 0.3);
      ctx.lineTo(-s * 1.05, s * 0.28);
      ctx.closePath();
      ctx.fillStyle = b.body;
      ctx.fill();

      // near wing (in front of body)
      drawWing(b.wing, -s * 0.44, -lift * s * 0.44, s, 1);

      ctx.restore();
    }
  }

  function drawWing(color, span, lift, s, alphaScale) {
    ctx.save();
    ctx.globalAlpha = 0.85 * alphaScale;
    ctx.fillStyle = color;
    // compact teardrop rather than a long spike
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.02);
    ctx.quadraticCurveTo(span * 0.55, -s * 0.14 + lift * s * 0.42, span, lift * s * 0.26);
    ctx.quadraticCurveTo(span * 0.5, s * 0.06 + lift * s * 0.06 + s * 0.1, -s * 0.2, s * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ---------- loop ------------------------------------------------------ */
  function renderOnce(t) {
    ctx.clearRect(0, 0, W, H);
    drawClouds();
    drawLeaves();
    drawBirds(t);
  }

  function frame(ts) {
    if (!running) return;
    var dt = Math.min((ts - lastTs) / 1000, 0.05); // clamp after tab switches
    if (dt < 0) dt = 0;
    lastTs = ts;

    var t = ts / 1000;
    update(dt, t);
    renderOnce(t);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || motionQuery.matches) return;
    running = true;
    lastTs = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function applyMotionPreference() {
    if (motionQuery.matches) {
      stop();
      renderOnce(0);            // static frame, no animation
    } else {
      start();
    }
  }

  /* ---------- events ---------------------------------------------------- */
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (motionQuery.matches) renderOnce(0);
    }, 150);
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });

  window.addEventListener('mousemove', function (e) {
    pointerX = e.clientX;
    pointerY = e.clientY;
  }, { passive: true });

  window.addEventListener('blur', function () { pointerX = null; pointerY = null; });

  function onMotionChange() { applyMotionPreference(); }

  function onSchemeChange() {
    palette = resolvePalette();
    buildScene();
    renderOnce(performance.now() / 1000);
  }

  if (typeof motionQuery.addEventListener === 'function') {
    motionQuery.addEventListener('change', onMotionChange);
    schemeQuery.addEventListener('change', onSchemeChange);
  } else if (typeof motionQuery.addListener === 'function') {
    motionQuery.addListener(onMotionChange);
    schemeQuery.addListener(onSchemeChange);
  }

  /* ---------- init ------------------------------------------------------ */
  function init() {
    resize();
    applyMotionPreference();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Small public surface for tuning from the console. */
  window.BirdAnimation = {
    pause: stop,
    resume: start,
    repaint: function () { renderOnce(performance.now() / 1000); },
    setCounts: function (birds, clouds, leaves) {
      if (typeof birds === 'number') LIMITS.desktop.birds = birds;
      if (typeof clouds === 'number') LIMITS.desktop.clouds = clouds;
      if (typeof leaves === 'number') LIMITS.desktop.leaves = leaves;
      buildScene();
      renderOnce(performance.now() / 1000);
    },
    getCounts: function () {
      return { birds: birds.length, clouds: clouds.length, leaves: leaves.length };
    }
  };
})();
