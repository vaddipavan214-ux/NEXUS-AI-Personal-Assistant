"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "convex/react";
import {
  MapPin,
  Navigation,
  ExternalLink,
  Square,
  Layers,
  Star,
  Car,
  ChevronRight,
  Maximize2,
  Minimize2,
  Compass,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";

interface FormattedPlace {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean;
  phoneNumber?: string;
  website?: string;
  mapsUrl: string;
  directionsUrl: string;
}

interface MapsData {
  mode: "search" | "directions";
  query?: string;
  source?: string;
  center?: { lat: number; lng: number };
  zoom?: number;
  places?: FormattedPlace[];
  selectedPlaceId?: string;
  origin?: { name: string; lat: number; lng: number };
  destination?: { name: string; lat: number; lng: number };
  distance?: string;
  duration?: string;
  travelMode?: string;
  directionsUrl?: string;
  routePoints?: [number, number][];
  updatedAt: number;
  fullscreen?: boolean;
}

export function CenterMapsTheater({ mapsData }: { mapsData: MapsData }) {
  const clearCard = useMutation(api.dashboard.clearCard);
  const setCard = useMutation(api.dashboard.setCard);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(Boolean(mapsData.fullscreen));
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    mapsData.selectedPlaceId || mapsData.places?.[0]?.id || null
  );
  const [viewMode, setViewMode] = useState<"interactive" | "google_embed">("interactive");

  const mode = mapsData.mode || "search";
  const isDirections = mode === "directions";

  // Google Maps fallback / embed URL
  const googleEmbedUrl = isDirections && mapsData.origin && mapsData.destination
    ? `https://maps.google.com/maps?saddr=${encodeURIComponent(mapsData.origin.name)}&daddr=${encodeURIComponent(mapsData.destination.name)}&output=embed`
    : `https://maps.google.com/maps?q=${encodeURIComponent(mapsData.query || (mapsData.places?.[0]?.name ?? "India"))}&output=embed`;

  // Direct Google Maps web link
  const googleWebUrl = isDirections
    ? mapsData.directionsUrl || `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(mapsData.origin?.name || "")}&destination=${encodeURIComponent(mapsData.destination?.name || "")}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsData.query || "")}`;

  // Sync state if Convex updates mapsData.fullscreen
  useEffect(() => {
    if (mapsData.fullscreen !== undefined && mapsData.fullscreen !== isFullscreen) {
      setIsFullscreen(Boolean(mapsData.fullscreen));
    }
  }, [mapsData.fullscreen]);

  // Leaflet resize invalidate helper
  const triggerMapResize = useCallback(() => {
    setTimeout(() => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    }, 120);
    setTimeout(() => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    }, 320);
  }, []);

  // Enter Fullscreen handler
  const handleEnterFullscreen = useCallback(async () => {
    setIsFullscreen(true);
    triggerMapResize();

    const el = fullscreenContainerRef.current;
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
        console.warn("[nexus] Browser native fullscreen request handled via CSS full-window mode:", err);
      }
    }

    if (!mapsData.fullscreen) {
      void setCard({
        key: "maps",
        data: { ...mapsData, fullscreen: true, updatedAt: Date.now() },
      });
    }
  }, [mapsData, setCard, triggerMapResize]);

  // Exit Fullscreen handler
  const handleExitFullscreen = useCallback(async () => {
    setIsFullscreen(false);
    triggerMapResize();

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

    if (mapsData.fullscreen) {
      void setCard({
        key: "maps",
        data: { ...mapsData, fullscreen: false, updatedAt: Date.now() },
      });
    }
  }, [mapsData, setCard, triggerMapResize]);

  // Escape key & native fullscreenchange listener
  useEffect(() => {
    const onFullscreenChange = () => {
      const isNativeActive = Boolean(
        document.fullscreenElement === fullscreenContainerRef.current ||
        (document as any).webkitFullscreenElement === fullscreenContainerRef.current
      );
      if (!isNativeActive && isFullscreen) {
        setIsFullscreen(false);
        triggerMapResize();
        if (mapsData.fullscreen) {
          void setCard({
            key: "maps",
            data: { ...mapsData, fullscreen: false, updatedAt: Date.now() },
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
  }, [isFullscreen, mapsData, setCard, handleExitFullscreen, triggerMapResize]);

  // Resize map whenever fullscreen state toggles
  useEffect(() => {
    triggerMapResize();
  }, [isFullscreen, triggerMapResize]);

  // Stable signature for map data to avoid rebuilding Leaflet on fullscreen updates
  const dataSignature = `${mapsData.query || ""}_${mapsData.origin?.name || ""}_${mapsData.destination?.name || ""}_${mapsData.places?.length || 0}_${viewMode}`;

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (viewMode !== "interactive" || !mapContainerRef.current) return;

    let isMounted = true;

    async function initMap() {
      const L = (await import("leaflet")).default;
      if (!isMounted || !mapContainerRef.current) return;

      // Clean existing map instance
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }

      const defaultLat = mapsData.center?.lat || mapsData.origin?.lat || mapsData.places?.[0]?.latitude || 16.7907;
      const defaultLng = mapsData.center?.lng || mapsData.origin?.lng || mapsData.places?.[0]?.longitude || 80.8476;
      const zoom = mapsData.zoom || (isDirections ? 11 : 13);

      const map = L.map(mapContainerRef.current, {
        center: [defaultLat, defaultLng],
        zoom,
        zoomControl: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Dark futuristic tile theme (CartoDB Dark Matter)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> & OpenStreetMap',
        maxZoom: 19,
        subdomains: "abcd",
      }).addTo(map);

      leafletMapRef.current = map;
      markersRef.current = [];

      // Render search places markers
      if (!isDirections && mapsData.places && mapsData.places.length > 0) {
        const bounds = L.latLngBounds([]);

        mapsData.places.forEach((place, idx) => {
          if (!place.latitude || !place.longitude) return;

          const customIcon = L.divIcon({
            className: "custom-map-pin",
            html: `
              <div style="
                background: linear-gradient(135deg, #8B5CF6, #22D3EE);
                color: #080B14;
                font-weight: 700;
                font-size: 11px;
                border-radius: 50%;
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 0 15px rgba(34, 211, 238, 0.7);
                border: 2px solid #FFFFFF;
                transform: translate(-14px, -14px);
              ">
                ${idx + 1}
              </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });

          const popupContent = `
            <div style="
              background: #0D1020;
              color: #F1F5F9;
              padding: 10px;
              border-radius: 8px;
              border: 1px solid rgba(139, 92, 246, 0.3);
              font-family: inherit;
              max-width: 240px;
            ">
              <div style="font-weight: 600; font-size: 13px; color: #FFFFFF; margin-bottom: 4px;">
                ${place.name}
              </div>
              <div style="font-size: 11px; color: rgba(255,255,255,0.6); margin-bottom: 6px; line-height: 1.3;">
                ${place.address}
              </div>
              ${place.rating ? `<div style="font-size: 11px; color: #FBBF24; margin-bottom: 6px;">★ ${place.rating} (${place.userRatingCount || 0} reviews)</div>` : ""}
              <div style="display: flex; gap: 6px; margin-top: 6px;">
                <a href="${place.directionsUrl}" target="_blank" rel="noreferrer" style="
                  background: rgba(34, 211, 238, 0.2);
                  color: #22D3EE;
                  padding: 4px 8px;
                  border-radius: 4px;
                  font-size: 10px;
                  text-decoration: none;
                  font-weight: 600;
                  display: inline-block;
                ">Directions</a>
                <a href="${place.mapsUrl}" target="_blank" rel="noreferrer" style="
                  background: rgba(139, 92, 246, 0.2);
                  color: #A78BFA;
                  padding: 4px 8px;
                  border-radius: 4px;
                  font-size: 10px;
                  text-decoration: none;
                  font-weight: 600;
                  display: inline-block;
                ">Google Maps</a>
              </div>
            </div>
          `;

          const marker = L.marker([place.latitude, place.longitude], { icon: customIcon })
            .addTo(map)
            .bindPopup(popupContent, { className: "nexus-popup" });

          marker.on("click", () => {
            setSelectedPlaceId(place.id);
          });

          markersRef.current.push({ id: place.id, marker });
          bounds.extend([place.latitude, place.longitude]);
        });

        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
        }
      }

      // Render Directions Origin, Destination & Route
      if (isDirections && mapsData.origin && mapsData.destination) {
        const bounds = L.latLngBounds([]);

        // Origin marker (Cyan)
        const originIcon = L.divIcon({
          className: "custom-map-pin",
          html: `
            <div style="
              background: #22D3EE;
              color: #080B14;
              font-weight: 800;
              font-size: 10px;
              border-radius: 50%;
              width: 26px;
              height: 26px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 0 15px rgba(34, 211, 238, 0.8);
              border: 2px solid #FFFFFF;
            ">A</div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        L.marker([mapsData.origin.lat, mapsData.origin.lng], { icon: originIcon })
          .addTo(map)
          .bindPopup(`<b style="color:#080B14">Origin:</b> ${mapsData.origin.name}`);
        bounds.extend([mapsData.origin.lat, mapsData.origin.lng]);

        // Destination marker (Violet)
        const destIcon = L.divIcon({
          className: "custom-map-pin",
          html: `
            <div style="
              background: #8B5CF6;
              color: #FFFFFF;
              font-weight: 800;
              font-size: 10px;
              border-radius: 50%;
              width: 26px;
              height: 26px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 0 15px rgba(139, 92, 246, 0.8);
              border: 2px solid #FFFFFF;
            ">B</div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        L.marker([mapsData.destination.lat, mapsData.destination.lng], { icon: destIcon })
          .addTo(map)
          .bindPopup(`<b style="color:#080B14">Destination:</b> ${mapsData.destination.name}`);
        bounds.extend([mapsData.destination.lat, mapsData.destination.lng]);

        // Draw Route Polyline
        if (mapsData.routePoints && mapsData.routePoints.length > 0) {
          const polyline = L.polyline(mapsData.routePoints, {
            color: "#22D3EE",
            weight: 4,
            opacity: 0.85,
            dashArray: "6, 8",
          }).addTo(map);

          polylineRef.current = polyline;
          bounds.extend(polyline.getBounds());
        }

        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      }
    }

    void initMap();

    return () => {
      isMounted = false;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [dataSignature, viewMode, isDirections]);

  // Handle clicking place card in list: center and open popup
  const focusPlace = (place: FormattedPlace) => {
    setSelectedPlaceId(place.id);
    if (leafletMapRef.current && place.latitude && place.longitude) {
      leafletMapRef.current.flyTo([place.latitude, place.longitude], 15, { duration: 0.8 });
      const found = markersRef.current.find((m) => m.id === place.id);
      if (found) {
        found.marker.openPopup();
      }
    }
  };

  return (
    <div
      ref={fullscreenContainerRef}
      className={
        isFullscreen
          ? "fixed inset-0 z-50 w-screen h-screen bg-[#05070E]/95 backdrop-blur-2xl flex flex-col p-3 sm:p-5 overflow-hidden animate-in fade-in duration-300"
          : "glass-card relative flex flex-col w-full max-w-[680px] overflow-hidden rounded-2xl border-cyan-400/35 bg-[#080B14]/90 shadow-[0_0_60px_rgba(34,211,238,0.2)] my-2 backdrop-blur-xl"
      }
    >
      {/* Sci-Fi HUD Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 bg-gradient-to-r from-violet-950/40 via-cyan-950/30 to-black/60 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-80" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
          </span>
          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="label-xs text-cyan-200 font-semibold tracking-widest uppercase">
                {isFullscreen ? "NEXUS Maps Theater // Fullscreen Navigation" : "HUD MAPS THEATER // Google Maps"}
              </span>
              {isDirections ? (
                <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-mono text-violet-300 uppercase">
                  Route Matrix
                </span>
              ) : (
                <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-mono text-cyan-300 uppercase">
                  Places Search
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-white/60 font-mono">
              {isDirections
                ? `${mapsData.origin?.name.split(",")[0]} → ${mapsData.destination?.name.split(",")[0]}`
                : `"${mapsData.query || "Nearby Places"}" (${mapsData.places?.length || 0} locations)`}
            </p>
          </div>
        </div>

        {/* Header Controls */}
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

          {/* Toggle between Interactive HUD and Google Embed */}
          <button
            onClick={() => setViewMode(viewMode === "interactive" ? "google_embed" : "interactive")}
            className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-mono text-white/60 transition hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-200 cursor-pointer"
            title="Toggle between Interactive Cyberpunk map and Google Maps iframe view"
          >
            <Layers className="h-3 w-3" />
            <span className="hidden sm:inline">
              {viewMode === "interactive" ? "Google View" : "HUD View"}
            </span>
          </button>

          {/* Open full map in Google Maps */}
          <a
            href={googleWebUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-mono text-cyan-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/20"
            title="Open in official Google Maps app/browser tab"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="hidden sm:inline">Open in Maps</span>
          </a>

          {/* Close HUD */}
          <button
            onClick={() => void clearCard({ key: "maps" })}
            className="flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-mono text-rose-300 transition hover:border-rose-400 hover:bg-rose-500/20 cursor-pointer"
            title="Close Maps Theater"
          >
            <Square className="h-2.5 w-2.5 fill-current" />
            <span>Close</span>
          </button>
        </div>
      </div>

      {/* Route Telemetry Banner (when in directions mode) */}
      {isDirections && (
        <div className="flex flex-wrap items-center justify-between border-b border-white/[0.06] bg-[#0D1020]/90 px-4 py-2 gap-2 text-[12px] font-mono shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-cyan-300">
              <Car className="h-3.5 w-3.5" />
              <span>{mapsData.travelMode || "DRIVE"}</span>
            </span>
            <span className="text-white/30">•</span>
            <span className="text-white/80">
              Distance: <strong className="text-white font-semibold">{mapsData.distance || "Calculating…"}</strong>
            </span>
            <span className="text-white/30">•</span>
            <span className="text-white/80">
              Est. Time: <strong className="text-emerald-300 font-semibold">{mapsData.duration || "45 mins"}</strong>
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isFullscreen && (
              <span className="mono text-[10px] text-cyan-300/60 bg-cyan-950/40 border border-cyan-500/20 px-2 py-0.5 rounded">
                Press <kbd className="text-white font-bold">Esc</kbd> to exit fullscreen
              </span>
            )}
            <a
              href={mapsData.directionsUrl || googleWebUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-100 hover:underline"
            >
              <span>Start Live Navigation</span>
              <ChevronRight className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      {/* Main Map Canvas Area */}
      <div
        className={
          isFullscreen
            ? "flex-1 relative w-full h-full min-h-0 bg-[#080B14] rounded-xl overflow-hidden border border-cyan-400/30 shadow-[0_0_80px_rgba(34,211,238,0.2)] my-1"
            : "relative h-[320px] sm:h-[360px] w-full bg-[#080B14]"
        }
      >
        {viewMode === "interactive" ? (
          <div ref={mapContainerRef} className="h-full w-full z-0" />
        ) : (
          <iframe
            src={googleEmbedUrl}
            title="Google Maps Embed View"
            className="h-full w-full border-0"
            loading="lazy"
            allowFullScreen
          />
        )}
      </div>

      {/* Places Results Carousel / Cards Area (Search Mode) */}
      {!isDirections && mapsData.places && mapsData.places.length > 0 && (
        <div
          className={
            isFullscreen
              ? "border-t border-white/10 bg-[#0A0E1A]/95 p-3 shrink-0 rounded-b-xl"
              : "border-t border-white/10 bg-[#0A0E1A]/95 p-3 shrink-0"
          }
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="label-xs text-white/50 flex items-center gap-1">
              <MapPin className="h-3 w-3 text-cyan-400" />
              <span>Locations Found ({mapsData.places.length})</span>
            </span>
            <div className="flex items-center gap-3">
              {isFullscreen && (
                <span className="mono text-[10px] text-cyan-300/60 bg-cyan-950/40 border border-cyan-500/20 px-2 py-0.5 rounded">
                  Press <kbd className="text-white font-bold">Esc</kbd> to exit fullscreen
                </span>
              )}
              <span className="text-[10px] font-mono text-cyan-300/70">
                Click place to focus on map
              </span>
            </div>
          </div>

          <div className="scroll-thin flex gap-2.5 overflow-x-auto pb-1">
            {mapsData.places.map((place, idx) => {
              const isSelected = place.id === selectedPlaceId;
              return (
                <div
                  key={place.id}
                  onClick={() => focusPlace(place)}
                  className={`flex flex-col justify-between w-[220px] shrink-0 rounded-xl border p-2.5 transition-all cursor-pointer ${
                    isSelected
                      ? "border-cyan-400/60 bg-cyan-950/30 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                      : "border-white/10 bg-white/[0.03] hover:border-violet-400/40 hover:bg-white/[0.06]"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-[10px] font-bold text-black">
                        {idx + 1}
                      </span>
                      {place.rating ? (
                        <span className="flex items-center gap-0.5 text-[10.5px] font-semibold text-amber-300">
                          <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                          {place.rating}
                        </span>
                      ) : (
                        <span className="text-[9.5px] text-white/30 font-mono">Unrated</span>
                      )}
                    </div>
                    <h4 className="text-[12.5px] font-semibold text-white/90 line-clamp-1" title={place.name}>
                      {place.name}
                    </h4>
                    <p className="text-[10.5px] text-white/45 line-clamp-2 mt-0.5" title={place.address}>
                      {place.address || "Address details on map"}
                    </p>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2">
                    <a
                      href={place.directionsUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[10px] font-mono text-cyan-300 hover:text-cyan-100"
                    >
                      <Navigation className="h-2.5 w-2.5" />
                      <span>Directions</span>
                    </a>
                    <a
                      href={place.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] font-mono text-violet-300 hover:text-violet-100 flex items-center gap-0.5"
                    >
                      <span>Google</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
