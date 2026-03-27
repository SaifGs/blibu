// ══════════════════════════════════════════════════════════
// ui.js — Benutzeroberfläche
// ══════════════════════════════════════════════════════════

const app       = document.getElementById("app");
const bsvg      = document.getElementById("bsvg");
const sleepBtn  = document.getElementById("sleep-btn");
const sleepIcon = document.getElementById("sleep-icon");
const talkPill  = document.getElementById("talk-pill");
const charRings = document.getElementById("char-rings");
const zzzWrap   = document.getElementById("zzz-wrap");
const pl        = document.getElementById("pl");
const pr        = document.getElementById("pr");

const ICON_BED = `<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>`;


// ── Sterne generieren ─────────────────────────────────────
(function generateStars() {
  const container = document.getElementById("night-stars");
  for (let i = 0; i < 120; i++) {
    const s    = document.createElement("div");
    const bright = Math.random() < 0.15;
    s.className = bright ? "night-star bright" : "night-star";
    s.style.left   = Math.random() * 100 + "%";
    s.style.top    = Math.random() * 90  + "%";
    const size = bright ? (Math.random() * 1.5 + 2) : (Math.random() * 1.8 + 0.5);
    s.style.width  = size + "px";
    s.style.height = size + "px";
    s.style.animationDelay    = (Math.random() * 5).toFixed(2) + "s";
    s.style.animationDuration = (Math.random() * 3 + 2).toFixed(2) + "s";
    container.appendChild(s);
  }
})();

// ── Körper-Animationen ────────────────────────────────────
export function setAnim(state) {
  bsvg.setAttribute("class", "bsvg " + (state || ""));
  zzzWrap.classList.toggle("show", state === "schlaf");
  app.classList.toggle("night", state === "schlaf");
}

// ── Gesprächs-Zustand ─────────────────────────────────────
// idle          — keine Session
// connected     — wartet auf Luis
// user-talking  — Luis spricht
// blibu-talking — Blibu antwortet
export function setMicState(state) {
  charRings.classList.toggle("show", state === "user-talking");

  talkPill.className = "talk-pill";
  talkPill.textContent = "";
  if (state === "connected") {
    talkPill.className = "talk-pill connected";
    talkPill.textContent = "Luis spricht";
  } else if (state === "user-talking") {
    talkPill.className = "talk-pill luis";
    talkPill.textContent = "Luis spricht...";
  } else if (state === "blibu-talking") {
    talkPill.className = "talk-pill blibu";
    talkPill.textContent = "Blibu antwortet...";
  }

  sleepIcon.innerHTML = ICON_BED;
  if (state === "idle") {
    sleepBtn.style.background = "#1D9E75";
    sleepBtn.style.boxShadow  = "0 6px 28px rgba(29,158,117,.45)";
  } else {
    sleepBtn.style.background = "#085041";
    sleepBtn.style.boxShadow  = "0 6px 28px rgba(8,80,65,.5)";
  }
}

export function setStatus(_text) {}

// ── Fehlermeldung kurz anzeigen ───────────────────────────
let errorTimer = null;
export function showError(msg) {
  if (errorTimer) clearTimeout(errorTimer);
  talkPill.className   = "talk-pill error";
  talkPill.textContent = msg;
  errorTimer = setTimeout(() => {
    talkPill.className   = "talk-pill";
    talkPill.textContent = "";
    errorTimer = null;
  }, 4000);
}

// ── Augen folgen Finger/Maus ──────────────────────────────
function moveEyes(clientX, clientY) {
  const r  = document.getElementById("char").getBoundingClientRect();
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const dx = (clientX - (r.left + r.width  / 2)) / (r.width  * 0.8);
  const dy = (clientY - (r.top  + r.height / 2)) / (r.height * 0.8);
  pl.setAttribute("cx", 81  + cl(dx * 4, -4, 4));
  pl.setAttribute("cy", 72  + cl(dy * 3, -3, 3));
  pr.setAttribute("cx", 123 + cl(dx * 4, -4, 4));
  pr.setAttribute("cy", 72  + cl(dy * 3, -3, 3));
}

document.addEventListener("mousemove", e => moveEyes(e.clientX, e.clientY));
document.addEventListener("touchmove", e => {
  moveEyes(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
