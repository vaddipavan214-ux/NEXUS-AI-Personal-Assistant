"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Glass panel card that flashes its border whenever `pulseKey` changes —
 * used to make dashboard cards visibly react to live data updates.
 */
export function GlassCard({
  title,
  icon,
  pulseKey,
  action,
  children,
  className = "",
}: {
  title: string;
  icon?: React.ReactNode;
  pulseKey?: string | number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [pulsing, setPulsing] = useState(false);
  const first = useRef(true);
  const prevKey = useRef(pulseKey);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      prevKey.current = pulseKey;
      return;
    }
    if (pulseKey !== undefined && pulseKey !== prevKey.current) {
      prevKey.current = pulseKey;
      setPulsing(true);
      const id = setTimeout(() => setPulsing(false), 1600);
      return () => clearTimeout(id);
    }
  }, [pulseKey]);

  return (
    <section className={`glass-card p-3.5 ${pulsing ? "card-pulse" : ""} ${className}`}>
      <div className="mb-2.5 flex items-center gap-2">
        {icon && <span className="text-white/45 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
        <h3 className="label-xs !text-[12.5px] text-white/80 font-bold tracking-wider">{title}</h3>
        {action && <div className="ml-auto flex items-center gap-1.5">{action}</div>}
      </div>
      {children}
    </section>
  );
}
