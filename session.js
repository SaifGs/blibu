// session.js — OpenAI Realtime API using Agents SDK
// Cleaned & modernized version — March 2026

import { REALTIME_MODEL, VAD_CONFIG, PERSONA, VOICE } from "./config.js";
import { log } from "./log.js";
import { startMouthAnim, stopMouthAnim } from "./mouth.js";
import { setAnim, setMicState, setStatus } from "./ui.js";

// ── SDK imports ──────────────────────────────────────────────
import {
  RealtimeAgent,
  RealtimeSession,
  OpenAIRealtimeWebRTC,
} from "@openai/agents/realtime";

let session = null;
let transport = null;
let agent = null;

export let sessionActive = false;
export let blibSpeaking = false;

// ── Start session ────────────────────────────────────────────
export async function startSession(apiKey) {
  if (sessionActive) return;
  log("INFO", "Session startet (Agents SDK)...");
  setStatus("Verbinde...");
  setAnim("thinking");

  try {
    // 1. Get ephemeral token (same as before)
    const tokenRes = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: REALTIME_MODEL,
        voice: VOICE,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(`Ephemeral token failed: ${tokenRes.status} — ${err.error?.message || ""}`);
    }

    const { client_secret } = await tokenRes.json();
    const ephemeralKey = client_secret.value;
    log("INFO", "Ephemeral Token OK");

    // 2. Get microphone stream
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    log("INFO", "Mikrofon aktiv");

    // 3. Create WebRTC transport
    transport = new OpenAIRealtimeWebRTC({
      mediaStream: audioStream,
      // Optional: you can pass an existing <audio> element if you want more control
      // audioElement: document.querySelector('audio') or create one
    });

    // 4. Create agent with your persona
    agent = new RealtimeAgent({
      name: "Blibu",
      instructions: PERSONA,
      model: REALTIME_MODEL,
      voice: VOICE,
      turn_detection: VAD_CONFIG,
      modalities: ["text", "audio"],
      input_audio_transcription: { model: "whisper-1" },
    });

    // 5. Create and connect session
    session = new RealtimeSession({
      agent,
      transport,
    });

    await session.connect({ apiKey: ephemeralKey });
    log("INFO", "RealtimeSession verbunden");

    sessionActive = true;
    setMicState("connected");
    setStatus("");
    setAnim("");

    // 6. Auto-greeting (cleaner than before)
    await session.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Hallo Blibu! Bitte begrüße Luis jetzt!" }],
      },
    });
    await session.createResponse();
    log("INFO", "Begrüßung ausgelöst");

    // ── Event listeners ──────────────────────────────────────
    setupEventListeners();

  } catch (err) {
    log("ERROR", "Session Fehler: " + err.message);
    setStatus("Fehler — nochmal tippen");
    setAnim("");
    stopSession();
  }
}

// ── Event mapping to your UI ────────────────────────────────
function setupEventListeners() {
  if (!session) return;

  session.on("input_audio_buffer.speech_started", () => {
    log("LUIS", "Luis spricht...");
    setAnim("listening");
    setMicState("user-talking");
    setStatus("Luis spricht...");
    if (blibSpeaking) {
      stopMouthAnim();
      blibSpeaking = false;
    }
  });

  session.on("input_audio_buffer.speech_stopped", () => {
    log("LUIS", "Luis fertig");
    setAnim("thinking");
    setMicState("connected");
    setStatus("Blibu denkt...");
  });

  session.on("conversation.item.input_audio_transcription.completed", (ev) => {
    if (ev.transcript?.trim()) {
      log("LUIS", `"${ev.transcript.trim()}"`);
    }
  });

  session.on("response.audio.delta", () => {
    if (!blibSpeaking) {
      blibSpeaking = true;
      startMouthAnim();
      setAnim("");
      setMicState("blibu-talking");
      setStatus("");
      log("BLIBU", "Blibu spricht...");
    }
  });

  session.on("response.audio_transcript.done", (ev) => {
    if (ev.transcript?.trim()) {
      log("BLIBU", `"${ev.transcript.trim()}"`);
    }
  });

  session.on("response.audio.done", () => {
    stopMouthAnim();
    blibSpeaking = false;
    setAnim("happy");
    setMicState("connected");
    setTimeout(() => setAnim(""), 900);
    log("BLIBU", "Fertig");
  });

  session.on("error", (err) => {
    log("ERROR", "SDK Fehler: " + (err.message || JSON.stringify(err)));
    setStatus("Fehler — nochmal tippen");
    stopSession();
  });

  // Optional: more events you might want
  // session.on("session.created", (ev) => log("INFO", "Session ID: " + ev.session?.id));
}

// ── Stop session ─────────────────────────────────────────────
export function stopSession() {
  log("INFO", "Session wird beendet");

  sessionActive = false;
  blibSpeaking = false;
  stopMouthAnim();

  if (session) {
    session.disconnect().catch((e) => log("WARN", "Disconnect fehlgeschlagen: " + e));
    session = null;
  }

  if (transport) {
    transport.close();
    transport = null;
  }

  if (agent) agent = null;

  setAnim("");
  setMicState("idle");
  setStatus("Tippen zum Starten");

  log("INFO", "Session beendet");
}

// ── Char tap (poke Blibu) ────────────────────────────────────
export function charTap() {
  if (!sessionActive || !session || blibSpeaking) return;

  log("LUIS", "Luis hat Blibu angetippt");

  session.send({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Luis hat Blibu gekitzelt!" }],
    },
  }).then(() => {
    session.createResponse();
  }).catch((e) => {
    log("WARN", "charTap fehlgeschlagen: " + e);
  });
}