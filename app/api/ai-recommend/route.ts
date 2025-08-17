import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnyEvent = any;

type UserContext = {
  city?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
  tone?: "Fun" | "Family" | "Cultural" | "Budget" | string;
};

/* --------------------------------- Helpers -------------------------------- */
function pick<T = any>(obj: any, path: string, fallback?: T): T | undefined {
  try {
    return path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj) ?? fallback;
  } catch {
    return fallback;
  }
}

function toISODateMaybe(s?: string) {
  if (!s) return undefined;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

function normalizeEvent(ev: AnyEvent) {
  const name = ev?.name || ev?.title || pick(ev, "name.text") || "Unknown event";
  const startISO =
    ev?.date || ev?.start || pick(ev, "dates.start.dateTime") || pick(ev, "dates.start.localDate") || pick(ev, "start.utc") || pick(ev, "start.local") || undefined;
  const date = toISODateMaybe(startISO);

  const venueName = ev?.venueName || pick(ev, "venue.name") || pick(ev, "_embedded.venues.0.name") || pick(ev, "location.name");
  const city = ev?.city || pick(ev, "venue.city") || pick(ev, "_embedded.venues.0.city.name") || pick(ev, "location.city") || pick(ev, "venue.address.city") || undefined;
  const country = ev?.country || pick(ev, "_embedded.venues.0.country.countryCode") || pick(ev, "venue.address.country") || "";
  const url = ev?.url || ev?.link || pick(ev, "resource_url") || undefined;
  const price = ev?.price || (ev?.is_free ? "free" : undefined) || pick(ev, "priceRanges.0.min") || undefined;
  const provider = ev?.provider || ev?.source || pick(ev, "classifications.0.segment.name") || undefined;
  const image = ev?.image || pick(ev, "images.0.url") || pick(ev, "logo.url") || undefined;

  return { name, date, venueName, city, country, url, price, provider, image };
}

function ruleBasedSummary(rawEvents: AnyEvent[], ctx: UserContext) {
  if (!rawEvents?.length) {
    const scope = ctx.city || ctx.keyword ? `${ctx.city ? ctx.city : ""}${ctx.city && ctx.keyword ? " · " : ""}${ctx.keyword ? ctx.keyword : ""}` : "your filters";
    return `No events to summarize yet for ${scope || "your filters"}. Try adjusting dates or keywords.`;
  }
  const events = rawEvents.map(normalizeEvent);
  const top = events.slice(0, 10);
  const byCity: Record<string, number> = {};
  let earliest = "9999-99-99";

  for (const e of top) {
    const c = (e.city || "TBA").toString();
    byCity[c] = (byCity[c] || 0) + 1;
    const d = e.date;
    if (d && d < earliest) earliest = d;
  }

  const hotspots = Object.entries(byCity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c, n]) => `${c} (${n})`)
    .join(", ");

  const picks = top
    .slice(0, 3)
    .map((e) => e.name)
    .filter(Boolean)
    .join(" • ");

  const meta: string[] = [];
  if (ctx.city) meta.push(`📍 ${ctx.city}`);
  if (ctx.keyword) meta.push(`🎯 ${ctx.keyword}`);
  if (ctx.startDate || ctx.endDate) meta.push(`🗓️ ${ctx.startDate || "?"} → ${ctx.endDate || "?"}`);

  return [
    meta.length ? meta.join("  |  ") : "",
    `Found ${events.length} events. ${earliest !== "9999-99-99" ? `Earliest: ${earliest}.` : ""}`.trim(),
    hotspots ? `Hotspots: ${hotspots}.` : "",
    picks ? `Top picks: ${picks}.` : "",
    `Tip: narrow down by neighborhood or add a price filter (e.g., free, under €20).`,
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeList(rawEvents: AnyEvent[]) {
  return (rawEvents || [])
    .slice(0, 20)
    .map((ev: any) => {
      const e = normalizeEvent(ev);
      const where = [e.venueName, e.city, e.country].filter(Boolean).join(", ");
      const priceLabel = typeof e.price === "number" ? `from ${e.price}` : e.price || "";
      const provider = e.provider ? ` · ${e.provider}` : "";
      return `${e.name} — ${e.date || "Unknown date"} — ${where}${provider}${priceLabel ? ` — ${priceLabel}` : ""}`;
    })
    .join("\n");
}

async function callGroqChat(content: string, ctx: UserContext) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Missing GROQ_API_KEY");

  const system = [
    "You are an energetic but concise festival & events planner.",
    "Given a city, date range, keyword, and a list of events, produce a short, helpful plan.",
    "Always output with these sections in this order:",
    "1) Top Picks — 2–3 bullets with event name, date, and a why-it’s-cool note.",
    "2) Suggested Itinerary — a compact day or weekend flow (Morning / Afternoon / Evening).",
    "3) Pro Tips — 1–2 short tips (tickets, transit, budget).",
    "Keep under 180 words. Prefer concrete details over fluff. Use simple emojis sparingly.",
    "Adapt to tone if provided: Fun (party vibe), Family (kid-friendly), Cultural (museums, heritage), Budget (low-cost, free).",
  ].join(" ");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0.5,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            ctx.city ? `City: ${ctx.city}` : undefined,
            ctx.keyword ? `Keyword: ${ctx.keyword}` : undefined,
            ctx.startDate || ctx.endDate ? `Dates: ${ctx.startDate || "?"} to ${ctx.endDate || "?"}` : undefined,
            ctx.tone ? `Tone: ${ctx.tone}` : undefined,
            "\nEvents:\n" + content,
          ].filter(Boolean).join("\n"),
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = await res.json();
  return json?.choices?.[0]?.message?.content?.trim() || "";
}

/* --------------------------------- Route ---------------------------------- */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { events = [], city, keyword, startDate, endDate, tone }: { events: AnyEvent[] } & UserContext = body || {};
    const ctx: UserContext = { city, keyword, startDate, endDate, tone };

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ summary: ruleBasedSummary(events, ctx) });
    }

    const list = summarizeList(events);
    if (!list) return NextResponse.json({ summary: ruleBasedSummary(events, ctx) });

    try {
      const summary = await callGroqChat(list, ctx);
      return NextResponse.json({ summary: summary || ruleBasedSummary(events, ctx) });
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "AI error", summary: ruleBasedSummary(events, ctx) },
        { status: 500 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Bad request", summary: "AI summary could not be generated." },
      { status: 400 }
    );
  }
}