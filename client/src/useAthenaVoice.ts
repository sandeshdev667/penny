// Athena's voice. She speaks only with ElevenLabs (through our server). If that isn't set up or fails,
// she stays silent and the page shows why. You can also speak to her with the microphone.

import { useCallback, useEffect, useRef, useState } from "react";

const AUTO_KEY = "penny.athenaAutoSpeak";
function loadAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== "off"; // default: ON, she speaks her answers
  } catch {
    return true;
  }
}

// The browser's speech recognition (Chrome and Safari call it "webkitSpeechRecognition")
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;
const getRecognition = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function useAthenaVoice() {
  const [autoSpeak, setAutoSpeakState] = useState(loadAuto);
  const [speaking, setSpeaking] = useState<string | null>(null); // the text being spoken right now
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null); // why she couldn't speak (shown on the page)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const runRef = useRef(0); // each speak() gets a number, so an old request can't play after a newer one started

  const supportsMic = typeof window !== "undefined" && getRecognition() !== null;

  function setAutoSpeak(on: boolean) {
    setAutoSpeakState(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? "on" : "off");
    } catch {
      // storage blocked: it still works, it just won't be remembered
    }
  }

  const stop = useCallback(() => {
    runRef.current++;
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setSpeaking(null);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      stop();
      setError(null);
      const run = runRef.current;
      setSpeaking(text);
      try {
        const res = await fetch("/api/athena/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Athena's voice is unavailable");
        }
        const blob = await res.blob();
        if (runRef.current !== run) return; // something newer started meanwhile
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          if (runRef.current === run) setSpeaking(null);
        };
        await audio.play();
      } catch (err) {
        if (runRef.current === run) {
          setSpeaking(null);
          setError(err instanceof Error ? err.message : "Athena's voice is unavailable");
        }
      }
    },
    [stop],
  );

  // Listen once; calls onText with what you said
  const listen = useCallback(
    (onText: (text: string) => void) => {
      const Ctor = getRecognition();
      if (!Ctor) return;
      stop();
      if (listening) {
        recognitionRef.current?.stop();
        return;
      }
      const rec = new Ctor();
      recognitionRef.current = rec;
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        const text = e.results[0]?.[0]?.transcript?.trim();
        if (text) onText(text);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      setListening(true);
      try {
        rec.start();
      } catch {
        setListening(false);
      }
    },
    [listening, stop],
  );

  // stop talking when leaving the page
  useEffect(() => stop, [stop]);

  return { autoSpeak, setAutoSpeak, speaking, speak, stop, error, listening, listen, supportsMic };
}
