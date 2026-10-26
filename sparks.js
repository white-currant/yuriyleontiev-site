// Искры на первом экране — порт рилса Workshop 47, Vol. 3 (Обложка искра/spark-reel/index.html).
// Рисунок, цвета и бесшовная петля те же; холст — под размер экрана, центр потока — на обложке.
// Все размеры частиц заданы в единицах кадра рилса (1080×1920) и масштабируются на u.
(function () {
  var cv = document.getElementById("sparks");
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");
  var hero = cv.parentElement;
  var LOOP = 25;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var small = matchMedia("(max-width: 700px)").matches || (navigator.hardwareConcurrency || 8) <= 4;
  var RES = 0.5; // холст в пол-разрешения: под blur разницы не видно, а рисовать вчетверо дешевле
  var FPS = small ? 30 : 60;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry32(47);
  var R = function (a, b) { return a + (b - a) * rnd(); };
  var gauss = function () { var s = 0; for (var i = 0; i < 4; i++) s += rnd(); return (s - 2) / 0.577; };

  // Направление полёта — как у искры на обложке: из правого верхнего угла в левый нижний.
  var ang = (150 * Math.PI) / 180;
  var DIR = [Math.cos(ang), Math.sin(ang)];
  var NRM = [-DIR[1], DIR[0]];

  function make(n, o) {
    n = Math.round(n * (small ? 0.5 : 1));
    var arr = [];
    for (var i = 0; i < n; i++) {
      var k = Math.max(1, Math.round((o.k[Math.floor(rnd() * o.k.length)] * LOOP) / 20)); // скорость как при 20 с
      var off = rnd() < o.band ? gauss() * o.sigma : R(-1300, 1300);
      arr.push({
        k: k, phase: rnd(), off: off,
        len: R(o.len[0], o.len[1]),
        w: R(o.w[0], o.w[1]),
        a: o.bright && rnd() < o.bright ? R(0.85, 1) : R(o.a[0], o.a[1]),
        r: o.r ? R(o.r[0], o.r[1]) : 0
      });
    }
    return arr;
  }

  // Слои (дальние → ближние)
  var L = {
    bokehV: make(34, { k: [1, 2], band: 0.3, sigma: 700, len: [0, 0], w: [0, 0], a: [0.16, 0.34], r: [24, 78] }),
    blobG: make(36, { k: [2, 3, 4], band: 0.8, sigma: 420, len: [0, 0], w: [0, 0], a: [0.10, 0.26], r: [18, 56] }),
    cometV: make(80, { k: [3, 4, 5, 6], band: 0.35, sigma: 650, len: [70, 240], w: [2.5, 6], a: [0.25, 0.6], bright: 0.22 }),
    streakG: make(280, { k: [6, 7, 8, 9, 10, 12], band: 0.85, sigma: 380, len: [60, 440], w: [1, 3.6], a: [0.2, 0.75], bright: 0.12 }),
    ember: make(220, { k: [4, 5, 6, 8], band: 0.7, sigma: 520, len: [8, 34], w: [1.2, 2.6], a: [0.5, 1] })
  };
  var TRAVEL = { bokehV: 900, blobG: 2600, cometV: 2700, streakG: 2900, ember: 2700 };

  var W = 0, H = 0, u = 1, C = [0, 0];
  var bg = document.createElement("canvas");

  function pos(p, t, travel) {
    var age = (t * p.k) / LOOP + p.phase; age -= Math.floor(age);
    var s = (age - 0.5) * travel * u, o = p.off * u;
    return { x: C[0] + NRM[0] * o + DIR[0] * s, y: C[1] + NRM[1] * o + DIR[1] * s, env: Math.pow(Math.sin(Math.PI * age), 0.6) };
  }

  // Статичный фон: тёмный янтарь, тёплое свечение вокруг обложки, лёгкий фиолет по углам
  function paintBg() {
    bg.width = W; bg.height = H;
    var b = bg.getContext("2d");
    b.fillStyle = "#120a05"; b.fillRect(0, 0, W, H);
    var glow = function (x, y, r, col) {
      var g = b.createRadialGradient(x, y, 0, x, y, r * u);
      g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
      b.fillStyle = g; b.fillRect(0, 0, W, H);
    };
    b.globalCompositeOperation = "lighter";
    glow(C[0], C[1], 1150, "rgba(150,92,28,0.55)");
    glow(W * 0.95, H * 0.2, 700, "rgba(170,110,40,0.35)");
    glow(W * 0.08, H * 0.82, 650, "rgba(160,100,36,0.30)");
    glow(W * 0.05, H * 0.08, 600, "rgba(110,40,150,0.30)");
    glow(W * 0.98, H * 0.95, 600, "rgba(110,40,150,0.26)");
    b.globalCompositeOperation = "source-over";
    var m = Math.max(W, H);
    var v = b.createRadialGradient(W / 2, H / 2, m * 0.3, W / 2, H / 2, m * 0.72);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(8,4,2,0.75)");
    b.fillStyle = v; b.fillRect(0, 0, W, H);
  }

  function softDot(x, y, r, rgb, a, stretch) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(stretch, 1);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, "rgba(" + rgb + "," + a + ")");
    g.addColorStop(0.55, "rgba(" + rgb + "," + a * 0.6 + ")");
    g.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function streak(x, y, len, w, head, a) {
    var tx = x - DIR[0] * len, ty = y - DIR[1] * len;
    var g = ctx.createLinearGradient(tx, ty, x, y);
    g.addColorStop(0, "rgba(" + head + ",0)");
    g.addColorStop(0.7, "rgba(" + head + "," + a * 0.45 + ")");
    g.addColorStop(1, "rgba(" + head + "," + a + ")");
    ctx.strokeStyle = g;
    ctx.lineWidth = w * 3.2; ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
    ctx.lineWidth = w; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
  }

  function draw(t) {
    var i, p, q;
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (i = 0; i < L.bokehV.length; i++) { p = L.bokehV[i]; q = pos(p, t, TRAVEL.bokehV); softDot(q.x, q.y, p.r * u, "160,80,255", p.a * q.env, 1.35); }
    for (i = 0; i < L.blobG.length; i++) { p = L.blobG[i]; q = pos(p, t, TRAVEL.blobG); softDot(q.x, q.y, p.r * u, "255,180,80", p.a * q.env, 2.6); }
    for (i = 0; i < L.cometV.length; i++) {
      p = L.cometV[i]; q = pos(p, t, TRAVEL.cometV);
      streak(q.x, q.y, p.len * u, p.w * u, "205,120,255", p.a * q.env);
      softDot(q.x, q.y, p.w * 2.4 * u, "245,190,255", p.a * q.env, 1);
    }
    for (i = 0; i < L.streakG.length; i++) { p = L.streakG[i]; q = pos(p, t, TRAVEL.streakG); streak(q.x, q.y, p.len * u, p.w * u, "255,196,105", p.a * q.env); }
    for (i = 0; i < L.ember.length; i++) { p = L.ember[i]; q = pos(p, t, TRAVEL.ember); streak(q.x, q.y, p.len * u, p.w * u, "255,232,170", p.a * q.env); }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  }

  // Размер холста и центр потока — по обложке (на телефоне она под текстом, на десктопе справа)
  function layout() {
    var hr = hero.getBoundingClientRect();
    W = Math.max(1, Math.round(hr.width * RES)); H = Math.max(1, Math.round(hr.height * RES));
    cv.width = W; cv.height = H;
    u = Math.max(W, H) / 1920;
    var f = hero.querySelector(".feat");
    if (f) {
      var r = f.getBoundingClientRect();
      C = [(r.left - hr.left + r.width / 2) * RES, (r.top - hr.top + r.height / 2) * RES];
    } else {
      C = [W / 2, H / 2];
    }
    paintBg();
  }

  var t0 = performance.now(), raf = 0, last = 0, onScreen = true;
  function now() { return (((performance.now() - t0) / 1000) % LOOP); }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (ts - last < 1000 / FPS - 2) return;
    last = ts;
    draw(now());
  }
  function run() {
    if (reduce || !onScreen || raf) return;
    raf = requestAnimationFrame(frame);
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  layout();
  draw(reduce ? 6 : now()); // без анимаций — один неподвижный кадр

  var rw = 0;
  window.addEventListener("resize", function () {
    clearTimeout(rw);
    rw = setTimeout(function () { layout(); draw(reduce ? 6 : now()); }, 120);
  });
  // за пределами первого экрана не рисуем — бережём батарею
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) {
      onScreen = e[0].isIntersecting;
      if (onScreen) run(); else stop();
    }).observe(hero);
  }
  run();
})();
