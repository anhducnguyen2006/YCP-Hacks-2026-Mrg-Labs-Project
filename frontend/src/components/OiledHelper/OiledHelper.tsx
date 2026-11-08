import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./OiledHelper.css";
import { playHelperPop } from "../uiSounds";

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{transcript: string}>>;
}
interface RecognitionErrorEvent { error: string }
interface BrowserRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserRecognition;
  webkitSpeechRecognition?: new () => BrowserRecognition;
};

// Expression morph paths for face
const EXPRESSIONS = {
  cheerful: {
    leftEyebrow: "M 64,124 Q 76,116 88,124",
    rightEyebrow: "M 112,124 Q 124,116 136,124",
    mouth: "M 88,164 Q 100,186 112,164 Z",
    fluid: "url(#oil-fluid-grad)",
  },
  curious: {
    leftEyebrow: "M 64,120 Q 76,112 88,120",
    rightEyebrow: "M 112,130 L 136,128",
    mouth: "M 94,166 Q 100,163 106,168",
    fluid: "url(#oil-fluid-grad)",
  },
  surprised: {
    leftEyebrow: "M 64,114 Q 76,108 88,114",
    rightEyebrow: "M 112,114 Q 124,108 136,114",
    mouth: "M 94,162 A 6 9 0 1 0 106,162 A 6 9 0 1 0 94,162 Z",
    fluid: "url(#oil-fluid-grad)",
  },
  scold: {
    leftEyebrow: "M 66,122 L 88,134",
    rightEyebrow: "M 112,134 L 134,122",
    mouth: "M 89,176 Q 100,165 111,176",
    fluid: "url(#oil-angry-grad)",
  },
};

const MOUTH_TALK_FRAMES = [
  "M 92,166 Q 100,169 108,166 Z", // closed
  "M 90,165 Q 100,177 110,165 Z", // small open
  "M 88,163 Q 100,185 112,163 Z", // wide open
  "M 90,164 Q 100,173 110,164 Z",  // mid
];

// Audio track definitions for user's voice recordings across different tabs
export interface AudioCaptionChunk {
  text: string;
  start: number; // in seconds
  end: number;   // in seconds
}

export interface AudioTrackDef {
  audioSrc: string;
  chunks: AudioCaptionChunk[];
  fullText: string;
  mood: keyof typeof EXPRESSIONS;
}

export const AUDIO_TRACKS: Record<string, AudioTrackDef> = {
  greeting: {
    audioSrc: "/audio/oiled-helper/greeting.m4a",
    mood: "cheerful",
    fullText:
      "Hello there, this is Oiled Helper. Well-greased and here to help you. I'll be moving around here and there, please don't mind me. In the scan tab, you will be able to upload the pre-recorded videos of the labels. Ask me if you've got any questions. Thank you.",
    chunks: [
      { text: "Hello there, this", start: 0.0, end: 1.1 },
      { text: "is Oiled Helper.", start: 1.1, end: 2.2 },
      { text: "Well-greased and here", start: 2.2, end: 3.5 },
      { text: "to help you.", start: 3.5, end: 4.4 },
      { text: "I'll be moving", start: 4.4, end: 5.3 },
      { text: "around here and", start: 5.3, end: 6.2 },
      { text: "there, please don't", start: 6.2, end: 7.0 },
      { text: "mind me.", start: 7.0, end: 7.6 },
      { text: "In the scan", start: 7.6, end: 8.5 },
      { text: "tab, you will", start: 8.5, end: 9.4 },
      { text: "be able to", start: 9.4, end: 10.2 },
      { text: "upload the pre-recorded", start: 10.2, end: 11.4 },
      { text: "videos of the", start: 11.4, end: 12.1 },
      { text: "labels.", start: 12.1, end: 12.85 },
      { text: "Ask me if", start: 12.85, end: 13.6 },
      { text: "you've got any", start: 13.6, end: 14.5 },
      { text: "questions. Thank you.", start: 14.5, end: 15.8 },
    ],
  },
  scan: {
    audioSrc: "/audio/oiled-helper/scan.m4a",
    mood: "cheerful",
    fullText: "In the scan tab, you will be able to upload the pre-recorded videos of the labels.",
    chunks: [
      { text: "In the scan", start: 0.0, end: 0.95 },
      { text: "tab, you will", start: 0.95, end: 1.8 },
      { text: "be able to", start: 1.8, end: 2.65 },
      { text: "upload the pre-recorded", start: 2.65, end: 3.9 },
      { text: "videos of the", start: 3.9, end: 4.55 },
      { text: "labels.", start: 4.55, end: 5.3 },
    ],
  },
  samples: {
    audioSrc: "/audio/oiled-helper/samples.m4a",
    mood: "cheerful",
    fullText:
      "In the samples tab, you will be able to see the recently scanned batch, but not only recently scanned batch, but also all the previous batches that you scanned.",
    chunks: [
      { text: "In the samples", start: 0.0, end: 0.95 },
      { text: "tab, you will", start: 0.95, end: 1.75 },
      { text: "be able to", start: 1.75, end: 2.45 },
      { text: "see the recently", start: 2.45, end: 3.4 },
      { text: "scanned batch, but", start: 3.4, end: 4.3 },
      { text: "not only recently", start: 4.3, end: 5.2 },
      { text: "scanned batch, but", start: 5.2, end: 6.0 },
      { text: "also all the", start: 6.0, end: 6.6 },
      { text: "previous batches that", start: 6.6, end: 7.2 },
      { text: "you scanned.", start: 7.2, end: 8.0 },
    ],
  },
  export: {
    audioSrc: "/audio/oiled-helper/export.m4a",
    mood: "cheerful",
    fullText: "In the export tab, you can see the batches that you want to export for the CSV template.",
    chunks: [
      { text: "In the export", start: 0.0, end: 1.05 },
      { text: "tab, you can", start: 1.05, end: 2.0 },
      { text: "see the batches", start: 2.0, end: 3.2 },
      { text: "that you want", start: 3.2, end: 4.4 },
      { text: "to export for", start: 4.4, end: 5.6 },
      { text: "the CSV template.", start: 5.6, end: 7.7 },
    ],
  },
};

// Helper to reliably find a high-definition, human-sounding female voice
export function pickFemaleVoice(voicesList?: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const voices =
    voicesList && voicesList.length > 0
      ? voicesList
      : typeof window !== "undefined" && "speechSynthesis" in window
      ? window.speechSynthesis.getVoices()
      : [];
  if (!voices || voices.length === 0) return null;

  const maleBlacklist = [
    "david",
    "mark",
    "george",
    "richard",
    "james",
    "guy",
    "male",
    "stefan",
    "puck",
    "charon",
    "fenrir",
  ];

  const nonMale = voices.filter(
    (v) => !maleBlacklist.some((m) => v.name.toLowerCase().includes(m))
  );
  const enNonMale = nonMale.filter((v) => v.lang.startsWith("en"));
  const pool = enNonMale.length > 0 ? enNonMale : nonMale;

  // 1. TOP TIER: Modern Natural / Neural Human-sounding voices (Google Cloud / Azure Natural)
  const naturalKeywords = [
    "google us english",
    "google uk english female",
    "natural",
    "neural",
    "online (natural)",
    "jenny",
    "aria",
    "samantha",
    "victoria",
  ];

  for (const kw of naturalKeywords) {
    const match = pool.find((v) => v.name.toLowerCase().includes(kw));
    if (match) return match;
  }

  // 2. SECOND TIER: Other female-identified voices
  const standardFemale = [
    "karen",
    "hazel",
    "susan",
    "catherine",
    "linda",
    "female",
  ];
  for (const kw of standardFemale) {
    const match = pool.find((v) => v.name.toLowerCase().includes(kw));
    if (match) return match;
  }

  // 3. THIRD TIER: Windows SAPI female voice (Microsoft Zira Desktop)
  const zira = pool.find((v) => v.name.toLowerCase().includes("zira"));
  if (zira) return zira;

  return pool[0] || null;
}

// Helper to build 3-word speech chunks and map boundary character positions
interface SpeechChunkMapping {
  chunks: string[];
  chunkStarts: number[];
  durationsMs: number[];
  getChunkIndexForChar: (charIndex: number) => number;
}

export function buildSpeechChunks(fullText: string, rate: number = 1.05): SpeechChunkMapping {
  const trimmed = fullText.trim();
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;
  const wordSpans: { word: string; start: number; end: number }[] = [];

  while ((match = wordRegex.exec(trimmed)) !== null) {
    wordSpans.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  if (wordSpans.length === 0) {
    return {
      chunks: [trimmed],
      chunkStarts: [0],
      durationsMs: [1000],
      getChunkIndexForChar: () => 0,
    };
  }

  const chunks: string[] = [];
  const chunkStarts: number[] = [];
  const durationsMs: number[] = [];

  for (let i = 0; i < wordSpans.length; i += 3) {
    const triplet = wordSpans.slice(i, i + 3);
    const text = triplet.map((w) => w.word).join(" ");
    chunks.push(text);
    chunkStarts.push(triplet[0].start);

    // Dynamic duration based on character count and punctuation pauses
    const charCount = text.length;
    let punctuationPause = 0;
    if (/[.!?]$/.test(text)) {
      punctuationPause = 450;
    } else if (/[,;:]$/.test(text)) {
      punctuationPause = 220;
    }
    const estDuration = Math.round(((charCount * 65) + 250 + punctuationPause) / rate);
    durationsMs.push(Math.max(650, Math.min(2500, estDuration)));
  }

  const getChunkIndexForChar = (charIndex: number): number => {
    if (charIndex <= 0) return 0;
    let matched = 0;
    for (let i = 0; i < chunkStarts.length; i++) {
      if (charIndex >= chunkStarts[i]) {
        matched = i;
      } else {
        break;
      }
    }
    return Math.min(matched, chunks.length - 1);
  };

  return {
    chunks,
    chunkStarts,
    durationsMs,
    getChunkIndexForChar,
  };
}

export function OiledHelper() {
  const navigate = useNavigate();
  const location = useLocation();

  // State
  const [isMicOn, setIsMicOn] = useState(false); // Off by default to prevent repeating speaker feedback loops
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const isVoiceMutedRef = useRef(false);
  const hasSpokenWelcomeRef = useRef(false);
  const pendingTrackRef = useRef<string | null>(null);
  const lastSpeechEndTimeRef = useRef(0);

  // 3-word liquid glass popup state
  const [displayWords, setDisplayWords] = useState("Hello there, this");
  const [speechBubbleActive, setSpeechBubbleActive] = useState(false);
  const [mood, setMood] = useState<keyof typeof EXPRESSIONS>("cheerful");
  const [pokeCount, setPokeCount] = useState(0);

  // Position & Rigging refs
  const actorRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const leftLegRef = useRef<SVGGElement>(null);
  const rightLegRef = useRef<SVGGElement>(null);
  const leftArmRef = useRef<SVGGElement>(null);
  const rightArmRef = useRef<SVGGElement>(null);
  const leftPupilRef = useRef<SVGEllipseElement>(null);
  const rightPupilRef = useRef<SVGEllipseElement>(null);
  const mouthRef = useRef<SVGPathElement>(null);

  // Animation & Physics Tracking
  const posXRef = useRef(typeof window !== "undefined" ? window.innerWidth * 0.72 : 400);
  const targetXRef = useRef(posXRef.current);
  const facingDirRef = useRef<1 | -1>(1);
  const isWalkingRef = useRef(false);
  const walkPhaseRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const talkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechBubbleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pokeCooloffRef = useRef<NodeJS.Timeout | null>(null);
  const voicePollRef = useRef<NodeJS.Timeout | null>(null);
  const lastPathRef = useRef<string | null>(null);
  const recognitionRef = useRef<BrowserRecognition | null>(null);

  // Fluid Wave, Bubbles, and Droplet Particle Physics Refs
  const fluidPathRef = useRef<SVGPathElement>(null);
  const fluidHighlightRef = useRef<SVGPathElement>(null);
  const bubbleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const dropletsGroupRef = useRef<SVGGElement>(null);
  const sloshRef = useRef(0);
  const dropletsRef = useRef<{
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    color: string;
    life: number;
    decay: number;
  }[]>([]);
  const bubblesStateRef = useRef([
    { x: 65, y: 190, r: 3.5, speed: 0.45, seed: 0 },
    { x: 135, y: 175, r: 2.8, speed: 0.6, seed: 1.5 },
    { x: 95, y: 205, r: 4.2, speed: 0.35, seed: 3.2 },
    { x: 80, y: 155, r: 2.2, speed: 0.55, seed: 4.8 },
    { x: 120, y: 140, r: 3.0, speed: 0.4, seed: 2.1 },
  ]);

  // -------------------------------------------------------------
  // User Voice Audio Playback with Exact 3-Word Captions
  // -------------------------------------------------------------
  const playTrack = useCallback((key: keyof typeof AUDIO_TRACKS) => {
    const track = AUDIO_TRACKS[key];
    if (!track) return;
    pendingTrackRef.current = null;
    isSpeakingRef.current = false;

    setMood(track.mood);

    // Cancel any ongoing audio, speech synthesis, or chunk timers
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
    if (speechBubbleTimerRef.current) {
      clearTimeout(speechBubbleTimerRef.current);
      speechBubbleTimerRef.current = null;
    }
    if (talkIntervalRef.current) {
      clearInterval(talkIntervalRef.current);
      talkIntervalRef.current = null;
    }

    // Set first 3 words immediately
    setDisplayWords(track.chunks[0].text);
    setSpeechBubbleActive(true);

    // Silent mode pacing if voice is muted or in SSR
    if (isVoiceMutedRef.current || typeof window === "undefined") {
      if (key === "greeting") hasSpokenWelcomeRef.current = true;
      let chunkIdx = 0;
      const stepSilent = () => {
        if (chunkIdx < track.chunks.length - 1) {
          const cur = track.chunks[chunkIdx];
          const nxt = track.chunks[chunkIdx + 1];
          const delay = Math.max(300, (nxt.start - cur.start) * 1000);
          activeTimerRef.current = setTimeout(() => {
            chunkIdx += 1;
            setDisplayWords(track.chunks[chunkIdx].text);
            stepSilent();
          }, delay);
        } else {
          speechBubbleTimerRef.current = setTimeout(() => {
            setSpeechBubbleActive(false);
          }, 1200);
        }
      };
      stepSilent();
      return;
    }

    // Play user recorded audio file with hardware timestamp synchronization
    const audio = new Audio(track.audioSrc);
    audio.volume = 1.0;
    activeAudioRef.current = audio;
    let currentChunkIdx = 0;

    const syncChunkToTime = (curTime: number) => {
      for (let i = track.chunks.length - 1; i >= 0; i--) {
        if (curTime >= track.chunks[i].start) {
          if (currentChunkIdx !== i) {
            currentChunkIdx = i;
            setDisplayWords(track.chunks[i].text);
          }
          break;
        }
      }
    };

    audio.onplay = () => {
      if (activeAudioRef.current !== audio) return;
      pendingTrackRef.current = null;
      if (key === "greeting") hasSpokenWelcomeRef.current = true;
      isSpeakingRef.current = true;
      let frame = 0;
      talkIntervalRef.current = setInterval(() => {
        if (mouthRef.current) {
          frame = (frame + 1) % MOUTH_TALK_FRAMES.length;
          mouthRef.current.setAttribute("d", MOUTH_TALK_FRAMES[frame]);
        }
        if (activeAudioRef.current) {
          syncChunkToTime(activeAudioRef.current.currentTime);
        }
      }, 50); // 50ms high-resolution synchronization with spoken audio
    };

    audio.ontimeupdate = () => {
      if (activeAudioRef.current === audio) syncChunkToTime(audio.currentTime);
    };

    audio.onended = () => {
      if (activeAudioRef.current !== audio) return;
      isSpeakingRef.current = false;
      lastSpeechEndTimeRef.current = Date.now();
      activeAudioRef.current = null;
      if (talkIntervalRef.current) clearInterval(talkIntervalRef.current);
      if (mouthRef.current) {
        mouthRef.current.setAttribute("d", EXPRESSIONS[track.mood].mouth);
      }
      setDisplayWords(track.chunks[track.chunks.length - 1].text);
      speechBubbleTimerRef.current = setTimeout(() => {
        setSpeechBubbleActive(false);
      }, 1500);
    };

    audio.onerror = () => {
      if (activeAudioRef.current !== audio) return;
      pendingTrackRef.current = null;
      isSpeakingRef.current = false;
      lastSpeechEndTimeRef.current = Date.now();
      activeAudioRef.current = null;
      if (talkIntervalRef.current) clearInterval(talkIntervalRef.current);
      if (mouthRef.current) {
        mouthRef.current.setAttribute("d", EXPRESSIONS[track.mood].mouth);
      }
      setSpeechBubbleActive(false);
    };

    const playPromise = audio.play();
    if (playPromise !== undefined && typeof playPromise.catch === "function") {
      playPromise.catch((error: unknown) => {
        if (activeAudioRef.current !== audio) return;
        isSpeakingRef.current = false;
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          pendingTrackRef.current = key;
        } else {
          activeAudioRef.current = null;
          setSpeechBubbleActive(false);
        }
      });
    }
  }, []);

  // -------------------------------------------------------------
  // Speech Synthesis with EXACT Audio-Text Word Synchronization
  // -------------------------------------------------------------
  const speakAloud = useCallback((fullText: string, newMood: keyof typeof EXPRESSIONS = "cheerful") => {
    setMood(newMood);

    // Cancel any active speech pacing or hide timers
    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
    if (speechBubbleTimerRef.current) {
      clearTimeout(speechBubbleTimerRef.current);
      speechBubbleTimerRef.current = null;
    }
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }

    // 1. Build precise 3-word chunks with character offset mappings
    const { chunks, durationsMs, getChunkIndexForChar } = buildSpeechChunks(fullText, 1.05);
    if (chunks.length === 0) return;

    // Display first 3 words immediately
    setDisplayWords(chunks[0]);
    setSpeechBubbleActive(true);

    // If voice is muted or speech API unavailable, pace the 3-word bubbles with natural cadence
    if (
      isVoiceMutedRef.current ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      !window.speechSynthesis ||
      typeof window.speechSynthesis.speak !== "function"
    ) {
      let silentIdx = 0;
      const stepSilent = () => {
        if (silentIdx < chunks.length - 1) {
          activeTimerRef.current = setTimeout(() => {
            silentIdx += 1;
            setDisplayWords(chunks[silentIdx]);
            stepSilent();
          }, durationsMs[silentIdx]);
        } else {
          speechBubbleTimerRef.current = setTimeout(() => {
            setSpeechBubbleActive(false);
          }, 1100);
        }
      };
      stepSilent();
      return;
    }

    // 2. Play Audio via Web Speech API with Female Voice & Exact Synchronization
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(fullText);
    currentUtteranceRef.current = utterance; // Prevent Chrome garbage collection bug

    // Natural human voice parameters: 1.0 preserves natural vocal formants, 0.96 is a warm conversational pace
    utterance.pitch = 1.0;
    utterance.rate = 0.96;

    let talkInterval: NodeJS.Timeout | null = null;
    let currentChunkIdx = 0;
    let boundaryFired = false;

    // Real-time boundary synchronization: fires on the exact spoken word boundary
    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      boundaryFired = true;
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
        activeTimerRef.current = null;
      }

      if (typeof event.charIndex === "number") {
        const targetIdx = getChunkIndexForChar(event.charIndex);
        if (targetIdx !== currentChunkIdx && targetIdx < chunks.length) {
          currentChunkIdx = targetIdx;
          setDisplayWords(chunks[targetIdx]);
        }
      }
    };

    // Fallback scheduler (used only if browser engine omits onboundary events)
    const runFallbackSchedule = (idx: number) => {
      if (idx >= chunks.length - 1) return;
      activeTimerRef.current = setTimeout(() => {
        if (!boundaryFired && isSpeakingRef.current) {
          const nextIdx = idx + 1;
          currentChunkIdx = nextIdx;
          setDisplayWords(chunks[nextIdx]);
          runFallbackSchedule(nextIdx);
        }
      }, durationsMs[idx]);
    };

    utterance.onstart = () => {
      isSpeakingRef.current = true;
      currentChunkIdx = 0;
      setDisplayWords(chunks[0]);
      setSpeechBubbleActive(true);

      // Mouth animation frames
      let frame = 0;
      talkInterval = setInterval(() => {
        if (mouthRef.current) {
          frame = (frame + 1) % MOUTH_TALK_FRAMES.length;
          mouthRef.current.setAttribute("d", MOUTH_TALK_FRAMES[frame]);
        }
      }, 110);

      // Start fallback in case onboundary is unsupported in current environment
      runFallbackSchedule(0);

      // Chrome keep-alive pulse for speech lasting > 14 seconds
      keepAliveIntervalRef.current = setInterval(() => {
        if (isSpeakingRef.current && typeof window !== "undefined" && window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } else {
          if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
        }
      }, 9000);
    };

    utterance.onend = () => {
      isSpeakingRef.current = false;
      lastSpeechEndTimeRef.current = Date.now();
      currentUtteranceRef.current = null;
      if (talkInterval) clearInterval(talkInterval);
      if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
      if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);

      // Ensure the final chunk is shown
      setDisplayWords(chunks[chunks.length - 1]);

      if (mouthRef.current) {
        mouthRef.current.setAttribute("d", EXPRESSIONS[newMood].mouth);
      }

      // Keep the final words visible for 1.1s so user can comfortably finish reading
      speechBubbleTimerRef.current = setTimeout(() => {
        setSpeechBubbleActive(false);
      }, 1100);
    };

    utterance.onerror = () => {
      isSpeakingRef.current = false;
      lastSpeechEndTimeRef.current = Date.now();
      currentUtteranceRef.current = null;
      if (talkInterval) clearInterval(talkInterval);
      if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
      if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);

      if (mouthRef.current) {
        mouthRef.current.setAttribute("d", EXPRESSIONS[newMood].mouth);
      }
      setSpeechBubbleActive(false);
    };

    // Strictly enforce female voice (wait for voiceschanged if browser is still loading voices)
    const playWithFemaleVoice = (voice: SpeechSynthesisVoice | null) => {
      if (voice) {
        utterance.voice = voice;
      }
      window.speechSynthesis.speak(utterance);
    };

    const immediateVoice = pickFemaleVoice();
    if (immediateVoice) {
      playWithFemaleVoice(immediateVoice);
    } else {
      // Chrome voices are loading asynchronously on first load. Wait to guarantee female voice!
      let resolved = false;
      const onVoicesReady = () => {
        if (resolved) return;
        const v = pickFemaleVoice();
        if (v) {
          resolved = true;
          playWithFemaleVoice(v);
        }
      };

      if ("onvoiceschanged" in window.speechSynthesis) {
        window.speechSynthesis.addEventListener("voiceschanged", onVoicesReady, { once: true });
      }

      let pollAttempts = 0;
      if (voicePollRef.current) clearInterval(voicePollRef.current);
      const pollTimer = setInterval(() => {
        if (resolved) {
          clearInterval(pollTimer);
          voicePollRef.current = null;
          return;
        }
        pollAttempts++;
        const v = pickFemaleVoice();
        if (v) {
          resolved = true;
          clearInterval(pollTimer);
          voicePollRef.current = null;
          playWithFemaleVoice(v);
        } else if (pollAttempts >= 15) {
          clearInterval(pollTimer);
          voicePollRef.current = null;
          resolved = true;
          utterance.pitch = 1.0; // natural human pitch
          utterance.rate = 0.96;
          window.speechSynthesis.speak(utterance);
        }
      }, 80);
      voicePollRef.current = pollTimer;
    }
  }, []);

  // -------------------------------------------------------------
  // Command & Dialogue Brain with Recorded Voice Tracks
  // -------------------------------------------------------------
  const handleUserIntent = useCallback(
    (raw: string) => {
      // Debounce: ignore room reverberation or echo from speakers
      if (Date.now() - lastSpeechEndTimeRef.current < 1500) return;

      const text = raw.toLowerCase().trim();

      // 1. Direct Tab Navigation & Voice Playback
      if (text.includes("scan") || text.includes("upload")) {
        if (location.pathname === "/scan") playTrack("scan");
        else navigate("/scan");
      } else if (text.includes("sample") || text.includes("inventory")) {
        if (location.pathname === "/samples") playTrack("samples");
        else navigate("/samples");
      } else if (text.includes("export") || text.includes("csv") || text.includes("template")) {
        if (location.pathname === "/templates") playTrack("export");
        else navigate("/templates");
      } else if (text.includes("setting") || text.includes("preference")) {
        navigate("/settings");
        speakAloud("Opening Settings!", "cheerful");
      } else if (text.includes("hello") || text.includes("hi") || text.includes("who are you") || text.includes("greeting")) {
        playTrack("greeting");
      } else if (text.includes("help") || text.includes("instruction") || text.includes("guide") || text.includes("how does this work")) {
        const currentPath = window.location.pathname.toLowerCase();
        if (currentPath.startsWith("/scan")) {
          playTrack("scan");
        } else if (currentPath.startsWith("/samples")) {
          playTrack("samples");
        } else if (currentPath.startsWith("/templates") || currentPath.startsWith("/export") || currentPath.startsWith("/review")) {
          playTrack("export");
        } else {
          playTrack("greeting");
        }
      } else {
        speakAloud(
          "I'm sorry, I'm just a helper here and a buddy you can talk to. Feel free to talk and share your feelings, but for more support, feel free to talk with an LLM or the supervisor, thank you!",
          "curious"
        );
      }
    },
    [navigate, playTrack, speakAloud, location.pathname]
  );

  // -------------------------------------------------------------
  // Tab-Specific Voice Announcements on Route Change & Startup
  // -------------------------------------------------------------
  // Separate mount effects remain correctly installed after StrictMode cleanup.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasSpokenWelcomeRef.current && !activeAudioRef.current) playTrack("greeting");
    }, 700);
    return () => clearTimeout(timer);
  }, [playTrack]);

  useEffect(() => {
    const unlockPendingTrack = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".oiled-actor, .oiled-dock")) return;
      if (pendingTrackRef.current) playTrack(pendingTrackRef.current);
      else if (!hasSpokenWelcomeRef.current && !activeAudioRef.current) playTrack("greeting");
    };
    window.addEventListener("pointerdown", unlockPendingTrack);
    window.addEventListener("keydown", unlockPendingTrack);
    return () => {
      window.removeEventListener("pointerdown", unlockPendingTrack);
      window.removeEventListener("keydown", unlockPendingTrack);
    };
  }, [playTrack]);

  useEffect(() => {
    const currentPath = location.pathname.toLowerCase();
    if (lastPathRef.current === null) { lastPathRef.current = currentPath; return; }
    if (lastPathRef.current === currentPath) return;
    lastPathRef.current = currentPath;
    // An explicit route choice takes priority over a not-yet-played introduction.
    hasSpokenWelcomeRef.current = true;
    if (currentPath.startsWith("/scan")) playTrack("scan");
    else if (currentPath.startsWith("/samples") || currentPath.startsWith("/review")) playTrack("samples");
    else if (currentPath.startsWith("/templates") || currentPath.startsWith("/export")) playTrack("export");
  }, [location.pathname, playTrack]);

  // -------------------------------------------------------------
  // Voice Mute Toggle (Fixed & Immediate for both Audio & TTS)
  // -------------------------------------------------------------
  const toggleVoiceMute = () => {
    setIsVoiceMuted((prev) => {
      const next = !prev;
      isVoiceMutedRef.current = next;

      if (next) {
        if (activeAudioRef.current) {
          activeAudioRef.current.pause();
          activeAudioRef.current.currentTime = 0;
          activeAudioRef.current = null;
        }
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
        isSpeakingRef.current = false;
        currentUtteranceRef.current = null;
        if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
        if (speechBubbleTimerRef.current) clearTimeout(speechBubbleTimerRef.current);
        if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
        if (voicePollRef.current) clearInterval(voicePollRef.current);
        if (talkIntervalRef.current) clearInterval(talkIntervalRef.current);
        setSpeechBubbleActive(false);
      }
      return next;
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
        activeAudioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
      if (speechBubbleTimerRef.current) clearTimeout(speechBubbleTimerRef.current);
      if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
      if (voicePollRef.current) clearInterval(voicePollRef.current);
      if (talkIntervalRef.current) clearInterval(talkIntervalRef.current);
    };
  }, []);

  // -------------------------------------------------------------
  // Microphone Speech Recognition (opt-in)
  // -------------------------------------------------------------
  useEffect(() => {
    const SpeechRec = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRec) return;

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    recognitionRef.current = rec;

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onresult = (event: RecognitionResultEvent) => {
      if (isSpeakingRef.current) return; // Do not transcribe own voice
      if (Date.now() - lastSpeechEndTimeRef.current < 1500) return; // Debounce audio playback echo
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript;
      if (transcript && transcript.trim()) {
        handleUserIntent(transcript);
      }
    };

    rec.onerror = (e: RecognitionErrorEvent) => {
      if (e.error !== "no-speech") {
        setIsListening(false);
      }
    };

    rec.onend = () => {
      setIsListening(false);
      if (isMicOn && !isSpeakingRef.current) {
        try {
          rec.start();
        } catch {
          // Ignore
        }
      }
    };

    if (isMicOn) {
      try {
        rec.start();
      } catch {
        // Ignored if waiting for user interaction
      }
    }

    return () => {
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onstart = null;
      try {
        rec.stop();
      } catch {
        // Cleanup
      }
    };
  }, [isMicOn, handleUserIntent]);

  // Toggle Mic for the user
  const toggleUserMic = () => {
    if (isMicOn) {
      setIsMicOn(false);
      setIsListening(false);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* Already stopped. */ }
      }
    } else {
      setIsMicOn(true);
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* Already listening. */ }
      }
    }
  };

  // -------------------------------------------------------------
  // Procedural Walking Animation & Rig Loop
  // -------------------------------------------------------------
  useEffect(() => {
    let animId: number;

    const renderLoop = (timestamp: number) => {
      const dx = targetXRef.current - posXRef.current;

      if (Math.abs(dx) > 6) {
        isWalkingRef.current = true;
        const dir = dx > 0 ? 1 : -1;

        if (dir !== facingDirRef.current) {
          facingDirRef.current = dir;
          if (rigRef.current) {
            rigRef.current.style.transform = `scaleX(${facingDirRef.current})`;
          }
        }

        posXRef.current += dir * 2.8;
        walkPhaseRef.current += 0.15;
        const walkBounce = Math.abs(Math.sin(walkPhaseRef.current)) * 4;

        if (actorRef.current) {
          actorRef.current.style.left = `${posXRef.current}px`;
          actorRef.current.style.transform = `translateX(-50%) translateY(${-walkBounce}px)`;
        }
        if (shadowRef.current) {
          shadowRef.current.style.left = `${posXRef.current}px`;
        }

        const legAngle = Math.sin(walkPhaseRef.current) * 30;

        if (leftLegRef.current) leftLegRef.current.style.transform = `rotate(${legAngle}deg)`;
        if (rightLegRef.current) rightLegRef.current.style.transform = `rotate(${-legAngle}deg)`;

        const armAngle = Math.sin(walkPhaseRef.current) * 24;
        if (leftArmRef.current) leftArmRef.current.style.transform = `rotate(${-armAngle}deg)`;
        if (rightArmRef.current) rightArmRef.current.style.transform = `rotate(${armAngle}deg)`;

      } else {
        isWalkingRef.current = false;
        const idleBounce = Math.sin(timestamp * 0.003) * 3;
        if (leftLegRef.current) leftLegRef.current.style.transform = `rotate(0deg)`;
        if (rightLegRef.current) rightLegRef.current.style.transform = `rotate(0deg)`;
        if (leftArmRef.current && !isSpeakingRef.current) {
          leftArmRef.current.style.transform = `rotate(${Math.sin(timestamp * 0.003) * 5}deg)`;
        }
        if (rightArmRef.current && !isSpeakingRef.current) {
          rightArmRef.current.style.transform = `rotate(${-Math.sin(timestamp * 0.003) * 5}deg)`;
        }
        if (actorRef.current) {
          actorRef.current.style.transform = `translateX(-50%) translateY(${idleBounce}px)`;
        }
        if (rigRef.current) {
          rigRef.current.style.transform = `scaleX(${facingDirRef.current})`;
        }
      }

      // --- FLUID WAVE & SLOSH PHYSICS ---
      const t = timestamp * 0.0032;
      const targetSlosh = isWalkingRef.current
        ? -facingDirRef.current * 10 + Math.sin(walkPhaseRef.current * 2) * 6
        : 0;
      sloshRef.current += (targetSlosh - sloshRef.current) * 0.08;

      const baseLevel = 120;
      const waveAmp = isWalkingRef.current ? 5.5 : 3.5;
      const yL = baseLevel + sloshRef.current + Math.sin(t * 1.9) * waveAmp;
      const cp1Y = baseLevel + sloshRef.current * 0.4 + Math.sin(t * 2.3 + 1) * waveAmp;
      const midY = baseLevel + Math.sin(t * 2.9 + 2) * (waveAmp * 0.8);
      const cp2Y = baseLevel - sloshRef.current * 0.4 + Math.cos(t * 2.5 + 3) * waveAmp;
      const yR = baseLevel - sloshRef.current + Math.cos(t * 2.0) * waveAmp;

      const wavePath = `M 15,${yL.toFixed(1)} C 55,${cp1Y.toFixed(1)} 80,${cp1Y.toFixed(1)} 100,${midY.toFixed(1)} C 120,${cp2Y.toFixed(1)} 145,${cp2Y.toFixed(1)} 185,${yR.toFixed(1)} L 185,230 L 15,230 Z`;
      const shimmerPath = `M 15,${yL.toFixed(1)} C 55,${cp1Y.toFixed(1)} 80,${cp1Y.toFixed(1)} 100,${midY.toFixed(1)} C 120,${cp2Y.toFixed(1)} 145,${cp2Y.toFixed(1)} 185,${yR.toFixed(1)} L 185,${(yR + 4).toFixed(1)} C 145,${(cp2Y + 4).toFixed(1)} 120,${(cp2Y + 4).toFixed(1)} 100,${(midY + 4).toFixed(1)} C 80,${(cp1Y + 4).toFixed(1)} 55,${(cp1Y + 4).toFixed(1)} 15,${(yL + 4).toFixed(1)} Z`;

      if (fluidPathRef.current) fluidPathRef.current.setAttribute("d", wavePath);
      if (fluidHighlightRef.current) fluidHighlightRef.current.setAttribute("d", shimmerPath);

      // --- RISING OIL BUBBLES ---
      const bubbles = bubblesStateRef.current;
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        b.y -= b.speed;
        if (b.y < 125) {
          b.y = 212 + Math.random() * 8;
          b.x = 50 + Math.random() * 100;
        }
        const bX = b.x + Math.sin(t * 1.5 + b.seed) * 3;
        const bubbleEl = bubbleRefs.current[i];
        if (bubbleEl) {
          bubbleEl.setAttribute("cx", bX.toFixed(1));
          bubbleEl.setAttribute("cy", b.y.toFixed(1));
        }
      }

      // --- POPPING OIL DROPLETS PARTICLE SYSTEM ---
      if (dropletsRef.current.length > 0) {
        dropletsRef.current.forEach((d) => {
          d.x += d.vx;
          d.y += d.vy;
          d.vy += 0.24; // gravity
          d.vx *= 0.985; // air drag
          d.life -= d.decay;
        });

        dropletsRef.current = dropletsRef.current.filter((d) => d.life > 0 && d.y < 250);

        if (dropletsGroupRef.current) {
          if (dropletsRef.current.length === 0) {
            dropletsGroupRef.current.innerHTML = "";
          } else {
            let svgStr = "";
            for (const d of dropletsRef.current) {
              const op = Math.min(1, d.life * 1.5).toFixed(2);
              const ry = (d.r * Math.min(2.2, 1 + Math.abs(d.vy) * 0.14)).toFixed(1);
              svgStr += `<ellipse cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" rx="${d.r.toFixed(1)}" ry="${ry}" fill="${d.color}" opacity="${op}"/><circle cx="${(d.x - d.r * 0.25).toFixed(1)}" cy="${(d.y - d.r * 0.25).toFixed(1)}" r="${(d.r * 0.35).toFixed(1)}" fill="#fff" opacity="${op}"/>`;
            }
            dropletsGroupRef.current.innerHTML = svgStr;
          }
        }
      } else if (dropletsGroupRef.current && dropletsGroupRef.current.innerHTML !== "") {
        dropletsGroupRef.current.innerHTML = "";
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Autonomous wandering
  useEffect(() => {
    const wanderInterval = setInterval(() => {
      if (!isWalkingRef.current && Math.random() > 0.4) {
        const delta = (Math.random() - 0.5) * 360;
        targetXRef.current = Math.max(100, Math.min(window.innerWidth - 180, posXRef.current + delta));
      }
    }, 6000);
    return () => clearInterval(wanderInterval);
  }, []);

  // Mouse pupil tracking
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!actorRef.current || !leftPupilRef.current || !rightPupilRef.current) return;
      const rect = actorRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.5;

      const deltaX = e.clientX - cx;
      const deltaY = e.clientY - cy;
      const dist = Math.hypot(deltaX, deltaY);

      const px = (deltaX / (dist + 1)) * Math.min(dist * 0.03, 4.5);
      const py = (deltaY / (dist + 1)) * Math.min(dist * 0.03, 4.5);

      leftPupilRef.current.style.transform = `translate(${px}px, ${py}px)`;
      rightPupilRef.current.style.transform = `translate(${px}px, ${py}px)`;
    };

    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  // -------------------------------------------------------------
  // Interactive Poking & Friendly Notice
  // -------------------------------------------------------------
  const pokeActor = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!isVoiceMutedRef.current) playHelperPop();
    const nextPoke = pokeCount + 1;
    setPokeCount(nextPoke);

    // 1. Slosh impulse to fluid
    sloshRef.current = (Math.random() > 0.5 ? 1 : -1) * 18;

    // 2. Spawn popping oil droplets that burst out of the bottle spout
    const count = 9 + Math.floor(Math.random() * 5);
    const oilColors = ["#F59E0B", "#FBBF24", "#34D399", "#10B981", "#FDE047", "#059669"];
    const newDrops: typeof dropletsRef.current = [];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const speed = 4.2 + Math.random() * 5.2;
      newDrops.push({
        id: Math.random(),
        x: 100 + (Math.random() - 0.5) * 16,
        y: 22,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 2.2 + Math.random() * 2.8,
        color: oilColors[Math.floor(Math.random() * oilColors.length)],
        life: 1.0,
        decay: 0.018 + Math.random() * 0.016,
      });
    }
    dropletsRef.current.push(...newDrops);

    if (actorRef.current) {
      actorRef.current.classList.remove("poking");
      void actorRef.current.offsetWidth;
      actorRef.current.classList.add("poking");
      setTimeout(() => actorRef.current?.classList.remove("poking"), 450);
    }

    if (pokeCooloffRef.current) clearTimeout(pokeCooloffRef.current);

    // Repeat the recorded voice instructions for whichever tab the user is currently at
    const currentPath = location.pathname.toLowerCase();
    if (!hasSpokenWelcomeRef.current) {
      hasSpokenWelcomeRef.current = true;
      playTrack("greeting");
    } else if (currentPath.startsWith("/samples")) {
      playTrack("samples");
    } else if (currentPath.startsWith("/templates") || currentPath.startsWith("/export") || currentPath.startsWith("/review")) {
      playTrack("export");
    } else if (currentPath.startsWith("/scan")) {
      playTrack("scan");
    } else {
      playTrack("greeting");
    }

    pokeCooloffRef.current = setTimeout(() => {
      setPokeCount(0);
      setMood("cheerful");
    }, 5000);
  };

  const currentExp = EXPRESSIONS[mood] || EXPRESSIONS.cheerful;

  return (
    <div className="oiled-helper-root" aria-label="Oiled Helper Companion">
      <div className="oiled-helper-baseline" />

      {/* Floor Contact Shadow */}
      <div className="oiled-actor-shadow" ref={shadowRef} style={{ left: `${posXRef.current}px` }} />

      {/* The Animated Walking Flask Character */}
      <div
        className="oiled-actor"
        ref={actorRef}
        style={{ left: `${posXRef.current}px` }}
        onClick={pokeActor}
        role="button"
        tabIndex={0}
        aria-label="Interact with Oiled Helper"
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault(); pokeActor(event);
          }
        }}
        title="Oiled Helper — Click or touch to interact!"
      >
        {/* Liquid Glass 3-Word Popup */}
        <div className={`oiled-speech-bubble ${speechBubbleActive ? "active" : ""}`}>
          <span key={displayWords} className="oiled-speech-text">
            {displayWords}
          </span>
        </div>

        {/* Character Rig Container - receives scaleX flip when changing direction, so the speech bubble stays forward-facing and readable */}
        <div className="oiled-character-rig" ref={rigRef}>
          <svg className="oiled-svg" viewBox="0 0 200 250">
            <defs>
              {/* Oiled Fluid Gradient (Amber/Golden Oil + Laboratory Emerald) */}
              <linearGradient id="oil-fluid-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#34D399" />
                <stop offset="45%" stopColor="#25633E" />
                <stop offset="85%" stopColor="#CA8A04" />
                <stop offset="100%" stopColor="#122E50" />
              </linearGradient>

              <linearGradient id="oil-angry-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F87171" />
                <stop offset="60%" stopColor="#DC2626" />
                <stop offset="100%" stopColor="#7F1D1D" />
              </linearGradient>

              <clipPath id="oiled-flask-clip">
                <path d="M 82,25 L 82,70 L 32,190 C 26,204 38,216 54,216 L 146,216 C 162,216 174,204 168,190 L 118,70 L 118,25 Z" />
              </clipPath>
            </defs>

            {/* LEGS ATTACHED UNDER BASE */}
            <g ref={leftLegRef} style={{ transformOrigin: "70px 212px" }}>
              <path className="oiled-limb-leg" d="M 70,212 L 68,235" />
              <g style={{ transformOrigin: "68px 235px" }}>
                <path className="oiled-shoe" d="M 52,234 C 52,228 78,228 80,234 L 80,243 C 74,244 54,244 52,243 Z" />
                <rect className="oiled-shoe-sole" x="50" y="242" width="32" height="4" rx="2" />
              </g>
            </g>

            <g ref={rightLegRef} style={{ transformOrigin: "130px 212px" }}>
              <path className="oiled-limb-leg" d="M 130,212 L 132,235" />
              <g style={{ transformOrigin: "132px 235px" }}>
                <path className="oiled-shoe" d="M 120,234 C 120,228 146,228 148,234 L 148,243 C 142,244 122,244 120,243 Z" />
                <rect className="oiled-shoe-sole" x="118" y="242" width="32" height="4" rx="2" />
              </g>
            </g>

            {/* FLASK BODY & OIL FLUID */}
            <g>
              <g clipPath="url(#oiled-flask-clip)">
                {/* Dynamic Animated Fluid Wave Surface */}
                <path ref={fluidPathRef} className="oiled-fluid" style={{ fill: currentExp.fluid }} d="M 20,118 Q 60,112 100,116 T 180,118 L 180,225 L 20,225 Z" />
                {/* Liquid Crest Shimmer Highlight */}
                <path ref={fluidHighlightRef} className="oiled-fluid-shimmer" fill="rgba(255, 255, 255, 0.25)" d="" />

                {/* Rising Liquid Bubbles */}
                <g>
                  {bubblesStateRef.current.map((b, idx) => (
                    <circle
                      key={idx}
                      ref={(el) => { bubbleRefs.current[idx] = el; }}
                      cx={b.x}
                      cy={b.y}
                      r={b.r}
                      fill="rgba(255,255,255,0.48)"
                    />
                  ))}
                </g>
                <ellipse className="oiled-cheeks" cx="68" cy="162" rx="8" ry="5" />
                <ellipse className="oiled-cheeks" cx="132" cy="162" rx="8" ry="5" />
              </g>

              <path className="oiled-glass-shell" d="M 82,25 L 82,70 L 32,190 C 26,204 38,216 54,216 L 146,216 C 162,216 174,204 168,190 L 118,70 L 118,25 Z" />
              <rect className="oiled-glass-shell" x="76" y="20" width="48" height="8" rx="4" />

              {/* Specular Glare */}
              <path d="M 88,32 L 88,68 L 48,165 C 44,175 48,188 52,200" stroke="rgba(255,255,255,0.45)" strokeWidth="3" strokeLinecap="round" fill="none" />

              {/* FACE */}
              <g transform="translate(76, 148)">
                <ellipse className="oiled-eye-sclera" cx="0" cy="0" rx="12" ry="15" />
                <ellipse ref={leftPupilRef} className="oiled-pupil" cx="0" cy="0" rx="6" ry="8" />
                <circle cx="-2" cy="-3" r="2.5" fill="#fff" />
              </g>

              <g transform="translate(124, 148)">
                <ellipse className="oiled-eye-sclera" cx="0" cy="0" rx="12" ry="15" />
                <ellipse ref={rightPupilRef} className="oiled-pupil" cx="0" cy="0" rx="6" ry="8" />
                <circle cx="-2" cy="-3" r="2.5" fill="#fff" />
              </g>

              <path className="oiled-eyebrow" d={currentExp.leftEyebrow} />
              <path className="oiled-eyebrow" d={currentExp.rightEyebrow} />
              <path ref={mouthRef} className="oiled-mouth" d={currentExp.mouth} />
            </g>

            {/* ARMS & GLOVES */}
            <g ref={leftArmRef} style={{ transformOrigin: "52px 105px" }}>
              <path className="oiled-limb-arm" d="M 52,105 Q 32,125 24,145" />
              <g transform="translate(24, 145)">
                <circle className="oiled-glove" cx="0" cy="0" r="8.5" />
                <ellipse className="oiled-glove" cx="5" cy="-2" rx="3.5" ry="4.5" transform="rotate(-30 5 -2)" />
              </g>
            </g>

            <g ref={rightArmRef} style={{ transformOrigin: "148px 105px" }}>
              <path className="oiled-limb-arm" d="M 148,105 Q 168,125 176,145" />
              <g transform="translate(176, 145)">
                <circle className="oiled-glove" cx="0" cy="0" r="8.5" />
                <ellipse className="oiled-glove" cx="-5" cy="-2" rx="3.5" ry="4.5" transform="rotate(30 -5 -2)" />
              </g>
            </g>

            {/* POPPING OIL DROPLETS LAYER (bursting from the flask top when touched) */}
            <g ref={dropletsGroupRef} className="oiled-droplets-layer" pointerEvents="none" />
          </svg>
        </div>
      </div>

      {/* Minimal Dock (ONLY Mic and Voice) */}
      <div className="oiled-dock">
        {/* User Mic Toggle Button */}
        <button
          className={`oiled-dock-btn ${isMicOn ? (isListening ? "mic-listening" : "mic-on") : "mic-off"}`}
          onClick={toggleUserMic}
          title={isMicOn ? "Microphone is ON and listening (click to mute)" : "Microphone is OFF (click to listen)"}
        >
          <span>{isMicOn ? "🎤" : "🔇"}</span>
          <span>{isMicOn ? (isListening ? "Listening..." : "Mic: ON") : "Mic: OFF"}</span>
        </button>

        {/* Audio Mute */}
        <button
          className={`oiled-dock-btn ${isVoiceMuted ? "voice-muted" : "voice-on"}`}
          onClick={toggleVoiceMute}
          title={isVoiceMuted ? "Unmute Oiled Helper voice" : "Mute Oiled Helper voice"}
        >
          <span>{isVoiceMuted ? "🔇" : "🔊"}</span>
          <span>{isVoiceMuted ? "Voice: Muted" : "Voice"}</span>
        </button>
      </div>
    </div>
  );
}
