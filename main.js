// ══════════════════════════════════════════════════════════
// main.js — App-Einstiegspunkt
// ══════════════════════════════════════════════════════════

import { STORAGE_KEY_ELEVENLABS, STORAGE_KEY_AGENT_ID, STORAGE_KEY_AGENT_HASH } from "./config.js";
import { log, showLog, closeLog, setFilter, clearLog, copyLog }  from "./log.js";
import { startSession, stopSession, charTap, sessionActive }     from "./session.js";
import { setAnim }                                               from "./ui.js";

let keys = { eleven: "" };

function loadKeys() {
  localStorage.removeItem("bibu_openai_key"); // Altlast aus der Whisper+GPT-Version
  try {
    const e = localStorage.getItem(STORAGE_KEY_ELEVENLABS);
    if (e) {
      keys.eleven = atob(e);
      log("INFO", "API Key geladen");
      return true;
    }
  } catch(err) {
    log("ERROR", "Key laden: " + err.message);
  }
  return false;
}

// ── window.* Funktionen ───────────────────────────────────

window.saveKey = function() {
  const elevenInput = document.getElementById("eleven-key-input");
  const err         = document.getElementById("key-err");

  const eVal = elevenInput.value.trim();

  if (!eVal || eVal.length < 10) {
    err.textContent = "ElevenLabs Key eingeben";
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY_ELEVENLABS, btoa(eVal));
    keys.eleven = eVal;
    log("INFO", "API Key gespeichert");
    document.getElementById("overlay").classList.add("hidden");
    setTimeout(initApp, 300);
  } catch(e) {
    err.textContent = "Speichern fehlgeschlagen: " + e.message;
    log("ERROR", "Key speichern: " + e.message);
  }
};

window.showResetConfirm = function() {
  if (!confirm("API Key wirklich loeschen?")) return;
  localStorage.removeItem(STORAGE_KEY_ELEVENLABS);
  localStorage.removeItem(STORAGE_KEY_AGENT_ID);
  localStorage.removeItem(STORAGE_KEY_AGENT_HASH);
  keys = { eleven: "" };
  document.getElementById("eleven-key-input").value = "";
  document.getElementById("key-err").textContent    = "";
  document.getElementById("overlay").classList.remove("hidden");
  log("INFO", "API Key geloescht");
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

  // Log-Viewer: Long-Press (900ms) auf Sleep-Button öffnet Log (versteckt für Papa)
  const sleepBtn = document.getElementById("sleep-btn");
  let pressTimer = null;
  let longPressed = false;
  const startPress = () => {
    longPressed = false;
    pressTimer = setTimeout(() => { longPressed = true; showLog(); }, 900);
  };
  const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
  sleepBtn.addEventListener("touchstart", startPress, { passive: true });
  sleepBtn.addEventListener("touchend",   cancelPress);
  sleepBtn.addEventListener("touchcancel", cancelPress);
  sleepBtn.addEventListener("mousedown",  startPress);
  sleepBtn.addEventListener("mouseup",    cancelPress);
  sleepBtn.addEventListener("mouseleave", cancelPress);
  // Normalen Klick unterdrücken, wenn Long-Press ausgelöst wurde
  sleepBtn.addEventListener("click", (e) => {
    if (longPressed) { e.stopImmediatePropagation(); e.preventDefault(); longPressed = false; }
  }, true);
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

  // Service Worker registrieren (PWA-Installation auf Android)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
      .then(() => log("INFO", "Service Worker registriert"))
      .catch(e => log("ERROR", "Service Worker Fehler: " + e.message));
  }

  if (loadKeys()) {
    document.getElementById("overlay").classList.add("hidden");
    initApp();
  } else {
    log("INFO", "Keine Keys — Setup wird angezeigt");
  }
});
