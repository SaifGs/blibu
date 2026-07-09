// ══════════════════════════════════════════════════════════
// session.js — Gesprächs-Engine (ElevenLabs Agents, Live)
//
// Ablauf:
//   1. Agent bei ElevenLabs anlegen/aktualisieren (Persona + Stimme aus config.js)
//   2. Signed URL für den privaten Agent holen
//   3. Live-Session über das ElevenLabs SDK (WebSocket, Speech-to-Speech)
//      — Turn-Taking, Unterbrechungen und Audio macht das SDK
//   4. Transkripte kommen als Events rein (Log + Schlaf-Befehl-Erkennung)
// ══════════════════════════════════════════════════════════

import {
  ELEVENLABS_SDK_URL,
  AGENT_NAME,
  AGENT_LLM,
  AGENT_LANGUAGE,
  FIRST_MESSAGE,
  ELEVENLABS_VOICE_ID,
  ELEVENLABS_MODEL,
  ELEVENLABS_SETTINGS,
  VOICE_THRESHOLD,
  STORAGE_KEY_AGENT_ID,
  STORAGE_KEY_AGENT_HASH,
  PERSONA,
} from "./config.js";
import { log } from "./log.js";
import { startMouthAnim, stopMouthAnim } from "./mouth.js";
import { setAnim, setMicState, showError } from "./ui.js";

// ── State ─────────────────────────────────────────────────
export let sessionActive = false;
export let blibSpeaking  = false;

let elevenKey    = "";
let conversation = null;   // ElevenLabs SDK Session
let stopping     = false;  // stopSession läuft — onDisconnect nicht doppelt behandeln
let volumeTimer  = null;   // Poll für "Luis spricht"-Anzeige
let currentAudio = null;   // eigenes Audio-Element für den Abschieds-Sound (iOS-Unlock)

// ── Agent-Konfiguration ───────────────────────────────────
// Wird bei ElevenLabs hinterlegt. Ändert sich config.js (Persona, Stimme, ...),
// erkennt der Hash das und der Agent wird automatisch aktualisiert.
function agentConfigBody() {
  return {
    name: AGENT_NAME,
    conversation_config: {
      agent: {
        language:      AGENT_LANGUAGE,
        first_message: FIRST_MESSAGE,
        prompt: {
          prompt:      PERSONA,
          llm:         AGENT_LLM,
          temperature: 0.9,
        },
      },
      tts: {
        voice_id:         ELEVENLABS_VOICE_ID,
        model_id:         ELEVENLABS_MODEL,
        stability:        ELEVENLABS_SETTINGS.stability,
        similarity_boost: ELEVENLABS_SETTINGS.similarity_boost,
      },
    },
  };
}

function configHash(body) {
  const s = JSON.stringify(body);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h);
}

async function elApi(path, method, body) {
  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    method,
    headers: {
      "xi-api-key": elevenKey,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.detail?.message || err.detail?.[0]?.msg || JSON.stringify(err.detail || err);
    throw new Error(`ElevenLabs ${method} ${path}: ${res.status} — ${msg}`);
  }
  return res.json();
}

// ── Agent anlegen oder aktualisieren ──────────────────────
async function ensureAgent() {
  const body = agentConfigBody();
  const hash = configHash(body);

  let agentId = localStorage.getItem(STORAGE_KEY_AGENT_ID);

  if (agentId && localStorage.getItem(STORAGE_KEY_AGENT_HASH) === hash) {
    return agentId; // unverändert
  }

  if (agentId) {
    log("INFO", "Agent-Konfiguration geändert — aktualisiere Agent...");
    try {
      await elApi(`/v1/convai/agents/${agentId}`, "PATCH", body);
      localStorage.setItem(STORAGE_KEY_AGENT_HASH, hash);
      return agentId;
    } catch (e) {
      // Agent existiert nicht mehr (z.B. im Dashboard gelöscht) → neu anlegen
      log("WARN", "Agent-Update fehlgeschlagen, lege neu an: " + e.message);
    }
  }

  log("INFO", "Lege Bibu-Agent bei ElevenLabs an...");
  const data = await elApi("/v1/convai/agents/create", "POST", body);
  agentId = data.agent_id;
  localStorage.setItem(STORAGE_KEY_AGENT_ID, agentId);
  localStorage.setItem(STORAGE_KEY_AGENT_HASH, hash);
  log("INFO", "Agent angelegt: " + agentId);
  return agentId;
}

async function getSignedUrl(agentId) {
  const data = await elApi(`/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, "GET");
  return data.signed_url;
}

// ── Session starten ───────────────────────────────────────
export async function startSession(keys) {
  if (sessionActive) return;

  elevenKey = keys.eleven;
  stopping  = false;

  log("INFO", "Session startet (ElevenLabs Agent, live)...");
  setAnim("thinking");

  // Mikrofon früh anfragen: klare Fehlermeldung + iOS braucht die User-Geste
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach(t => t.stop()); // SDK holt sich das Mikro selbst
    log("INFO", "Mikrofon aktiv");
  } catch (e) {
    log("ERROR", "Mikrofon verweigert: " + e.message);
    setAnim("");
    return;
  }

  // iOS: Audio-Element innerhalb der User-Geste entsperren (für den Abschieds-Sound)
  currentAudio = new Audio();
  currentAudio.play().catch(() => {});
  currentAudio.pause();

  try {
    const agentId   = await ensureAgent();
    const signedUrl = await getSignedUrl(agentId);

    const { Conversation } = await import(ELEVENLABS_SDK_URL);

    conversation = await Conversation.startSession({
      signedUrl,
      connectionType: "websocket",

      onConnect: () => {
        log("INFO", "Live-Verbindung steht");
        setAnim("");
        setMicState("connected");
      },

      onDisconnect: () => {
        if (stopping) return; // gewolltes Ende über stopSession
        log("WARN", "Verbindung getrennt");
        if (sessionActive) cleanupSession();
      },

      onError: (message) => {
        log("ERROR", "Live-Fehler: " + message);
        showError("Uups, ich war kurz abgelenkt!");
      },

      // Transkripte: source ist "user" oder "ai"
      onMessage: ({ message, source }) => {
        if (source === "user") {
          log("LUIS", `"${message}"`);
          if (isSleepCommand(message)) {
            log("INFO", "Schlaf-Befehl erkannt — Session wird beendet");
            stopSession();
          }
        } else {
          log("BLIBU", `"${message}"`);
        }
      },

      // mode: "speaking" (Bibu redet) oder "listening" (Bibu hört zu)
      onModeChange: ({ mode }) => {
        if (stopping) return;
        blibSpeaking = mode === "speaking";
        if (blibSpeaking) {
          setMicState("blibu-talking");
          startMouthAnim();
          setAnim("");
        } else {
          stopMouthAnim();
          setMicState("connected");
        }
      },
    });

    sessionActive = true;
    startVolumeWatch();

  } catch (err) {
    conversation = null;
    setAnim("");
    setMicState("idle");
    if (!navigator.onLine || err instanceof TypeError) {
      log("ERROR", "Keine Internetverbindung");
      showError("Keine Internetverbindung");
    } else {
      log("ERROR", "Session-Start fehlgeschlagen: " + err.message);
      showError("Uups, das hat nicht geklappt!");
    }
  }
}

// ── "Luis spricht"-Anzeige ────────────────────────────────
// Das SDK meldet nur ob Bibu spricht/zuhört. Ob Luis gerade redet,
// lesen wir aus der Mikro-Lautstärke.
function startVolumeWatch() {
  stopVolumeWatch();
  let userTalking = false;

  volumeTimer = setInterval(() => {
    if (!sessionActive || !conversation || blibSpeaking) {
      if (userTalking) { userTalking = false; }
      return;
    }
    let vol = 0;
    try { vol = conversation.getInputVolume() || 0; } catch (e) { /* noch nicht bereit */ }

    const talking = vol > VOICE_THRESHOLD;
    if (talking !== userTalking) {
      userTalking = talking;
      setMicState(talking ? "user-talking" : "connected");
      setAnim(talking ? "listening" : "");
    }
  }, 150);
}

function stopVolumeWatch() {
  if (volumeTimer) { clearInterval(volumeTimer); volumeTimer = null; }
}

// ── Schlaf-Erkennung ──────────────────────────────────────
const SLEEP_TRIGGERS = [
  "geh schlafen", "gehe schlafen", "geh jetzt schlafen",
  "gute nacht", "schlaf jetzt", "schlafe jetzt",
  "tschüss bibu", "tschuess bibu", "auf wiedersehen",
  "bis morgen", "mach's gut", "machs gut",
];

function isSleepCommand(text) {
  const t = text.toLowerCase().trim();
  return SLEEP_TRIGGERS.some(trigger => t.includes(trigger));
}

// ── ElevenLabs TTS (nur noch für den fixen Abschied) ──────
async function speakWithElevenLabs(text) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key":   elevenKey,
      },
      body: JSON.stringify({
        text,
        model_id:       ELEVENLABS_MODEL,
        voice_settings: ELEVENLABS_SETTINGS,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`ElevenLabs Fehler: ${res.status} — ${err.detail?.message || ""}`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function playAudio(url) {
  return new Promise((resolve) => {
    if (!currentAudio) { URL.revokeObjectURL(url); resolve(); return; }

    const done = () => { URL.revokeObjectURL(url); resolve(); };

    currentAudio.pause();
    currentAudio.src = url;
    currentAudio.load(); // iOS: src-Wechsel braucht explizites load() vor play()
    currentAudio.onended = done;
    currentAudio.onerror = (e) => { log("ERROR", "Audio Ladefehler: " + (e.message || JSON.stringify(e))); done(); };
    currentAudio.play().catch((err) => {
      log("ERROR", "Audio play() fehlgeschlagen: " + err.message);
      done();
    });
  });
}

// ── Aufräumen (ohne Abschied) ─────────────────────────────
function cleanupSession() {
  sessionActive = false;
  blibSpeaking  = false;
  stopVolumeWatch();
  stopMouthAnim();
  conversation = null;
  setAnim("schlaf");
  setMicState("idle");
}

// ── Session beenden ───────────────────────────────────────
export async function stopSession() {
  if (!sessionActive || stopping) return;
  stopping = true;
  log("INFO", "Session wird beendet");

  sessionActive = false;
  stopVolumeWatch();

  if (conversation) {
    try { await conversation.endSession(); } catch (e) { /* Verbindung ggf. schon weg */ }
    conversation = null;
  }

  // Fixer Abschied — deterministisch, kein Agent
  blibSpeaking = true;
  try {
    const audioUrl = await speakWithElevenLabs("OK, ich gehe schlafen. Tschüss Luis!");
    log("BLIBU", '"OK, ich gehe schlafen. Tschüss Luis!"');
    setMicState("blibu-talking");
    startMouthAnim();
    setAnim("");
    await playAudio(audioUrl);
  } catch (e) {
    log("ERROR", "Abschied fehlgeschlagen: " + e.message);
  }

  blibSpeaking = false;
  stopMouthAnim();
  if (currentAudio) { currentAudio.onended = null; currentAudio.onerror = null; currentAudio.pause(); currentAudio = null; }

  setAnim("schlaf");
  setMicState("idle");
  stopping = false;

  log("INFO", "Session beendet");
}

// ── Akrobatik bei Antippen ────────────────────────────────
const ACROS = ['acro-sprung', 'acro-purzelbaum', 'acro-radschlag', 'acro-stern'];
let acroPlaying = false;

export function charTap() {
  if (blibSpeaking || acroPlaying) return;

  const anim = ACROS[Math.floor(Math.random() * ACROS.length)];
  acroPlaying = true;
  setAnim(anim);

  setTimeout(() => {
    acroPlaying = false;
    if (sessionActive && conversation) {
      setAnim('');
      log("LUIS", "Luis hat Bibu angetippt");
      try { conversation.sendUserMessage("Luis hat dich gerade gekitzelt!"); }
      catch (e) { log("ERROR", "Kitzel-Nachricht fehlgeschlagen: " + e.message); }
    } else {
      setAnim('schlaf');
    }
  }, 950);
}
