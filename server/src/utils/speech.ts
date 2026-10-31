import { RutoLanguage, Waypoint } from '../types';

// Minimal Web Speech API TypeScript definitions for cross-browser SpeechRecognition
export interface BrowserSpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

export interface BrowserSpeechRecognitionResultList {
  length: number;
  [index: number]: BrowserSpeechRecognitionResult;
}

export interface BrowserSpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: BrowserSpeechRecognitionResultList;
}

export interface BrowserSpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface BrowserSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((this: BrowserSpeechRecognition, ev: Event) => unknown) | null;
  onresult:
    | ((
        this: BrowserSpeechRecognition,
        ev: BrowserSpeechRecognitionEvent
      ) => unknown)
    | null;
  onerror:
    | ((
        this: BrowserSpeechRecognition,
        ev: BrowserSpeechRecognitionErrorEvent
      ) => unknown)
    | null;
  onend: ((this: BrowserSpeechRecognition, ev: Event) => unknown) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export function speechLocaleForLanguage(language: RutoLanguage): string {
  if (language === 'Yoruba') return 'yo-NG';
  // Nigerian English locale handles English + Naija Pidgin campus vocabulary cleanly
  return 'en-NG';
}

export function createSpeechRecognition(
  language: RutoLanguage
): BrowserSpeechRecognition | null {
  const Ctor = getSpeechRecognitionConstructor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = speechLocaleForLanguage(language);
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  return recognition;
}

export function friendlySpeechErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was blocked. Allow mic access in your browser address bar and try again.';
    case 'no-speech':
      return 'No speech was detected. Hold the phone closer and speak your route clearly.';
    case 'audio-capture':
      return 'No microphone was found on this device.';
    case 'network':
      return 'Browser speech recognition needs a brief network connection, or type your route directly.';
    default:
      return 'Voice dictation stopped unexpectedly. Tap the mic to try again.';
  }
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

function selectBestVoice(language: RutoLanguage): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  if (language === 'Yoruba') {
    const yoVoice = voices.find((v) =>
      v.lang.toLowerCase().startsWith('yo')
    );
    if (yoVoice) return yoVoice;
  }

  // Prefer Nigerian English voice first for authentic campus cadence, then GB/US English
  const ngVoice = voices.find(
    (v) => v.lang.toLowerCase() === 'en-ng' || v.name.toLowerCase().includes('nigeria')
  );
  if (ngVoice) return ngVoice;

  const gbVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en-gb'));
  if (gbVoice) return gbVoice;

  const anyEn = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
  return anyEn || voices[0] || null;
}

export function stopSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore browser synthesis errors
  }
}

export function speakRouteText(
  text: string,
  language: RutoLanguage = 'English',
  callbacks?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  }
): boolean {
  if (!isSpeechSynthesisSupported() || !text.trim()) {
    callbacks?.onError?.();
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text.trim());
    const voice = selectBestVoice(language);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = speechLocaleForLanguage(language);
    }
    utterance.rate = 0.96;
    utterance.pitch = 1.0;

    utterance.onstart = () => callbacks?.onStart?.();
    utterance.onend = () => callbacks?.onEnd?.();
    utterance.onerror = () => callbacks?.onEnd?.();

    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    callbacks?.onError?.();
    return false;
  }
}

export function buildStepSpeechLine(params: {
  stepIndex: number;
  totalSteps: number;
  waypoint: Waypoint | undefined;
  directionSentence?: string;
  prefix?: string;
}): string {
  const { stepIndex, totalSteps, waypoint, directionSentence, prefix } = params;
  if (!waypoint) return '';

  const coreInstruction =
    directionSentence && directionSentence.trim()
      ? directionSentence.trim()
      : `${waypoint.name}.${waypoint.note ? ` ${waypoint.note}.` : ''}`;

  const turnHint =
    stepIndex < totalSteps - 1 &&
    waypoint.turn &&
    waypoint.turn !== 'straight'
      ? ` Prepare to turn ${waypoint.turn}.`
      : '';

  return `${prefix ? `${prefix} ` : ''}Step ${stepIndex + 1} of ${totalSteps}: ${coreInstruction}${turnHint}`;
}
