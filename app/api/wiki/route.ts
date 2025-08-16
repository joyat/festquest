import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchWikiSummary(topic: string) {
  const page = encodeURIComponent(topic.replace(/\s+/g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${page}`;

  const r = await fetch(url, {
    headers: {
      "User-Agent": "FestQuest/1.0 (https://festquest.app)",
      "Accept": "application/json",
    },
    cache: "no-store",
  });

  if (!r.ok) {
    console.error("Wiki fetch failed", r.status, await r.text());
    return null;
  }

  const j = await r.json();
  return (j?.extract as string) || "";
}

export async function POST(req: Request) {
  try {
    const { topic } = await req.json();
    const t = (topic || "").trim();
    if (t.length < 2) return NextResponse.json({ blurb: "" });

    const raw = await fetchWikiSummary(t);
    if (!raw) return NextResponse.json({ blurb: "" });

    // Trim to ~4–6 lines (~600 chars) without cutting mid-sentence
    const max = 600;
    let text = raw;
    if (text.length > max) {
      const sliced = text.slice(0, max);
      text = sliced.slice(0, sliced.lastIndexOf(". ") + 1) || sliced;
    }

    return NextResponse.json({ blurb: text });
  } catch (err) {
    console.error("Wiki route error", err);
    return NextResponse.json({ blurb: "" }, { status: 200 });
  }
}