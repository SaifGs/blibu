// ══════════════════════════════════════════════════════════
// session.js — OpenAI Realtime API (WebRTC)
//
// Verwaltet die komplette Verbindung zu OpenAI:
//   STT (Whisper) + LLM (GPT-4o) + TTS (nova Stimme)
//   Alles in einer WebRTC Verbindung — echte Echtzeit
// ══════════════════════════════════════════════════════════

import { REALTIME_MODEL, VAD_CONFIG, PERSONA, VOICE } from "./config.js";
import { log }                                         from "./log.js";
import { startMouthAnim, stopMouthAnim }               from "./mouth.js";
import { setAnim, setMicState, setStatus }             from "./ui.js";

let peerConn    = null;
let dataChan    = null;
let audioStream = null;

export let sessionActive = false;
export let blibSpeaking  = false;

// ── Session starten ───────────────────────────────────────
export async function startSession(apiKey) {
  if (sessionActive) return;
  log("INFO", "Session startet...");
  setStatus("Verbinde...");
  setAnim("thinking");

  try {
    // Schritt 1: Ephemeral Token holen
    const tr = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ model: REALTIME_MODEL, voice: VOICE }),
    });
    if (!tr.ok) {
      const d = await tr.json().catch(() => ({}));
      throw new Error(`Token ${tr.status}: ${d.error?.message || ""}`);
    }
    const ephKey = (await tr.json()).client_secret.value;
    log("INFO", "Ephemeral Token OK");

    // Schritt 2: WebRTC PeerConnection
    peerConn = new RTCPeerConnection();

    // Schritt 3: Audio-Ausgang (Blibu's Stimme)
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    peerConn.ontrack = e => {
      audioEl.srcObject = e.streams[0];
      log("INFO", "Audio-Track empfangen");
    };

    // Schritt 4: Mikrofon
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    peerConn.addTrack(audioStream.getTracks()[0]);
    log("INFO", "Mikrofon aktiv");

    // Schritt 5: DataChannel für Events
    dataChan = peerConn.createDataChannel("oai-events");
    dataChan.onopen    = onOpen;
    dataChan.onmessage = onMessage;

    // Schritt 6: SDP Handshake
    const offer = await peerConn.createOffer();
    await peerConn.setLocalDescription(offer);
    const sr = await fetch(
      `https://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${ephKey}`, "Content-Type": "application/sdp" },
        body: offer.sdp,
      }
    );
    if (!sr.ok) throw new Error(`SDP ${sr.status}`);
    await peerConn.setRemoteDescription({ type: "answer", sdp: await sr.text() });

    sessionActive = true;
    log("INFO", "WebRTC verbunden");

  } catch(err) {
    log("ERROR", "Session Fehler: " + err.message);
    setStatus("Fehler — nochmal tippen");
    setAnim("");
    stopSession();
  }
}

// ── DataChannel offen → Session konfigurieren ────────────
function onOpen() {
  log("INFO", "DataChannel offen");
  setStatus("");
  setAnim("");
  setMicState("connected");
  document.getElementById("mic").classList.add("ready");

  dataChan.send(JSON.stringify({
    type: "session.update",
    session: {
      instructions:              PERSONA,
      voice:                     VOICE,
      modalities:                ["text", "audio"],
      input_audio_transcription: { model: "whisper-1" },
      turn_detection:            VAD_CONFIG,
    },
  }));

  // Begrüßung auslösen
  setTimeout(() => {
    if (!dataChan || dataChan.readyState !== "open") {
      log("WARN", "DataChannel geschlossen — Begruessung abgebrochen");
      return;
    }
    dataChan.send(JSON.stringify({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: "Bitte begrüsse Luis jetzt!" }] },
    }));
    dataChan.send(JSON.stringify({ type: "response.create" }));
    log("INFO", "Begruessung ausgeloest");
  }, 500);
}

// ── OpenAI Events ─────────────────────────────────────────
function onMessage(e) {
  let ev;
  try { ev = JSON.parse(e.data); } catch { return; }

  switch(ev.type) {

    case "input_audio_buffer.speech_started":
      log("LUIS", "Luis spricht...");
      setAnim("listening"); setMicState("user-talking"); setStatus("Luis spricht...");
      if (blibSpeaking) { stopMouthAnim(); blibSpeaking = false; }
      break;

    case "input_audio_buffer.speech_stopped":
      log("LUIS", "Luis fertig");
      setAnim("thinking"); setMicState("connected"); setStatus("Blibu denkt...");
      break;

    case "conversation.item.input_audio_transcription.completed":
      if (ev.transcript) log("LUIS", `"${ev.transcript.trim()}"`);
      break;

    case "response.audio.delta":
      if (!blibSpeaking) {
        blibSpeaking = true;
        startMouthAnim();
        setAnim(""); setMicState("blibu-talking"); setStatus("");
        log("BLIBU", "Blibu spricht...");
      }
      break;

    case "response.audio_transcript.done":
      if (ev.transcript) log("BLIBU", `"${ev.transcript.trim()}"`);
      break;

    case "response.audio.done":
      stopMouthAnim(); blibSpeaking = false;
      setAnim("happy"); setMicState("connected");
      setTimeout(() => setAnim(""), 900);
      log("BLIBU", "Fertig");
      break;

    case "session.created":
      log("INFO", "Session ID: " + (ev.session?.id || ""));
      break;

    case "error":
      log("ERROR", "OpenAI: " + JSON.stringify(ev.error));
      if (ev.error?.type === "server_error") {
        log("WARN", "Server-Fehler — versuche in 3 Sekunden neu...");
        setStatus("Verbindungsfehler — versuche neu...");
        const savedKey = sessionStorage.getItem("_retry_key");
        stopSession();
        if (savedKey) setTimeout(() => { log("INFO", "Auto-Retry..."); startSession(savedKey); }, 3000);
      } else {
        setStatus("Fehler — nochmal tippen");
        stopSession();
      }
      break;

    default:
      if (!["input_audio_buffer.append", "response.audio.delta", "response.audio_transcript.delta"].includes(ev.type)) {
        log("INFO", "Event: " + ev.type);
      }
  }
}

// ── Session beenden ───────────────────────────────────────
export function stopSession() {
  log("INFO", "Session wird beendet");
  sessionActive = false; blibSpeaking = false;
  stopMouthAnim();
  if (dataChan)    { dataChan.close();    dataChan = null; }
  if (peerConn)    { peerConn.close();    peerConn = null; }
  if (audioStream) {
    audioStream.getTracks().forEach(t => t.stop());
    audioStream = null;
    log("INFO", "Mikrofon freigegeben");
  }
  setAnim("");
  document.getElementById("mic").classList.remove("ready");
  setMicState("idle");
  log("INFO", "Session beendet");
}

// ── Luis tippt Blibu an ───────────────────────────────────
export function charTap() {
  if (!sessionActive || blibSpeaking) return;
  if (!dataChan || dataChan.readyState !== "open") {
    log("WARN", "charTap: DataChannel nicht offen");
    return;
  }
  log("LUIS", "Luis hat Blibu angetippt");
  dataChan.send(JSON.stringify({
    type: "conversation.item.create",
    item: { type: "message", role: "user", content: [{ type: "input_text", text: "Luis hat Blibu gekitzelt!" }] },
  }));
  dataChan.send(JSON.stringify({ type: "response.create" }));
}
