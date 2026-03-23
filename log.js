// ══════════════════════════════════════════════════════════
// log.js — Persistentes Logging
//
// Alle Ereignisse werden in localStorage gespeichert.
// Papa öffnet den Log mit Doppeltipp auf "Blibu".
//
// Log-Level:
//   INFO  = System-Events (Verbindung, Session, etc.)
//   LUIS  = Was Luis gesagt/getan hat
//   BLIBU = Was Blibu gesagt hat
//   WARN  = Warnungen
//   ERROR = Fehler
// ══════════════════════════════════════════════════════════

import { STORAGE_LOG_KEY, LOG_MAX_ENTRIES } from "./config.js";

// Aktuell aktiver Filter im Log-Viewer
let activeFilter = "ALL";

// Statistik-Zähler
let stats = { sessions: 0, luis: 0, blibu: 0, errors: 0 };

// ── Log lesen/schreiben ───────────────────────────────────

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_LOG_KEY) || "[]");
  } catch(e) {
    return [];
  }
}

function saveEntries(entries) {
  try {
    // Älteste Einträge löschen wenn zu viele
    localStorage.setItem(STORAGE_LOG_KEY, JSON.stringify(entries.slice(-LOG_MAX_ENTRIES)));
  } catch(e) {
    console.warn("Log speichern fehlgeschlagen:", e);
  }
}

// ── Eintrag schreiben ─────────────────────────────────────

export function log(level, message) {
  const now   = new Date();
  const date  = now.toLocaleDateString("de-AT");
  const time  = now.toTimeString().slice(0, 8);
  const entry = { date, time, level, message };

  // Speichern
  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);

  // Statistiken
  if (level === "LUIS")                          stats.luis++;
  else if (level === "BLIBU")                    stats.blibu++;
  else if (level === "ERROR")                    stats.errors++;
  else if (message.includes("Session startet")) stats.sessions++;
  updateStats();

  // Browser-Konsole
  const fn = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.log;
  fn(`[${time}] [${level}] ${message}`);

  // Log-Viewer aktualisieren falls offen
  appendEntry(entry);
}

// ── Log-Viewer ────────────────────────────────────────────

// Einen einzelnen Eintrag ans Ende hängen (schneller als alles neu rendern)
function appendEntry(entry) {
  const body = document.getElementById("log-body");
  if (!body || document.getElementById("log-overlay").classList.contains("hidden")) return;
  const span = document.createElement("span");
  span.className = "log-entry " + entry.level +
    (activeFilter !== "ALL" && entry.level !== activeFilter ? " hidden" : "");
  span.textContent = `[${entry.date} ${entry.time}] [${entry.level}] ${entry.message}\n`;
  body.appendChild(span);
  body.scrollTop = body.scrollHeight;
}

// Gesamten Log neu rendern (nach Filter-Wechsel oder beim Öffnen)
function renderAll() {
  const body = document.getElementById("log-body");
  if (!body) return;
  const entries = loadEntries();
  body.innerHTML = "";

  // Statistiken neu berechnen
  stats = { sessions: 0, luis: 0, blibu: 0, errors: 0 };
  entries.forEach(e => {
    if (e.level === "LUIS")                          stats.luis++;
    else if (e.level === "BLIBU")                    stats.blibu++;
    else if (e.level === "ERROR")                    stats.errors++;
    else if (e.message?.includes("Session startet")) stats.sessions++;

    const span = document.createElement("span");
    span.className = "log-entry " + e.level +
      (activeFilter !== "ALL" && e.level !== activeFilter ? " hidden" : "");
    span.textContent = `[${e.date||""} ${e.time}] [${e.level}] ${e.message}\n`;
    body.appendChild(span);
  });

  updateStats();
  body.scrollTop = body.scrollHeight;
}

function updateStats() {
  const el = document.getElementById("log-stats");
  if (!el) return;
  el.textContent =
    `Sessions: ${stats.sessions}  |  Luis: ${stats.luis} Nachrichten` +
    `  |  Blibu: ${stats.blibu} Nachrichten  |  Fehler: ${stats.errors}`;
}

// ── Öffentliche Funktionen (werden von index.html aufgerufen) ──

export function showLog() {
  document.getElementById("log-overlay").classList.remove("hidden");
  renderAll();
}

export function closeLog() {
  document.getElementById("log-overlay").classList.add("hidden");
}

export function setFilter(level) {
  activeFilter = level;
  document.querySelectorAll(".log-filters button").forEach(btn => {
    btn.classList.toggle("active",
      level === "ALL" ? btn.textContent === "Alle" : btn.textContent.toUpperCase().includes(level)
    );
  });
  document.querySelectorAll(".log-entry").forEach(el => {
    el.classList.toggle("hidden", level !== "ALL" && !el.classList.contains(level));
  });
}

export function clearLog() {
  if (!confirm("Gesamten Log loeschen?")) return;
  localStorage.removeItem(STORAGE_LOG_KEY);
  stats = { sessions: 0, luis: 0, blibu: 0, errors: 0 };
  document.getElementById("log-body").innerHTML = "";
  updateStats();
  log("INFO", "Log geleert");
}

export function copyLog() {
  const entries = loadEntries();
  const text = entries
    .filter(e => activeFilter === "ALL" || e.level === activeFilter)
    .map(e => `[${e.date} ${e.time}] [${e.level}] ${e.message}`)
    .join("\n");
  navigator.clipboard.writeText(text).then(() => log("INFO", "Log kopiert"));
}
