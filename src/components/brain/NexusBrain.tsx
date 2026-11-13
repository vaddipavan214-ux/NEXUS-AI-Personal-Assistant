"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BrainRenderer } from "./brainRenderer";
import { BrainState, BRAIN_STATE_COLORS, ORB_STATE_LABELS } from "@/lib/types";
import { Cpu, Zap, Activity } from "lucide-react";

interface Props {
  state: BrainState;
  /** Returns the current audio level 0..1 (mic while listening, synthesized speech while speaking). */
  getLevel: () => number;
  active: boolean;
  onActivate: () => void;
  onDeactivate?: () => void;
  /** True when this tab hosts the live session (vs. mirroring another tab). */
  hosting?: boolean;
  connecting: boolean;
  compact?: boolean;
  activeTool?: string | null;
}

export function NexusBrain({
  state,
  getLevel,
  active,
  onActivate,
  onDeactivate,
  hosting,
  connecting,
  compact = false,
  activeTool,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BrainRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new BrainRenderer(canvas);
    rendererRef.current = renderer;
    renderer.start();

    let raf = 0;
    const pump = () => {
      renderer.setAudioLevel(getLevel());
      raf = requestAnimationFrame(pump);
    };
    raf = requestAnimationFrame(pump);

    const onResize = () => {
      renderer.resize();
    };
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.stop();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setState(active ? state : "offline");
  }, [state, active]);

  useEffect(() => {
    rendererRef.current?.resize();
  }, [compact]);

  const stateMeta = BRAIN_STATE_COLORS[active ? state : "offline"];

  return (
    <div className="relative flex flex-col items-center select-none">
      {/* 3D Holographic Brain Viewport */}
      <div
        className={`relative transition-all duration-500 ease-out flex items-center justify-center ${
          compact
            ? "h-[140px] w-[260px]"
            : "h-[320px] w-[440px] xl:h-[380px] xl:w-[520px]"
        }`}
      >
        <canvas ref={canvasRef} className="h-full w-full pointer-events-auto" />

        {/* Ambient Holographic Glow Aura */}
        <div
          className="absolute inset-0 -z-10 rounded-full blur-[80px] transition-all duration-700 pointer-events-none opacity-40"
          style={{ background: stateMeta.glow }}
        />

        {/* Outer HUD Tech Ring & Coordinates (when full size) */}
        {!compact && (
          <div className="absolute inset-4 pointer-events-none border border-violet-500/10 rounded-full radar-spin">
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-cyan-400/40" />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-violet-400/40" />
          </div>
        )}

        {/* Telemetry Annotations */}
        {!compact && active && (
          <>
            <div className="absolute left-2 top-8 pointer-events-none mono text-[9px] text-violet-300/40 space-y-1">
              <p className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-violet-400 animate-pulse" />
                <span>NEURAL CORE // ACTIVE</span>
              </p>
              <p className="text-white/20">SYNAPSE LOAD: 1400 NODES</p>
            </div>
            <div className="absolute right-2 top-8 pointer-events-none mono text-[9px] text-cyan-300/40 text-right space-y-1">
              <p className="flex items-center justify-end gap-1.5">
                <span>FREQ: 44.1 kHz</span>
                <span className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse" />
              </p>
              <p className="text-white/20">HEMISPHERE: DUAL SYNC</p>
            </div>
          </>
        )}

        {/* Activation Button Overlay when Standby / Offline */}
        <AnimatePresence>
          {!active && (
            <motion.div
              key="activate"
              className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] rounded-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.1, filter: "blur(6px)" }}
              transition={{ duration: 0.4 }}
            >
              <button
                onClick={onActivate}
                disabled={connecting}
                className="group relative flex items-center gap-3 rounded-full border border-violet-500/30 bg-gradient-to-r from-violet-950/60 via-purple-900/40 to-cyan-950/60 px-8 py-3.5 backdrop-blur-xl transition-all duration-300 hover:border-cyan-400/60 hover:shadow-[0_0_50px_rgba(139,92,246,0.35)] disabled:opacity-60 cursor-pointer"
              >
                <Cpu className="h-4 w-4 text-cyan-300 group-hover:rotate-90 transition-transform duration-500" />
                <span className="mono text-[12.5px] tracking-[0.25em] text-cyan-100 font-semibold uppercase">
                  {connecting ? (
                    <span className="shimmer-text">Initializing Neural Core…</span>
                  ) : (
                    "Activate Nexus"
                  )}
                </span>
                <span className="absolute inset-0 rounded-full border border-cyan-300/0 transition-all duration-500 group-hover:border-cyan-300/30 group-hover:scale-105" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* State Readout & Telemetry Bar */}
      <div className={`flex items-center gap-2.5 transition-all duration-300 ${compact ? "h-5 -mt-1" : "mt-1 h-7"}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={active ? state : "offline"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-2.5"
          >
            <span
              className="h-2 w-2 rounded-full transition-colors duration-300"
              style={{
                background: stateMeta.hex,
                boxShadow: `0 0 10px ${stateMeta.hex}`,
              }}
            />
            <span
              className={`mono uppercase font-semibold tracking-[0.25em] transition-colors duration-300 ${
                compact ? "text-[9.5px]" : "text-[11.5px]"
              }`}
              style={{ color: stateMeta.hex }}
            >
              {stateMeta.label}
            </span>
            {active && hosting && (
              <span className="mono text-[8px] rounded border border-cyan-400/30 bg-cyan-400/10 px-1 py-0.2 text-cyan-200">
                HOST
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Active Tool Execution Indicator */}
      {activeTool && active && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="mt-1 flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-950/40 px-2.5 py-0.5"
        >
          <Zap className="h-2.5 w-2.5 text-cyan-300 animate-bounce" />
          <span className="mono text-[9px] tracking-wider text-cyan-200 uppercase">
            TOOL: {activeTool.replace(/_/g, " ")}
          </span>
        </motion.div>
      )}

      {/* Active Voice Link Status & Disconnect Button */}
      {active && (
        <div className={`flex items-center gap-3 transition-all duration-300 ${compact ? "mt-0.5" : "mt-2"}`}>
          <span className="mono text-[9px] tracking-[0.2em] text-white/30 uppercase flex items-center gap-1">
            <Activity className="h-2.5 w-2.5 text-violet-400 animate-pulse" />
            Neural Link Active
          </span>
          {onDeactivate && (
            <button
              onClick={onDeactivate}
              className="mono rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[8.5px] tracking-wider text-white/40 uppercase transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
            >
              Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
