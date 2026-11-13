"use client";

import { useState } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Calendar,
  SquareCheck,
  FileText,
  Plug,
  Target,
  ExternalLink,
  Square,
  CheckCircle2,
  Circle,
  Briefcase,
  RotateCw,
  Video,
  MapPin,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { GlassCard } from "../GlassCard";

/* eslint-disable @typescript-eslint/no-explicit-any */

function timeAgo(ts?: number): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatMeetingDate(iso?: string): string {
  if (!iso) return "Date pending";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;

  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(tomorrow);
  const eventDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);

  if (eventDateStr === todayStr) return "Today";
  if (eventDateStr === tomorrowStr) return "Tomorrow";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  }).format(d);
}

function formatMeetingTimeRange(startIso?: string, endIso?: string): string {
  if (!startIso) return "";
  const startDate = new Date(startIso);
  if (isNaN(startDate.getTime())) return startIso;

  const startTimeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(startDate);

  if (!endIso) {
    return `${startTimeStr} IST`;
  }

  const endDate = new Date(endIso);
  if (isNaN(endDate.getTime())) {
    return `${startTimeStr} IST`;
  }

  const endTimeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(endDate);

  return `${startTimeStr} – ${endTimeStr} IST`;
}

export function LeftPanel() {
  const dashboard = useQuery(api.dashboard.getAll) ?? {};
  const objective = useQuery(api.objective.get);
  const connections = useQuery(api.connections.list) ?? [];
  const todos = useQuery(api.todos.list);
  const completeTodo = useMutation(api.todos.complete);
  const executeTool = useAction(api.tools.execute);

  const [refreshingCalendar, setRefreshingCalendar] = useState(false);

  const media = dashboard.media?.data as any;
  const emails = dashboard.emails?.data as any;
  const calendar = dashboard.calendar?.data as any;
  const notes = dashboard.notes?.data as any;

  return (
    <aside className="scroll-thin flex min-h-0 flex-col gap-3.5 overflow-y-auto pr-0.5">
      {/* Panel Header */}
      <div className="flex items-center gap-2 px-1 pt-0.5">
        <Briefcase className="h-4 w-4 text-violet-400" />
        <h2 className="label-xs !text-[13px] text-violet-300 font-bold tracking-widest uppercase">
          Personal Workspace
        </h2>
      </div>

      {/* Current Objective */}
      <section
        className="glass-card relative overflow-hidden p-3.5 border-violet-500/20"
        style={
          objective?.state !== "idle"
            ? {
                borderColor: "rgba(139, 92, 246, 0.4)",
                boxShadow: "inset 0 0 25px rgba(139, 92, 246, 0.15)",
              }
            : undefined
        }
      >
        <div className="mb-2 flex items-center gap-2">
          <Target className="h-4 w-4 text-cyan-300/70" />
          <h3 className="label-xs !text-[12.5px] text-white/60 font-semibold uppercase">Current Objective</h3>
          {objective?.state === "working" && (
            <span className="ml-auto h-2.5 w-2.5 animate-ping rounded-full bg-cyan-400" />
          )}
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={objective?.text ?? "…"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className={`text-[15px] font-medium leading-relaxed ${
              objective?.state === "working"
                ? "shimmer-text"
                : objective?.state === "waiting_auth"
                  ? "text-amber-200"
                  : "text-white/90"
            }`}
          >
            {objective?.text ?? "Standing by"}
          </motion.p>
        </AnimatePresence>
      </section>

      {/* Media Status Mini Card (When video is playing) */}
      <AnimatePresence>
        {media?.videoId && <MediaMiniCard key={media.videoId} media={media} />}
      </AnimatePresence>

      {/* Calendar Dashboard Card */}
      <GlassCard
        title="Calendar"
        icon={<Calendar className="text-cyan-400" />}
        pulseKey={dashboard.calendar?.updatedAt}
        action={
          <div className="flex items-center gap-2">
            {calendar?.lastSync && (
              <span className="mono text-[11px] text-white/30 hidden sm:inline">
                sync {timeAgo(calendar.lastSync)}
              </span>
            )}
            <button
              onClick={async () => {
                setRefreshingCalendar(true);
                try {
                  await executeTool({ name: "get_calendar_events", arguments: {} });
                } catch (err) {
                  console.warn("Failed to refresh calendar:", err);
                } finally {
                  setRefreshingCalendar(false);
                }
              }}
              disabled={refreshingCalendar}
              title="Sync with Google Calendar"
              className="rounded p-1 text-white/40 hover:text-cyan-300 hover:bg-cyan-500/10 transition cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`h-3.5 w-3.5 ${refreshingCalendar ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        }
      >
        {calendar ? (
          <div className="space-y-3">
            {/* Header metrics */}
            <div className="flex items-baseline gap-2">
              <AnimatedNumber value={calendar.todayCount ?? 0} />
              <span className="text-[13px] text-white/60 font-mono">events today</span>
              <span className="mono ml-auto text-[11.5px] text-cyan-300/80 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20">
                Asia/Kolkata (IST)
              </span>
            </div>

            {/* Scrollable Meeting List */}
            {calendar.upcoming && calendar.upcoming.length > 0 ? (
              <div className="scroll-thin max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
                {calendar.upcoming.map((e: any, i: number) => {
                  const dateLabel = formatMeetingDate(e.start);
                  const isToday = dateLabel === "Today";
                  const isTomorrow = dateLabel === "Tomorrow";

                  return (
                    <div
                      key={e.id ?? i}
                      className="group relative rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/25 via-black/40 to-slate-900/40 p-3 transition-all duration-200 hover:border-cyan-400/50 hover:bg-cyan-950/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.15)]"
                    >
                      {/* Top Row: Date Badge & Time Range */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-mono font-medium tracking-wide border ${
                              isToday
                                ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                                : isTomorrow
                                  ? "border-violet-400/50 bg-violet-400/15 text-violet-200"
                                  : "border-white/10 bg-white/[0.04] text-white/70"
                            }`}
                          >
                            {dateLabel}
                          </span>
                          <span className="mono text-[12.5px] font-medium text-cyan-200/90">
                            {formatMeetingTimeRange(e.start, e.end)}
                          </span>
                        </div>

                        {/* Direct calendar link */}
                        {e.link && (
                          <a
                            href={e.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-white/35 hover:text-cyan-300 hover:bg-white/[0.06] transition"
                            title="Open event in Google Calendar"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>

                      {/* Meeting Title (Clickable link directly to event) */}
                      <a
                        href={e.link ?? "https://calendar.google.com"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-[15px] font-semibold text-white/95 group-hover:text-cyan-200 transition leading-snug line-clamp-1 mb-1.5"
                        title={e.title}
                      >
                        {e.title}
                      </a>

                      {/* Location and Google Meet Link */}
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {e.hangoutLink && (
                          <a
                            href={e.hangoutLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11.5px] font-medium text-emerald-300 hover:bg-emerald-500/25 transition shadow-[0_0_10px_rgba(52,211,153,0.15)]"
                          >
                            <Video className="h-3.5 w-3.5" />
                            <span>Join Google Meet</span>
                          </a>
                        )}
                        {e.location && (
                          <span className="inline-flex items-center gap-1 text-[12.5px] text-white/60 truncate max-w-[220px]">
                            <MapPin className="h-3.5 w-3.5 text-cyan-400/80 shrink-0" />
                            <span className="truncate">{e.location}</span>
                          </span>
                        )}
                      </div>

                      {/* Description snippet */}
                      {e.description && (
                        <p className="mt-1.5 text-[12.5px] text-white/50 line-clamp-2 leading-relaxed font-sans">
                          {e.description}
                        </p>
                      )}

                      {/* Bottom action row */}
                      <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.04] pt-1.5">
                        <span className="mono text-[11px] text-white/30">Google Calendar</span>
                        <a
                          href={e.link ?? "https://calendar.google.com"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-cyan-400/80 hover:text-cyan-200 transition"
                        >
                          <span>View in Calendar</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] text-white/40 pt-1">
                No upcoming meetings scheduled.
              </p>
            )}
          </div>
        ) : (
          <Empty text="Ask NEXUS: 'What meetings do I have today?' or 'Schedule a meeting with Narendra Modi on November 15 at 3 PM IST'" />
        )}
      </GlassCard>

      {/* Emails */}
      <GlassCard title="Emails" icon={<Mail className="text-violet-400" />} pulseKey={dashboard.emails?.updatedAt}>
        {emails ? (
          <div className="space-y-2.5">
            <div className="flex items-baseline gap-2">
              <AnimatedNumber value={emails.unread ?? 0} />
              <span className="text-[12.5px] text-white/50 font-mono">unread</span>
              <span className="mono ml-auto text-[11px] text-white/30">
                sync {timeAgo(emails.lastSync)}
              </span>
            </div>
            <div className="space-y-2">
              {(emails.important ?? []).slice(0, 3).map((e: any, i: number) => (
                <div key={i} className="truncate rounded-lg border border-white/[0.05] bg-white/[0.02] p-2 hover:border-violet-500/30 transition">
                  <p className="text-white/90 truncate text-[13.5px] font-medium">{e.subject}</p>
                  <p className="text-white/40 text-[12px] truncate mt-0.5">{shortSender(e.from)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty text="Ask Nexus to check your inbox" />
        )}
      </GlassCard>

      {/* To-dos */}
      <GlassCard
        title="To-Dos"
        icon={<SquareCheck className="text-violet-400" />}
        pulseKey={
          todos
            ? `${todos.pending.map((t) => t._id).join()}|${todos.done.map((t) => t._id).join()}`
            : undefined
        }
      >
        {todos && (todos.pending.length || todos.done.length) ? (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {todos.pending.slice(0, 6).map((t) => (
                <motion.div
                  key={t._id}
                  layout
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 14 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-2.5 text-[14px] py-0.5 group"
                >
                  <button
                    onClick={() => void completeTodo({ title: t.title }).catch(() => {})}
                    className="text-white/35 hover:text-cyan-300 transition shrink-0 cursor-pointer"
                    title="Mark task done"
                  >
                    <Circle className="h-4 w-4" />
                  </button>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      t.priority === "high"
                        ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]"
                        : t.priority === "low"
                          ? "bg-white/25"
                          : "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                    }`}
                  />
                  <span className="truncate text-white/85 group-hover:text-white transition">{t.title}</span>
                  {t.dueAt && <DueChip dueAt={t.dueAt} />}
                </motion.div>
              ))}
              {todos.done.slice(0, 2).map((t) => (
                <motion.div
                  key={t._id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-2.5 text-[13.5px]"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="truncate line-through text-white/60">{t.title}</span>
                </motion.div>
              ))}
            </AnimatePresence>
            {todos.pending.length > 6 && (
              <p className="mono pt-1 text-[11px] text-white/35">
                +{todos.pending.length - 6} more pending
              </p>
            )}
          </div>
        ) : (
          <Empty text='Say "Nexus, add a task" to track to-dos' />
        )}
      </GlassCard>

      {/* Notes */}
      <GlassCard title="Notes" icon={<FileText className="text-cyan-400" />} pulseKey={dashboard.notes?.updatedAt}>
        {notes ? (
          <div className="space-y-2">
            {(notes.recent ?? []).slice(0, 4).map((n: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-2 text-[14px] py-0.5">
                <span className="truncate text-white/85 font-medium">{n.title}</span>
                {n.url && (
                  <a href={n.url} target="_blank" rel="noreferrer" className="text-white/35 hover:text-cyan-300">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
            <p className="mono pt-1 text-[11px] text-white/35">
              {(notes.sources ?? []).join(" · ")} — sync {timeAgo(notes.lastSync)}
            </p>
          </div>
        ) : (
          <Empty text="Ask Nexus to search Notion notes" />
        )}
      </GlassCard>

      {/* Connected Services */}
      <GlassCard title="Connected Services" icon={<Plug className="text-violet-400" />} pulseKey={connections.map((c) => c.status).join()}>
        <div className="space-y-2.5">
          {connections.length === 0 && <Empty text="Detecting integrated services…" />}
          {connections.map((c) => (
            <ServiceRow key={c.toolkit} connection={c} />
          ))}
        </div>
      </GlassCard>
    </aside>
  );
}

function MediaMiniCard({ media }: { media: any }) {
  const clearCard = useMutation(api.dashboard.clearCard);

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.96, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -8 }}
      transition={{ duration: 0.3 }}
      className="glass-card relative overflow-hidden border-cyan-400/30 bg-black/40 p-3 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
          </span>
          <span className="label-xs !text-[11.5px] text-cyan-200 font-semibold tracking-wider uppercase">
            Now Playing
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {media.url && (
            <a
              href={media.url}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1 text-white/40 hover:text-white/80 transition"
              title="Open video on YouTube"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={() => void clearCard({ key: "media" })}
            className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] font-mono text-white/60 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
            title="Stop playback"
          >
            <Square className="h-3 w-3 fill-current" />
            STOP
          </button>
        </div>
      </div>

      <div className="space-y-0.5">
        <p className="truncate text-[14px] font-medium text-white/95" title={media.title}>
          {media.title}
        </p>
        <p className="truncate text-[12px] text-cyan-300/70 font-mono">{media.channelTitle}</p>
      </div>
    </motion.section>
  );
}

function ServiceRow({ connection: c }: { connection: any }) {
  const initiateConnection = useAction(api.composio.initiateConnection);
  const checkConnection = useAction(api.composio.checkConnection);
  const resetService = useMutation(api.connections.resetService);
  const statusColor =
    c.status === "connected"
      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
      : c.status === "pending_auth"
        ? "bg-amber-300 animate-pulse"
        : c.status === "error"
          ? "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]"
          : "bg-white/20";

  return (
    <div className="flex items-center gap-2.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`} />
      <span className="text-[13.5px] text-white/85 font-medium">{c.name}</span>
      <span className="mono ml-auto text-[11px] tracking-wider text-white/35 uppercase">
        {c.status === "pending_auth" ? "awaiting auth" : c.status}
      </span>
      {c.status === "available" && (
        <button
          onClick={async () => {
            try {
              const res = await initiateConnection({ toolkit: c.toolkit });
              if (res.ok && res.redirectUrl) {
                window.open(res.redirectUrl, "nexus-auth", "width=560,height=720");
                const interval = setInterval(() => {
                  void checkConnection({ toolkit: c.toolkit }).then((r) => {
                    if (r?.connected) clearInterval(interval);
                  }).catch(() => {});
                }, 3000);
                setTimeout(() => clearInterval(interval), 60000);
              }
            } catch (err) {
              console.warn("Connection initiation error:", err);
            }
          }}
          className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-[11.5px] font-mono text-cyan-200 transition hover:bg-cyan-400/20 cursor-pointer"
        >
          Connect
        </button>
      )}
      {c.status === "error" && (
        <button
          onClick={() => void resetService({ toolkit: c.toolkit }).catch(() => {})}
          title={c.error || "Click to reset to available"}
          className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/50 transition hover:bg-white/10 hover:text-white/80 cursor-pointer"
        >
          Reset
        </button>
      )}
      {c.status === "pending_auth" && (
        <button
          onClick={async () => {
            if (c.authUrl) {
              window.open(c.authUrl, "nexus-auth", "width=560,height=720");
            } else {
              const res = await initiateConnection({ toolkit: c.toolkit });
              if (res.ok && res.redirectUrl) {
                window.open(res.redirectUrl, "nexus-auth", "width=560,height=720");
              }
            }
            const interval = setInterval(() => {
              void checkConnection({ toolkit: c.toolkit }).then((r) => {
                if (r?.connected) clearInterval(interval);
              }).catch(() => {});
            }, 3000);
            setTimeout(() => clearInterval(interval), 60000);
          }}
          className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2.5 py-0.5 text-[11.5px] text-amber-200 transition hover:bg-amber-300/20 cursor-pointer"
        >
          Sign in
        </button>
      )}
      {c.status === "connected" && c.lastSync && (
        <span className="mono text-[10.5px] text-white/25">{timeAgo(c.lastSync)}</span>
      )}
    </div>
  );
}

function DueChip({ dueAt }: { dueAt: number }) {
  const now = Date.now();
  const overdue = dueAt < now;
  const d = new Date(dueAt);
  const sameDay = d.toDateString() === new Date().toDateString();
  const label = sameDay
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <span
      className={`mono ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10.5px] tracking-wide ${
        overdue
          ? "border border-red-400/30 bg-red-400/10 text-red-300"
          : "border border-white/10 bg-white/[0.04] text-white/45"
      }`}
    >
      {overdue ? "overdue" : label}
    </span>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={value}
        initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
        transition={{ duration: 0.35 }}
        className="mono text-2xl font-bold text-white/95"
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[12.5px] text-white/40 leading-relaxed">{text}</p>;
}

function shortSender(from?: string): string {
  if (!from) return "";
  const match = from.match(/^([^<]+)</);
  return (match ? match[1] : from).trim().slice(0, 26);
}
