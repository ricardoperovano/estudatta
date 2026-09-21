/**
 * Voz do Tatá. `speak(text)` tenta a voz natural (POST /tata/voice → MP3, guardado em memória
 * por texto nesta visita) e, se não vier (sem plano, sem cota, sem chave, erro de rede), usa o
 * sintetizador do aparelho em pt-BR, em silêncio. Nunca lança. A preferência ("off" | "on") fica
 * neste aparelho em localStorage; no iOS o primeiro áudio precisa de um toque, e é o toque no
 * interruptor que libera. A voz respeita o mascote desligado e as falas ocultas (`useTataVoice`).
 */
import { locale as uiLocale } from "@/i18n";
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

// --- escolha da voz do aparelho (puro, testável) ---------------------------------------------

export interface VoiceLike {
  lang: string;
  name?: string;
  default?: boolean;
}

/**
 * Voz no idioma da interface: a variante exata primeiro (pt-BR / en-US, a padrão do sistema se
 * houver), depois qualquer voz do mesmo idioma; senão a padrão (null).
 */
export function pickVoice<T extends VoiceLike>(
  voices: readonly T[],
  lang: string = uiLocale === "en" ? "en-US" : "pt-BR",
): T | null {
  const norm = (l: string) => (l || "").toLowerCase().replace("_", "-");
  const exact = norm(lang);
  const base = exact.split("-")[0];
  const same = voices.filter((v) => norm(v.lang) === exact || norm(v.lang).startsWith(exact));
  if (same.length) return same.find((v) => v.default) ?? same[0];
  const any = voices.filter((v) => norm(v.lang).startsWith(base));
  if (any.length) return any.find((v) => v.default) ?? any[0];
  return null;
}

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

/** Vozes do aparelho (podem chegar depois do primeiro pedido). */
function getVoices(): SpeechSynthesisVoice[] {
  try {
    return window.speechSynthesis?.getVoices?.() ?? [];
  } catch {
    return [];
  }
}

function speakWithDevice(text: string, mySeq: number): void {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;
  const say = () => {
    if (mySeq !== seq) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.05;
      const v = pickVoice(getVoices());
      // com a voz escolhida o idioma vem dela; definir os dois faz o Chrome no Linux
      // (speech-dispatcher) falar duas vezes em alguns sistemas
      if (v) u.voice = v;
      else u.lang = uiLocale === "en" ? "en-US" : "pt-BR";
      u.onstart = () => mySeq === seq && setSpeaking(true);
      u.onend = () => mySeq === seq && setSpeaking(false);
      u.onerror = () => mySeq === seq && setSpeaking(false);
      // cancelar e falar no mesmo instante também sobrepõe vozes no Linux: cancela só se há
      // algo tocando e espera o motor esvaziar antes de falar
      const start = () => mySeq === seq && synth.speak(u);
      if (synth.speaking || synth.pending) {
        synth.cancel();
        window.setTimeout(start, 120);
      } else {
        start();
      }
    } catch {
      setSpeaking(false);
    }
  };
  if (getVoices().length || !("onvoiceschanged" in synth)) {
    say();
    return;
  }
  // as vozes ainda não carregaram: espera o evento (com teto) e fala com a que houver
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    synth.removeEventListener?.("voiceschanged", go);
    say();
  };
  synth.addEventListener?.("voiceschanged", go);
  window.setTimeout(go, 400);
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

/** Fala o texto: voz natural quando dá, senão a do aparelho. Interrompe o que estava falando. */
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

export async function speak(text: string): Promise<void> {
  const t = normalizeSpeech(text);
  if (!t || typeof window === "undefined") return;
  if (document.visibilityState === "hidden") return;
  const mySeq = ++seq;
  stopPlayback();
  channel?.postMessage({ type: "speaking", tab: TAB_ID });
  try {
    if (canUseNatural()) {
      let blob = cache.get(t) ?? null;
      if (!blob) {
        try {
          blob = await fetchTataVoice(t);
          cache.set(t, blob);
        } catch (e) {
          noteNaturalFailure(e);
          blob = null;
        }
      }
      if (mySeq !== seq) return;
      if (blob && (await playBlob(blob, mySeq))) return;
      if (mySeq !== seq) return;
    }
    speakWithDevice(t, mySeq);
  } catch {
    /* nunca lança: a voz é um extra */
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
