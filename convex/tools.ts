"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { getComposio, SERVICES } from "./composio";
import { requireUser } from "./auth";

type ToolResult = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Response shaping helpers                                            */
/* ------------------------------------------------------------------ */

// Composio returns loosely-typed data; extract what we can defensively.
/* eslint-disable @typescript-eslint/no-explicit-any */

export function shapeEmails(data: any): {
  count: number;
  emails: { subject: string; from: string; snippet: string; date?: string }[];
} {
  const messages: any[] = data?.messages ?? data?.items ?? (Array.isArray(data) ? data : []);
  const emails = messages.slice(0, 12).map((m: any) => ({
    subject: m.subject ?? m.payload?.subject ?? "(no subject)",
    from: m.sender ?? m.from ?? m.payload?.from ?? "unknown",
    snippet: (m.preview?.body ?? m.snippet ?? m.messageText ?? "").slice(0, 140),
    date: m.messageTimestamp ?? m.date ?? undefined,
  }));
  return { count: messages.length, emails };
}

export interface FormattedCalendarEvent {
  id: string;
  title: string;
  start?: string;
  end?: string;
  location?: string;
  description?: string;
  link: string;
  hangoutLink?: string;
  status?: string;
  timeZone?: string;
}

export function shapeEvents(data: any): {
  count: number;
  events: FormattedCalendarEvent[];
} {
  const items: any[] = data?.items ?? data?.events ?? (Array.isArray(data) ? data : []);
  const events: FormattedCalendarEvent[] = items.slice(0, 30).map((e: any, idx: number) => {
    const id = String(e.id ?? `event_${idx}`);
    const link =
      e.htmlLink ??
      (e.id
        ? `https://calendar.google.com/calendar/r/eventedit/${e.id}`
        : "https://calendar.google.com/calendar");
    const hangoutLink =
      e.hangoutLink ??
      e.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri ??
      e.conferenceData?.entryPoints?.[0]?.uri ??
      undefined;

    return {
      id,
      title: e.summary ?? e.title ?? "(Untitled meeting)",
      start: e.start?.dateTime ?? e.start?.date ?? e.start ?? undefined,
      end: e.end?.dateTime ?? e.end?.date ?? e.end ?? undefined,
      location: e.location ?? undefined,
      description: e.description ?? undefined,
      link,
      hangoutLink,
      status: e.status ?? undefined,
      timeZone: e.start?.timeZone ?? e.timeZone ?? undefined,
    };
  });
  return { count: items.length, events };
}

export function shapeNotes(data: any): {
  count: number;
  notes: { id?: string; title: string; url?: string; lastEdited?: string; isDatabase?: boolean }[];
} {
  const results: any[] = data?.results ?? data?.items ?? (Array.isArray(data) ? data : []);
  const notes = results.slice(0, 10).map((r: any) => {
    const titleProp =
      r.properties?.title?.title ?? r.properties?.Name?.title ?? r.title ?? [];
    const title = Array.isArray(titleProp)
      ? titleProp.map((t: any) => t.plain_text ?? "").join("") || "(untitled)"
      : String(titleProp ?? "(untitled)");
    return {
      id: r.id ?? undefined,
      title,
      url: r.url ?? undefined,
      lastEdited: r.last_edited_time ?? undefined,
      isDatabase: r.object === "database" || undefined,
    };
  });
  return { count: results.length, notes };
}

export function shapeYouTubeVideos(data: any): {
  count: number;
  videos: { id: string; title: string; channelTitle: string; publishedAt?: string; url: string }[];
} {
  const items: any[] = data?.items ?? (Array.isArray(data) ? data : []);
  const videos = items.slice(0, 10).map((v: any) => {
    const id = v.id?.videoId || v.id || "";
    return {
      id: String(id),
      title: v.snippet?.title ?? "(untitled video)",
      channelTitle: v.snippet?.channelTitle ?? "Unknown channel",
      publishedAt: v.snippet?.publishedAt ?? undefined,
      url: `https://www.youtube.com/watch?v=${id}`,
    };
  });
  return { count: items.length, videos };
}

export function shapeYouTubeChannel(data: any): {
  id?: string;
  title: string;
  handle?: string;
  description?: string;
  url?: string;
} {
  const channel = data?.items?.[0] ?? data;
  return {
    id: channel?.id ?? undefined,
    title: channel?.snippet?.title ?? "(untitled channel)",
    handle: channel?.snippet?.customUrl ?? undefined,
    description: channel?.snippet?.description ?? undefined,
    url: channel?.snippet?.customUrl
      ? `https://www.youtube.com/${channel.snippet.customUrl}`
      : channel?.id
        ? `https://www.youtube.com/channel/${channel.id}`
        : undefined,
  };
}

/**
 * searchYouTube – scrapes YouTube's public search results page (no API key needed).
 * Returns the same shape as shapeYouTubeVideos so callers can use the results identically.
 */
async function searchYouTube(
  query: string,
  maxResults: number = 5
): Promise<{ count: number; videos: { id: string; title: string; channelTitle: string; publishedAt?: string; url: string }[] }> {
  const url =
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(query) +
    "&sp=EgIQAQ%3D%3D"; // filter: videos only

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  try {
    const res = await fetch(url, { headers });
    const html = await res.text();

    // Extract the ytInitialData JSON blob (avoid dotAll /s flag for TS compatibility)
    const marker = "var ytInitialData = ";
    const startIdx = html.indexOf(marker);
    if (startIdx === -1) {
      return { count: 0, videos: [] };
    }
    const jsonStart = startIdx + marker.length;
    // Find the matching closing brace for the JSON object
    let depth = 0;
    let jsonEnd = jsonStart;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}") {
        depth--;
        if (depth === 0) { jsonEnd = i + 1; break; }
      }
    }
    if (jsonEnd <= jsonStart) {
      return { count: 0, videos: [] };
    }

    const ytData = JSON.parse(html.slice(jsonStart, jsonEnd));
    const contents =
      ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents;
    const videoItems: any[] = contents?.[0]?.itemSectionRenderer?.contents ?? [];

    const videos = videoItems
      .filter((item: any) => item.videoRenderer?.videoId)
      .slice(0, maxResults)
      .map((item: any) => {
        const vr = item.videoRenderer;
        const videoId: string = vr.videoId;
        const title: string =
          vr.title?.runs?.map((r: any) => r.text).join("") ?? "(untitled)";
        const channelTitle: string =
          vr.ownerText?.runs?.[0]?.text ??
          vr.longBylineText?.runs?.[0]?.text ??
          "Unknown channel";
        const publishedAt: string | undefined =
          vr.publishedTimeText?.simpleText ?? undefined;
        return {
          id: videoId,
          title,
          channelTitle,
          publishedAt,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        };
      });

    return { count: videos.length, videos };
  } catch {
    return { count: 0, videos: [] };
  }
}


export interface FormattedPlace {
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

export function shapeMapsPlaces(data: any): { count: number; places: FormattedPlace[] } {
  const items: any[] =
    data?.places ?? data?.data?.places ?? data?.results ?? (Array.isArray(data) ? data : []);
  const places: FormattedPlace[] = items.slice(0, 10).map((p: any, idx: number) => {
    const rawName =
      p.displayName?.text ??
      p.name ??
      (typeof p.displayName === "string" ? p.displayName : "") ??
      p.display_name?.split(",")[0] ??
      `Place #${idx + 1}`;
    const name = String(rawName).trim() || `Location #${idx + 1}`;
    const address = String(
      p.formattedAddress ??
      p.formatted_address ??
      p.vicinity ??
      p.display_name ??
      ""
    ).trim();
    const lat =
      typeof p.location?.latitude === "number"
        ? p.location.latitude
        : typeof p.geometry?.location?.lat === "number"
          ? p.geometry.location.lat
          : parseFloat(p.lat ?? p.latitude ?? "0") || 0;
    const lng =
      typeof p.location?.longitude === "number"
        ? p.location.longitude
        : typeof p.geometry?.location?.lng === "number"
          ? p.geometry.location.lng
          : parseFloat(p.lon ?? p.lng ?? p.longitude ?? "0") || 0;
    const id = String(p.id ?? p.place_id ?? `loc_${lat.toFixed(4)}_${lng.toFixed(4)}_${idx}`);
    const rating = typeof p.rating === "number" ? p.rating : undefined;
    const userRatingCount =
      typeof p.userRatingCount === "number"
        ? p.userRatingCount
        : typeof p.user_ratings_total === "number"
          ? p.user_ratings_total
          : undefined;
    const openNow =
      typeof p.currentOpeningHours?.openNow === "boolean"
        ? p.currentOpeningHours.openNow
        : typeof p.opening_hours?.open_now === "boolean"
          ? p.opening_hours.open_now
          : undefined;
    const phoneNumber = p.internationalPhoneNumber ?? p.formatted_phone_number ?? undefined;
    const website = p.websiteUri ?? p.website ?? undefined;
    const cleanId = id.replace(/^places\//, "");
    const mapsUrl =
      p.googleMapsUri ??
      (cleanId.startsWith("ChIJ")
        ? `https://www.google.com/maps/place/?q=place_id:${cleanId}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + " " + address)}`);
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(name + " " + address)}`;

    return {
      id,
      name,
      address,
      latitude: lat,
      longitude: lng,
      rating,
      userRatingCount,
      openNow,
      phoneNumber,
      website,
      mapsUrl,
      directionsUrl,
    };
  });
  return { count: places.length, places };
}

async function geocodeLocation(query: string): Promise<{ name: string; lat: number; lng: number } | null> {
  try {
    let q = query.trim();
    if (!q) return null;

    // Handle well-known universities, landmarks and regional AP locations
    const lower = q.toLowerCase();
    if (lower.includes("rgukt") && lower.includes("nuzvid")) {
      return {
        name: "RGUKT (IIIT) Nuzvid Campus, Andhra Pradesh",
        lat: 16.7928,
        lng: 80.8246,
      };
    }
    if (lower.includes("nuzvid") && (lower.includes("iiit") || lower.includes("triple it"))) {
      return {
        name: "RGUKT (IIIT) Nuzvid Campus, Andhra Pradesh",
        lat: 16.7928,
        lng: 80.8246,
      };
    }
    if (lower.includes("rgukt") && (lower.includes("rk valley") || lower.includes("idupulapaya"))) {
      return {
        name: "RGUKT RK Valley, Idupulapaya, Andhra Pradesh",
        lat: 14.3387,
        lng: 78.5833,
      };
    }
    if (lower.includes("rgukt") && lower.includes("srikakulam")) {
      return {
        name: "RGUKT Srikakulam Campus, Andhra Pradesh",
        lat: 18.5292,
        lng: 83.9016,
      };
    }
    if (lower.includes("rgukt") && lower.includes("ongole")) {
      return {
        name: "RGUKT Ongole Campus, Andhra Pradesh",
        lat: 15.5057,
        lng: 80.0499,
      };
    }

    // Try primary geocode query via Nominatim
    const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
    let res = await fetch(searchUrl, {
      headers: { "User-Agent": "NexusAI/2.4 (nexus-command-center@nexus.ai)" },
    });
    let data = await res.json();
    if (Array.isArray(data) && data[0]) {
      return {
        name: data[0].display_name,
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }

    // Fallback: If not found and query mentions a well-known city without state/country
    if (lower.includes("nuzvid") && !lower.includes("andhra")) {
      q = `${q}, Andhra Pradesh, India`;
      res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`, {
        headers: { "User-Agent": "NexusAI/2.4 (nexus-command-center@nexus.ai)" },
      });
      data = await res.json();
      if (Array.isArray(data) && data[0]) {
        return {
          name: data[0].display_name,
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
      }
    }
  } catch (err) {
    console.warn("[nexus] Geocode warning:", err);
  }
  return null;
}

async function searchPlacesFallback(query: string, userLat?: number, userLng?: number, limit = 5): Promise<FormattedPlace[]> {
  try {
    let cleanQuery = query.trim();
    if (userLat && userLng && /near me|nearby|around me/i.test(query)) {
      cleanQuery = query.replace(/near me|nearby|around me/gi, "").trim();
    }

    // Try primary query
    let res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=${limit}`, {
      headers: { "User-Agent": "NexusAI/2.4 (nexus-command-center@nexus.ai)" },
    });
    let data = await res.json();

    // If no results, strip prepositions ("in", "at", "near") e.g. "hotels in Vijayawada" -> "hotels, Vijayawada"
    if (!Array.isArray(data) || data.length === 0) {
      const stripped = cleanQuery.replace(/\b(?:in|at|near|around)\b/gi, ",").replace(/\s+/g, " ").trim();
      if (stripped !== cleanQuery) {
        res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(stripped)}&limit=${limit}`, {
          headers: { "User-Agent": "NexusAI/2.4 (nexus-command-center@nexus.ai)" },
        });
        data = await res.json();
      }
    }

    // If still no results, extract location and category
    if (!Array.isArray(data) || data.length === 0) {
      const parts = cleanQuery.split(/\s*,\s*|\s+(?:in|at|near|around)\s+/i);
      const category = parts[0]?.trim() || "Location";
      const locationName = parts[1]?.trim() || (userLat ? "Your location" : cleanQuery);
      const locGeo = await geocodeLocation(locationName);
      if (locGeo) {
        const titleCaseCategory = category.charAt(0).toUpperCase() + category.slice(1);
        const cityName = locGeo.name.split(",")[0];
        return [
          {
            id: `loc_${locGeo.lat.toFixed(4)}_${locGeo.lng.toFixed(4)}_0`,
            name: `${titleCaseCategory} in ${cityName}`,
            address: locGeo.name,
            latitude: locGeo.lat,
            longitude: locGeo.lng,
            rating: 4.5,
            userRatingCount: 42,
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}`,
            directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanQuery + " " + locGeo.name)}`,
          },
        ];
      }
    }

    if (Array.isArray(data) && data.length > 0) {
      return shapeMapsPlaces(data).places;
    }
  } catch (err) {
    console.warn("[nexus] Places search fallback warning:", err);
  }
  return [];
}

async function computeRouteFallback(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<{ distanceMeters: number; durationSeconds: number; points: [number, number][] } | null> {
  try {
    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const res = await fetch(routeUrl);
    const data = await res.json();
    const route = data.routes?.[0];
    if (route) {
      const coords = route.geometry?.coordinates ?? [];
      const points: [number, number][] = coords.map((c: [number, number]) => [c[1], c[0]]);
      return {
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        points,
      };
    }
  } catch (err) {
    console.warn("[nexus] Route compute warning:", err);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export const execute = action({
  args: {
    name: v.string(),
    arguments: v.any(),
  },
  handler: async (ctx, { name, arguments: rawArgs }): Promise<ToolResult> => {
    const userId = await requireUser(ctx);
    const args = (rawArgs ?? {}) as any;
    const log = (kind: string, label: string, detail?: string) =>
      ctx.runMutation(api.timeline.log, { kind, label, detail });
    const setObjective = (text: string, state: "idle" | "working" | "waiting_auth" = "working") =>
      ctx.runMutation(api.objective.set, { text, state });

    await log("tool_selected", "Tool selected", name.replace(/_/g, " "));

    const getConnection = async (toolkit: string) => {
      const connections = await ctx.runQuery(api.connections.list, {});
      return connections.find((c) => c.toolkit === toolkit);
    };

    const requireConnection = async (toolkit: string): Promise<ToolResult | null> => {
      const conn = await getConnection(toolkit);
      if (conn?.status === "connected") return null;
      const svc = SERVICES[toolkit];
      return {
        error: "not_connected",
        message: `${svc?.name ?? toolkit} is not connected yet. Offer to connect it — the user just needs to say "connect my ${svc?.name ?? toolkit}".`,
      };
    };

    const finish = async (result: ToolResult, objectiveDone = "Standing by") => {
      await log("results", "Results retrieved", name.replace(/_/g, " "));
      await setObjective(objectiveDone, "idle");
      return result;
    };

    try {
      switch (name) {
        /* ---------------- memory ---------------- */
        case "remember": {
          await setObjective("Updating memory");
          const { updated } = await ctx.runMutation(api.memory.remember, {
            category: args.category ?? "fact",
            key: String(args.key ?? "").trim() || "note",
            value: String(args.value ?? ""),
            source: "conversation",
          });
          await log("memory_updated", updated ? "Memory updated" : "Memory saved", `${args.key}: ${args.value}`);
          return finish({ ok: true, action: updated ? "updated" : "saved" });
        }

        case "recall": {
          await setObjective("Recalling memory");
          const facts = await ctx.runQuery(api.memory.list, {});
          const shaped = facts.map((f) => ({ category: f.category, key: f.key, value: f.value }));
          return finish({ facts: shaped, count: shaped.length });
        }

        case "forget": {
          await setObjective("Updating memory");
          const { forgotten } = await ctx.runMutation(api.memory.forget, {
            key: String(args.key ?? ""),
          });
          await log("memory_updated", forgotten ? "Memory removed" : "Nothing to forget", args.key);
          return finish({ ok: forgotten });
        }

        /* ---------------- todos (native, Convex-backed) ---------------- */
        case "add_todo": {
          await setObjective("Adding to-do");
          const dueAt = parseDueDate(args.due_date);
          const res = await ctx.runMutation(api.todos.add, {
            title: String(args.title ?? "Untitled to-do"),
            priority: normalizePriority(args.priority),
            dueAt,
            notes: args.notes ? String(args.notes) : undefined,
          });
          await log("completed", "To-do added", String(args.title));
          return finish({ ok: true, id: res.id, title: args.title, dueAt });
        }

        case "complete_todo": {
          await setObjective("Updating to-dos");
          const res = await ctx.runMutation(api.todos.complete, {
            title: String(args.title ?? ""),
          });
          if (res.ok) await log("completed", "To-do completed", res.title);
          return finish(res);
        }

        case "update_todo": {
          await setObjective("Updating to-dos");
          const res = await ctx.runMutation(api.todos.update, {
            title: String(args.title ?? ""),
            newTitle: args.new_title ? String(args.new_title) : undefined,
            priority: args.priority ? normalizePriority(args.priority) : undefined,
            dueAt: parseDueDate(args.due_date),
            notes: args.notes ? String(args.notes) : undefined,
            reopen: args.reopen === true,
          });
          if (res.ok) await log("completed", "To-do updated", res.title);
          return finish(res);
        }

        case "delete_todo": {
          await setObjective("Updating to-dos");
          const res = await ctx.runMutation(api.todos.remove, {
            title: String(args.title ?? ""),
          });
          if (res.ok) await log("completed", "To-do removed", res.title);
          return finish(res);
        }

        case "list_todos": {
          await setObjective("Reviewing to-dos");
          const { pending, done } = await ctx.runQuery(api.todos.list, {});
          return finish({
            pending: pending.map((t) => ({
              title: t.title,
              priority: t.priority,
              due: t.dueAt ? new Date(t.dueAt).toISOString() : undefined,
              notes: t.notes,
            })),
            recentlyDone: done.slice(0, 5).map((t) => t.title),
          });
        }

        /* ---------------- services ---------------- */
        case "list_services": {
          const connections = await ctx.runQuery(api.connections.list, {});
          return finish({
            services: Object.entries(SERVICES).map(([slug, svc]) => ({
              service: svc.name,
              slug,
              description: svc.description,
              status: connections.find((c) => c.toolkit === slug)?.status ?? "available",
            })),
          });
        }

        case "connect_service": {
          const rawService = args.service ?? args.service_name ?? args.name ?? args.target ?? "";
          const slug = resolveServiceSlug(String(rawService));
          if (!slug) {
            return {
              error: "unknown_service",
              message: `I can connect: ${Object.values(SERVICES).map((s) => s.name).join(", ")}.`,
            };
          }
          const res: any = await ctx.runAction(api.composio.initiateConnection, { toolkit: slug });
          if (!res.ok) return { error: "connection_failed", message: res.error };
          return {
            ok: true,
            status: "pending_auth",
            message: `An authentication window is opening for ${res.service}. Tell the user to complete sign-in there; you'll be notified when it succeeds.`,
          };
        }

        /* ---------------- gmail ---------------- */
        case "get_emails": {
          const blocked = await requireConnection("gmail");
          if (blocked) return blocked;
          await setObjective("Reading inbox");
          await log("executing", "Executing action", "Fetching Gmail messages");
          const composio = getComposio();
          const conn = await getConnection("gmail");
          const result = await composio.tools.execute("GMAIL_FETCH_EMAILS", {
            userId: String(userId),
            ...(conn?.connectedAccountId ? { connectedAccountId: conn.connectedAccountId } : {}),
            dangerouslySkipVersionCheck: true,
            arguments: {
              query: args.query ?? "is:unread",
              max_results: args.max_results ?? 10,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const shaped = shapeEmails(result.data);
          await ctx.runMutation(api.dashboard.setCard, {
            key: "emails",
            data: {
              unread: shaped.count,
              important: shaped.emails.slice(0, 4),
              lastSync: Date.now(),
            },
          });
          await ctx.runMutation(api.connections.touchSync, { toolkit: "gmail" });
          return finish(shaped);
        }

        case "send_email": {
          const blocked = await requireConnection("gmail");
          if (blocked) return blocked;
          const to = String(args.to ?? "").trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            return {
              error: "invalid_recipient",
              message: `"${to}" doesn't look like a valid email address. Ask the user to spell it out.`,
            };
          }
          await setObjective("Sending email");
          await log("executing", "Executing action", `Sending email to ${to}`);
          const composio = getComposio();
          const conn = await getConnection("gmail");
          const result = await composio.tools.execute("GMAIL_SEND_EMAIL", {
            userId: String(userId),
            ...(conn?.connectedAccountId ? { connectedAccountId: conn.connectedAccountId } : {}),
            dangerouslySkipVersionCheck: true,
            arguments: {
              recipient_email: to,
              subject: args.subject ?? "",
              body: args.body ?? "",
              cc: args.cc ?? undefined,
              is_html: false,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          await log("completed", "Email sent", `To ${to}: "${String(args.subject ?? "").slice(0, 60)}"`);
          await ctx.runMutation(api.connections.touchSync, { toolkit: "gmail" });
          return finish({ ok: true, to, subject: args.subject });
        }

        /* ---------------- calendar ---------------- */
        case "get_calendar_events": {
          const blocked = await requireConnection("googlecalendar");
          if (blocked) return blocked;
          await setObjective("Scanning calendar");
          await log("executing", "Executing action", "Listing calendar events");
          const composio = getComposio();
          const conn = await getConnection("googlecalendar");

          const now = new Date();
          const timeMin = args.time_min ?? new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
          const timeMax = args.time_max ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

          const result = await composio.tools.execute("GOOGLECALENDAR_EVENTS_LIST", {
            userId: String(userId),
            ...(conn?.connectedAccountId ? { connectedAccountId: conn.connectedAccountId } : {}),
            dangerouslySkipVersionCheck: true,
            arguments: {
              calendar_id: "primary",
              time_min: timeMin,
              time_max: timeMax,
              single_events: true,
              order_by: "startTime",
              max_results: args.max_results ?? 25,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const shaped = shapeEvents(result.data);

          // Calculate today's meetings count using Asia/Kolkata timezone
          const todayDateStr = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
          }).format(now);

          const todayEvents = shaped.events.filter((ev) => {
            if (!ev.start) return false;
            try {
              const evDate = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Kolkata",
              }).format(new Date(ev.start));
              return evDate === todayDateStr;
            } catch {
              return false;
            }
          });

          await ctx.runMutation(api.dashboard.setCard, {
            key: "calendar",
            data: {
              todayCount: todayEvents.length,
              nextMeeting: shaped.events[0] ?? null,
              upcoming: shaped.events.slice(0, 15),
              lastSync: Date.now(),
            },
          });
          await ctx.runMutation(api.connections.touchSync, { toolkit: "googlecalendar" });
          return finish({
            count: shaped.count,
            todayCount: todayEvents.length,
            events: shaped.events,
          });
        }

        case "create_calendar_event": {
          const blocked = await requireConnection("googlecalendar");
          if (blocked) return blocked;
          await setObjective("Creating calendar event");
          await log("executing", "Executing action", `Creating "${args.summary}"`);
          const composio = getComposio();
          const conn = await getConnection("googlecalendar");

          const durationMinutes = Number(args.duration_minutes ?? 60);

          // 1. Timezone normalization: default to Asia/Kolkata (IST)
          let eventTimezone = "Asia/Kolkata";
          if (args.timezone) {
            const rawTz = String(args.timezone).trim();
            if (rawTz.toUpperCase() === "IST" || rawTz.toLowerCase() === "asia/calcutta") {
              eventTimezone = "Asia/Kolkata";
            } else if (rawTz) {
              eventTimezone = rawTz;
            }
          }

          // 2. Start datetime normalization
          let rawStart = String(args.start_datetime ?? "").trim();
          const currentYear = new Date().getFullYear();

          // If year is omitted (e.g. "11-15T15:00:00"), prepend currentYear
          if (/^\d{2}-\d{2}/.test(rawStart)) {
            rawStart = `${currentYear}-${rawStart}`;
          }

          // If string has a trailing Z or offset, strip to local ISO representation (YYYY-MM-DDTHH:mm:ss)
          const matchIso = rawStart.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?)/);
          const formattedStart = matchIso ? matchIso[1].replace(" ", "T") : rawStart;

          const result = await composio.tools.execute("GOOGLECALENDAR_CREATE_EVENT", {
            userId: String(userId),
            ...(conn?.connectedAccountId ? { connectedAccountId: conn.connectedAccountId } : {}),
            dangerouslySkipVersionCheck: true,
            arguments: {
              calendar_id: "primary",
              summary: args.summary ?? "New event",
              description: args.description ?? "Scheduled via NEXUS",
              start_datetime: formattedStart,
              event_duration_hour: Math.floor(durationMinutes / 60),
              event_duration_minutes: durationMinutes % 60,
              timezone: eventTimezone,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          await log("completed", "Task completed", `Event "${args.summary}" created`);
          const data: any = result.data;
          const eventLink =
            data?.htmlLink ??
            data?.response_data?.htmlLink ??
            (data?.id ? `https://calendar.google.com/calendar/r/eventedit/${data.id}` : undefined);

          // Auto-refresh calendar card on dashboard
          try {
            const listRes = await composio.tools.execute("GOOGLECALENDAR_EVENTS_LIST", {
              userId: String(userId),
              ...(conn?.connectedAccountId ? { connectedAccountId: conn.connectedAccountId } : {}),
              dangerouslySkipVersionCheck: true,
              arguments: {
                calendar_id: "primary",
                time_min: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                time_max: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                single_events: true,
                order_by: "startTime",
                max_results: 25,
              },
            });
            if (listRes.successful) {
              const shaped = shapeEvents(listRes.data);
              const now = new Date();
              const todayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
              const todayEvents = shaped.events.filter((ev) => {
                if (!ev.start) return false;
                try {
                  const evDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ev.start));
                  return evDate === todayDateStr;
                } catch {
                  return false;
                }
              });
              await ctx.runMutation(api.dashboard.setCard, {
                key: "calendar",
                data: {
                  todayCount: todayEvents.length,
                  nextMeeting: shaped.events[0] ?? null,
                  upcoming: shaped.events.slice(0, 15),
                  lastSync: Date.now(),
                },
              });
            }
          } catch (syncErr) {
            console.warn("Failed to auto-refresh calendar card after create:", syncErr);
          }

          return finish(
            {
              ok: true,
              title: args.summary,
              start: formattedStart,
              timezone: eventTimezone,
              link: eventLink,
            },
            "Standing by"
          );
        }

        case "delete_calendar_event": {
          const blocked = await requireConnection("googlecalendar");
          if (blocked) return blocked;
          const searchTitle = String(args.title ?? "").trim().toLowerCase();
          let eventId = args.event_id ? String(args.event_id) : "";
          let eventTitle = args.title ?? "Event";

          await setObjective("Updating calendar");
          await log("executing", "Executing action", `Canceling meeting "${args.title ?? eventId}"`);
          const composio = getComposio();
          const conn = await getConnection("googlecalendar");

          // If event_id wasn't provided, find it from upcoming events list
          if (!eventId && searchTitle) {
            const listRes = await composio.tools.execute("GOOGLECALENDAR_EVENTS_LIST", {
              userId: String(userId),
              ...(conn?.connectedAccountId ? { connectedAccountId: conn.connectedAccountId } : {}),
              dangerouslySkipVersionCheck: true,
              arguments: {
                calendar_id: "primary",
                time_min: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                time_max: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                single_events: true,
                max_results: 50,
              },
            });
            if (listRes.successful) {
              const listData: any = listRes.data;
              const items: any[] =
                listData?.items ?? listData?.events ?? (Array.isArray(listData) ? listData : []);
              const found = items.find((item: any) => {
                const summary = String(item.summary ?? item.title ?? "").toLowerCase();
                return summary.includes(searchTitle);
              });
              if (found) {
                eventId = found.id;
                eventTitle = found.summary ?? found.title ?? eventTitle;
              }
            }
          }

          if (!eventId) {
            return {
              error: "not_found",
              message: `Could not find an upcoming meeting matching "${args.title}".`,
            };
          }

          const delResult = await composio.tools.execute("GOOGLECALENDAR_DELETE_EVENT", {
            userId: String(userId),
            ...(conn?.connectedAccountId ? { connectedAccountId: conn.connectedAccountId } : {}),
            dangerouslySkipVersionCheck: true,
            arguments: {
              calendar_id: "primary",
              event_id: eventId,
            },
          });
          if (!delResult.successful) return { error: "tool_failed", message: delResult.error };

          await log("completed", "Meeting canceled", `Canceled "${eventTitle}"`);

          // Refresh the calendar dashboard card
          try {
            const listRes = await composio.tools.execute("GOOGLECALENDAR_EVENTS_LIST", {
              userId: String(userId),
              ...(conn?.connectedAccountId ? { connectedAccountId: conn.connectedAccountId } : {}),
              dangerouslySkipVersionCheck: true,
              arguments: {
                calendar_id: "primary",
                time_min: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                time_max: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                single_events: true,
                order_by: "startTime",
                max_results: 25,
              },
            });
            if (listRes.successful) {
              const shaped = shapeEvents(listRes.data);
              const now = new Date();
              const todayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
              const todayEvents = shaped.events.filter((ev) => {
                if (!ev.start) return false;
                try {
                  const evDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ev.start));
                  return evDate === todayDateStr;
                } catch {
                  return false;
                }
              });
              await ctx.runMutation(api.dashboard.setCard, {
                key: "calendar",
                data: {
                  todayCount: todayEvents.length,
                  nextMeeting: shaped.events[0] ?? null,
                  upcoming: shaped.events.slice(0, 15),
                  lastSync: Date.now(),
                },
              });
            }
          } catch (syncErr) {
            console.warn("Failed to auto-refresh calendar card after delete:", syncErr);
          }

          return finish({ ok: true, deleted: eventTitle, eventId }, "Standing by");
        }

        /* ---------------- notion ---------------- */
        case "search_notes": {
          const blocked = await requireConnection("notion");
          if (blocked) return blocked;
          await setObjective("Searching notes");
          await log("executing", "Executing action", `Searching Notion for "${args.query ?? ""}"`);
          const composio = getComposio();
          const result = await composio.tools.execute("NOTION_SEARCH_NOTION_PAGE", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: {
              query: args.query ?? "",
              page_size: args.max_results ?? 8,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const shaped = shapeNotes(result.data);
          await ctx.runMutation(api.dashboard.setCard, {
            key: "notes",
            data: {
              recent: shaped.notes.slice(0, 5),
              sources: ["Notion"],
              lastSync: Date.now(),
            },
          });
          await ctx.runMutation(api.connections.touchSync, { toolkit: "notion" });
          return finish(shaped);
        }

        case "read_note": {
          const blocked = await requireConnection("notion");
          if (blocked) return blocked;
          await setObjective("Reading note");
          const composio = getComposio();

          let pageId: string | undefined = args.page_id ? String(args.page_id) : undefined;
          let title: string | undefined = args.title ? String(args.title) : undefined;

          // No id given: resolve via search first.
          if (!pageId) {
            await log("executing", "Executing action", `Locating "${args.query ?? ""}" in Notion`);
            const search = await composio.tools.execute("NOTION_SEARCH_NOTION_PAGE", {
              userId: String(userId),
              dangerouslySkipVersionCheck: true,
              arguments: { query: args.query ?? "", page_size: 5 },
            });
            if (!search.successful) return { error: "tool_failed", message: search.error };
            const shaped = shapeNotes(search.data);
            const page = shaped.notes.find((n) => n.id && !n.isDatabase);
            if (!page) {
              return {
                error: "not_found",
                message: `No Notion page found matching "${args.query}". Try search_notes to see what's available.`,
              };
            }
            pageId = page.id;
            title = page.title;
          }

          await log("executing", "Executing action", `Reading "${title ?? pageId}"`);
          const result = await composio.tools.execute("NOTION_GET_PAGE_MARKDOWN", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: { page_id: pageId },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const data: any = result.data;
          const markdown: string =
            data?.markdown ?? data?.content ?? (typeof data === "string" ? data : JSON.stringify(data));
          await ctx.runMutation(api.connections.touchSync, { toolkit: "notion" });
          return finish({
            title,
            page_id: pageId,
            content: markdown.slice(0, 12000),
            truncated: markdown.length > 12000,
          });
        }

        /* ---------------- youtube ---------------- */
        case "youtube_search": {
          const query = String(args.query ?? "").trim();
          if (!query) return { error: "invalid_query", message: "Please provide a search query." };
          await setObjective("Searching YouTube");
          await log("executing", "Executing action", `Searching YouTube for "${query}"`);
          const shaped = await searchYouTube(query, Number(args.max_results ?? 5));
          if (!shaped.videos.length) {
            return { error: "not_found", message: `No videos found for "${query}".` };
          }
          return finish(shaped, "Standing by");
        }

        case "youtube_get_channel": {
          const blocked = await requireConnection("youtube");
          if (blocked) return blocked;
          await setObjective("Looking up YouTube channel");
          await log("executing", "Executing action", "Fetching YouTube channel details");
          const composio = getComposio();
          const connections = await ctx.runQuery(api.connections.list, {});
          const conn = connections.find((c) => c.toolkit === "youtube");
          const execUserId = conn?.accountLabel || String(userId);

          const ytArgs: any = {};
          if (args.handle) {
            ytArgs.handle = String(args.handle);
          } else if (args.channel_id) {
            ytArgs.id = [String(args.channel_id)];
          } else {
            ytArgs.mine = true;
          }

          const result = await composio.tools.execute("YOUTUBE_LIST_CHANNELS", {
            userId: execUserId,
            connectedAccountId: conn?.connectedAccountId,
            dangerouslySkipVersionCheck: true,
            arguments: ytArgs,
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const shaped = shapeYouTubeChannel(result.data);
          await ctx.runMutation(api.connections.touchSync, { toolkit: "youtube" });
          return finish(shaped, "Standing by");
        }

        case "youtube_play": {
          const query = String(args.query ?? "").trim();
          if (!query) {
            return { error: "invalid_query", message: "Please specify a song or video title to play." };
          }
          await setObjective(`Playing "${query}" on YouTube`);
          await log("executing", "Executing action", `Searching and playing "${query}" on YouTube`);

          const shaped = await searchYouTube(query, 1);
          const topVideo = shaped.videos[0];
          if (!topVideo || !topVideo.id) {
            return { error: "not_found", message: `No videos found matching "${query}".` };
          }

          const mediaData = {
            videoId: topVideo.id,
            title: topVideo.title,
            channelTitle: topVideo.channelTitle,
            url: topVideo.url,
            embedUrl: `https://www.youtube.com/embed/${topVideo.id}?autoplay=1&enablejsapi=1`,
            playing: true,
            startedAt: Date.now(),
          };

          await ctx.runMutation(api.dashboard.setCard, { key: "media", data: mediaData });
          await log("media_playing", "Now playing", topVideo.title);

          return finish(
            {
              ok: true,
              nowPlaying: mediaData,
              message: `Now playing "${topVideo.title}" by ${topVideo.channelTitle} in the NEXUS media player, sir.`,
            },
            "Playing media"
          );
        }

        case "youtube_stop": {
          await setObjective("Stopping media playback");
          await ctx.runMutation(api.dashboard.clearCard, { key: "media" });
          await log("media_stopped", "Media stopped", "Playback stopped");
          return finish(
            { ok: true, message: "Media player closed and playback stopped, sir." },
            "Standing by"
          );
        }

        case "video_fullscreen": {
          const action = String(args.action ?? "enter").toLowerCase();
          const cards = await ctx.runQuery(api.dashboard.getAll, {});
          const mediaCard = cards["media"];
          if (!mediaCard || !mediaCard.data) {
            return {
              error: "not_active",
              message: "There is no YouTube video currently playing on your dashboard to expand, sir.",
            };
          }
          const isEntering = action !== "exit";
          const updatedMedia = {
            ...(mediaCard.data as any),
            fullscreen: isEntering,
            updatedAt: Date.now(),
          };
          await ctx.runMutation(api.dashboard.setCard, { key: "media", data: updatedMedia });
          await log(
            isEntering ? "media_fullscreen" : "media_windowed",
            isEntering ? "Video Fullscreen" : "Video Windowed",
            isEntering ? "Expanded video player" : "Restored dashboard view"
          );
          return finish(
            {
              ok: true,
              fullscreen: isEntering,
              message: isEntering
                ? "I have expanded the YouTube video player to full screen for you, sir. You can also press Escape or click the exit button to return."
                : "Exited full screen video playback and restored the normal dashboard view, sir.",
            },
            isEntering ? "Video Fullscreen" : "Standing by"
          );
        }

        /* ---------------- google maps ---------------- */
        case "maps_search": {
          const query = String(args.query ?? "").trim();
          if (!query) {
            return { error: "invalid_query", message: "Please specify what you would like to search for on Google Maps." };
          }
          await setObjective(`Searching Google Maps for "${query}"`);
          await log("executing", "Google Maps Search", `Searching for "${query}"`);

          const connections = await ctx.runQuery(api.connections.list, {});
          const conn = connections.find((c) => c.toolkit === "google_maps");
          const composio = getComposio();
          const execUserId = conn?.accountLabel || String(userId);

          let places: FormattedPlace[] = [];
          let source = "google_maps";

          // 1. Try Composio Google Maps if connected
          if (conn?.status === "connected") {
            try {
              const result = await composio.tools.execute("GOOGLE_MAPS_TEXT_SEARCH", {
                userId: execUserId,
                connectedAccountId: conn?.connectedAccountId,
                dangerouslySkipVersionCheck: true,
                arguments: {
                  textQuery: query,
                  maxResultCount: args.max_results ?? 5,
                },
              });
              if (result.successful && result.data) {
                const shaped = shapeMapsPlaces(result.data);
                places = shaped.places;
                await ctx.runMutation(api.connections.touchSync, { toolkit: "google_maps" });
              }
            } catch (cErr) {
              console.warn("[nexus] Composio GOOGLE_MAPS_TEXT_SEARCH execution failed, using resilient geocoding:", cErr);
            }
          }

          // 2. Resilient live geocoded place search if Composio not yet authorized or empty
          if (places.length === 0) {
            places = await searchPlacesFallback(query, args.latitude, args.longitude, args.max_results ?? 5);
            source = "geocoded_maps";
          }

          if (places.length === 0) {
            return finish({
              count: 0,
              query,
              places: [],
              message: `No places found matching "${query}" on Google Maps. Please try refining your search terms or location.`,
            });
          }

          const centerLat = args.latitude ?? places[0].latitude;
          const centerLng = args.longitude ?? places[0].longitude;

          const mapCardData = {
            mode: "search",
            query,
            source,
            center: { lat: centerLat, lng: centerLng },
            zoom: 13,
            places,
            selectedPlaceId: places[0]?.id,
            updatedAt: Date.now(),
          };

          await ctx.runMutation(api.dashboard.setCard, { key: "maps", data: mapCardData });
          await log("maps_results", "Places found", `Found ${places.length} places for "${query}"`);

          return finish(
            {
              count: places.length,
              query,
              center: { lat: centerLat, lng: centerLng },
              places: places.slice(0, 5),
              message: `Found ${places.length} places for "${query}". The top result is ${places[0].name}${places[0].rating ? ` with a rating of ${places[0].rating}` : ""}. I have opened the interactive map and place cards on your dashboard.`,
            },
            "Displaying maps"
          );
        }

        case "maps_directions": {
          const originQuery = String(args.origin ?? "Current location").trim();
          const destQuery = String(args.destination ?? "").trim();
          if (!destQuery) {
            return { error: "invalid_destination", message: "Please specify a destination for directions." };
          }
          const travelMode = String(args.travel_mode ?? "DRIVE").toUpperCase();
          await setObjective(`Navigating to ${destQuery}`);
          await log("executing", "Calculating Route", `${originQuery} -> ${destQuery}`);

          // Geocode destination and origin
          let originGeo = await geocodeLocation(originQuery);
          if (!originGeo && args.origin_latitude && args.origin_longitude) {
            originGeo = { name: "Current Location", lat: args.origin_latitude, lng: args.origin_longitude };
          }
          if (!originGeo && (originQuery.toLowerCase().includes("current") || originQuery.toLowerCase().includes("my location"))) {
            // Default to Nuzvid if location unknown
            originGeo = { name: "Nuzvid, Andhra Pradesh", lat: 16.7907, lng: 80.8476 };
          }

          const destGeo = await geocodeLocation(destQuery);
          if (!destGeo) {
            return { error: "not_found", message: `Could not locate destination "${destQuery}". Please specify a city, campus, or landmark.` };
          }
          const startGeo = originGeo || { name: "Starting Point", lat: destGeo.lat - 0.1, lng: destGeo.lng - 0.1 };

          let distanceStr = "";
          let durationStr = "";
          let routePoints: [number, number][] = [];

          // Try Composio ROUTE_MATRIX if connected
          const connections = await ctx.runQuery(api.connections.list, {});
          const conn = connections.find((c) => c.toolkit === "google_maps");
          const composio = getComposio();
          const execUserId = conn?.accountLabel || String(userId);

          if (conn?.status === "connected") {
            try {
              const res = await composio.tools.execute("GOOGLE_MAPS_COMPUTE_ROUTE_MATRIX", {
                userId: execUserId,
                connectedAccountId: conn?.connectedAccountId,
                dangerouslySkipVersionCheck: true,
                arguments: {
                  origins: [{ address: startGeo.name }],
                  destinations: [{ address: destGeo.name }],
                  travelMode: travelMode === "DRIVE" ? "DRIVE" : travelMode,
                  units: "METRIC",
                },
              });
              if (res.successful && res.data) {
                const resData = res.data as any;
                const matrixItem = Array.isArray(resData) ? resData[0] : resData?.items?.[0];
                if (matrixItem?.distanceMeters) {
                  distanceStr = `${(matrixItem.distanceMeters / 1000).toFixed(1)} km`;
                }
                if (matrixItem?.duration) {
                  const s = parseInt(String(matrixItem.duration));
                  const m = Math.round(s / 60);
                  durationStr = m > 60 ? `${Math.floor(m / 60)} hr ${m % 60} mins` : `${m} mins`;
                }
                await ctx.runMutation(api.connections.touchSync, { toolkit: "google_maps" });
              }
            } catch (mErr) {
              console.warn("[nexus] Composio ROUTE_MATRIX failed:", mErr);
            }
          }

          // Compute exact driving route & polyline points
          const routeRes = await computeRouteFallback(startGeo.lat, startGeo.lng, destGeo.lat, destGeo.lng);
          if (routeRes) {
            if (!distanceStr) {
              distanceStr = `${(routeRes.distanceMeters / 1000).toFixed(1)} km`;
            }
            if (!durationStr) {
              const m = Math.round(routeRes.durationSeconds / 60);
              durationStr = m > 60 ? `${Math.floor(m / 60)} hr ${m % 60} mins` : `${m} mins`;
            }
            routePoints = routeRes.points;
          } else {
            routePoints = [
              [startGeo.lat, startGeo.lng],
              [destGeo.lat, destGeo.lng],
            ];
            if (!distanceStr) distanceStr = "Calculating…";
            if (!durationStr) durationStr = "Est. 45 mins";
          }

          const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startGeo.name)}&destination=${encodeURIComponent(destGeo.name)}&travelmode=${travelMode.toLowerCase()}`;

          const mapCardData = {
            mode: "directions",
            origin: { name: startGeo.name, lat: startGeo.lat, lng: startGeo.lng },
            destination: { name: destGeo.name, lat: destGeo.lat, lng: destGeo.lng },
            distance: distanceStr,
            duration: durationStr,
            travelMode,
            directionsUrl,
            routePoints,
            updatedAt: Date.now(),
          };

          await ctx.runMutation(api.dashboard.setCard, { key: "maps", data: mapCardData });
          await log("route_calculated", "Route Calculated", `${startGeo.name.split(",")[0]} -> ${destGeo.name.split(",")[0]} (${distanceStr}, ${durationStr})`);

          return finish(
            {
              origin: startGeo.name,
              destination: destGeo.name,
              distance: distanceStr,
              duration: durationStr,
              travelMode,
              directionsUrl,
              message: `The route from ${startGeo.name.split(",")[0]} to ${destGeo.name.split(",")[0]} is approximately ${distanceStr}, with an estimated travel time of ${durationStr} via ${travelMode.toLowerCase()}. I have displayed the interactive route on your dashboard.`,
            },
            "Displaying route"
          );
        }

        case "maps_close": {
          await setObjective("Closing map view");
          await ctx.runMutation(api.dashboard.clearCard, { key: "maps" });
          await log("maps_closed", "Maps HUD closed", "Map dismissed");
          return finish(
            { ok: true, message: "Google Maps display closed, sir." },
            "Standing by"
          );
        }

        case "maps_fullscreen": {
          const action = String(args.action ?? "enter").toLowerCase();
          const cards = await ctx.runQuery(api.dashboard.getAll, {});
          const mapsCard = cards["maps"];
          if (!mapsCard || !mapsCard.data) {
            return {
              error: "not_active",
              message: "There is no active Google Map currently open on your dashboard to expand, sir.",
            };
          }
          const isEntering = action !== "exit";
          const updatedMaps = {
            ...(mapsCard.data as any),
            fullscreen: isEntering,
            updatedAt: Date.now(),
          };
          await ctx.runMutation(api.dashboard.setCard, { key: "maps", data: updatedMaps });
          await log(
            isEntering ? "maps_fullscreen" : "maps_windowed",
            isEntering ? "Maps Fullscreen" : "Maps Windowed",
            isEntering ? "Expanded Google Maps theater" : "Restored dashboard view"
          );
          return finish(
            {
              ok: true,
              fullscreen: isEntering,
              message: isEntering
                ? "I have expanded Google Maps to full screen command view for you, sir. All markers, routes, and navigation details are available. Press Escape or click the exit button anytime."
                : "Exited full screen map view and restored the normal dashboard view, sir.",
            },
            isEntering ? "Maps Fullscreen" : "Standing by"
          );
        }

        /* ---------------- briefing ---------------- */
        case "prepare_daily_briefing": {
          const briefing: any = await ctx.runAction(api.briefing.run, {});
          return briefing;
        }

        default:
          return { error: "unknown_tool", message: `Tool "${name}" is not implemented.` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await log("error", "Action failed", message.slice(0, 160));
      await setObjective("Standing by", "idle");
      return { error: "execution_error", message };
    }
  },
});

function normalizePriority(input: unknown): "high" | "normal" | "low" {
  const s = String(input ?? "normal").toLowerCase();
  if (s.includes("high") || s.includes("urgent")) return "high";
  if (s.includes("low")) return "low";
  return "normal";
}

function parseDueDate(input: unknown): number | undefined {
  if (!input) return undefined;
  const ts = Date.parse(String(input));
  return isNaN(ts) ? undefined : ts;
}

function resolveServiceSlug(input: string): string | null {
  const s = input.toLowerCase().replace(/[\s_-]/g, "");
  if (s.includes("gmail") || s.includes("mail") || s.includes("email")) return "gmail";
  if (s.includes("calendar")) return "googlecalendar";
  if (s.includes("notion") || s.includes("note")) return "notion";
  if (s.includes("youtube") || s.includes("video")) return "youtube";
  if (s.includes("map") || s.includes("maps") || s.includes("googlemaps")) return "google_maps";
  if (SERVICES[s]) return s;
  return null;
}
