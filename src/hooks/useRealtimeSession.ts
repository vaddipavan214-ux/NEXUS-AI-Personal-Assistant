"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { OrbState } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RealtimeSession {
  orbState: OrbState;
  active: boolean;
  connecting: boolean;
  error: string | null;
  activate: () => Promise<void>;
  deactivate: () => void;
  getLevel: () => number;
  /** Inject a system note (e.g. "Gmail connected") and have Nexus respond. */
  notifySystem: (text: string) => void;
  /** Immediately halt speech synthesis output. */
  stopSpeaking: () => void;
  /** Direct text command submission from keyboard. */
  sendTextMessage: (text: string) => Promise<void>;
  /** Whether Nexus is actively outputting speech. */
  isSpeaking: boolean;
  /** Active tool name being executed by the neural engine. */
  activeTool: string | null;
}

function rms(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
}

function getAuthTokenFallback(): string | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes("__convexAuthJWT")) {
        const val = localStorage.getItem(key);
        if (val) return val;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Clean markdown syntax for natural browser speech synthesis. */
function sanitizeForSpeech(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/[#>\-~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function useRealtimeSession(): RealtimeSession {
  const [orbState, setOrbStateRaw] = useState<OrbState>("idle");
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpeakingState, setIsSpeakingState] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const activeRef = useRef(false);
  const orbStateRef = useRef<OrbState>("idle");
  const isSpeakingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          userLocationRef.current = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
        },
        () => {},
        { timeout: 8000 }
      );
    }
  }, []);

  // Audio & Mic analysis
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const levelBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Browser Speech Recognition & Synthesis
  const recognitionRef = useRef<any>(null);
  const speechVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Conversation history for Groq context
  const conversationHistoryRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);

  // Active user turn tracking
  const currentTurnItemIdRef = useRef<string | null>(null);
  const currentTurnTextRef = useRef<string>("");
  const turnSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authToken = useAuthToken();
  const authTokenRef = useRef<string | null>(null);
  authTokenRef.current = authToken ?? null;

  const upsertStreaming = useMutation(api.messages.upsertStreaming);
  const finalizeMessage = useMutation(api.messages.finalize);
  const logTimeline = useMutation(api.timeline.log);
  const setVoiceState = useMutation(api.voiceState.set);

  // Load browser speech synthesis voices
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const updateVoices = () => {
      speechVoicesRef.current = window.speechSynthesis.getVoices();
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, []);

  const setOrb = useCallback(
    (state: OrbState, opts?: { flashBackTo?: OrbState; flashMs?: number }) => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      orbStateRef.current = state;
      setOrbStateRaw(state);
      void setVoiceState({ orbState: state, sessionActive: activeRef.current }).catch(() => {});
      if (opts?.flashBackTo) {
        flashTimerRef.current = setTimeout(() => {
          orbStateRef.current = opts.flashBackTo!;
          setOrbStateRaw(opts.flashBackTo!);
          void setVoiceState({ orbState: opts.flashBackTo!, sessionActive: activeRef.current }).catch(() => {});
        }, opts.flashMs ?? 1000);
      }
    },
    [setVoiceState]
  );

  /* -------------------------------------------------------------- */
  /* Text to Speech (Jarvis Voice)                                  */
  /* -------------------------------------------------------------- */

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setIsSpeakingState(false);
    currentUtteranceRef.current = null;
    if (activeRef.current) {
      setOrb("listening");
    }
  }, [setOrb]);

  const speakText = useCallback(
    async (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const cleanText = sanitizeForSpeech(text);
      if (!cleanText) {
        if (activeRef.current) setOrb("listening");
        return;
      }

      stopSpeaking();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      currentUtteranceRef.current = utterance;

      // Select voice: Prefer UK English (British persona) -> any English
      const voices = speechVoicesRef.current.length > 0 ? speechVoicesRef.current : window.speechSynthesis.getVoices();
      const britishVoice = voices.find(
        (v) =>
          (v.lang === "en-GB" || v.name.includes("UK") || v.name.includes("British") || v.name.includes("Oliver") || v.name.includes("George")) &&
          !v.name.includes("Female")
      ) ?? voices.find((v) => v.lang.startsWith("en-GB")) ?? voices.find((v) => v.lang.startsWith("en"));

      if (britishVoice) {
        utterance.voice = britishVoice;
      }

      utterance.rate = 1.05;
      utterance.pitch = 0.98;

      utterance.onstart = () => {
        isSpeakingRef.current = true;
        setIsSpeakingState(true);
        setOrb("speaking");
      };

      utterance.onend = () => {
        isSpeakingRef.current = false;
        setIsSpeakingState(false);
        currentUtteranceRef.current = null;
        if (activeRef.current) {
          setOrb("listening");
          // Resume recognition if needed
          try {
            recognitionRef.current?.start();
          } catch {
            /* already started */
          }
        }
      };

      utterance.onerror = (e) => {
        if (e.error !== "canceled" && e.error !== "interrupted") {
          console.warn("[nexus] TTS error:", e.error);
        }
        isSpeakingRef.current = false;
        setIsSpeakingState(false);
        currentUtteranceRef.current = null;
        if (activeRef.current) {
          setOrb("listening");
          try {
            recognitionRef.current?.start();
          } catch {
            /* already started */
          }
        }
      };

      window.speechSynthesis.speak(utterance);
    },
    [setOrb, stopSpeaking]
  );

  /* -------------------------------------------------------------- */
  /* Send message to Groq AI backend                                */
  /* -------------------------------------------------------------- */

  const submitUserMessage = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed || isProcessingRef.current) return;

      isProcessingRef.current = true;
      setOrb("thinking");

      void logTimeline({ kind: "planning", label: "Planning response", detail: "Consulting Groq" }).catch(() => {});

      try {
        const token = authTokenRef.current || getAuthTokenFallback();
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: trimmed,
            messages: conversationHistoryRef.current.slice(-10),
            userLocation: userLocationRef.current ?? undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          let errText = data.error ?? `Chat request failed (${res.status})`;
          try {
            const jsonStart = errText.indexOf("{");
            if (jsonStart !== -1) {
              const parsed = JSON.parse(errText.slice(jsonStart));
              if (parsed?.error?.message) {
                errText = parsed.error.message;
              }
            }
          } catch {
            /* ignore */
          }
          throw new Error(errText);
        }

        const reply = data.response ?? "";

        // Log timeline and record history
        conversationHistoryRef.current.push({ role: "user", content: trimmed });
        conversationHistoryRef.current.push({ role: "assistant", content: reply });

        if (data.toolsExecuted && data.toolsExecuted.length > 0) {
          const lastTool = data.toolsExecuted[data.toolsExecuted.length - 1];
          setActiveTool(lastTool.name);
          setTimeout(() => setActiveTool(null), 4000);
        }

        void logTimeline({ kind: "response_generated", label: "Response generated" }).catch(() => {});

        // Save assistant reply to Convex transcript
        const assistantItemId = "asst_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        await finalizeMessage({
          itemId: assistantItemId,
          role: "assistant",
          text: reply,
        });

        // Speak the reply through browser speech synthesis
        await speakText(reply);
      } catch (err: any) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[nexus] Chat error:", message);
        setError(message);
        setOrb("error", { flashBackTo: "listening", flashMs: 2000 });
        void logTimeline({ kind: "error", label: "Error encountered", detail: message }).catch(() => {});
      } finally {
        isProcessingRef.current = false;
      }
    },
    [finalizeMessage, logTimeline, setOrb, speakText]
  );

  const sendTextMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isProcessingRef.current) return;

      if (isSpeakingRef.current) {
        stopSpeaking();
      }

      const itemId = "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      await finalizeMessage({ itemId, role: "user", text: trimmed });
      void logTimeline({ kind: "user_spoke", label: "User sent message", detail: trimmed.slice(0, 80) }).catch(() => {});

      await submitUserMessage(trimmed);
    },
    [finalizeMessage, logTimeline, stopSpeaking, submitUserMessage]
  );

  /* -------------------------------------------------------------- */
  /* Speech Recognition Setup                                       */
  /* -------------------------------------------------------------- */

  const commitTurn = useCallback(() => {
    if (turnSilenceTimerRef.current) {
      clearTimeout(turnSilenceTimerRef.current);
      turnSilenceTimerRef.current = null;
    }

    const text = currentTurnTextRef.current.trim();
    const itemId = currentTurnItemIdRef.current;

    currentTurnTextRef.current = "";
    currentTurnItemIdRef.current = null;

    if (!text || !itemId) return;

    // Finalize user message in Convex
    void finalizeMessage({ itemId, role: "user", text }).catch(() => {});
    void logTimeline({ kind: "user_spoke", label: "User spoke", detail: text.slice(0, 80) }).catch(() => {});

    // Temporarily pause speech recognition while Jarvis processes & answers
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }

    void submitUserMessage(text);
  }, [finalizeMessage, logTimeline, submitUserMessage]);

  const initSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;

    const SpeechRecognition =
      (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error("Speech recognition is not supported in this browser. Please use Google Chrome.");
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      if (!isSpeakingRef.current && !isProcessingRef.current && activeRef.current) {
        setOrb("listening");
      }
    };

    recognition.onresult = (event: any) => {
      // Barge-in: if Jarvis is speaking and the user speaks, interrupt Jarvis immediately!
      if (isSpeakingRef.current) {
        stopSpeaking();
        void logTimeline({
          kind: "speech_interrupted",
          label: "Speech interrupted",
          detail: "User barge-in",
        }).catch(() => {});
        setOrb("listening");
      }

      let interim = "";
      let finalSegment = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalSegment += transcript;
        } else {
          interim += transcript;
        }
      }

      // Initialize an item ID for the current user turn if not yet created
      if (!currentTurnItemIdRef.current) {
        currentTurnItemIdRef.current = "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      }

      const itemId = currentTurnItemIdRef.current;

      if (finalSegment) {
        currentTurnTextRef.current = (currentTurnTextRef.current + " " + finalSegment).trim();
      }

      const displayAcc = (currentTurnTextRef.current + " " + interim).trim();

      if (displayAcc) {
        void upsertStreaming({ itemId, role: "user", text: displayAcc }).catch(() => {});
      }

      // Reset turn silence timer
      if (turnSilenceTimerRef.current) {
        clearTimeout(turnSilenceTimerRef.current);
      }

      // If user pauses for 900ms after speaking, commit the turn
      if (finalSegment || interim) {
        turnSilenceTimerRef.current = setTimeout(() => {
          commitTurn();
        }, 900);
      }
    };

    recognition.onerror = (event: any) => {
      // Benign errors like no-speech can happen during silence; ignore them
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.warn("[nexus] recognition error:", event.error);
      if (event.error === "not-allowed") {
        setError("Microphone permission was denied. Please allow microphone access in Chrome.");
      }
    };

    recognition.onend = () => {
      // If session is still active and not processing or speaking, keep listening
      if (activeRef.current && !isProcessingRef.current && !isSpeakingRef.current) {
        try {
          recognition.start();
        } catch {
          /* already started */
        }
      }
    };

    return recognition;
  }, [commitTurn, logTimeline, setOrb, stopSpeaking, upsertStreaming]);

  /* -------------------------------------------------------------- */
  /* Session lifecycle                                              */
  /* -------------------------------------------------------------- */

  const deactivate = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    isSpeakingRef.current = false;
    isProcessingRef.current = false;

    if (turnSilenceTimerRef.current) {
      clearTimeout(turnSilenceTimerRef.current);
      turnSilenceTimerRef.current = null;
    }

    stopSpeaking();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }

    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    void audioCtxRef.current?.close().catch(() => {});

    micStreamRef.current = null;
    audioCtxRef.current = null;
    micAnalyserRef.current = null;

    orbStateRef.current = "idle";
    setOrbStateRaw("idle");
    void setVoiceState({ orbState: "idle", sessionActive: false }).catch(() => {});
  }, [setVoiceState, stopSpeaking]);

  const activate = useCallback(async () => {
    if (active || connecting) return;
    setConnecting(true);
    setError(null);

    try {
      // 1. Request microphone access for real-time audio visualization
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = micStream;

      // 2. Setup Web Audio Analyser for Orb audio reactivity
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 512;
      audioCtx.createMediaStreamSource(micStream).connect(micAnalyser);
      micAnalyserRef.current = micAnalyser;
      levelBufRef.current = new Uint8Array(new ArrayBuffer(512));

      // 3. Setup Chrome Speech Recognition
      const recognition = initSpeechRecognition();
      if (!recognition) throw new Error("Could not initialize Speech Recognition");
      recognitionRef.current = recognition;
      recognition.start();

      activeRef.current = true;
      setActive(true);
      setOrb("listening");

      void logTimeline({
        kind: "completed",
        label: "NEXUS online",
        detail: "Neural assistant active (Groq AI)",
      }).catch(() => {});
      void setVoiceState({ orbState: "listening", sessionActive: true }).catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setOrb("error", { flashBackTo: "idle", flashMs: 2000 });
      deactivate();
    } finally {
      setConnecting(false);
    }
  }, [active, connecting, deactivate, initSpeechRecognition, logTimeline, setOrb, setVoiceState]);

  const notifySystem = useCallback(
    (text: string) => {
      void submitUserMessage(text);
    },
    [submitUserMessage]
  );

  const getLevel = useCallback((): number => {
    const state = orbStateRef.current;

    // While Jarvis is speaking, generate animated harmonic speech pulse for Orb
    if (state === "speaking") {
      const t = performance.now() / 1000;
      const pulse = 0.38 + 0.22 * Math.sin(t * 7.5) + 0.14 * Math.sin(t * 14.2) + 0.08 * Math.sin(t * 22.1);
      return Math.min(1, Math.max(0.1, pulse));
    }

    // While listening or idle, read real microphone audio energy
    const buf = levelBufRef.current;
    if (buf && micAnalyserRef.current && (state === "listening" || state === "idle")) {
      return rms(micAnalyserRef.current, buf) * (state === "idle" ? 0.35 : 1);
    }

    if (state === "thinking" || state === "executing") {
      const t = performance.now() / 1000;
      return 0.15 + 0.1 * Math.sin(t * 4);
    }

    return 0;
  }, []);

  // Heartbeat while hosting a session so mirror tabs can detect staleness
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      void setVoiceState({ orbState: orbStateRef.current, sessionActive: true }).catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, [active, setVoiceState]);

  // Cleanup on unmount / tab close
  useEffect(() => {
    const onUnload = () => {
      void setVoiceState({ orbState: "idle", sessionActive: false }).catch(() => {});
    };
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
    };
  }, [setVoiceState]);

  return {
    orbState,
    active,
    connecting,
    error,
    activate,
    deactivate,
    getLevel,
    notifySystem,
    stopSpeaking,
    sendTextMessage,
    isSpeaking: isSpeakingState,
    activeTool,
  };
}
