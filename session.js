// ══════════════════════════════════════════════════════════
// session.js — Gesprächs-Engine
//
// Ablauf:
//   1. MediaRecorder nimmt Luis' Stimme auf
//   2. Silence-Detektion erkennt wann Luis fertig ist
//   3. Whisper (OpenAI) transkribiert das Audio
//   4. GPT-4o-mini generiert Bibu's Antwort
//   5. OpenAI TTS spricht die Antwort
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
import { setAnim, setMicState, showError } from "./ui.js";

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
let isRecording      = false;
let recorderMimeType = "audio/webm";
let currentAudio     = null;
let resolvePendingAudio = null; // damit laufende playAudio-Promises sauber beendet werden
let conversationHistory = [];

// ── Session starten ───────────────────────────────────────
export async function startSession(keys) {
  if (sessionActive) return;

  openaiKey = keys.openai;
  elevenKey = keys.eleven;

  log("INFO", "Session startet (Whisper + GPT-4o-mini + ElevenLabs)...");

  setAnim("thinking");

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    log("INFO", "Mikrofon aktiv");
  } catch (e) {
    log("ERROR", "Mikrofon verweigert: " + e.message);

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

  setMicState("connected");
  setAnim("");

  const interval = setInterval(() => {
    if (!sessionActive || blibSpeaking || isRecording) { clearInterval(interval); return; }

    analyser.getFloatTimeDomainData(buffer);
    const rms = Math.sqrt(buffer.reduce((s, v) => s + v * v, 0) / buffer.length);

    if (rms > SILENCE_THRESHOLD) {
      clearInterval(interval);
      startRecording();
    }
  }, 50);
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


  // MediaRecorder: webm für alle, mp4 als iOS-Fallback
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : "";

  recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : {});
  recorderMimeType = recorder.mimeType || "audio/webm";
  recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
  recorder.onstop = onRecordingStop;
  recorder.start(100); // alle 100ms ein Chunk

  // Silence-Detektion während der Aufnahme
  monitorSilence();
}

// ── Stille während Aufnahme überwachen ────────────────────
function monitorSilence() {
  const buffer = new Float32Array(analyser.fftSize);

  const interval = setInterval(() => {
    if (!isRecording) { clearInterval(interval); return; }

    analyser.getFloatTimeDomainData(buffer);
    const rms = Math.sqrt(buffer.reduce((s, v) => s + v * v, 0) / buffer.length);

    if (rms < SILENCE_THRESHOLD) {
      if (!silenceTimer) {
        silenceTimer = setTimeout(() => {
          if (isRecording) stopRecording();
        }, SILENCE_TIMEOUT_MS);
      }
    } else {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    }
  }, 50);
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

// ── Aufnahme verarbeiten ──────────────────────────────────
async function onRecordingStop() {
  if (!sessionActive) return;

  const blob = new Blob(audioChunks, { type: recorderMimeType });
  audioChunks = [];

  setAnim("thinking");
  setMicState("connected");

  try {
    // 1. Whisper STT
    const transcript = await transcribeWithWhisper(blob);
    if (!transcript || transcript.trim().length < 2) {
      log("INFO", "Kein Text erkannt — neu warten");
      waitForSpeech();
      return;
    }
    log("LUIS", `"${transcript}"`);

    // 2. Schlaf-Befehl? → Session beenden (stopSession sagt selbst Tschüss)
    if (isSleepCommand(transcript)) {
      log("INFO", "Schlaf-Befehl erkannt — Session wird beendet");
      await stopSession();
      return;
    }

    // 3. Normale Antwort
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
  const isGreeting = userMessage === "__greeting__";
  const message = isGreeting
    ? "Begrüße Luis in 1-2 kurzen Sätzen!"
    : userMessage;

  // Greeting-Prompt nur für diese eine Anfrage, nicht in History speichern
  const historyForApi = isGreeting
    ? [...conversationHistory, { role: "user", content: message }]
    : (conversationHistory.push({ role: "user", content: message }), conversationHistory);

  // Maximal 10 Nachrichten im Verlauf behalten — in Paaren schneiden,
  // damit die History nicht mit einem 'assistant'-Turn beginnt.
  if (conversationHistory.length > 10) {
    const drop = conversationHistory.length - 10;
    conversationHistory = conversationHistory.slice(drop + (drop % 2));
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
        ...historyForApi,
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GPT Fehler: ${res.status} — ${err.error?.message || ""}`);
  }

  const data  = await res.json();
  const reply = data.choices[0]?.message?.content?.trim() || "Wubbeldiwupp!";

  // Assistant-Turn nur speichern, wenn auch der User-Turn gespeichert wurde (kein Greeting)
  if (!isGreeting) conversationHistory.push({ role: "assistant", content: reply });
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
  let apiErr = false;

  try {
    const reply = await askGPT(userMessage, userMessage === "__greeting__" ? 100 : 300);
    if (!sessionActive) return; // Session wurde während GPT beendet

    log("BLIBU", `"${reply}"`);

    const audioUrl = await speakWithElevenLabs(reply);
    if (!sessionActive) { URL.revokeObjectURL(audioUrl); return; } // Session wurde während TTS beendet

    setMicState("blibu-talking");
    startMouthAnim();
    setAnim("");

    await playAudio(audioUrl);

  } catch (err) {
    if (!navigator.onLine) {
      log("ERROR", "Keine Internetverbindung");
      netErr = true;
    } else {
      log("ERROR", "Antwort fehlgeschlagen: " + err.message);
      apiErr = true;
    }
  } finally {
    // Wenn stopSession mitten im Flow aufgerufen wurde, besitzt stopSession jetzt
    // blibSpeaking + Mund-Animation für den Abschieds-Sound — nicht überschreiben.
    if (!sessionActive) return;
    blibSpeaking = false;
    stopMouthAnim();
    setAnim("happy");
    setMicState("connected");
    if (netErr)      showError("Keine Internetverbindung");
    else if (apiErr) showError("Uups, ich war kurz abgelenkt!");
    setTimeout(() => {
      if (!sessionActive) return;
      setAnim("");
      waitForSpeech();
    }, 900);
  }
}

// ── Audio abspielen ───────────────────────────────────────
// Wiederverwendet das in startSession entsperrte Audio-Element (iOS-Fix).
// Löst ein laufendes playAudio-Promise auf bevor ein neues startet —
// verhindert dass blibRespond ewig hängt wenn stopSession dazwischenkommt.
function playAudio(url) {
  return new Promise((resolve) => {
    // Hängendes Promise (z.B. von vorheriger Antwort) sauber beenden
    if (resolvePendingAudio) { resolvePendingAudio(); resolvePendingAudio = null; }

    if (!currentAudio) { URL.revokeObjectURL(url); resolve(); return; }

    resolvePendingAudio = resolve;

    const done = () => { URL.revokeObjectURL(url); resolvePendingAudio = null; resolve(); };

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

// ── Session beenden ───────────────────────────────────────
export async function stopSession() {
  if (!sessionActive) return;
  log("INFO", "Session wird beendet");

  sessionActive = false;
  blibSpeaking  = true;
  isRecording   = false;

  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
  if (recorder)     { try { recorder.stop(); } catch(e) {} recorder = null; }

  // Sofortiger Abschied — kein GPT, fixer Text
  try {
    const audioUrl = await speakWithElevenLabs("OK, ich gehe schlafen. Tschüss Luis!");
    log("BIBU", '"OK, ich gehe schlafen. Tschüss Luis!"');
    setMicState("blibu-talking");
    startMouthAnim();
    setAnim("");
    await playAudio(audioUrl);
  } catch(e) {
    log("ERROR", "Abschied fehlgeschlagen: " + e.message);
  }

  blibSpeaking = false;
  stopMouthAnim();
  if (currentAudio) { currentAudio.onended = null; currentAudio.onerror = null; currentAudio.pause(); currentAudio = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
  if (mediaStream)  { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }

  conversationHistory = [];

  setAnim("schlaf");
  setMicState("idle");


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
