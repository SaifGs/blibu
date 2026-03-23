// ══════════════════════════════════════════════════════════
// mouth.js — Mund-Animation
//
// Blibu hat 5 Mund-Formen die reihum gewechselt werden
// während er spricht — sieht realistischer aus als nur auf/zu.
//
// Jede Form besteht aus:
// - OberLippe (SVG path)
// - UnterLippe (SVG path)
// - Mundinneres (SVG path)
// - Zähne-Sichtbarkeit (0-1)
// - Zungen-Sichtbarkeit (0-1)
// ══════════════════════════════════════════════════════════

// SVG-Elemente (werden beim ersten Aufruf gecacht)
let lipTop, lipBot, mInner, teethTop, tongue;

function initElements() {
  if (lipTop) return; // bereits initialisiert
  lipTop   = document.getElementById("lip-top");
  lipBot   = document.getElementById("lip-bot");
  mInner   = document.getElementById("mouth-inner");
  teethTop = document.getElementById("teeth-top");
  tongue   = document.getElementById("tongue");
}

// ── Mund-Formen ───────────────────────────────────────────
// [OberLippe, UnterLippe, Innen, ZähneOpacity, ZungeOpacity]
const SHAPES = [
  ["M 80 101 Q 100 98 120 101",  "M 80 101 Q 100 104 120 101", "M 82 101 Q 100 101 118 101", 0,    0   ], // geschlossen
  ["M 83 100 Q 100 97 117 100",  "M 83 100 Q 100 107 117 100", "M 85 100 Q 100 104 115 100", 0.4,  0   ], // klein offen
  ["M 82 99 Q 100 95 118 99",    "M 82 99 Q 100 111 118 99",   "M 84 99 Q 100 106 116 99",   0.7,  0.3 ], // mittel
  ["M 80 98 Q 100 93 120 98",    "M 80 98 Q 100 115 120 98",   "M 82 98 Q 100 108 118 98",   0.9,  0.7 ], // weit offen
  ["M 86 98 Q 100 94 114 98",    "M 86 98 Q 100 116 114 98",   "M 88 98 Q 100 108 112 98",   0.85, 0.8 ], // "Oh!"-Form
];

// Reihenfolge der Formen — natürlich wirkende Bewegung
const SEQUENCE = [0, 1, 2, 3, 2, 4, 2, 1, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 0];

let animInterval = null;
let seqIndex     = 0;

// ── Eine Mund-Form setzen ─────────────────────────────────
function setShape(lt, lb, inn, tO, tonO) {
  initElements();
  lipTop.setAttribute("d", lt);
  lipBot.setAttribute("d", lb);
  mInner.setAttribute("d", inn);
  teethTop.style.opacity = tO;
  tongue.style.opacity   = tonO;
}

// ── Animation starten ─────────────────────────────────────
export function startMouthAnim() {
  stopMouthAnim();
  seqIndex = 0;
  // Alle 105ms nächste Mund-Form anzeigen
  animInterval = setInterval(() => {
    setShape(...SHAPES[SEQUENCE[seqIndex % SEQUENCE.length]]);
    seqIndex++;
  }, 105);
}

// ── Animation stoppen → Mund schließen ───────────────────
export function stopMouthAnim() {
  if (animInterval) { clearInterval(animInterval); animInterval = null; }
  setShape(...SHAPES[0]); // geschlossen
  seqIndex = 0;
}
