// ══════════════════════════════════════════════════════════
// main.js — App-Einstiegspunkt
// ══════════════════════════════════════════════════════════

import { STORAGE_KEY_OPENAI }                                    from "./config.js";
import { log, showLog, closeLog, setFilter, clearLog, copyLog }  from "./log.js";
import { startSession, stopSession, charTap, sessionActive }     from "./session.js";
import { setAnim }                                               from "./ui.js";

let keys = { openai: "" };

function loadKeys() {
  try {
    const o = localStorage.getItem(STORAGE_KEY_OPENAI);
    if (o) {
      keys.openai = atob(o);
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
  const openaiInput = document.getElementById("openai-key-input");
  const err         = document.getElementById("key-err");

  const oVal = openaiInput.value.trim();

  if (!oVal.startsWith("sk-")) {
    err.textContent = "OpenAI Key muss mit sk- beginnen";
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY_OPENAI, btoa(oVal));
    keys.openai = oVal;
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
  localStorage.removeItem(STORAGE_KEY_OPENAI);
  keys = { openai: "" };
  document.getElementById("openai-key-input").value = "";
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
