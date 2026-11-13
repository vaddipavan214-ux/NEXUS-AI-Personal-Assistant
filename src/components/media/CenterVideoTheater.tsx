"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useMutation } from "convex/react";
import {
  Maximize2,
  Minimize2,
  ExternalLink,
  Square,
  Video,
  Tv,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";

interface MediaData {
  videoId: string;
  title: string;
  channelTitle?: string;
  url?: string;
  embedUrl?: string;
  playing?: boolean;
  startedAt?: number;
  fullscreen?: boolean;
}

export function CenterVideoTheater({ media }: { media: MediaData }) {
  const clearCard = useMutation(api.dashboard.clearCard);
  const setCard = useMutation(api.dashboard.setCard);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(Boolean(media.fullscreen));

  // Sync state if Convex updates media.fullscreen
  useEffect(() => {
    if (media.fullscreen !== undefined && media.fullscreen !== isFullscreen) {
      setIsFullscreen(Boolean(media.fullscreen));
    }
  }, [media.fullscreen]);

  // Enter Fullscreen handler
  const handleEnterFullscreen = useCallback(async () => {
    setIsFullscreen(true);

    // Try browser Fullscreen API on container element
    const el = containerRef.current;
    if (el) {
      try {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if ((el as any).webkitRequestFullscreen) {
          await (el as any).webkitRequestFullscreen();
        } else if ((el as any).msRequestFullscreen) {
          await (el as any).msRequestFullscreen();
        }
      } catch (err) {
        // Voice or programmatic calls outside direct click gesture may trigger error
        // Graceful fallback to CSS full-window mode which is already set
        console.warn("[nexus] Browser native fullscreen request handled via CSS full-window mode:", err);
      }
    }

    // Update Convex card state so assistant knows and persists across components
    if (!media.fullscreen) {
      void setCard({
        key: "media",
        data: { ...media, fullscreen: true, updatedAt: Date.now() },
      });
    }
  }, [media, setCard]);

  // Exit Fullscreen handler
  const handleExitFullscreen = useCallback(async () => {
    setIsFullscreen(false);

    // Exit browser native fullscreen if active
    try {
      if (
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      ) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn("[nexus] Exit native fullscreen warning:", err);
    }

    // Update Convex card state
    if (media.fullscreen) {
      void setCard({
        key: "media",
        data: { ...media, fullscreen: false, updatedAt: Date.now() },
      });
    }
  }, [media, setCard]);

  // Listen for native Escape / fullscreenchange events
  useEffect(() => {
    const onFullscreenChange = () => {
      const isNativeActive = Boolean(
        document.fullscreenElement === containerRef.current ||
        (document as any).webkitFullscreenElement === containerRef.current
      );
      if (!isNativeActive && isFullscreen) {
        setIsFullscreen(false);
        if (media.fullscreen) {
          void setCard({
            key: "media",
            data: { ...media, fullscreen: false, updatedAt: Date.now() },
          });
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        void handleExitFullscreen();
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isFullscreen, media, setCard, handleExitFullscreen]);

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? "fixed inset-0 z-50 w-screen h-screen bg-[#05070E]/95 backdrop-blur-2xl flex flex-col p-3 sm:p-5 overflow-hidden animate-in fade-in duration-300"
          : "glass-card relative flex flex-col w-full max-w-[680px] overflow-hidden rounded-2xl border-cyan-400/40 bg-black/75 shadow-[0_0_60px_rgba(34,211,238,0.22)] my-2 backdrop-blur-xl"
      }
    >
      {/* Sci-Fi HUD Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 bg-gradient-to-r from-cyan-950/40 via-violet-950/20 to-black/60 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-80" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
          </span>
          <div className="flex items-center gap-2 truncate">
            <Video className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
            <span className="label-xs text-cyan-200 font-semibold tracking-widest uppercase">
              {isFullscreen ? "NEXUS Video Theater // Fullscreen" : "HUD Video Theater // YouTube"}
            </span>
            {isFullscreen && (
              <span className="rounded bg-cyan-500/20 border border-cyan-400/30 px-1.5 py-0.2 text-[9px] font-mono text-cyan-300 uppercase hidden sm:inline">
                Maximized Mode
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Fullscreen Toggle Button */}
          <button
            onClick={() => {
              if (isFullscreen) {
                void handleExitFullscreen();
              } else {
                void handleEnterFullscreen();
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-mono text-cyan-200 transition-all hover:border-cyan-300 hover:bg-cyan-500/30 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-3.5 w-3.5 text-cyan-300" />
                <span className="hidden sm:inline">Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5 text-cyan-300" />
                <span className="hidden sm:inline">Fullscreen</span>
              </>
            )}
          </button>

          {/* External Pop-Out Link */}
          {media.url && (
            <a
              href={media.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-mono text-cyan-200/80 transition hover:border-cyan-400/50 hover:bg-cyan-500/10 hover:text-cyan-100"
              title="Open video in new YouTube tab"
            >
              <ExternalLink className="h-3 w-3" />
              <span className="hidden sm:inline">Pop Out</span>
            </a>
          )}

          {/* Stop Video Button */}
          <button
            onClick={() => void clearCard({ key: "media" })}
            className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-mono text-red-300 transition hover:border-red-400 hover:bg-red-500/20 cursor-pointer"
            title="Stop playback and close theater"
          >
            <Square className="h-2.5 w-2.5 fill-current" />
            <span>Stop</span>
          </button>
        </div>
      </div>

      {/* Main Video Viewport (16:9 Widescreen preserved, never reloaded) */}
      <div
        className={
          isFullscreen
            ? "flex-1 relative flex items-center justify-center w-full min-h-0 py-2 sm:py-4 px-2"
            : "relative aspect-video w-full bg-black overflow-hidden"
        }
      >
        <div
          className={
            isFullscreen
              ? "aspect-video max-w-full max-h-full w-full h-auto mx-auto rounded-xl overflow-hidden border border-cyan-400/30 shadow-[0_0_80px_rgba(34,211,238,0.22)] bg-black relative"
              : "w-full h-full"
          }
        >
          <iframe
            src={`https://www.youtube.com/embed/${media.videoId}?autoplay=1&enablejsapi=1`}
            title={media.title || "YouTube Video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      </div>

      {/* Video Details Footer */}
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 bg-black/60 shrink-0">
        <div className="min-w-0 flex-1 pr-3">
          <p className="truncate text-[12.5px] font-medium text-white/95" title={media.title}>
            {media.title}
          </p>
          <p className="truncate text-[10.5px] text-cyan-300/70 font-mono">
            {media.channelTitle || "YouTube"}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isFullscreen && (
            <span className="mono text-[10px] text-cyan-300/60 bg-cyan-950/40 border border-cyan-500/20 px-2 py-0.5 rounded">
              Press <kbd className="text-white font-bold">Esc</kbd> to exit fullscreen
            </span>
          )}
          <span className="mono text-[9.5px] text-white/40 uppercase tracking-wider hidden sm:inline">
            Say "stop video" or "exit fullscreen"
          </span>
        </div>
      </div>
    </div>
  );
}
