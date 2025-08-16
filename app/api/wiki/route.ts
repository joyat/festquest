// app/api/wiki/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchWikiSummary(topic: string) {
  const page = encodeURIComponent(topic.replace(/\s+/g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${page}`;

  const r = await fetch(url, {
    headers: {
      "User-Agent": "FestQuest/1.0 (https://festquest.vercel.app)",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!r.ok) {
    console.error("Wiki fetch failed", r.status, await r.text());
    return "";
  }
  const j = await r.json();
  return (j?.extract as string) || "";
}

// Fallback formatter: 4–6 short lines from the raw text (no AI)
function toLines(text: string, maxLines = 5) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  const lines: string[] = [];
  let i = 0;
  while (i < sentences.length && lines.length < maxLines) {
    // try to keep each line ~12–18 words
    let line = sentences[i++];
    while (i < sentences.length && line.split(" ").length < 16) {
      const next = sentences[i];
      if (!next) break;
      if ((line + " " + next).split(" ").length > 20) break;
      line += " " + next;
      i++;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

async function aiPolish(text: string, topic: string) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return toLines(text); // fallback

  const prompt = `
Rewrite the following background about "${topic}" into a concise, engaging travel blurb.
Output 4–6 lines (each ~10–18 words). Friendly, practical, non-academic. No links, no markdown bullets.
Text:
${text}
`.trim();

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
        { role: "system", content: "You write compact, engaging travel blurbs." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    console.error("Groq polish failed", res.status, await res.text());
    return toLines(text);
  }
  const j = await res.json();
  // Ensure plain text lines (strip bullets if the model added any)
  const out = (j?.choices?.[0]?.message?.content || "")
    .replace(/^[•\-]\s*/gm, "") // remove bullets if present
    .trim();
  return out || toLines(text);
}

export async function POST(req: Request) {
  try {
    const { topic } = await req.json();
    const t = (topic || "").trim();
    if (t.length < 2) return NextResponse.json({ blurb: "" });

    const raw = await fetchWikiSummary(t);
    if (!raw) return NextResponse.json({ blurb: "" });

    const blurb = await aiPolish(raw, t);
    return NextResponse.json({ blurb });
  } catch (err) {
    console.error("Wiki route error", err);
    return NextResponse.json({ blurb: "" }, { status: 200 });
  }
}