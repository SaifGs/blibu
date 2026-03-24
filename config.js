// ══════════════════════════════════════════════════════════
// config.js — Zentrale Konfiguration
// ══════════════════════════════════════════════════════════

// ── OpenAI ────────────────────────────────────────────────
export const OPENAI_STT_MODEL = "whisper-1";      // Spracherkennung (sehr gut für Kinder)
export const OPENAI_LLM_MODEL = "gpt-4o-mini";   // Günstig & schnell & smart

// ── ElevenLabs Stimme ──────────────────────────────────────
// Auf https://elevenlabs.io/voice-library nach "child" suchen
// Voice-ID aus der URL kopieren und hier eintragen
export const ELEVENLABS_VOICE_ID = "pFZP5JQG7iQjIQuC4Bku"; // Lily — hell & kindlich
export const ELEVENLABS_MODEL    = "eleven_multilingual_v2"; // Beste Qualität für Deutsch
export const ELEVENLABS_SETTINGS = {
  stability:         0.55,
  similarity_boost:  0.75,
  style:             0.3,
  use_speaker_boost: true,
};

// ── Aufnahme-Einstellungen ─────────────────────────────────
export const SILENCE_TIMEOUT_MS = 1800;   // ms Stille bis Aufnahme endet
export const SILENCE_THRESHOLD  = 0.015;  // Lautstärke-Schwelle (0–1)
export const MIN_RECORD_MS      = 400;    // Mindest-Aufnahmedauer

// ── localStorage Keys ─────────────────────────────────────
export const STORAGE_KEY_OPENAI     = "blibu_openai_key";
export const STORAGE_KEY_ELEVENLABS = "blibu_elevenlabs_key";
export const STORAGE_LOG_KEY        = "blibu_log";
export const LOG_MAX_ENTRIES        = 500;

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
