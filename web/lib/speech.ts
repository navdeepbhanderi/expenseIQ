"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser speech recognition, behind a hook.
 *
 * The backend team's own measurement drives this: browser transcript → text
 * was 2.2–2.6s and as accurate as sending audio (4.7–5.1s), because the model
 * reconstructs phonetically-mangled romanisation anyway. So the transcript is
 * the default path and audio upload is the fallback for browsers that cannot
 * listen at all.
 *
 * `lang` is set to en-IN rather than hi-IN deliberately. Indian English
 * recognition handles code-mixed speech — "kal swiggy se 482 ka order" — far
 * better than a Hindi model does, and the LLM does the real language work
 * downstream. Forcing hi-IN makes English words in the same sentence worse.
 */

const LANG = "en-IN";

interface SpeechResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: { 0: { transcript: string }; isFinal: boolean };
  };
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;

  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };

  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechState = "idle" | "listening" | "denied" | "unsupported";

export function useSpeech({
  onFinal,
}: {
  /** Called once with the complete transcript when listening stops. */
  onFinal: (transcript: string) => void;
}) {
  const [state, setState] = useState<SpeechState>("idle");
  const [transcript, setTranscript] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const recognitionRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  // Held in a ref so the recognition callbacks always see the current handler
  // without tearing down and rebuilding the recogniser on every render.
  // Assigned in an effect rather than during render — a render can be thrown
  // away, and a ref written during one that never commits is a stale handler.
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const supported = getRecognitionCtor() !== null;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();

    if (!Ctor) {
      setState("unsupported");
      return;
    }

    const recognition = new Ctor();
    recognitionRef.current = recognition;
    finalRef.current = "";
    setTranscript("");
    setElapsed(0);

    recognition.lang = LANG;
    // Interim results are what design 5b renders while the user is still
    // speaking — the whole point of using the browser rather than uploading
    // audio at the end.
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        if (result.isFinal) finalRef.current += result[0].transcript;
        else interim += result[0].transcript;
      }

      setTranscript((finalRef.current + interim).trim());
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are ordinary — the user said nothing, or
      // cancelled. Only a permission refusal is worth a different UI.
      setState(event.error === "not-allowed" ? "denied" : "idle");
    };

    recognition.onend = () => {
      setState("idle");
      const text = finalRef.current.trim();
      if (text) onFinalRef.current(text);
    };

    try {
      recognition.start();
      setState("listening");
    } catch {
      // start() throws if called while already running.
      setState("idle");
    }
  }, []);

  // The 0:03 counter in design 5b.
  useEffect(() => {
    if (state !== "listening") return;

    const timer = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  // Anything still listening when the component goes away must be torn down,
  // or the microphone indicator stays on after the user has navigated off.
  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  return { state, transcript, elapsed, supported, start, stop };
}
