"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAuthActions } from "@convex-dev/auth/react";
import { Activity, ShieldCheck, Sparkles } from "lucide-react";

export function SignIn() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, password, flow });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        /invalid/i.test(message) && flow === "signIn"
          ? "Invalid credentials. New here? Switch to Create access."
          : /already exists/i.test(message)
            ? "Account already exists. Switch to Sign in."
            : "Authentication failed. Check your email and password (min 8 characters)."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative z-10 flex h-screen w-screen items-center justify-center bg-[#080B14] p-4">
      {/* Background ambient radial gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 h-[450px] w-[450px] rounded-full bg-cyan-500/10 blur-[130px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="glass relative w-full max-w-[400px] rounded-2xl border border-violet-500/20 bg-[#13182A]/75 p-8 shadow-[0_12px_48px_rgba(0,0,0,0.6)] backdrop-blur-xl"
      >
        {/* Brand header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-600/25 via-cyan-500/15 to-transparent shadow-[0_0_24px_rgba(139,92,246,0.3)]">
            <svg
              className="h-8 w-8 text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.7)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" className="fill-violet-500/40" />
              <circle cx="4" cy="7" r="2" />
              <circle cx="20" cy="7" r="2" />
              <circle cx="4" cy="17" r="2" />
              <circle cx="20" cy="17" r="2" />
              <path d="M6 7.8L9.5 10.5" />
              <path d="M18 7.8L14.5 10.5" />
              <path d="M6 16.2L9.5 13.5" />
              <path d="M18 16.2L14.5 13.5" />
            </svg>
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
            </span>
          </div>

          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-[0.35em] text-white">
              NEXUS
            </h1>
            <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[9px] font-medium tracking-[0.2em] text-violet-300 uppercase">
              AI Command
            </span>
          </div>
          <p className="mt-1.5 text-[11px] font-mono tracking-wider text-cyan-300/70 uppercase">
            Neural Intelligence Center
          </p>
          <p className="mt-1 text-[11px] text-white/40">
            One Intelligent Connection Point for Your Digital World.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3.5">
          <div>
            <label className="label-xs mb-1.5 block text-white/60">Operator ID / Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mono w-full rounded-lg border border-white/10 bg-[#080B14]/70 px-3 py-2.5 text-[13px] text-white/90 outline-none transition focus:border-cyan-400/50 focus:bg-[#0D1020] focus:shadow-[0_0_15px_rgba(34,211,238,0.15)] placeholder:text-white/20"
              placeholder="operator@nexus.ai"
            />
          </div>
          <div>
            <label className="label-xs mb-1.5 block text-white/60">Security Key / Password</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={flow === "signIn" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mono w-full rounded-lg border border-white/10 bg-[#080B14]/70 px-3 py-2.5 text-[13px] text-white/90 outline-none transition focus:border-violet-400/50 focus:bg-[#0D1020] focus:shadow-[0_0_15px_rgba(139,92,246,0.15)] placeholder:text-white/20"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded border border-rose-500/30 bg-rose-500/10 p-2 text-[11.5px] leading-snug text-rose-300"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mono w-full rounded-lg border border-violet-400/30 bg-gradient-to-r from-violet-600/30 via-indigo-600/30 to-cyan-500/30 py-2.5 text-[12px] font-semibold tracking-[0.25em] text-cyan-100 uppercase transition hover:border-cyan-400/50 hover:from-violet-600/50 hover:to-cyan-500/50 hover:shadow-[0_0_25px_rgba(139,92,246,0.3)] disabled:opacity-50"
          >
            {busy ? (
              <span className="shimmer-text">Authenticating Neural Link…</span>
            ) : flow === "signIn" ? (
              "Access Nexus"
            ) : (
              "Initialize Access"
            )}
          </button>
        </form>

        <button
          onClick={() => {
            setFlow(flow === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
          className="mt-5 w-full text-center text-[11.5px] text-white/40 transition hover:text-cyan-300/80"
        >
          {flow === "signIn" ? "New operator? Initialize access" : "Have credentials? Sign in"}
        </button>

        <div className="mt-6 flex items-center justify-center gap-3 border-t border-white/[0.06] pt-4 text-[10px] text-white/30 font-mono">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-emerald-400/70" /> Secured System
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3 text-cyan-400/70" /> v2.4.0 Live
          </span>
        </div>
      </motion.div>
    </div>
  );
}
