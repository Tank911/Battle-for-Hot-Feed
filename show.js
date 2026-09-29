// Battle for Hot Feed — an object show about websim's most famous faces.
// Everything you see is drawn on this canvas; everything you hear is ElevenLabs
// (voices, sound effects, music) mixed into episode.mp3. timeline.json holds the
// start time of every line/sfx plus a 30fps loudness envelope used for lip-sync.

const W = 1920, H = 1080, GROUND = 860;
const cv = document.getElementById("c");
const ctx = cv.getContext("2d");
cv.width = W; cv.height = H;
function fit() {
  const r = Math.min(innerWidth / W, innerHeight / H);
  cv.style.width = W * r + "px"; cv.style.height = H * r + "px";
}
addEventListener("resize", fit); fit();

const audio = new Audio("episode.mp3");
audio.preload = "auto";
let TL = null, started = false;

const FONT = "'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif";
const COLORS = { HOST: "#7b61ff", ONE: "#e8262b", XP: "#1f63d6", CURSOR: "#444", DUCK: "#e0a800", CREDIT: "#1c9be6" };
const NAMES = { HOST: "Prompt Box", ONE: "One", XP: "XP", CURSOR: "Cursor", DUCK: "Duck", CREDIT: "Credit" };

// ---------- math ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k = clamp(k), k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const easeOut = (k) => 1 - Math.pow(1 - clamp(k), 3);
function elastic(k) {
  k = clamp(k); if (k === 0 || k === 1) return k;
  return Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
}
const prog = (t, a, d) => clamp((t - a) / d);
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// ---------- timeline helpers ----------
const byId = {};
let T = (id) => byId[id].start;
let END = (id) => byId[id].start + byId[id].dur;
function speaking(t) {
  for (const e of TL.events) if (e.t === "line" && t >= e.start && t < e.start + e.dur) return e;
  return null;
}
function talk(who, t) {
  const e = speaking(t);
  if (!e || e.who !== who) return 0;
  const i = Math.floor((t - e.start) * TL.fps);
  const a = +e.env[i] || 0, b = +e.env[i + 1] || 0;
  return lerp(a, b, (t - e.start) * TL.fps - i) / 9;
}
// keyframe track: [[time, {x,y,s,r,a}], ...] -> state at t (eased between keys)
function track(keys) {
  const full = []; let prev = { x: 0, y: GROUND, s: 1, r: 0, a: 1 };
  for (const [kt, st, d] of keys) { prev = { ...prev, ...st }; full.push([kt, prev, d ?? 0.6]); }
  return (t) => {
    if (t <= full[0][0]) return full[0][1];
    for (let i = full.length - 1; i >= 0; i--) {
      const [kt, st, d] = full[i];
      if (t >= kt) {
        const from = i > 0 ? full[i - 1][1] : st, k = ease((t - kt) / d);
        const o = {}; for (const key in st) o[key] = lerp(from[key], st[key], k);
        return o;
      }
    }
  };
}

// ---------- drawing primitives ----------
const INK = "#16121c";
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function stroke(w = 6) { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(); }
function fillStroke(c, w = 6) { ctx.fillStyle = c; ctx.fill(); stroke(w); }
function line(x1, y1, x2, y2, w = 6) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); stroke(w); }
function text(str, x, y, size, fill = "#fff", outline = INK, ow = 10, align = "center") {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = "middle";
  if (outline) { ctx.lineWidth = ow; ctx.strokeStyle = outline; ctx.lineJoin = "round"; ctx.strokeText(str, x, y); }
  ctx.fillStyle = fill; ctx.fillText(str, x, y);
}

function eye(x, y, r, st) {
  ctx.save(); ctx.translate(x, y);
  if (st.x_eyes) {
    line(-r * 0.6, -r * 0.6, r * 0.6, r * 0.6, 6); line(r * 0.6, -r * 0.6, -r * 0.6, r * 0.6, 6);
    ctx.restore(); return;
  }
  if (st.blink) {
    ctx.beginPath(); ctx.moveTo(-r * 0.8, 0); ctx.quadraticCurveTo(0, r * 0.45, r * 0.8, 0); stroke(5);
    ctx.restore(); return;
  }
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.82, r, 0, 0, 7); fillStroke("#fff", 4.5);
  const lx = (st.lookX || 0) * r * 0.32, ly = (st.lookY || 0) * r * 0.3 + r * 0.08;
  ctx.beginPath(); ctx.ellipse(lx, ly, r * 0.4, r * 0.48, 0, 0, 7); ctx.fillStyle = INK; ctx.fill();
  ctx.beginPath(); ctx.arc(lx - r * 0.13, ly - r * 0.16, r * 0.13, 0, 7); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.restore();
}
function brows(x, y, sep, r, mood) {
  if (mood !== "angry" && mood !== "sad" && mood !== "worried") return;
  const d = mood === "angry" ? 1 : -1;
  line(x - sep - r * 0.7, y - r * 1.25 - d * r * 0.25, x - sep + r * 0.6, y - r * 1.25 + d * r * 0.25, 6);
  line(x + sep + r * 0.7, y - r * 1.25 - d * r * 0.25, x + sep - r * 0.6, y - r * 1.25 + d * r * 0.25, 6);
}
function mouth(x, y, w, open, mood) {
  ctx.save(); ctx.translate(x, y);
  if (open < 0.08) {
    ctx.beginPath();
    if (mood === "sad" || mood === "worried") { ctx.moveTo(-w / 2, w * 0.18); ctx.quadraticCurveTo(0, -w * 0.22, w / 2, w * 0.18); }
    else if (mood === "angry") { ctx.moveTo(-w / 2, w * 0.05); ctx.lineTo(w / 2, -w * 0.05); }
    else if (mood === "smug") { ctx.moveTo(-w / 2, 0); ctx.quadraticCurveTo(w * 0.1, w * 0.3, w / 2, -w * 0.2); }
    else { ctx.moveTo(-w / 2, 0); ctx.quadraticCurveTo(0, w * 0.42, w / 2, 0); }
    stroke(5);
  } else {
    const h = w * 0.12 + open * w * 0.6;
    ctx.beginPath(); ctx.moveTo(-w / 2, 0);
    ctx.quadraticCurveTo(0, -h * 0.2, w / 2, 0);
    ctx.quadraticCurveTo(w * 0.35, h * 1.25, 0, h * 1.25);
    ctx.quadraticCurveTo(-w * 0.35, h * 1.25, -w / 2, 0);
    ctx.fillStyle = "#5b1020"; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.beginPath(); ctx.ellipse(0, h * 1.15, w * 0.26, h * 0.42, 0, 0, 7); ctx.fillStyle = "#ef6b7e"; ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(-w * 0.3, -2, w * 0.6, h * 0.22);
    ctx.restore();
    stroke(4.5);
  }
  ctx.restore();
}
function face(x, y, sep, r, mw, st) {
  eye(x - sep, y, r, st); eye(x + sep, y, r, st);
  brows(x, y, sep, r, st.mood);
  mouth(x + (st.mouthX || 0), y + r * 1.75, mw, st.talk, st.mood);
}
// stick limbs, BFDI style
function legs(x1, x2, top, st) {
  const step = st.walk ? Math.sin(st.time * 18) * 16 : 0;
  line(x1, top, x1 - 8 + step, 0, 6); line(x2, top, x2 + 8 - step, 0, 6);
  line(x1 - 8 + step, 0, x1 - 26 + step, 0, 7); line(x2 + 8 - step, 0, x2 + 26 - step, 0, 7);
}
function arms(lx, ly, rx, ry, st) {
  const k = st.talk, t = st.time;
  const wave = st.wave ? Math.sin(t * 10) * 0.5 : 0;
  const la = st.armsUp ? -2.3 : 2.2 - k * 1.1 - Math.sin(t * 6.5) * k * 0.5 + Math.sin(t * 1.7) * 0.06;
  const ra = st.armsUp ? -0.85 : 0.95 + k * 1.1 + Math.sin(t * 7.3) * k * 0.5 - Math.sin(t * 1.9) * 0.06 - (st.wave ? 2.2 + wave : 0);
  const L = 62;
  const hand = (x, y, a) => {
    const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
    line(x, y, ex, ey, 6);
    ctx.beginPath(); ctx.arc(ex, ey, 6, 0, 7); ctx.fillStyle = INK; ctx.fill();
  };
  hand(lx, ly, la); hand(rx, ry, ra);
}

// ---------- characters (feet at 0,0; local units ≈ px at s=1) ----------
const LEG = 46;
const CHAR = {
  ONE(st) {
    const top = -LEG - 150;
    legs(-35, 35, -LEG, st);
    arms(-75, top + 85, 75, top + 85, st);
    rr(-75, top, 150, 150, 12); fillStroke(st.gray ? "#9c9aa3" : "#e8262b", 7);
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(-66, top + 9, 132, 16);
    // One has a single big eye
    eye(0, top + 58, 38, st);
    brows(0, top + 58, 0, 38, st.mood === "angry" ? "angry" : "");
    mouth(0, top + 118, 54, st.talk, st.mood);
    // numberling
    const bob = Math.sin(st.time * 3) * 4;
    text("1", 0, top - 36 + bob, 54, "#fff", INK, 10);
  },
  XP(st) {
    const w = 236, h = 180, top = -LEG - h;
    legs(-45, 45, -LEG, st);
    arms(-w / 2, top + 100, w / 2, top + 100, st);
    ctx.save(); rr(-w / 2, top, w, h, 12); ctx.clip();
    if (st.crashed) {
      ctx.fillStyle = "#1339a6"; ctx.fillRect(-w / 2, top, w, h);
    } else {
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, "#3d8ff0"); g.addColorStop(0.55, "#b9ddff"); g.addColorStop(0.56, "#58b33a"); g.addColorStop(1, "#3a8e22");
      ctx.fillStyle = g; ctx.fillRect(-w / 2, top, w, h);
      ctx.beginPath(); ctx.moveTo(-w / 2, top + h * 0.62); ctx.quadraticCurveTo(0, top + h * 0.38, w / 2, top + h * 0.66);
      ctx.lineTo(w / 2, top + h); ctx.lineTo(-w / 2, top + h); ctx.fillStyle = "#4fae31"; ctx.fill();
    }
    // title bar
    const g2 = ctx.createLinearGradient(0, top, 0, top + 36);
    g2.addColorStop(0, "#3b86f2"); g2.addColorStop(1, "#0b4fc9");
    ctx.fillStyle = g2; ctx.fillRect(-w / 2, top, w, 36);
    ctx.restore();
    text("XP", -w / 2 + 26, top + 19, 20, "#fff", null, 0);
    rr(w / 2 - 34, top + 6, 26, 24, 5); fillStroke("#e2462b", 3);
    line(w / 2 - 27, top + 12, w / 2 - 15, top + 24, 3.5); line(w / 2 - 15, top + 12, w / 2 - 27, top + 24, 3.5);
    rr(w / 2 - 64, top + 6, 26, 24, 5); fillStroke("#3b86f2", 3);
    rr(-w / 2, top, w, h, 12); stroke(7);
    if (st.crashed) {
      text(":(", -w / 2 + 40, top + 150, 30, "#fff", null, 0);
      face(0, top + 78, 42, 21, 50, { ...st, x_eyes: true, mood: "sad" });
    } else face(0, top + 80, 44, 24, 54, st);
    if (st.loading) { // spinning hourglass
      ctx.save(); ctx.translate(w / 2 + 34, top + 10); ctx.rotate(Math.floor(st.time * 3) * Math.PI / 2 * 0.5);
      ctx.beginPath(); ctx.moveTo(-14, -18); ctx.lineTo(14, -18); ctx.lineTo(-14, 18); ctx.lineTo(14, 18); ctx.closePath();
      fillStroke("#f4d35e", 4); ctx.restore();
    }
  },
  CURSOR(st) {
    const P = [[0, 0], [0, 17], [4, 13.2], [6.8, 19], [9.3, 17.9], [6.6, 12.3], [12, 12.3]];
    const k = 11.5, ox = -46, top = -LEG - 214;
    line(ox + 18, top + 190, -30, -2, 6); line(ox + 92, top + 214, 28, -2, 6);
    line(-30, 0, -48, 0, 7); line(28, 0, 46, 0, 7);
    arms(ox + 22, top + 120, ox + 105, top + 140, st);
    ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ox + x * k, top + y * k));
    ctx.closePath(); fillStroke("#fff", 7);
    face(ox + 38, top + 92, 17, 17, 34, st);
  },
  DUCK(st) {
    const top = -LEG;
    legs(-30, 25, top + 4, st);
    // body
    ctx.beginPath(); ctx.moveTo(-110, top - 95);
    ctx.quadraticCurveTo(-90, top - 60, -60, top - 110);
    ctx.bezierCurveTo(10, top - 130, 110, top - 120, 100, top - 50);
    ctx.bezierCurveTo(90, top + 5, -70, top + 10, -95, top - 40);
    ctx.quadraticCurveTo(-110, top - 65, -110, top - 95);
    fillStroke(st.gray ? "#bbb" : "#ffd83a", 7);
    // wing = arm
    const flap = Math.sin(st.time * 9) * st.talk * 0.4 + (st.armsUp ? -0.8 : 0);
    ctx.save(); ctx.translate(-10, top - 75); ctx.rotate(flap);
    ctx.beginPath(); ctx.ellipse(0, 0, 48, 26, -0.25, 0, 7); fillStroke("#f6c21e", 5); ctx.restore();
    // head
    ctx.beginPath(); ctx.arc(45, top - 170, 62, 0, 7); fillStroke(st.gray ? "#bbb" : "#ffd83a", 7);
    // bill: lower half opens with speech
    const open = st.talk * 0.5;
    ctx.save(); ctx.translate(92, top - 152); ctx.rotate(open);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(40, 2, 58, 6); ctx.quadraticCurveTo(40, 26, 0, 16); ctx.closePath();
    fillStroke("#f08a24", 5); ctx.restore();
    ctx.beginPath(); ctx.moveTo(92, top - 170); ctx.quadraticCurveTo(140, top - 172, 158, top - 150);
    ctx.quadraticCurveTo(130, top - 146, 92, top - 150); ctx.closePath(); fillStroke("#ff9a2e", 5);
    eye(30, top - 188, 19, st); eye(70, top - 190, 17, st);
    brows(50, top - 189, 20, 18, st.mood);
    if (st.crown) {
      ctx.save(); ctx.translate(40, top - 236 + Math.sin(st.time * 4) * 3); ctx.rotate(-0.15);
      ctx.beginPath(); ctx.moveTo(-40, 20); ctx.lineTo(-44, -18); ctx.lineTo(-20, 4); ctx.lineTo(0, -26); ctx.lineTo(20, 4); ctx.lineTo(44, -18); ctx.lineTo(40, 20); ctx.closePath();
      fillStroke("#ffcf1f", 5);
      ctx.beginPath(); ctx.arc(0, 8, 6, 0, 7); fillStroke("#e83a59", 3);
      ctx.restore();
    }
  },
  CREDIT(st) {
    const top = -LEG - 200, mid = top + 80;
    legs(-16, 16, -LEG + 6, st);
    arms(-62, mid + 10, 62, mid + 10, st);
    const g = st.gray;
    const c = g ? ["#a9a9b3", "#d4d4dc", "#83838e", "#c1c1ca"] : ["#27a6f5", "#8fe3ff", "#1270c9", "#5cc6ff"];
    // diamond with facets
    const pts = { t: [0, top], l: [-86, mid], r: [86, mid], b: [0, -LEG + 6], cl: [-40, mid], cr: [40, mid] };
    const poly = (arr, col) => { ctx.beginPath(); arr.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ...pts[p])); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
    poly(["t", "l", "cl"], c[1]); poly(["t", "cl", "cr"], c[3]); poly(["t", "cr", "r"], c[0]);
    poly(["l", "b", "cl"], c[0]); poly(["cl", "b", "cr"], c[3]); poly(["cr", "b", "r"], c[2]);
    ctx.beginPath(); ctx.moveTo(...pts.t); ctx.lineTo(...pts.r); ctx.lineTo(...pts.b); ctx.lineTo(...pts.l); ctx.closePath(); stroke(7);
    line(-86, mid, 86, mid, 4); line(0, top, -40, mid, 3); line(0, top, 40, mid, 3); line(-40, mid, 0, -LEG + 6, 3); line(40, mid, 0, -LEG + 6, 3);
    if (st.cracked) { ctx.beginPath(); ctx.moveTo(10, top + 20); ctx.lineTo(-6, top + 60); ctx.lineTo(14, top + 90); ctx.lineTo(-4, top + 130); stroke(4); }
    face(0, mid - 6, 22, 18, 36, st);
    if (!g) for (let i = 0; i < 3; i++) { // sparkles
      const a = st.time * 1.3 + i * 2.1, k = (Math.sin(a * 2) + 1) / 2;
      sparkle(Math.cos(a) * 110, top + 90 + Math.sin(a) * 90, 6 + k * 10, "#fff");
    }
  },
  HOST(st) {
    // the prompt box: floats, types what it says
    const w = 380, h = 180;
    ctx.save(); ctx.translate(0, -h / 2);
    ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.beginPath(); ctx.ellipse(0, h / 2 + 150, 140, 16, 0, 0, 7); ctx.fill();
    arms(-w / 2, 10, w / 2, 10, st);
    rr(-w / 2, -h / 2, w, h, 30); fillStroke("#fff", 7);
    rr(-w / 2 + 6, -h / 2 + 6, w - 12, 20, 14); ctx.fillStyle = "#f1eefc"; ctx.fill();
    face(-40, -38, 34, 22, 48, st);
    rr(-w / 2 + 22, 28, w - 44, 46, 23); ctx.fillStyle = "#f4f4f7"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#c9c6d6"; ctx.stroke();
    const typed = st.typed || "";
    const shown = typed.length > 22 ? "…" + typed.slice(-21) : typed;
    ctx.font = `600 22px system-ui, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = typed ? "#2a2540" : "#9c98ad"; ctx.fillText(shown || "Ask websim to make anything…", -w / 2 + 42, 51);
    if (Math.floor(st.time * 2) % 2 === 0) {
      const cw = ctx.measureText(shown).width; ctx.fillStyle = "#6f5cff"; ctx.fillRect(-w / 2 + 44 + (typed ? cw : 0), 38, 3, 26);
    }
    ctx.beginPath(); ctx.arc(w / 2 - 50, 51, 20, 0, 7); ctx.fillStyle = "#6f5cff"; ctx.fill();
    line(w / 2 - 50, 60, w / 2 - 50, 41, 4.5); ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(w / 2 - 59, 49); ctx.lineTo(w / 2 - 50, 40); ctx.lineTo(w / 2 - 41, 49); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 2 - 50, 60); ctx.lineTo(w / 2 - 50, 41); ctx.stroke();
    ctx.restore();
  },
};

function sparkle(x, y, r, col) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rad = i % 2 ? r * 0.3 : r; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill();
}
function heart(x, y, r, col) {
  ctx.beginPath(); ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.fillStyle = col; ctx.fill(); stroke(4);
}
function flame(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const f = (sc, col) => {
    ctx.beginPath(); ctx.moveTo(0, 40 * sc);
    ctx.bezierCurveTo(-38 * sc, 36 * sc, -40 * sc, -6 * sc, -14 * sc, -30 * sc);
    ctx.bezierCurveTo(-12 * sc, -12 * sc, -4 * sc, -10 * sc, 0, -52 * sc);
    ctx.bezierCurveTo(22 * sc, -26 * sc, 40 * sc, -4 * sc, 30 * sc, 18 * sc);
    ctx.bezierCurveTo(26 * sc, 32 * sc, 14 * sc, 40 * sc, 0, 40 * sc); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  f(1, "#ff4b1f"); ctx.lineWidth = 6 / s; ctx.strokeStyle = INK; ctx.stroke(); f(0.65, "#ff9d1c"); f(0.35, "#ffe066");
  ctx.restore();
}

function drawChar(name, st) {
  if (!st || st.a <= 0.01 || st.s <= 0.01) return;
  ctx.save(); ctx.globalAlpha = st.a;
  ctx.translate(st.x, st.y + (st.hop || 0)); ctx.rotate(st.r || 0); ctx.scale(st.s * (st.flip ? -1 : 1), st.s);
  if (name !== "HOST" && st.y >= GROUND - 4) { // ground shadow
    ctx.fillStyle = "rgba(0,0,0,.16)"; ctx.beginPath(); ctx.ellipse(0, 4, 90, 14, 0, 0, 7); ctx.fill();
  }
  CHAR[name](st);
  ctx.restore();
}

// ---------- backgrounds ----------
function sky(t) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, "#5fb8ff"); g.addColorStop(1, "#d6efff");
  ctx.fillStyle = g; ctx.fillRect(-400, -400, W + 800, GROUND + 400);
  ctx.beginPath(); ctx.arc(1690, 150, 70, 0, 7); ctx.fillStyle = "#fff4b0"; ctx.fill();
  for (let i = 0; i < 6; i++) {
    const x = ((hash(i) * 2600 + t * (14 + i * 4)) % 2600) - 400, y = 90 + hash(i + 9) * 260, s = 0.6 + hash(i + 3) * 0.8;
    ctx.fillStyle = "rgba(255,255,255,.92)";
    for (const [dx, dy, r] of [[0, 0, 40], [42, -18, 50], [90, 0, 38], [45, 12, 40]]) {
      ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, 7); ctx.fill();
    }
  }
}
function field(t, opts = {}) {
  sky(t);
  // far hills
  ctx.fillStyle = "#9fdc7c"; ctx.beginPath(); ctx.moveTo(-400, GROUND);
  for (let x = -400; x <= W + 400; x += 40) ctx.lineTo(x, 640 + Math.sin(x * 0.004 + 1) * 50 + Math.sin(x * 0.011) * 18);
  ctx.lineTo(W + 400, GROUND); ctx.fill();
  if (opts.graveyard) graveyard(t, opts);
  // HOT FEED billboard
  ctx.save(); ctx.translate(220, 520);
  line(-50, 0, -50, 160, 10); line(50, 0, 50, 160, 10);
  rr(-120, -110, 240, 120, 14); fillStroke("#fff", 7);
  flame(-62, -52, 0.8); text("HOT", 38, -66, 38, "#ff4b1f", null); text("FEED", 38, -26, 30, INK, null);
  ctx.restore();
  // trees
  for (const [x, y, s] of [[420, 690, 0.8], [1520, 670, 0.7], [1760, 700, 0.9]]) {
    if (opts.graveyard && x > 1500) continue;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    rr(-12, -10, 24, 90, 6); fillStroke("#8a5a34", 6);
    ctx.beginPath(); ctx.arc(0, -50, 62, 0, 7); fillStroke("#3fa34d", 6);
    ctx.restore();
  }
  // ground
  const g = ctx.createLinearGradient(0, GROUND - 40, 0, H);
  g.addColorStop(0, "#63c24a"); g.addColorStop(1, "#3f9a34");
  ctx.fillStyle = g; ctx.fillRect(-400, GROUND - 60, W + 800, H - GROUND + 460);
  ctx.fillStyle = "rgba(255,255,255,.08)";
  for (let i = 0; i < 40; i++) { const x = hash(i * 7) * W, y = GROUND - 40 + hash(i * 13) * 200; ctx.fillRect(x, y, 22, 5); }
}
function graveyard(t, opts) {
  ctx.save(); ctx.translate(1770, 600);
  ctx.fillStyle = "#6a8f5a"; ctx.beginPath(); ctx.ellipse(40, 60, 330, 90, 0, Math.PI, 0); ctx.fill();
  const stones = [[-160, 22, 0.7], [-70, 10, 0.8], [40, 4, 0.75], [140, 16, 0.7], [230, 30, 0.6]];
  if (opts.newGrave > 0) stones.push([-10, 40, 0.95 * easeOut(opts.newGrave), true]);
  for (const [x, y, s, fresh] of stones) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(-34, 30); ctx.lineTo(-34, -30); ctx.arc(0, -30, 34, Math.PI, 0); ctx.lineTo(34, 30); ctx.closePath();
    fillStroke(fresh ? "#c9d4e8" : "#a3a9b5", 6);
    ctx.save(); ctx.scale(0.5, 0.5); ctx.translate(0, 60);
    ctx.beginPath(); ctx.moveTo(0, -95); ctx.lineTo(24, -60); ctx.lineTo(0, -25); ctx.lineTo(-24, -60); ctx.closePath();
    ctx.fillStyle = fresh ? "#27a6f5" : "#77808f"; ctx.fill(); ctx.restore();
    if (fresh) text("RIP", 0, 12, 18, INK, null);
    ctx.restore();
  }
  ctx.restore();
  ctx.save(); ctx.translate(1800, 440);
  line(0, 20, 0, 120, 7);
  rr(-120, -26, 240, 50, 8); fillStroke("#c89a62", 6);
  text("CREDIT GRAVEYARD", 0, 0, 22, "#fff", INK, 6);
  ctx.restore();
}
function rays(t, c1, c2) {
  ctx.fillStyle = c1; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(t * 0.15); ctx.fillStyle = c2;
  for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1600, i * Math.PI / 8, i * Math.PI / 8 + Math.PI / 16); ctx.fill(); }
  ctx.restore();
}
function logo(x, y, s, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(Math.sin(t * 2) * 0.02);
  text("BATTLE FOR", 0, -120, 76, "#fff", INK, 18);
  flame(-330, 20, 1.6); flame(330, 20, 1.6);
  text("HOT FEED", 0, 20, 170, "#ff5a1f", INK, 26);
  ctx.restore();
}

// ---------- the episode ----------
let cast, hostTrack, S;
function build() {
  for (const e of TL.events) if (e.id) byId[e.id] = e;
  S = { intro: T("welcome") - 0.25, challenge: T("to_challenge") + 0.3, results: T("times_up"), outro: T("next_time") - 0.3, end: T("end") };
  const G = GROUND;
  const pop = (id) => T(id) - 0.08;
  cast = {
    ONE: track([[0, { x: 560, y: G, s: 0 }], [pop("intro_one"), { s: 1 }, 0.35],
      [S.challenge, { x: 470 }], [S.results, { x: 520 }], [T("elim"), { x: 240, y: G - 90, s: 0.7 }],
      [S.outro, { x: 600, y: G, s: 1 }]]),
    XP: track([[0, { x: 850, y: G, s: 0 }], [pop("intro_xp"), { s: 1 }, 0.35],
      [S.challenge, { x: 1260 }], [S.results, { x: 1360 }], [T("elim"), { x: 800 }],
      [S.outro, { x: 1350 }]]),
    CURSOR: track([[0, { x: 1130, y: G, s: 0 }], [pop("intro_cursor"), { s: 1 }, 0.35],
      [S.challenge, { x: 1010 }], [T("nice_blocks"), { x: 800 }, 0.5], [T("steal"), { x: 1000 }, 0.8],
      [S.results, { x: 800 }], [T("elim"), { x: 420, y: G - 90, s: 0.7 }],
      [T("launch") - 0.6, { x: 1310, y: G, s: 1.1 }, 0.4], [S.outro, { x: 850, s: 1 }]]),
    DUCK: track([[0, { x: 1390, y: G, s: 0 }], [pop("intro_duck"), { s: 1 }, 0.35],
      [S.challenge, { x: 1500 }], [S.results, { x: 1080 }], [T("duck_wins"), { y: G - 110 }, 0.4],
      [T("elim"), { x: 620, y: G - 90, s: 0.7 }], [S.outro, { x: 1100, y: G, s: 1 }]]),
    CREDIT: track([[0, { x: 1650, y: G, s: 0 }], [pop("intro_credit"), { s: 1 }, 0.35],
      [S.challenge, { x: 1730 }], [T("said_credit"), { x: 700, y: G - 250 }, 0.35], [T("flattery") + 0.2, { x: 1730, y: G }, 0.5],
      [S.results, { x: 1640 }], [T("elim"), { x: 1120 }]]),
  };
  hostTrack = track([[0, { x: 330, y: 380, s: 0 }], [T("welcome") - 0.3, { s: 1 }, 0.4],
    [S.challenge, { x: 300, y: 330, s: 0.8 }], [S.results, { x: 560, y: 250, s: 0.75 }],
    [T("elim"), { x: 1500, y: 300, s: 0.8 }], [S.outro, { x: 960, y: 300, s: 0.95 }]]);
}

function charState(name, t) {
  const st = cast[name](t);
  st.time = t + hash(name.length) * 10;
  st.talk = talk(name, t);
  const bp = (t + hash(name.charCodeAt(0)) * 4) % 3.7; st.blink = bp < 0.12;
  st.hop = -Math.abs(Math.sin(t * 9)) * st.talk * 10;
  const sp = speaking(t);
  if (sp && sp.who !== name) {
    const other = sp.who === "HOST" ? hostTrack(t) : cast[sp.who](t);
    st.lookX = clamp((other.x - st.x) / 300, -1, 1); st.lookY = sp.who === "HOST" ? -0.6 : 0;
  }
  st.flip = false;
  return st;
}

// Characters' moods / props by story beat
function beats(name, st, t) {
  if (name === "ONE") {
    if (t >= T("hey") && t < END("said_credit")) st.mood = "angry";
    if (t >= S.outro) st.wave = true;
  }
  if (name === "CURSOR") {
    if (t >= T("nice_blocks") && t < S.results) st.mood = "smug";
    if (t >= T("launch") - 0.2 && t < T("launch") + 0.4) { st.armsUp = true; st.r = -0.25 * Math.sin(prog(t, T("launch") - 0.2, 0.6) * Math.PI); }
    if (t >= T("spent")) st.mood = "smug";
  }
  if (name === "XP") {
    st.loading = t >= T("xp_loading") && t < T("xp_crash");
    st.crashed = (t >= T("xp_crash") + 0.3 && t < S.results) || t >= END("restart");
    if (t >= T("elim") && t < T("credit_out")) st.mood = "worried";
    if (t >= T("credit_out") && t < T("next_time")) st.armsUp = true;
  }
  if (name === "DUCK") {
    st.crown = t >= T("duck_wins");
    if (t >= T("duck_wins") && t < END("explained")) st.armsUp = true;
  }
  if (name === "CREDIT") {
    if (t >= T("tip_self") && t < S.results) st.mood = "smug";
    if (t >= T("bankrupt") + 2.2) { st.gray = true; st.cracked = true; st.mood = "sad"; }
    if (t >= T("elim")) st.mood = "worried";
    if (t >= T("nooo")) { st.x += Math.sin(t * 60) * 6; st.armsUp = true; }
    if (t >= T("launch")) { // yeet into the credit graveyard
      const k = prog(t, T("launch") + 0.15, 1.5);
      const from = { x: 1120, y: GROUND }, to = { x: 1760, y: 640 };
      st.x = lerp(from.x, to.x, k); st.y = lerp(from.y, to.y, k) - Math.sin(k * Math.PI) * 520;
      st.r = k * 14; st.s = lerp(1, 0.2, k); st.a = k >= 1 ? 0 : 1;
    }
    if (t >= T("said_credit") && t < T("flattery") + 0.7) { st.hop = Math.sin(t * 12) * 12; st.mood = "happy"; }
  }
  return st;
}

// Scene-specific props
function towerX(t) {
  if (t < T("steal")) return 640;
  return lerp(640, 870, ease(prog(t, T("steal"), 0.8)));
}
function drawTower(t) {
  const n = Math.floor(clamp((t - T("stack") + 0.1) / 0.36, 0, 8));
  const cols = ["#e8262b", "#ff8a1c", "#ffd21f", "#35b84a", "#27b6d8", "#3b5fd6", "#8a4bd6", "#e8409a", "#e8262b"];
  const x = towerX(t);
  for (let i = 0; i < n; i++) {
    const wob = Math.sin(t * 3 + i * 0.7) * i * 1.4 * (t > T("steal") && t < T("steal") + 1.2 ? 3 : 1);
    rr(x - 34 + wob, GROUND - 66 * (i + 1), 68, 66, 8); fillStroke(cols[i], 6);
  }
}
function drawHearts(t) {
  const t0 = T("tip_self");
  if (t < t0 || t > S.results) return;
  for (let i = 0; i < 30; i++) {
    const b = t0 + i * 0.1, k = (t - b) / 1.6;
    if (k < 0 || k > 1) continue;
    const x = 1730 + (hash(i) - 0.5) * 300, y = GROUND - 220 - k * 380;
    ctx.globalAlpha = 1 - k; heart(x, y, 18 + hash(i + 2) * 12, "#ff4d6d");
    text("+1", x + 30, y - 20, 24, "#fff", INK, 6); ctx.globalAlpha = 1;
  }
}
function drawTimer(t) {
  const k = prog(t, T("go"), S.results - T("go"));
  const x = 1780, y = 130;
  ctx.beginPath(); ctx.arc(x, y, 80, 0, 7); fillStroke("#fff", 8);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 64, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); ctx.closePath();
  ctx.fillStyle = k > 0.8 ? "#ff4b3e" : "#ffcf33"; ctx.fill();
  text(String(Math.ceil(30 * (1 - k))), x, y + 4, 56, "#fff", INK, 10);
}
const SCORES = { ONE: 580, CURSOR: 677, DUCK: 1492, XP: 0, CREDIT: 9999 };
function drawScores(t) {
  if (t < T("count") || t > T("elim") + 0.5) return;
  ctx.globalAlpha = clamp(1 - (t - T("elim")) / 0.5);
  const k = easeOut(prog(t, T("count"), 2.7));
  for (const name of Object.keys(SCORES)) {
    const st = cast[name](t);
    const x = st.x, y = st.y - 330 - (name === "DUCK" ? 30 : 0);
    const bankrupt = name === "CREDIT" && t >= T("bankrupt") + 2.2;
    rr(x - 90, y - 34, 180, 68, 34); fillStroke(bankrupt ? "#444" : "#fff", 6);
    if (name === "XP" && k > 0.3) text("ERROR", x, y + 2, 34, "#e2462b", null);
    else if (bankrupt) text("BROKE", x, y + 2, 34, "#aaa", null);
    else { heart(x - 50, y + 2, 14, "#ff4d6d"); text(String(Math.round(SCORES[name] * k)), x + 18, y + 2, 34, INK, null); }
  }
  if (t > T("duck_wins")) {
    const x = cast.DUCK(t).x;
    rr(x - 110, GROUND - 110, 220, 120, 10); fillStroke("#ffcf1f", 7); text("#1", x, GROUND - 50, 56, "#fff", INK, 10);
  }
  ctx.globalAlpha = 1;
}
function drawSpotlights(t) {
  if (t < T("elim") || t > T("launch") + 2.5) return;
  const a = clamp((t - T("elim")) / 0.6);
  ctx.fillStyle = `rgba(10,8,30,${0.45 * a})`; ctx.fillRect(-400, -400, W + 800, H + 800);
  let target;
  if (t < T("roll")) target = null;
  else if (t < T("credit_out")) target = lerp(800, 1120, (Math.sin((t - T("roll")) * 5) + 1) / 2);
  else target = 1120;
  const beams = target == null ? [800, 1120] : [target];
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const bx of beams) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, `rgba(255,250,200,${0.05 * a})`); g.addColorStop(1, `rgba(255,250,200,${0.32 * a})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx - 40, -50); ctx.lineTo(bx + 40, -50); ctx.lineTo(bx + 170, GROUND + 20); ctx.lineTo(bx - 170, GROUND + 20); ctx.fill();
  }
  ctx.restore();
}
function drawCaption(t) {
  const e = speaking(t);
  if (!e) return;
  const words = e.text;
  ctx.font = `600 36px system-ui, sans-serif`;
  const tw = Math.min(ctx.measureText(words).width, 1500);
  const x = W / 2, y = H - 70;
  rr(x - tw / 2 - 30, y - 34, tw + 60, 68, 20); ctx.fillStyle = "rgba(16,12,28,.78)"; ctx.fill();
  const nm = NAMES[e.who];
  ctx.font = `20px ${FONT}`; const nw = ctx.measureText(nm).width + 28;
  rr(x - tw / 2 - 30, y - 62, nw, 32, 12); ctx.fillStyle = COLORS[e.who]; ctx.fill();
  text(nm, x - tw / 2 - 30 + nw / 2, y - 45, 20, "#fff", null);
  ctx.font = `600 36px system-ui, sans-serif`; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(words, x, y + 2, 1500);
}
function wipe(t, at) {
  const k = (t - at + 0.35) / 0.7;
  if (k < 0 || k > 1) return;
  const x = lerp(-W * 1.4, W * 1.4, k);
  ctx.save(); ctx.translate(x, 0);
  ctx.fillStyle = "#ffcf1f"; ctx.beginPath(); ctx.moveTo(-300, -100); ctx.lineTo(W * 0.9, -100); ctx.lineTo(W * 0.9 - 400, H + 100); ctx.lineTo(-700, H + 100); ctx.fill();
  ctx.fillStyle = "#ff5a1f"; ctx.beginPath(); ctx.moveTo(-100, -100); ctx.lineTo(W * 0.7, -100); ctx.lineTo(W * 0.7 - 400, H + 100); ctx.lineTo(-500, H + 100); ctx.fill();
  flame(W * 0.25, H / 2, 3);
  ctx.restore();
}

// camera: drifts toward whoever is talking
const cam = { x: W / 2, y: H / 2, z: 1 };
function camTarget(t) {
  const wide = { x: W / 2, y: H / 2, z: 1 };
  if ((t >= T("count") && t < T("duck_wins")) || (t >= T("roll") && t < T("credit_out")) || (t >= T("launch") && t < T("spent")) || t >= S.end) return wide;
  const e = speaking(t);
  if (!e) return wide;
  const st = e.who === "HOST" ? hostTrack(t) : cast[e.who](t);
  const focusY = e.who === "HOST" ? st.y : st.y - 150;
  return { x: lerp(W / 2, st.x, 0.45), y: lerp(H / 2, focusY, 0.35), z: 1.14 };
}

function titleCard(t, dur) {
  rays(t, "#ffcf1f", "#ffb400");
  const k = elastic(prog(t, 0.3, 0.9));
  logo(W / 2, 400, k, t);
  const kk = easeOut(prog(t, 1.3, 0.6));
  ctx.globalAlpha = kk;
  text("Episode 1:  Remix or Die", W / 2, 620, 58, "#fff", INK, 12);
  ctx.globalAlpha = 1;
  const names = ["ONE", "XP", "CURSOR", "DUCK", "CREDIT"];
  names.forEach((n, i) => {
    const p = elastic(prog(t, 1.6 + i * 0.25, 0.6));
    drawChar(n, { x: 380 + i * 290, y: H + 30, s: 0.72 * p, r: 0, a: 1, time: t + i, talk: 0, hop: -Math.abs(Math.sin(t * 4 + i)) * 16, lookY: -0.5 });
  });
}

function render(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!TL) { rays(t, "#ffcf1f", "#ffb400"); text("loading…", W / 2, H / 2, 60); return; }

  if (t < S.intro) { titleCard(t); wipe(t, S.intro); return; }

  // camera
  const tg = camTarget(t), f = 0.06;
  cam.x = lerp(cam.x, tg.x, f); cam.y = lerp(cam.y, tg.y, f); cam.z = lerp(cam.z, tg.z, f);
  let shake = 0;
  for (const id of ["xp_crash", "launch", "go"]) if (t > T(id) && t < T(id) + 0.5) shake = 14 * (1 - (t - T(id)) / 0.5);
  ctx.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.x * cam.z + (hash(Math.floor(t * 60)) - 0.5) * shake, H / 2 - cam.y * cam.z + (hash(Math.floor(t * 60) + 1) - 0.5) * shake);

  const inResults = t >= S.results && t < S.outro;
  field(t, { graveyard: inResults, newGrave: t > T("launch") + 1.6 ? (t - T("launch") - 1.6) / 0.4 : 0 });

  if (t >= S.challenge - 0.3 && t < S.results) drawTower(t);
  drawSpotlights(t);

  const order = ["ONE", "XP", "CURSOR", "DUCK", "CREDIT"];
  // during elimination, the survivors stand in back
  const back = t >= T("elim") && t < S.outro ? ["ONE", "DUCK", "CURSOR"] : [];
  for (const n of order.filter((n) => back.includes(n))) drawChar(n, beats(n, charState(n, t), t));
  for (const n of order.filter((n) => !back.includes(n))) drawChar(n, beats(n, charState(n, t), t));

  const hs = hostTrack(t);
  hs.time = t; hs.talk = talk("HOST", t); hs.blink = (t % 4.1) < 0.12;
  hs.y += Math.sin(t * 2) * 10;
  const hl = speaking(t);
  hs.typed = hl && hl.who === "HOST" ? hl.text.slice(0, Math.floor(hl.text.length * clamp((t - hl.start) / hl.dur * 1.05))) : "";
  drawChar("HOST", hs);

  drawHearts(t);
  drawScores(t);
  if (t > T("launch") + 1.6 && t < T("launch") + 2.4) { // poof at the graveyard
    const k = prog(t, T("launch") + 1.6, 0.8);
    ctx.globalAlpha = 1 - k;
    for (let i = 0; i < 8; i++) sparkle(1760 + Math.cos(i) * k * 120, 640 + Math.sin(i) * k * 90, 22, "#8fe3ff");
    ctx.globalAlpha = 1;
  }

  // screen-space overlays
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (t >= T("go") && t < S.results) drawTimer(t);
  if (t >= T("xp_crash") && t < T("xp_crash") + 0.35) { ctx.fillStyle = "rgba(19,57,166,.55)"; ctx.fillRect(0, 0, W, H); }
  if (t >= T("results") && t < T("elim")) {
    const k = elastic(prog(t, T("results"), 0.6));
    ctx.save(); ctx.translate(W / 2, 110); ctx.scale(k, k); text("♥ LIKES ♥", 0, 0, 84, "#ff4d6d", INK, 16); ctx.restore();
  }
  if (t >= T("elim") && t < T("launch")) {
    const k = elastic(prog(t, T("elim"), 0.6));
    ctx.save(); ctx.translate(W / 2, 110); ctx.scale(k, k); text("ELIMINATION", 0, 0, 84, "#fff", INK, 16); ctx.restore();
  }
  if (t >= T("challenge") && t < T("go") + 1.5) {
    const k = elastic(prog(t, T("challenge"), 0.6));
    ctx.save(); ctx.translate(W / 2 + 120, 130); ctx.scale(k, k); ctx.rotate(-0.03);
    rr(-470, -70, 940, 140, 24); fillStroke("#fff", 8);
    text("CHALLENGE: most liked project", 0, -18, 44, INK, null); text("in 30 seconds", 0, 32, 34, "#7b61ff", null);
    ctx.restore();
  }
  if (t >= T("comment") && t < S.end + 0.5) {
    const k = elastic(prog(t, T("comment"), 0.7));
    ctx.save(); ctx.translate(W / 2, 110); ctx.scale(k, k);
    text("💬 COMMENT WHAT HAPPENS NEXT", 0, 0, 64, "#fff", INK, 14);
    ctx.restore();
  }
  drawCaption(t);
  wipe(t, S.challenge); wipe(t, S.results); wipe(t, S.outro);

  if (t >= S.end) { // end card
    const k = prog(t, S.end, 0.5);
    ctx.globalAlpha = k; rays(t, "#ffcf1f", "#ffb400"); ctx.globalAlpha = 1;
    logo(W / 2, 380, elastic(prog(t, S.end, 0.9)), t);
    ctx.globalAlpha = k;
    text("Next episode: whatever you comment", W / 2, 620, 54, "#fff", INK, 12);
    text("starring One · XP · Cursor · Duck · (the late) Credit", W / 2, 720, 34, INK, null);
    ctx.globalAlpha = 1;
  }
}

// ---------- player chrome ----------
function overlay(t) {
  if (!started) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(0, 0, W, H);
    const p = 1 + Math.sin(t * 4) * 0.04;
    ctx.save(); ctx.translate(W / 2, H - 200); ctx.scale(p, p);
    ctx.beginPath(); ctx.arc(0, 0, 90, 0, 7); fillStroke("#ff5a1f", 10);
    ctx.beginPath(); ctx.moveTo(-26, -42); ctx.lineTo(46, 0); ctx.lineTo(-26, 42); ctx.closePath(); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.restore();
    text(TL ? "click to watch (sound on!)" : "loading…", W / 2, H - 70, 36, "#fff", INK, 8);
    return;
  }
  if (audio.paused && !audio.ended) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(0, 0, W, H);
    rr(W / 2 - 60, H / 2 - 70, 40, 140, 10); fillStroke("#fff", 6); rr(W / 2 + 20, H / 2 - 70, 40, 140, 10); fillStroke("#fff", 6);
  }
  if (audio.ended) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    text("↻ click to replay", W / 2, H - 80, 40, "#fff", INK, 8);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(0, H - 8, W, 8);
  ctx.fillStyle = "#ff5a1f"; ctx.fillRect(0, H - 8, W * (audio.currentTime / (TL.duration || 1)), 8);
}

cv.addEventListener("click", () => {
  if (!TL) return;
  if (!started || audio.ended) { started = true; audio.currentTime = 0; audio.play(); return; }
  audio.paused ? audio.play() : audio.pause();
});
addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); cv.click(); }
  if (!started) return;
  if (e.code === "ArrowRight") audio.currentTime += 5;
  if (e.code === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 5);
});

const t0 = performance.now();
function frame() {
  const now = (performance.now() - t0) / 1000;
  // ?t=SECONDS freezes a frame (for previews/thumbnails)
  const fixed = new URLSearchParams(location.search).get("t");
  let t;
  if (fixed != null && TL) { t = +fixed; started = true; Object.assign(cam, camTarget(t)); }
  else t = started ? audio.currentTime : Math.min(now, 4.5);
  render(t);
  if (fixed == null) overlay(now);
  requestAnimationFrame(frame);
}
fetch("timeline.json").then((r) => r.json()).then((d) => { TL = d; build(); });
frame();
