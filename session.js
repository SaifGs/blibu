// ══════════════════════════════════════════════════════════
// session.js — Gesprächs-Engine
//
// Ablauf:
//   1. MediaRecorder nimmt Luis' Stimme auf
//   2. Silence-Detektion erkennt wann Luis fertig ist
//   3. Whisper (OpenAI) transkribiert das Audio
//   4. GPT-4o-mini generiert Bibu's Antwort
//   5. ElevenLabs spricht die Antwort mit Kinderstimme
// ══════════════════════════════════════════════════════════

import {
  OPENAI_STT_MODEL,
  OPENAI_LLM_MODEL,
  ELEVENLABS_VOICE_ID,
  ELEVENLABS_MODEL,
  ELEVENLABS_SETTINGS,
  SILENCE_TIMEOUT_MS,
  SILENCE_THRESHOLD,
  MIN_RECORD_MS,
  PERSONA,
} from "./config.js";
import { log } from "./log.js";
import { startMouthAnim, stopMouthAnim } from "./mouth.js";
import { setAnim, setMicState, setStatus, showError } from "./ui.js";

// ── State ─────────────────────────────────────────────────
export let sessionActive = false;
export let blibSpeaking  = false;

let openaiKey  = "";
let elevenKey  = "";

let mediaStream     = null;
let audioContext    = null;
let analyser        = null;
let recorder        = null;
let audioChunks     = [];
let recordingStart  = 0;
let silenceTimer    = null;
let isRecording     = false;
let currentAudio    = null;
let conversationHistory = [];

// ── Session starten ───────────────────────────────────────
export async function startSession(keys) {
  if (sessionActive) return;

  openaiKey = keys.openai;
  elevenKey = keys.eleven;

  log("INFO", "Session startet (Whisper + GPT-4o-mini + ElevenLabs)...");
  setStatus("Verbinde...");
  setAnim("thinking");

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    log("INFO", "Mikrofon aktiv");
  } catch (e) {
    log("ERROR", "Mikrofon verweigert: " + e.message);
    setStatus("Mikrofon erlauben!");
    setAnim("");
    return;
  }

  // AudioContext für Silence-Detektion (iOS: resume nach User-Gesture nötig)
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") await audioContext.resume();
  const source = audioContext.createMediaStreamSource(mediaStream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  // iOS: Audio-Element innerhalb der User-Gesture entsperren
  // Ohne das blockt iOS alle play()-Aufrufe die asynchron (nach STT/GPT) kommen
  currentAudio = new Audio();
  currentAudio.play().catch(() => {});
  currentAudio.pause();

  sessionActive = true;
  conversationHistory = [];

  setMicState("connected");
  setStatus("Luis kann sprechen!");
  setAnim("");

  // Begrüßung
  await blibRespond("__greeting__");

  // Danach auf Luis warten
  waitForSpeech();
}

// ── Auf Sprache warten (Silence → Speech Detektion) ───────
function waitForSpeech() {
  if (!sessionActive || blibSpeaking) return;

  const buffer = new Float32Array(analyser.fftSize);
  let speechDetected = false;

  setStatus("Luis kann sprechen!");
  setMicState("connected");
  setAnim("");

  function checkLevel() {
    if (!sessionActive || blibSpeaking) return;

    analyser.getFloatTimeDomainData(buffer);
    const rms = Math.sqrt(buffer.reduce((s, v) => s + v * v, 0) / buffer.length);

    if (rms > SILENCE_THRESHOLD && !speechDetected && !isRecording) {
      // Luis fängt an zu sprechen
      speechDetected = true;
      startRecording();
    } else if (!speechDetected) {
      requestAnimationFrame(checkLevel);
    }
  }

  requestAnimationFrame(checkLevel);
}

// ── Aufnahme starten ──────────────────────────────────────
function startRecording() {
  if (!sessionActive || isRecording) return;

  isRecording    = true;
  audioChunks    = [];
  recordingStart = Date.now();

  log("LUIS", "Luis spricht...");
  setAnim("listening");
  setMicState("user-talking");
  setStatus("Luis spricht...");

  // MediaRecorder: webm für alle, mp4 als iOS-Fallback
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : "";

  recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : {});
  recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
  recorder.onstop = onRecordingStop;
  recorder.start(100); // alle 100ms ein Chunk

  // Silence-Detektion während der Aufnahme
  monitorSilence();
}

// ── Stille während Aufnahme überwachen ────────────────────
function monitorSilence() {
  const buffer = new Float32Array(analyser.fftSize);

  function check() {
    if (!isRecording) return;

    analyser.getFloatTimeDomainData(buffer);
    const rms = Math.sqrt(buffer.reduce((s, v) => s + v * v, 0) / buffer.length);

    if (rms < SILENCE_THRESHOLD) {
      // Stille erkannt — Timer starten
      if (!silenceTimer) {
        silenceTimer = setTimeout(() => {
          if (isRecording) stopRecording();
        }, SILENCE_TIMEOUT_MS);
      }
    } else {
      // Luis spricht noch — Timer zurücksetzen
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    }
    requestAnimationFrame(check);
  }

  requestAnimationFrame(check);
}

function stopRecording() {
  if (!isRecording || !recorder) return;
  isRecording = false;
  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }

  // Mindestdauer prüfen
  const duration = Date.now() - recordingStart;
  if (duration < MIN_RECORD_MS) {
    // Zu kurz — ignorieren und neu warten
    recorder.stop();
    log("INFO", "Zu kurze Aufnahme ignoriert");
    setTimeout(() => waitForSpeech(), 200);
    return;
  }

  recorder.stop();
}

// ── Aufnahme verarbeiten ──────────────────────────────────
async function onRecordingStop() {
  if (!sessionActive) return;

  const blob = new Blob(audioChunks, { type: "audio/webm" });
  audioChunks = [];

  setAnim("thinking");
  setMicState("connected");
  setStatus("Bibu denkt...");

  try {
    // 1. Whisper STT
    const transcript = await transcribeWithWhisper(blob);
    if (!transcript || transcript.trim().length < 2) {
      log("INFO", "Kein Text erkannt — neu warten");
      waitForSpeech();
      return;
    }
    log("LUIS", `"${transcript}"`);

    // 2. GPT-4o-mini + ElevenLabs
    await blibRespond(transcript);

  } catch (err) {
    if (!navigator.onLine || err instanceof TypeError) {
      log("ERROR", "Keine Internetverbindung");
      showError("Keine Internetverbindung");
      setTimeout(() => waitForSpeech(), 4500);
    } else {
      log("ERROR", "Verarbeitungsfehler: " + err.message);
      setTimeout(() => waitForSpeech(), 1500);
    }
  }
}

// ── Whisper STT ───────────────────────────────────────────
async function transcribeWithWhisper(blob) {
  log("INFO", "Whisper transkribiert...");

  const ext = blob.type.includes("mp4") ? "m4a" : "webm";
  const formData = new FormData();
  formData.append("file", blob, `audio.${ext}`);
  formData.append("model", OPENAI_STT_MODEL);
  formData.append("language", "de");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Whisper Fehler: ${res.status} — ${err.error?.message || ""}`);
  }

  const data = await res.json();
  return data.text?.trim() || "";
}

// ── GPT-4o-mini ───────────────────────────────────────────
async function askGPT(userMessage, maxTokens = 300) {
  // Sonderfall: Begrüßung / Abschied
  const message = userMessage === "__greeting__"
    ? "Begrüße Luis in 1-2 kurzen Sätzen!"
    : userMessage === "__farewell__"
    ? "Verabschiede dich von Luis in 1-2 kurzen Sätzen und sag dass du jetzt schlafen gehst!"
    : userMessage;

  conversationHistory.push({ role: "user", content: message });

  // Maximal 10 Nachrichten im Verlauf behalten
  if (conversationHistory.length > 10) {
    conversationHistory = conversationHistory.slice(-10);
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:       OPENAI_LLM_MODEL,
      max_tokens:  maxTokens,
      temperature: 0.9,
      messages: [
        { role: "system", content: PERSONA },
        ...conversationHistory,
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GPT Fehler: ${res.status} — ${err.error?.message || ""}`);
  }

  const data  = await res.json();
  const reply = data.choices[0]?.message?.content?.trim() || "Wubbeldiwupp!";

  conversationHistory.push({ role: "assistant", content: reply });
  return reply;
}

// ── ElevenLabs TTS ────────────────────────────────────────
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

// ── Bibu antwortet ───────────────────────────────────────
async function blibRespond(userMessage) {
  if (!sessionActive) return;

  blibSpeaking = true;
  let netErr = false;

  try {
    const isShort  = userMessage === "__greeting__" || userMessage === "__farewell__";
    const reply    = await askGPT(userMessage, isShort ? 60 : 300);
    log("BLIBU", `"${reply}"`);

    const audioUrl = await speakWithElevenLabs(reply);

    setMicState("blibu-talking");
    setStatus("");
    startMouthAnim();
    setAnim("");

    await playAudio(audioUrl);

  } catch (err) {
    if (!navigator.onLine || err instanceof TypeError) {
      log("ERROR", "Keine Internetverbindung");
      netErr = true;
    } else {
      log("ERROR", "Antwort fehlgeschlagen: " + err.message);
    }
  } finally {
    blibSpeaking = false;
    stopMouthAnim();
    setAnim("happy");
    setMicState("connected");
    if (netErr) showError("Keine Internetverbindung");
    setTimeout(() => {
      setAnim("");
      if (sessionActive) waitForSpeech();
    }, 900);
  }
}

// ── Audio abspielen ───────────────────────────────────────
// Wiederverwendet das in startSession entsperrte Audio-Element (iOS-Fix)
function playAudio(url) {
  return new Promise((resolve) => {
    currentAudio.pause();
    currentAudio.src = url;
    currentAudio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    currentAudio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    currentAudio.play().catch((err) => {
      log("ERROR", "Audio play() fehlgeschlagen: " + err.message);
      URL.revokeObjectURL(url);
      resolve();
    });
  });
}

// ── Session beenden ───────────────────────────────────────
export async function stopSession() {
  if (!sessionActive) return;
  log("INFO", "Session wird beendet");

  sessionActive = false;
  blibSpeaking  = true;
  isRecording   = false;

  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
  if (recorder)     { try { recorder.stop(); } catch(e) {} recorder = null; }

  // Abschied
  try {
    setAnim("thinking");
    const reply    = await askGPT("__farewell__");
    log("BLIBU", `"${reply}"`);
    const audioUrl = await speakWithElevenLabs(reply);
    setMicState("blibu-talking");
    startMouthAnim();
    setAnim("");
    await playAudio(audioUrl);
  } catch(e) {
    log("ERROR", "Abschied fehlgeschlagen: " + e.message);
  }

  blibSpeaking = false;
  stopMouthAnim();
  if (currentAudio) { currentAudio.pause(); currentAudio.src = ""; currentAudio = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
  if (mediaStream)  { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }

  conversationHistory = [];

  setAnim("schlaf");
  setMicState("idle");
  setStatus("Tippen zum Starten");

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
    if (sessionActive) {
      setAnim('');
      log("LUIS", "Luis hat Bibu angetippt");
      blibRespond("Luis hat Bibu gekitzelt!");
    } else {
      setAnim('schlaf');
    }
  }, 950);
}
