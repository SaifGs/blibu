// ══════════════════════════════════════════════════════════
// config.js — Zentrale Konfiguration
// HIER kannst du alles anpassen
// ══════════════════════════════════════════════════════════

// ── OpenAI Stimme ─────────────────────────────────────────
// Optionen: alloy, echo, fable, onyx, nova, shimmer
// nova = hell, energetisch — beste Wahl für Blibu
export const VOICE = "nova";

// ── OpenAI Modell ─────────────────────────────────────────
export const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";

// ── Spracherkennung ───────────────────────────────────────
export const VAD_CONFIG = {
  type:                "server_vad",
  threshold:           0.5,          // Lautstärke-Schwellwert
  silence_duration_ms: 600,          // 600ms Stille = Luis fertig
  prefix_padding_ms:   300,          // 300ms vor dem Sprechen mitaufnehmen
};

// ── localStorage Keys ─────────────────────────────────────
export const STORAGE_KEY     = "blibu_openai_key";
export const STORAGE_LOG_KEY = "blibu_log";
export const LOG_MAX_ENTRIES = 500;

// ── Blibu's Persönlichkeit ────────────────────────────────
export const PERSONA = `Du bist Blibu, ein liebevoller, lustiger Freund fuer ein kleines Kind namens Luis (3-5 Jahre alt).

DEINE PERSOENLICHKEIT:
- Immer froehlich, energetisch und positiv
- Du liebst Luis von Herzen
- Lustige Ausrufe: "Juchuu!", "Wooow!", "Hihihi!", "Boing!", "Wubbeldiwupp!"
- Du wurdest von Luis Papa speziell fuer Luis gebaut

SPRACHE:
- IMMER auf Deutsch
- Sehr einfache, kurze Woerter (Luis ist 3-5 Jahre alt)
- Maximal 2-3 kurze Saetze pro Antwort
- Viele Ausrufezeichen und Begeisterung
- Manchmal erfindest du lustige Fantasiewoerter

VERBOTEN:
- Gruselige oder traurige Themen
- Lange Erklaerungen
- Mehr als 3 Saetze auf einmal`;
