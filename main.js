// ══════════════════════════════════════════════════════════
// main.js — App-Einstiegspunkt
// ══════════════════════════════════════════════════════════

import { STORAGE_KEY_OPENAI, STORAGE_KEY_ELEVENLABS }           from "./config.js";
import { log, showLog, closeLog, setFilter, clearLog, copyLog }  from "./log.js";
import { startSession, stopSession, charTap, sessionActive }     from "./session.js";
import { setAnim }                                               from "./ui.js";

let keys = { openai: "", eleven: "" };

function loadKeys() {
  try {
    const o = localStorage.getItem(STORAGE_KEY_OPENAI);
    const e = localStorage.getItem(STORAGE_KEY_ELEVENLABS);
    if (o && e) {
      keys.openai = atob(o);
      keys.eleven = atob(e);
      log("INFO", "API Keys geladen");
      return true;
    }
  } catch(err) {
    log("ERROR", "Keys laden: " + err.message);
  }
  return false;
}

// ── window.* Funktionen ───────────────────────────────────

window.saveKey = function() {
  const openaiInput = document.getElementById("openai-key-input");
  const elevenInput = document.getElementById("eleven-key-input");
  const err         = document.getElementById("key-err");

  const oVal = openaiInput.value.trim();
  const eVal = elevenInput.value.trim();

  if (!oVal.startsWith("sk-")) {
    err.textContent = "OpenAI Key muss mit sk- beginnen";
    return;
  }
  if (!eVal || eVal.length < 10) {
    err.textContent = "ElevenLabs Key eingeben";
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY_OPENAI,     btoa(oVal));
    localStorage.setItem(STORAGE_KEY_ELEVENLABS, btoa(eVal));
    keys.openai = oVal;
    keys.eleven = eVal;
    log("INFO", "API Keys gespeichert");
    document.getElementById("overlay").classList.add("hidden");
    setTimeout(initApp, 300);
  } catch(e) {
    err.textContent = "Speichern fehlgeschlagen: " + e.message;
    log("ERROR", "Keys speichern: " + e.message);
  }
};

window.showResetConfirm = function() {
  if (!confirm("API Keys wirklich loeschen?")) return;
  localStorage.removeItem(STORAGE_KEY_OPENAI);
  localStorage.removeItem(STORAGE_KEY_ELEVENLABS);
  keys = { openai: "", eleven: "" };
  document.getElementById("openai-key-input").value = "";
  document.getElementById("eleven-key-input").value = "";
  document.getElementById("key-err").textContent    = "";
  document.getElementById("overlay").classList.remove("hidden");
  log("INFO", "API Keys geloescht");
};

window.toggleSession = function() {
  if (sessionActive) {
    stopSession();
  } else {
    startSession(keys);
  }
};

window.charTap = charTap;
window.showLog   = showLog;
window.closeLog  = closeLog;
window.setFilter = setFilter;
window.clearLog  = clearLog;
window.copyLog   = copyLog;

function initApp() {
  log("INFO", "Bibu gestartet — " + new Date().toLocaleString("de-AT"));
  setAnim("schlaf");
}

// ── Vollbild ──────────────────────────────────────────────
function enterFullscreen() {
  const el = document.documentElement;
  if      (el.requestFullscreen)       el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

// Beim ersten Tippen Vollbild aktivieren
document.addEventListener("touchstart", enterFullscreen, { once: true });
document.addEventListener("click",      enterFullscreen, { once: true });

// Wenn jemand Vollbild verlässt → sofort wieder rein
document.addEventListener("fullscreenchange",       () => { if (!document.fullscreenElement)       setTimeout(enterFullscreen, 400); });
document.addEventListener("webkitfullscreenchange", () => { if (!document.webkitFullscreenElement) setTimeout(enterFullscreen, 400); });

window.addEventListener("load", () => {
  log("INFO", "Seite geladen");
  if (loadKeys()) {
    document.getElementById("overlay").classList.add("hidden");
    initApp();
  } else {
    log("INFO", "Keine Keys — Setup wird angezeigt");
  }
});
