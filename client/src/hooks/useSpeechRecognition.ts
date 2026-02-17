import { useState, useCallback, useRef, useEffect } from 'react';

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

/** Single result: has transcript and isFinal. */
interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: { readonly transcript: string };
}

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined;

/** Indian English for better accuracy with Indian food names (idli, roti, sambar, etc.). */
const DEFAULT_LANG = 'en-IN';

/** After this many ms of no new final speech, stop and fill. */
const SILENCE_TIMEOUT_MS = 2500;
/** Absolute max listening time (ms). */
const MAX_LISTEN_MS = 60000;

/**
 * Maps app locale to Web Speech API lang for accurate recognition.
 * en -> en-IN, hi -> hi-IN, ta -> ta-IN.
 */
export function localeToSpeechLang(locale: string): string {
  if (locale === 'hi') return 'hi-IN';
  if (locale === 'ta') return 'ta-IN';
  return 'en-IN';
}

export function useSpeechRecognition(options?: { lang?: string; continuous?: boolean }) {
  const lang = options?.lang ?? DEFAULT_LANG;
  const continuous = options?.continuous ?? true;
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultCallbackRef = useRef<((transcript: string) => void) | null>(null);
  const finalTranscriptRef = useRef<string[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supported = !!SpeechRecognitionAPI;

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxListenTimerRef.current) {
      clearTimeout(maxListenTimerRef.current);
      maxListenTimerRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    clearTimers();
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [clearTimers]);

  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!SpeechRecognitionAPI) {
        setError('Voice input is not supported in this browser. Try Chrome or Edge.');
        return;
      }
      setError(null);
      onResultCallbackRef.current = onResult;
      finalTranscriptRef.current = [];
      clearTimers();

      const rec = new SpeechRecognitionAPI() as SpeechRecognitionInstance;
      recognitionRef.current = rec;
      rec.continuous = continuous;
      rec.interimResults = true;
      rec.lang = lang;
      rec.maxAlternatives = 3;

      const deliverAndCleanup = () => {
        const full = finalTranscriptRef.current.join(' ').trim();
        if (onResultCallbackRef.current) {
          if (full) onResultCallbackRef.current(full);
          onResultCallbackRef.current = null;
        }
        finalTranscriptRef.current = [];
        recognitionRef.current = null;
        clearTimers();
        setIsListening(false);
      };

      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/\.\s*/g, ' ').trim();

      rec.onresult = (e: SpeechRecognitionEvent) => {
        const results = e.results;
        const segments = finalTranscriptRef.current;
        let hadNewFinal = false;
        for (let i = 0; i < results.length; i++) {
          const result = results[i] as unknown as SpeechRecognitionResultLike;
          if (result.isFinal && result.length > 0) {
            const transcript = (result[0] as { transcript: string }).transcript?.trim();
            if (!transcript) continue;
            const last = segments.length > 0 ? segments[segments.length - 1] : '';
            const full = segments.join(' ');
            const normFull = normalize(full);
            const normNew = normalize(transcript);

            if (transcript === last) continue;
            if (normNew.length > 8 && normFull.includes(normNew)) continue;
            if (normFull.length > 8 && normNew.includes(normFull) && normNew.length > normFull.length) {
              segments.length = 0;
              segments.push(transcript);
              hadNewFinal = true;
              continue;
            }
            if (last && transcript.startsWith(last)) {
              const delta = transcript.slice(last.length).replace(/^[\s.,]+/, '').trim();
              if (!delta) continue;
              if (delta === last || delta.startsWith(last)) continue;
              segments[segments.length - 1] = transcript;
            } else if (last && last.startsWith(transcript)) {
              continue;
            } else {
              segments.push(transcript);
            }
            hadNewFinal = true;
          }
        }
        if (hadNewFinal) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null;
            if (recognitionRef.current === rec) {
              try {
                rec.stop();
              } catch {
                // ignore
              }
            }
          }, SILENCE_TIMEOUT_MS);
        }
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        const err = e.error || '';
        if (err === 'no-speech') {
          if (finalTranscriptRef.current.length === 0) {
            setError('No speech detected. Try again.');
          }
        } else if (err === 'aborted') {
          // User or code stopped; don't show error
        } else if (err === 'not-allowed' || err === 'service-not-allowed') {
          setError('Microphone access was denied.');
        } else if (err === 'network') {
          setError('Network error. Check connection and try again.');
        } else {
          setError(err && e.message ? `${err}: ${e.message}` : 'Voice recognition failed. Try again.');
        }
        recognitionRef.current = null;
        clearTimers();
        setIsListening(false);
      };

      rec.onend = () => {
        const full = finalTranscriptRef.current.join(' ').trim();
        if (full && onResultCallbackRef.current) {
          onResultCallbackRef.current(full);
        }
        onResultCallbackRef.current = null;
        finalTranscriptRef.current = [];
        recognitionRef.current = null;
        clearTimers();
        setIsListening(false);
      };

      try {
        rec.start();
        setIsListening(true);
        maxListenTimerRef.current = setTimeout(() => {
          maxListenTimerRef.current = null;
          if (recognitionRef.current === rec) {
            try {
              rec.stop();
            } catch {
              // ignore
            }
          }
        }, MAX_LISTEN_MS);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start voice input.');
        clearTimers();
        setIsListening(false);
      }
    },
    [lang, continuous, clearTimers],
  );

  useEffect(() => {
    return () => {
      clearTimers();
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
    };
  }, [clearTimers]);

  return { supported, isListening, error, setError, startListening, stopListening };
}
