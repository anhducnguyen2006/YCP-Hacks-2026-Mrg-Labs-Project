import { useEffect } from "react";

let context: AudioContext | null = null;
let lastPop = -Infinity;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Constructor = window.AudioContext || (window as typeof window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Constructor) return null;
  try {
    if (!context || context.state === "closed") { context = new Constructor(); lastPop = -Infinity; }
    return context;
  } catch { return null; }
}

function unlockAudio() {
  const audio = audioContext();
  if (audio?.state === "suspended") void audio.resume().catch(() => {});
}

// Unlock during the upload click/key press, so a later asynchronous completion
// can chime without relying on browsers allowing unprompted autoplay.
export function useUiAudioActivation() {
  useEffect(() => {
    document.addEventListener("pointerdown", unlockAudio, {capture: true, passive: true});
    document.addEventListener("keydown", unlockAudio, true);
    return () => {
      document.removeEventListener("pointerdown", unlockAudio, true);
      document.removeEventListener("keydown", unlockAudio, true);
    };
  }, []);
}

function tone(audio: AudioContext, frequency: number, start: number, duration: number,
              volume: number, type: OscillatorType = "sine", endFrequency?: number) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(start);
  oscillator.stop(start + duration + .015);
}

export function playCompletionChime() {
  // Never queue a delayed sound for an old notification if autoplay is blocked.
  if (!context || context.state !== "running") return;
  try {
    const start = context.currentTime;
    tone(context, 660, start, .18, .055);
    tone(context, 990, start + .11, .26, .045);
  } catch { /* Sound is supplementary; notifications must still work. */ }
}

export function playHelperPop() {
  const audio = audioContext();
  if (!audio) return;
  const play = () => {
    if (audio.state !== "running" || audio.currentTime - lastPop < .12) return;
    lastPop = audio.currentTime;
    try { tone(audio, 520, audio.currentTime, .12, .065, "triangle", 145); }
    catch { /* Keep the flask interaction working without audio support. */ }
  };
  if (audio.state === "suspended") void audio.resume().then(play).catch(() => {});
  else play();
}
