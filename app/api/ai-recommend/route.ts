import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TMEvent = any;

function ruleBasedSummary(events: TMEvent[]) {
  if (!events?.length) return "No events to summarize yet.";
  const top = events.slice(0, 10);
  const cities: Record<string, number> = {};
  let earliest = "9999-99-99";

  top.forEach((e: any) => {
    const v = e?._embedded?.venues?.[0];
    const city = v?.city?.name || "TBA";
    cities[city] = (cities[city] || 0) + 1;
    const d = e?.dates?.start?.localDate;
    if (d && d < earliest) earliest = d;
  });

  const cityList = Object.entries(cities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c, n]) => `${c} (${n})`)
    .join(", ");

  const picks = top
    .slice(0, 3)
    .map((e: any) => e?.name)
    .filter(Boolean)
    .join(" • ");

  return [
    `We found ${events.length} upcoming events.`,
    earliest !== "9999-99-99" ? `Earliest date: ${earliest}.` : "",
    cityList ? `Hotspots: ${cityList}.` : "",
    picks ? `Top picks: ${picks}.` : "",
    `Tip: refine with a keyword (e.g., "jazz", "film", "tech") or add an end date for tighter results.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function summarizeList(events: TMEvent[]) {
  return (events || [])
    .slice(0, 10)
    .map((ev: any) => {
      const name = ev?.name || "Unknown event";
      const date = ev?.dates?.start?.localDate || "Unknown date";
      const v = ev?._embedded?.venues?.[0];
      const where = [v?.name, v?.city?.name, v?.country?.countryCode]
        .filter(Boolean)
        .join(", ");
      return `${name} — ${date} — ${where}`;
    })
    .join("\n");
}

async function callGroqChat(content: string) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Missing GROQ_API_KEY");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant", // fast & free-tier friendly
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are a concise travel & events guide. Write a 3–5 sentence summary suggesting why these events are interesting and how a traveler could plan a weekend around them.",
        },
        { role: "user", content },
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

export async function POST(req: Request) {
  try {
    const { events = [] } = await req.json();

    // If no key, return a useful summary anyway
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ summary: ruleBasedSummary(events) });
    }

    const list = summarizeList(events);
    if (!list) return NextResponse.json({ summary: "No events to summarize yet." });

    // Try Groq; if anything fails, fall back
    try {
      const summary = await callGroqChat(`Summarize these events for a traveler:\n${list}`);
      return NextResponse.json({ summary: summary || ruleBasedSummary(events) });
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "AI error", summary: ruleBasedSummary(events) },
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