/**
 * Voz do Tatá. `speak(text)` toca a voz natural (POST /tata/voice → MP3, guardado em memória por
 * texto nesta visita). Se ela não vier (sem cota, serviço fora, erro de rede), o Tatá fica em
 * silêncio e a fala segue só no balão: a voz sintetizada do aparelho soava robótica e, misturada
 * às frases em cache na voz natural, parecia haver duas vozes. Nunca lança. A preferência
 * ("off" | "on") fica neste aparelho em localStorage; no iOS o primeiro áudio precisa de um toque,
 * e é o toque no interruptor que libera. A voz respeita o mascote desligado e as falas ocultas
 * (`useTataVoice`).
 */
import * as React from "react";
import { fetchTataVoice, VOICE_FALLBACK_CODES } from "@/api/tata";
import { ApiError } from "@/api/client";
import { useTataPrefs } from "./use-tata";

export type VoiceMode = "off" | "on";
export const VOICE_KEY = "estudatta.tata.voice";
const MAX_CHARS = 600;
const TRANSIENT_BLOCK_MS = 5 * 60_000;

// --- preferência ---------------------------------------------------------------------------

const modeListeners = new Set<() => void>();

export function readVoiceMode(): VoiceMode {
  try {
    return localStorage.getItem(VOICE_KEY) === "on" ? "on" : "off";
  } catch {
    return "off";
  }
}

export function setVoiceMode(mode: VoiceMode) {
  try {
    if (mode === "on") localStorage.setItem(VOICE_KEY, "on");
    else localStorage.removeItem(VOICE_KEY);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  if (mode === "off") stop();
  modeListeners.forEach((l) => l());
}

export function useVoiceMode(): VoiceMode {
  return React.useSyncExternalStore(
    (cb) => {
      modeListeners.add(cb);
      return () => modeListeners.delete(cb);
    },
    readVoiceMode,
    () => "off",
  );
}

// --- "está falando?" -------------------------------------------------------------------------

let speaking = false;
const speakingListeners = new Set<() => void>();
function setSpeaking(v: boolean) {
  if (speaking === v) return;
  speaking = v;
  speakingListeners.forEach((l) => l());
}
export const isSpeaking = () => speaking;
export function subscribeSpeaking(cb: () => void) {
  speakingListeners.add(cb);
  return () => speakingListeners.delete(cb);
}
export function useTataSpeaking(): boolean {
  return React.useSyncExternalStore(subscribeSpeaking, isSpeaking, () => false);
}

// --- texto --------------------------------------------------------------------------------

/** Normaliza e corta o texto para caber na voz (o servidor aceita até 600 caracteres). */
export function normalizeSpeech(text: string): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS - 1).trimEnd()}…` : t;
}

// --- motor -----------------------------------------------------------------------------------

const cache = new Map<string, Blob>();
let audio: HTMLAudioElement | null = null;
let audioUrl: string | null = null;
let seq = 0;
/** Depois de um "sem voz natural", não bate na API de novo por um tempo (ou nesta visita, se for de plano/cota). */
let naturalBlockedUntil = 0;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
  }
  return audio;
}

function releaseUrl() {
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
}

function canUseNatural(): boolean {
  return typeof Audio !== "undefined" && Date.now() >= naturalBlockedUntil;
}

function noteNaturalFailure(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === "voice_plan" || e.code === "voice_quota" || e.code === "voice_disabled") {
      naturalBlockedUntil = Number.POSITIVE_INFINITY;
      return;
    }
    if (VOICE_FALLBACK_CODES.includes(e.code) || e.status >= 500 || e.status === 0) {
      naturalBlockedUntil = Date.now() + TRANSIENT_BLOCK_MS;
      return;
    }
  }
  naturalBlockedUntil = Date.now() + TRANSIENT_BLOCK_MS;
}

async function playBlob(blob: Blob, mySeq: number): Promise<boolean> {
  const el = getAudio();
  releaseUrl();
  audioUrl = URL.createObjectURL(blob);
  el.src = audioUrl;
  el.onended = () => mySeq === seq && setSpeaking(false);
  el.onerror = () => mySeq === seq && setSpeaking(false);
  try {
    await el.play();
    if (mySeq !== seq) {
      el.pause();
      return true;
    }
    setSpeaking(true);
    return true;
  } catch {
    return false; // autoplay bloqueado ou formato sem suporte
  }
}

// Só a aba visível fala; ao começar, avisa as outras abas para silenciarem (duas abas do app
// abertas falavam ao mesmo tempo).
const TAB_ID = Math.random().toString(36).slice(2);
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("estudatta-tata-voice") : null;
channel?.addEventListener("message", (e: MessageEvent) => {
  if (e.data?.type === "speaking" && e.data.tab !== TAB_ID) stop();
});
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stop();
  });
}

/**
 * Fala o texto com a voz natural. Devolve se tocou; sem voz natural disponível, fica em silêncio
 * (a fala continua no balão) e devolve false.
 */
export async function speak(text: string): Promise<boolean> {
  const t = normalizeSpeech(text);
  if (!t || typeof window === "undefined") return false;
  if (document.visibilityState === "hidden") return false;
  const mySeq = ++seq;
  stopPlayback();
  channel?.postMessage({ type: "speaking", tab: TAB_ID });
  try {
    if (!canUseNatural()) return false;
    let blob = cache.get(t) ?? null;
    if (!blob) {
      try {
        blob = await fetchTataVoice(t);
        cache.set(t, blob);
      } catch (e) {
        noteNaturalFailure(e);
        return false;
      }
    }
    if (mySeq !== seq) return false;
    return await playBlob(blob, mySeq);
  } catch {
    return false; // nunca lança: a voz é um extra
  }
}

function stopPlayback() {
  try {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
  } catch {
    /* ignora */
  }
}

/** Para a fala atual (se houver). */
export function stop(): void {
  seq++;
  stopPlayback();
  setSpeaking(false);
}

/** Só para testes: zera o bloqueio da voz natural e o cache. */
export function _resetVoiceForTests() {
  naturalBlockedUntil = 0;
  cache.clear();
  lastSpoken = null;
  seq++;
  setSpeaking(false);
}

// --- gancho para componentes -----------------------------------------------------------------

/** Último texto falado por `say` (não repete a mesma fala duas vezes seguidas, mesmo entre telas). */
let lastSpoken: string | null = null;

/**
 * Voz do Tatá com as regras do app: só fala com a voz ligada, o mascote ligado e as falas
 * visíveis. `say` ignora repetições seguidas do mesmo texto.
 */
export function useTataVoice() {
  const { enabled, muted } = useTataPrefs();
  const mode = useVoiceMode();
  const speaking = useTataSpeaking();
  const active = mode === "on" && enabled && !muted;
  const say = React.useCallback(
    (text: string | null | undefined) => {
      if (!active || !text) return;
      const t = normalizeSpeech(text);
      if (!t || t === lastSpoken) return;
      lastSpoken = t;
      void speak(t);
    },
    [active],
  );
  React.useEffect(() => {
    if (!active) stop();
  }, [active]);
  return { mode, active, speaking, say, stop, setMode: setVoiceMode };
}
