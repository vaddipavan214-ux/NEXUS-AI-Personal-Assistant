"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExternalLink,
  Square,
  Network,
  Mic,
  MicOff,
  Send,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useRealtimeSession } from "@/hooks/useRealtimeSession";
import { BrainState, OrbState } from "@/lib/types";
import { NexusBrain } from "./brain/NexusBrain";
import { CenterMapsTheater } from "./maps/CenterMapsTheater";
import { CenterVideoTheater } from "./media/CenterVideoTheater";
import { Transcript } from "./Transcript";
import { LeftPanel } from "./panels/LeftPanel";
import { RightPanel } from "./panels/RightPanel";

export function JarvisApp() {
  const session = useRealtimeSession();
  const seed = useMutation(api.init.seed);
  const syncConnections = useAction(api.composio.syncConnections);
  const checkConnection = useAction(api.composio.checkConnection);

  const voiceState = useQuery(api.voiceState.get);
  const connections = useQuery(api.connections.list) ?? [];
  const dashboard = useQuery(api.dashboard.getAll) ?? {};
  const media = dashboard.media?.data as any;
  const isMediaActive = Boolean(media?.videoId);
  const mapsData = dashboard.maps?.data as any;
  const isMapsActive = Boolean(mapsData && (mapsData.places?.length || mapsData.origin || mapsData.destination));

  // Bootstrap singletons + refresh connection statuses once per load.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void seed({}).catch(() => {});
    void syncConnections({}).catch(() => {});
  }, [seed, syncConnections]);

  // Re-evaluate staleness periodically so dead sessions stop mirroring.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // This tab hosts the live session, or mirrors another tab's session.
  const heartbeatFresh =
    !!voiceState?.sessionActive && Date.now() - voiceState.updatedAt < 25000;
  const mirroring = !session.active && heartbeatFresh;
  const displayState: BrainState = session.active
    ? session.orbState
    : mirroring
      ? ((voiceState?.orbState ?? "idle") as BrainState)
      : "idle";
  const sessionAlive = session.active || mirroring;

  // Poll pending OAuth connections; the host tab notifies Nexus on success.
  const pendingToolkits = useMemo(
    () =>
      connections
        .filter((c) => c.status === "pending_auth")
        .map((c) => `${c.toolkit}:${c.name}`)
        .join(","),
    [connections]
  );
  useEffect(() => {
    if (!pendingToolkits) return;
    const entries = pendingToolkits.split(",").map((e) => {
      const [toolkit, name] = e.split(":");
      return { toolkit, name };
    });
    const interval = setInterval(() => {
      for (const { toolkit, name } of entries) {
        void checkConnection({ toolkit })
          .then((res) => {
            if (res?.connected && session.active) {
              session.notifySystem(
                `System notification: ${name} has been connected successfully to Nexus. Acknowledge this briefly to the operator.`
              );
            }
          })
          .catch(() => {});
      }
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingToolkits, session.active]);

  // Audio level pump for 3D brain reactions
  const getLevel = () => {
    if (session.active) return session.getLevel();
    if (mirroring && (displayState === "speaking" || displayState === "listening")) {
      const t = performance.now() / 1000;
      return 0.25 + 0.2 * Math.sin(t * 6.1) + 0.12 * Math.sin(t * 13.7);
    }
    return 0;
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#080B14]">
      <div className="scene" />
      <div className="scene-grid" />
      <div className="scene-noise" />

      <div className="relative z-10 flex h-full flex-col">
        {/* Top Header */}
        <Header sessionAlive={sessionAlive} mirroring={mirroring} error={session.error} />

        {/* Main Three-Column Neural Command Center */}
        <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr_320px] gap-4 px-4 pb-3 xl:grid-cols-[330px_1fr_360px] xl:gap-5 xl:px-5 xl:pb-4">
          {/* Left Panel: Personal Workspace */}
          <LeftPanel />

          {/* Center Panel: Nexus AI Workspace */}
          <main className="glass flex min-h-0 flex-col items-center rounded-2xl px-6 pt-2 pb-3 overflow-hidden shadow-2xl relative">
            {/* 3D Holographic AI Brain */}
            <NexusBrain
              state={displayState}
              getLevel={getLevel}
              active={sessionAlive}
              onActivate={() => void session.activate()}
              onDeactivate={session.deactivate}
              hosting={session.active}
              connecting={session.connecting}
              compact={isMediaActive || isMapsActive}
              activeTool={session.activeTool}
            />

            {mirroring && (
              <p className="mono -mt-1 text-[9.5px] tracking-[0.25em] text-violet-300/40 uppercase">
                Session Active in Parallel Window
              </p>
            )}

            {/* Central Video Theater HUD (YouTube playback) */}
            <AnimatePresence>
              {isMediaActive && <CenterVideoTheater key={media.videoId} media={media} />}
            </AnimatePresence>

            {/* Central Maps Theater HUD (Google Maps places & routes) */}
            <AnimatePresence>
              {isMapsActive && <CenterMapsTheater key={mapsData.query || mapsData.destination?.name || "maps"} mapsData={mapsData} />}
            </AnimatePresence>

            {/* Conversation Messages Transcript */}
            <Transcript />

            {/* Voice & Keyboard Command Bar */}
            <CommandBar session={session} displayState={displayState} />
          </main>

          {/* Right Panel: Intelligence Centre */}
          <RightPanel />
        </div>
      </div>
    </div>
  );
}

function CommandBar({
  session,
  displayState,
}: {
  session: any;
  displayState: OrbState;
}) {
  const [input, setInput] = useState("");
  const isSpeaking = session.isSpeaking;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    void session.sendTextMessage(trimmed);
    setInput("");
  };

  return (
    <div className="w-full max-w-[680px] mt-2">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2.5 rounded-2xl border border-violet-500/25 bg-gradient-to-b from-[#13182A]/95 to-[#0A0D18]/98 px-2 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      >
        {/* Voice Microphone Toggle Button */}
        <button
          type="button"
          onClick={() => {
            if (session.active) {
              session.deactivate();
            } else {
              void session.activate();
            }
          }}
          disabled={session.connecting}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 cursor-pointer ${
            session.active
              ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.35)]"
              : "border-white/10 bg-white/[0.04] text-white/50 hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-200"
          }`}
          title={session.active ? "Disconnect microphone" : "Activate voice session"}
        >
          {session.active ? (
            <>
              <Mic className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            </>
          ) : (
            <MicOff className="h-4 w-4" />
          )}
        </button>

        {/* Immediate Stop Speaking Interruption Button */}
        {isSpeaking && (
          <button
            type="button"
            onClick={session.stopSpeaking}
            className="flex items-center gap-1 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-mono font-medium text-amber-200 transition hover:bg-amber-500/25 animate-pulse cursor-pointer shrink-0"
            title="Interrupt speech output immediately"
          >
            <Square className="h-3 w-3 fill-current text-amber-300" />
            <span>Stop</span>
          </button>
        )}

        {/* Compact Single-Line Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={
            session.active
              ? "Listening… or type a command"
              : "Ask NEXUS anything…"
          }
          className="flex-1 rounded-xl border border-white/10 bg-black/50 px-3.5 py-2 text-[14px] text-white/95 placeholder:text-white/35 outline-none transition focus:border-cyan-400/50 focus:bg-black/70 focus:shadow-[0_0_20px_rgba(34,211,238,0.15)]"
        />

        {/* Send Button */}
        <button
          type="submit"
          disabled={!input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-600/40 to-purple-600/30 text-violet-200 transition-all hover:border-cyan-400/50 hover:from-cyan-600/40 hover:to-violet-600/40 hover:text-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          title="Send command"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function Header({
  sessionAlive,
  mirroring,
  error,
}: {
  sessionAlive: boolean;
  mirroring: boolean;
  error: string | null;
}) {
  const { signOut } = useAuthActions();
  const user = useQuery(api.auth.me);
  const profile = useQuery(api.profiles.get);

  return (
    <header className="flex items-center justify-between px-6 py-3.5 xl:px-7 border-b border-violet-500/15 bg-black/20 backdrop-blur-md">
      <div className="flex items-center gap-3">
        {/* Futuristic Neural Network Logo Mark */}
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/40 bg-gradient-to-br from-violet-600/30 via-purple-900/20 to-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.25)]">
          <Network className="h-4 w-4 text-cyan-300" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-[17px] font-bold tracking-[0.38em] text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-cyan-300">
              NEXUS
            </h1>
            <span className="label-xs text-violet-300/80 !text-[9px]">
              Neural Command Center
            </span>
          </div>
          <span className="mono text-[8.5px] text-white/30 tracking-wider">
            One Intelligent Connection Point for Your Digital World
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {error && (
          <span className="mono max-w-[420px] truncate text-[11px] text-red-300/80">
            {error}
          </span>
        )}
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${sessionAlive ? "" : "opacity-30"}`}
            style={{
              background: sessionAlive ? "#22D3EE" : "#64748B",
              boxShadow: sessionAlive ? "0 0 10px #22D3EE" : "none",
            }}
          />
          <span className="mono text-[10px] tracking-[0.25em] text-white/50 uppercase">
            {sessionAlive ? (mirroring ? "Linked" : "Online") : "Standby"}
          </span>
        </div>
        <Clock />
        <div className="flex items-center gap-2.5 border-l border-white/10 pl-4">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-violet-400/30 bg-violet-500/10">
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[10px] font-semibold text-cyan-200">
                  {(profile?.displayName ?? user?.email ?? "O")[0]?.toUpperCase()}
                </span>
              )}
            </span>
            <span className="mono max-w-[160px] truncate text-[11px] text-white/50">
              {profile?.displayName ?? user?.email ?? "operator"}
            </span>
          </span>
          <Link
            href="/profile"
            className="mono rounded border border-cyan-400/30 bg-cyan-400/[0.08] px-2 py-1 text-[9.5px] tracking-[0.2em] text-cyan-200 uppercase transition hover:border-cyan-300/60 hover:bg-cyan-400/20 hover:text-cyan-100"
          >
            Profile
          </Link>
          <button
            onClick={() => void signOut()}
            className="mono rounded border border-white/10 px-2 py-1 text-[9.5px] tracking-[0.2em] text-white/40 uppercase transition hover:border-red-400/40 hover:text-red-300 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span suppressHydrationWarning className="mono text-[11px] text-white/40">
      {time}
    </span>
  );
}
