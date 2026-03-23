// ══════════════════════════════════════════════════════════
// ui.js — Benutzeroberfläche
//
// Kümmert sich um:
// - Blibu's Körper-Animationen (bobbing, wiggle, thinking...)
// - Augen die dem Finger/Maus folgen
// - Mic-Button Farben & Status-Text
// - Listening-Ringe
// ══════════════════════════════════════════════════════════

// ── Elemente ──────────────────────────────────────────────
const bsvg    = document.getElementById("bsvg");
const micBtn  = document.getElementById("mic");
const micSt   = document.getElementById("mic-status");
const rings   = document.getElementById("rings");
const pl      = document.getElementById("pl");  // linke Pupille
const pr      = document.getElementById("pr");  // rechte Pupille

// ── Körper-Animationen ────────────────────────────────────
// CSS-Klassen steuern die Animationen (definiert in index.html)
// Mögliche States: "" | "happy" | "thinking" | "listening"
export function setAnim(state) {
  bsvg.setAttribute("class", "bsvg " + (state || ""));
}

// ── Mic-Button Farben ─────────────────────────────────────
// connected    = grün  — verbunden, wartet auf Luis
// user-talking = rot   — Luis spricht gerade
// blibu-talking= orange— Blibu antwortet gerade
// idle         = grau  — nicht verbunden
export function setMicState(state) {
  micBtn.className = "mic ready " + state;
  // Ringe nur anzeigen wenn Luis spricht
  rings.classList.toggle("show", state === "user-talking");
}

// ── Status-Text unter dem Mic-Button ─────────────────────
export function setStatus(text) {
  micSt.textContent = text;
}

// ── Augen folgen Finger/Maus ──────────────────────────────
// Berechnet wohin der Finger zeigt relativ zu Blibu's Mitte
// und bewegt die Pupillen entsprechend (max ±4px horizontal, ±3px vertikal)
function moveEyes(clientX, clientY) {
  const r  = document.getElementById("char").getBoundingClientRect();
  const cl = (v, a, b) => Math.max(a, Math.min(b, v)); // clamp
  const dx = (clientX - (r.left + r.width  / 2)) / (r.width  * 0.8);
  const dy = (clientY - (r.top  + r.height / 2)) / (r.height * 0.8);
  pl.setAttribute("cx", 81  + cl(dx * 4, -4, 4));
  pl.setAttribute("cy", 72  + cl(dy * 3, -3, 3));
  pr.setAttribute("cx", 123 + cl(dx * 4, -4, 4));
  pr.setAttribute("cy", 72  + cl(dy * 3, -3, 3));
}

// Augen-Tracking für Maus und Touch aktivieren
document.addEventListener("mousemove", e => moveEyes(e.clientX, e.clientY));
document.addEventListener("touchmove", e => {
  moveEyes(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
