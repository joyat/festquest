import { NextRequest, NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

export async function POST(req: NextRequest) {
  try {
    const { action, text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "No section text provided." }, { status: 400 });
    }

    if (!GROQ_API_KEY) {
      return NextResponse.json({ error: "Missing GROQ_API_KEY" }, { status: 500 });
    }

    const actionPrompt =
      action === "shorten"
        ? "Shorten this itinerary day to 2–3 concise one-line bullets. Keep original date/city heading."
        : action === "expand"
        ? "Expand this itinerary day with 2–3 extra relevant bullets (venues, food, logistics). Keep concise one-liners."
        : "Regenerate this itinerary day with fresh, realistic suggestions. Keep format and heading.";

    const sys =
      `You are a concise travel planner.\n` +
      `Return **GitHub-flavored Markdown** only (no code fences).\n` +
      `Preserve the first heading line exactly if present (e.g., "### 📅 2025-09-26 — Berlin").\n` +
      `Use short, single-line bullets with emojis (🚶‍♂️ 🚌 🎟️ 🍽️ 🕒 💡) and price brackets (€, €€, €€€, free).\n` +
      `Avoid overlaps; mark uncertain info as (approx).\n`;

    const body = {
      model: DEFAULT_GROQ_MODEL,
      temperature: 0.6,
      max_tokens: 600,
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: `${actionPrompt}\n\n---\n${text}\n---`,
        },
      ],
    };

    async function callGroq(payload: any) {
      return fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
    }

    let response = await callGroq(body);

    if (!response.ok) {
      const errText = await response.text();
      if (/model_decommissioned|deprecations|invalid_model|unsupported/i.test(errText)) {
        const fallbacks = [
          "llama-3.1-8b-instant",
          "mixtral-8x7b-32768",
          "llama-3.2-90b-text-preview",
        ];
        for (const m of fallbacks) {
          if (m === DEFAULT_GROQ_MODEL) continue;
          response = await callGroq({ ...body, model: m });
          if (response.ok) break;
        }
      }
      if (!response.ok) {
        return NextResponse.json({ error: errText || "Groq API error" }, { status: 500 });
      }
    }

    const data = await response.json();
    const summary = data?.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({ summary });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}