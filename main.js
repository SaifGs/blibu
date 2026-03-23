// ══════════════════════════════════════════════════════════
// main.js — App-Einstiegspunkt
//
// Fix: window.* Funktionen werden SOFORT definiert bevor
// das Modul async lädt — so funktionieren onclick Handler
// im HTML immer zuverlässig.
// ══════════════════════════════════════════════════════════

import { STORAGE_KEY }                                          from "./config.js";
import { log, showLog, closeLog, setFilter, clearLog, copyLog } from "./log.js";
import { startSession, stopSession, charTap, sessionActive }    from "./session.js";
import { setStatus }                                            from "./ui.js";

// ── API Key in localStorage ───────────────────────────────
let apiKey = "";

function loadKey() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      apiKey = atob(stored); // base64 dekodieren
      log("INFO", "API Key geladen");
      return true;
    }
  } catch(e) {
    log("ERROR", "Key laden: " + e.message);
  }
  return false;
}

// ── window.* Funktionen ───────────────────────────────────
// Müssen auf window gesetzt werden damit onclick="..." im
// HTML funktioniert. ES Modules sind scoped — ohne window
// sind sie im HTML nicht sichtbar.

window.saveKey = function() {
  const input = document.getElementById("key-input");
  const err   = document.getElementById("key-err");
  const val   = input.value.trim();

  if (!val.startsWith("sk-")) {
    err.textContent = "Gueltigen Key eingeben (beginnt mit sk-)";
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, btoa(val)); // base64 kodiert speichern
    apiKey = val;
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
  localStorage.removeItem(STORAGE_KEY);
  apiKey = "";
  document.getElementById("key-input").value = "";
  document.getElementById("key-err").textContent = "";
  document.getElementById("overlay").classList.remove("hidden");
  log("INFO", "API Key geloescht");
};

window.toggleSession = function() {
  if (sessionActive) {
    stopSession();
    setStatus("Tippen zum Starten");
  } else {
    sessionStorage.setItem("_retry_key", apiKey); // für Auto-Retry
    document.getElementById("mic").classList.add("ready");
    startSession(apiKey);
  }
};

window.charTap = charTap;

// Log-Funktionen
window.showLog   = showLog;
window.closeLog  = closeLog;
window.setFilter = setFilter;
window.clearLog  = clearLog;
window.copyLog   = copyLog;

// ── App starten ───────────────────────────────────────────
function initApp() {
  log("INFO", "Blibu gestartet — " + new Date().toLocaleString("de-AT"));
  document.getElementById("mic").classList.add("ready");
  setStatus("Tippen zum Starten");
}

// Beim Laden: Key prüfen
window.addEventListener("load", () => {
  log("INFO", "Seite geladen");
  if (loadKey()) {
    document.getElementById("overlay").classList.add("hidden");
    initApp();
  } else {
    log("INFO", "Kein Key — Setup wird angezeigt");
  }
});
