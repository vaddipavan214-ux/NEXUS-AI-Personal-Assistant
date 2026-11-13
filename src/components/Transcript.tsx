"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Cpu, User } from "lucide-react";

export function Transcript() {
  const messages = useQuery(api.messages.list) ?? [];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      className="scroll-thin mt-2 w-full max-w-[680px] flex-1 space-y-3.5 overflow-y-auto pb-4 pr-1 [mask-image:linear-gradient(to_bottom,transparent,black_20px)]"
    >
      {messages.length === 0 && (
        <div className="pt-12 text-center space-y-2">
          <p className="mono text-[13px] tracking-[0.2em] uppercase text-violet-300/50 font-semibold">
            Neural Command Center Ready
          </p>
          <p className="text-[14.5px] text-white/40">
            Activate Nexus or speak/type a command below to begin.
          </p>
        </div>
      )}
      <AnimatePresence initial={false}>
        {messages.map((m) => (
          <motion.div
            key={m._id}
            initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] rounded-2xl px-4.5 py-3.5 text-[15px] md:text-[15.5px] leading-relaxed shadow-lg ${
                m.role === "user"
                  ? "rounded-br-sm border border-violet-500/25 bg-gradient-to-r from-violet-950/45 to-slate-900/65 text-white/95"
                  : "rounded-bl-sm border border-cyan-400/25 bg-gradient-to-r from-[#13182A]/95 to-[#191E34]/85 text-cyan-50/95"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {m.role === "assistant" ? (
                  <>
                    <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="mono text-[11px] font-semibold tracking-[0.2em] text-cyan-300 uppercase">
                      NEXUS
                    </span>
                    <span className="mono text-[10px] text-violet-400/70">
                      // NEURAL INTELLIGENCE
                    </span>
                  </>
                ) : (
                  <>
                    <User className="h-3.5 w-3.5 text-violet-400" />
                    <span className="mono text-[11px] font-semibold tracking-[0.2em] text-violet-300 uppercase">
                      OPERATOR
                    </span>
                  </>
                )}
              </div>

              <div className="whitespace-pre-wrap break-words font-sans selection:bg-cyan-500/30">
                {m.text}
              </div>

              {m.status === "streaming" && (
                <span className="blink ml-1.5 inline-block h-3.5 w-[2px] translate-y-[2px] bg-cyan-400" />
              )}
              {m.status === "interrupted" && (
                <span className="mono ml-2 text-[11px] text-amber-300/70">— interrupted</span>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
