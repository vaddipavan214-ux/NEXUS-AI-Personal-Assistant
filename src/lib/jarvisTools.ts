/**
 * Tool definitions and persona instructions for the Realtime session.
 * Shared between the token route (session config) and the client.
 */

export const JARVIS_INSTRUCTIONS = `You are NEXUS, an advanced AI-powered personal voice assistant and neural intelligence command center — calm, precise, quietly witty, with the composed confidence of a premier AI chief of staff. Address the user as "sir" sparingly and naturally. NEXUS is the central connection point for the user's digital world, bridging voice commands with tools, integrations, and services.

Voice style:
- Speak in short, information-dense sentences. This is a spoken conversation, not an essay.
- Never read raw data structures aloud. Synthesize: "Three unread emails, one from Sarah about the launch."
- When interrupted, stop gracefully and address the new request immediately.

Operational rules:
- Introduce or identify yourself as NEXUS if asked who you are or what your name is.
- Use tools proactively. If the user asks about email, calendar, or notes, call the matching tool rather than guessing.
- When the user states a preference, fact about themselves, project, or favorite tool — even in passing — call "remember" to store it. Confirm briefly: "Noted."
- If a tool reports a service is not connected, offer to connect it. If the user agrees, call "connect_service" with service set to "gmail", "googlecalendar", "notion", "youtube", or "google_maps".
- After initiating a connection, tell the user an authentication window is opening and to complete sign-in there.
- Google Calendar & Scheduling:
  * Default timezone is Asia/Kolkata (IST = UTC+05:30).
  * When the user asks to schedule a meeting (e.g. "Schedule a meeting with Narendra Modi on November 15 at 3:00 PM IST"), calculate the local ISO timestamp using the current year (e.g. "2026-11-15T15:00:00") and always pass timezone "Asia/Kolkata". Confirm the details in your voice response: "Scheduled: Meeting with Narendra Modi on November 15 at 3:00 PM IST."
  * When the user asks "Show my meetings today", "What meetings do I have tomorrow?", "Show my schedule for November 15", or "What is my next meeting?", call "get_calendar_events". Summarize the meetings with exact times (e.g. "3:00 PM to 4:00 PM IST").
  * When the user asks to cancel or delete a meeting ("Cancel my meeting with Narendra Modi", "Delete the 3 PM meeting"), call "delete_calendar_event" with the title of the meeting.
- "What can you connect to?" → call "list_services" and summarize.
- Google Maps & Navigation:
  * For finding places, restaurants, hospitals, petrol bunks, ATMs, pharmacies, or attractions ("Find restaurants near me", "Show hospitals nearby", "Where is the nearest petrol pump", "Best restaurants in Vijayawada"): call "maps_search" immediately with their query. If user coordinates are provided in the system context, include them. This opens the interactive Google Maps HUD with pins and place cards on their dashboard. Speak a short, concise summary mentioning the top 1-2 results and ratings.
  * For directions, routes, distance, or travel times ("Give me directions to RGUKT Nuzvid", "How can I reach Vijayawada Railway Station?", "Distance between Nuzvid and Vijayawada", "Route to nearest hospital"): call "maps_directions" with origin and destination. It displays the interactive route polyline, distance, and duration on their dashboard. Deliver a concise spoken answer with the distance and travel time.
  * To expand or maximize the map view ("Make the map fullscreen", "Expand Google Maps"), call "maps_fullscreen" with action "enter". To exit map fullscreen, call "maps_fullscreen" with action "exit". If no map is currently open, explain that there is no active map to expand.
  * To close or dismiss the map, call "maps_close".
- YouTube & Media Playback: you can play music or videos using "youtube_play" (e.g. "play Believer on YouTube", "play some jazz", "play Bohemian Rhapsody"). When the user asks to play a song, video, or track, call "youtube_play" with their query immediately — do NOT just search, call "youtube_play" so the video mounts in the media player. To stop or close the player, call "youtube_stop". To search or inspect video results without playing, call "youtube_search". To view channel information, call "youtube_get_channel".
  * To expand the video to fullscreen ("Make the video fullscreen", "Expand the YouTube player", "Maximize the video"), call "video_fullscreen" with action "enter". To exit video fullscreen, call "video_fullscreen" with action "exit". If no video is currently playing, explain that there is no active video to expand.
- You CAN read Notion page contents: "search_notes" finds pages (returns their ids), "read_note" retrieves a page's full content. When asked what's inside a note or to read it back, call "read_note" — never claim you cannot access page contents.
- "Prepare me for today" or any daily-briefing request → call "prepare_daily_briefing", then deliver a confident executive summary of its results.
- If asked what you know about the user, call "recall" and summarize warmly.
- To-dos live natively in this platform (not Notion). Manage them with "add_todo", "complete_todo", "update_todo", "delete_todo", and "list_todos". Be proactive: if an email or meeting clearly implies an action item, offer to add it as a to-do. When the user references a to-do loosely ("the launch thing"), call "list_todos" first to find the right title.
- Sending email: draft the message yourself from the user's intent, then read back the recipient, subject, and a one-line gist and ask for confirmation BEFORE calling "send_email". Never send without explicit verbal confirmation. If the user dictates a recipient address, repeat it back character-perfect. After sending, confirm briefly.
- External service integrations (Gmail, Google Calendar, Notion, YouTube) are managed via Composio. Never ask the user to provide Google Cloud, AWS, or Azure API keys or scopes in chat. If a connection error mentions Composio or auth_configs permissions, tell the user that their Composio API key needs write access in https://app.composio.dev/settings/api-keys.
- Report failures honestly and suggest the next step. Never invent data.`;

export const JARVIS_TOOLS = [
  {
    type: "function",
    name: "get_emails",
    description:
      "Fetch emails from the user's connected Gmail account. Defaults to unread messages.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Gmail search query, e.g. 'is:unread', 'from:sarah', 'subject:invoice'. Default 'is:unread'.",
        },
        max_results: { type: "number", description: "Max messages to fetch (default 10)." },
      },
    },
  },
  {
    type: "function",
    name: "send_email",
    description:
      "Send an email from the user's connected Gmail account. ONLY call this after the user has verbally confirmed the recipient, subject, and message content.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address." },
        subject: { type: "string" },
        body: {
          type: "string",
          description:
            "Plain-text email body. Write it well-formed and professional unless told otherwise; sign off as the user would.",
        },
        cc: {
          type: "array",
          items: { type: "string" },
          description: "Optional CC addresses.",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    type: "function",
    name: "get_calendar_events",
    description:
      "List upcoming events from the user's Google Calendar. Defaults to the next 30 days. Use when the user asks about today's meetings, tomorrow's schedule, or any date.",
    parameters: {
      type: "object",
      properties: {
        time_min: { type: "string", description: "ISO 8601 lower bound. Defaults to start of today." },
        time_max: {
          type: "string",
          description: "ISO 8601 upper bound. Defaults to 30 days ahead.",
        },
        max_results: { type: "number", description: "Max events to fetch (default 25)." },
      },
    },
  },
  {
    type: "function",
    name: "create_calendar_event",
    description: "Create a new Google Calendar event in Asia/Kolkata (IST) timezone.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title (e.g. 'Meeting with Narendra Modi')." },
        start_datetime: {
          type: "string",
          description:
            "Event start in local ISO 8601 format 'YYYY-MM-DDTHH:mm:ss', e.g. '2026-11-15T15:00:00'. Always include the year.",
        },
        duration_minutes: { type: "number", description: "Duration in minutes (default 60)." },
        description: { type: "string", description: "Optional description or meeting notes." },
        timezone: { type: "string", description: "IANA timezone. Defaults to 'Asia/Kolkata'." },
      },
      required: ["summary", "start_datetime"],
    },
  },
  {
    type: "function",
    name: "delete_calendar_event",
    description: "Cancel or delete a calendar event from Google Calendar by title or event ID.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title or search keyword of the meeting to cancel/delete." },
        event_id: { type: "string", description: "Google Calendar event ID if already known." },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "search_notes",
    description: "Search the user's Notion workspace for pages and documents.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text. Empty string returns recent pages." },
        max_results: { type: "number" },
      },
    },
  },
  {
    type: "function",
    name: "read_note",
    description:
      "Read the full content of a Notion page (rendered as Markdown) so you can summarize it or read it back aloud. Provide page_id if known (from search_notes results), otherwise a query to find the page by title.",
    parameters: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "Notion page UUID, if already known." },
        query: { type: "string", description: "Page title to search for when no page_id is available." },
        title: { type: "string", description: "Display title, if known." },
      },
    },
  },
  {
    type: "function",
    name: "remember",
    description:
      "Store a fact about the user in long-term memory. Use whenever the user states a preference, project, tool choice, or personal fact.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["preference", "project", "fact", "context", "service"],
        },
        key: {
          type: "string",
          description: "Short stable identifier, e.g. 'favorite editor', 'current project'.",
        },
        value: { type: "string", description: "The fact itself, e.g. 'Cursor'." },
      },
      required: ["category", "key", "value"],
    },
  },
  {
    type: "function",
    name: "recall",
    description: "Retrieve everything NEXUS remembers about the user.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "forget",
    description: "Remove a remembered fact by its key.",
    parameters: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
  {
    type: "function",
    name: "add_todo",
    description:
      "Add a to-do item to the user's native task list. Use when the user asks to add, track, or be reminded of something to do.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, action-oriented title." },
        priority: { type: "string", enum: ["high", "normal", "low"] },
        due_date: {
          type: "string",
          description:
            "Optional due date/time in ISO 8601 WITH timezone offset, e.g. '2026-08-05T18:00:00+05:30'. Resolve relative phrases like 'by Friday evening' yourself using the current date/time.",
        },
        notes: { type: "string", description: "Optional extra context." },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "complete_todo",
    description: "Mark a to-do as done. Matches by (partial) title.",
    parameters: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "update_todo",
    description:
      "Edit an existing to-do: rename it, change priority, set or move a due date, add notes, or reopen a completed one.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Current (partial) title to match." },
        new_title: { type: "string" },
        priority: { type: "string", enum: ["high", "normal", "low"] },
        due_date: { type: "string", description: "New due date in ISO 8601." },
        notes: { type: "string" },
        reopen: { type: "boolean", description: "Set true to move a done item back to pending." },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "delete_todo",
    description: "Delete a to-do entirely. Matches by (partial) title.",
    parameters: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "list_todos",
    description:
      "List the user's pending and recently completed to-dos. Use before editing when unsure of exact titles, or when the user asks what's on their plate.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "list_services",
    description:
      "List all external services NEXUS can connect to, with their current connection status.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "connect_service",
    description:
      "Begin the OAuth connection flow for an external service (Gmail, Google Calendar, Notion, or YouTube). Opens an authentication window for the user.",
    parameters: {
      type: "object",
      properties: {
        service: {
          type: "string",
          enum: ["gmail", "googlecalendar", "notion", "youtube", "google_maps"],
          description: "Service name to connect: 'gmail' for Gmail, 'googlecalendar' for Google Calendar, 'notion' for Notion, 'youtube' for YouTube, or 'google_maps' for Google Maps.",
        },
      },
      required: ["service"],
    },
  },
  {
    type: "function",
    name: "youtube_search",
    description:
      "Search YouTube for videos matching a query. Returns video titles, channel names, publication dates, and URLs.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search terms or keywords, e.g. 'Next.js 15 tutorial', 'space launch live'.",
        },
        max_results: {
          type: "number",
          description: "Number of video results to return (default 5, max 10).",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "youtube_get_channel",
    description:
      "Get information about the user's connected YouTube channel (title, handle, channel ID), or lookup a channel by handle.",
    parameters: {
      type: "object",
      properties: {
        handle: {
          type: "string",
          description: "Optional channel handle (e.g. '@Google') to lookup. Omit to fetch the authenticated user's own channel.",
        },
      },
    },
  },
  {
    type: "function",
    name: "youtube_play",
    description:
      "Play a song, music video, or video on YouTube. Searches for the best match and launches the video directly in the NEXUS in-app media player with autoplay. Use whenever the user asks to 'play <song/video>', 'listen to <music>', or 'put on <video>'.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Song title, artist, or video name to play, e.g. 'Believer', 'Imagine Dragons Believer', 'Lofi hip hop beats'.",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "youtube_stop",
    description:
      "Stop the currently playing YouTube video and close the media player. Use when the user asks to 'stop video', 'stop playing', 'close player', or 'stop the music'.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "prepare_daily_briefing",
    description:
      "Gather email, calendar, and notes from all connected services and compile a daily briefing. Use for 'prepare me for today', 'daily briefing', 'what's my day look like'.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "maps_search",
    description:
      "Search for places, businesses, restaurants, hospitals, petrol bunks, ATMs, or landmarks on Google Maps. Returns real place names, addresses, ratings, and coordinates, and mounts the interactive Maps HUD on the dashboard.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query, e.g. 'restaurants in Vijayawada', 'hospitals near me', 'petrol pump in Nuzvid', 'coffee shops'.",
        },
        latitude: {
          type: "number",
          description: "Optional user latitude if searching nearby.",
        },
        longitude: {
          type: "number",
          description: "Optional user longitude if searching nearby.",
        },
        max_results: {
          type: "number",
          description: "Maximum number of places to retrieve (default 5, max 10).",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "maps_directions",
    description:
      "Calculate routes, distance, and travel time between an origin and destination on Google Maps, and renders the route, polyline, and direction cards on the dashboard.",
    parameters: {
      type: "object",
      properties: {
        origin: {
          type: "string",
          description:
            "Starting point, e.g. 'Nuzvid', 'Vijayawada', 'Current location'. Default is user's current location or specified city.",
        },
        destination: {
          type: "string",
          description:
            "Destination to navigate to, e.g. 'RGUKT Nuzvid', 'Vijayawada Railway Station', 'nearest hospital'.",
        },
        travel_mode: {
          type: "string",
          enum: ["DRIVE", "WALK", "BICYCLE", "TRANSIT"],
          description: "Mode of transportation. Defaults to 'DRIVE'.",
        },
      },
      required: ["destination"],
    },
  },
  {
    type: "function",
    name: "maps_close",
    description:
      "Close or dismiss the active Google Maps HUD display on the dashboard. Use when the user asks to 'close map', 'hide map', or 'dismiss map'.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "video_fullscreen",
    description:
      "Expand the active YouTube video player to full screen or exit full screen. Use when the user asks to 'make the video fullscreen', 'expand YouTube player', 'maximize video', 'exit video fullscreen', or 'minimize video'.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["enter", "exit"],
          description: "Whether to enter or exit fullscreen mode. Defaults to 'enter'.",
        },
      },
    },
  },
  {
    type: "function",
    name: "maps_fullscreen",
    description:
      "Expand the active Google Maps HUD to full screen or exit full screen. Use when the user asks to 'make the map fullscreen', 'expand Google Maps', 'maximize map', 'exit map fullscreen', or 'minimize map'.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["enter", "exit"],
          description: "Whether to enter or exit fullscreen mode. Defaults to 'enter'.",
        },
      },
    },
  },
];


export function getGroqTools() {
  return JARVIS_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
