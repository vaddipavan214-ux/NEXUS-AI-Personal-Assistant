"use client";

import { useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Mic,
  Crosshair,
  Sparkles,
  Wrench,
  Zap,
  ListChecks,
  MessageSquare,
  CircleStop,
  KeyRound,
  PlugZap,
  CircleCheck,
  TriangleAlert,
  Newspaper,
  Activity,
  Play,
  Square,
  Radio,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

const KIND_META: Record<string, { icon: React.ReactNode; color: string }> = {
  user_spoke: { icon: <Mic />, color: "text-cyan-300" },
  intent_detected: { icon: <Crosshair />, color: "text-violet-300" },
  planning: { icon: <Sparkles />, color: "text-purple-300" },
  tool_selected: { icon: <Wrench />, color: "text-amber-300" },
  executing: { icon: <Zap />, color: "text-blue-300" },
  results: { icon: <ListChecks />, color: "text-emerald-300" },
  response_generated: { icon: <MessageSquare />, color: "text-cyan-300" },
  speech_interrupted: { icon: <CircleStop />, color: "text-amber-400" },
  auth_requested: { icon: <KeyRound />, color: "text-amber-300" },
  connected: { icon: <PlugZap />, color: "text-emerald-300" },
  completed: { icon: <CircleCheck />, color: "text-emerald-300" },
  error: { icon: <TriangleAlert />, color: "text-red-400" },
  memory_updated: { icon: <Brain />, color: "text-fuchsia-300" },
  briefing: { icon: <Newspaper />, color: "text-cyan-300" },
  media_playing: { icon: <Play />, color: "text-cyan-400" },
  media_stopped: { icon: <Square />, color: "text-white/40" },
};

const CATEGORY_LABELS: Record<string, string> = {
  preference: "Preferences",
  project: "Active Projects",
  fact: "Personal Facts",
  context: "Working Context",
  service: "External Services",
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function RightPanel() {
  const facts = useQuery(api.memory.list) ?? [];
  const events = useQuery(api.timeline.list) ?? [];

  const grouped = new Map<string, typeof facts>();
  for (const f of facts) {
    const list = grouped.get(f.category) ?? [];
    list.push(f);
    grouped.set(f.category, list);
  }

  return (
    <aside className="flex min-h-0 flex-col gap-3.5">
      {/* Panel Header */}
      <div className="flex items-center gap-2 px-1 pt-0.5">
        <Radio className="h-4 w-4 text-cyan-400" />
        <h2 className="label-xs !text-[13px] text-cyan-300 font-bold tracking-widest uppercase">
          Intelligence Centre
        </h2>
      </div>

      {/* Personal Memory */}
      <section className="glass-card flex max-h-[44%] min-h-[170px] flex-col p-3.5 border-violet-500/15">
        <div className="mb-2.5 flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-400" />
          <h3 className="label-xs !text-[12.5px] text-white/70 uppercase">Personal Memory</h3>
          <span className="mono ml-auto text-[11px] rounded border border-violet-500/25 bg-violet-500/15 px-2 py-0.5 text-violet-200">
            {facts.length} facts
          </span>
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
          {facts.length === 0 && (
            <p className="text-[12.5px] text-white/40 pt-2 leading-relaxed">
              Memory bank empty. Tell Nexus something to remember (e.g. your role, favorite framework, or project).
            </p>
          )}
          {[...grouped.entries()].map(([category, items]) => (
            <div key={category}>
              <p className="label-xs mb-1.5 !text-[11px] !text-cyan-400/70 font-semibold">
                {CATEGORY_LABELS[category] ?? category}
              </p>
              <AnimatePresence initial={false}>
                {items.map((f) => (
                  <motion.div
                    key={f._id}
                    layout
                    initial={{ opacity: 0, x: 16, filter: "blur(4px)" }}
                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.35 }}
                    className="mb-2 rounded-lg border border-violet-500/15 bg-white/[0.03] px-3 py-2 hover:border-violet-400/30 transition"
                  >
                    <p className="text-[11px] tracking-wide text-violet-300/60 capitalize font-mono">{f.key}</p>
                    <p className="text-[13.5px] text-white/90 font-medium mt-0.5">{f.value}</p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>

      {/* System Activity Timeline */}
      <section className="glass-card flex min-h-0 flex-1 flex-col p-3.5 border-cyan-500/15">
        <div className="mb-2.5 flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <h3 className="label-xs !text-[12.5px] text-white/70 uppercase">System Activity Telemetry</h3>
        </div>
        <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto pr-0.5 [mask-image:linear-gradient(to_bottom,black_85%,transparent)]">
          {/* Spine Line */}
          <div className="absolute top-1 bottom-1 left-[8px] w-px bg-gradient-to-b from-violet-500/25 via-cyan-500/25 to-transparent" />
          <AnimatePresence initial={false}>
            {events.map((e) => {
              const meta = KIND_META[e.kind] ?? { icon: <Activity />, color: "text-white/40" };
              return (
                <motion.div
                  key={e._id}
                  layout
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="relative mb-3 flex gap-2.5 pl-0.5"
                >
                  <span
                    className={`z-10 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#080B14] border border-white/15 ${meta.color} [&>svg]:h-2.5 [&>svg]:w-2.5 shadow-sm`}
                  >
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[13px] font-medium text-white/90">{e.label}</p>
                      <span className="mono ml-auto shrink-0 text-[10.5px] text-white/35">
                        {timeAgo(e.createdAt)}
                      </span>
                    </div>
                    {e.detail && (
                      <p className="truncate text-[12px] text-white/50 font-mono mt-0.5">{e.detail}</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </section>
    </aside>
  );
}
