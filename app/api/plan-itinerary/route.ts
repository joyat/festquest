import { NextRequest, NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant"; // safe default

export async function POST(req: NextRequest) {
  try {
    const { itinerary, city, startDate, endDate, tone } = await req.json();

    if (!Array.isArray(itinerary) || itinerary.length === 0) {
      return NextResponse.json(
        { error: "Itinerary is required and cannot be empty." },
        { status: 400 }
      );
    }

    if (!GROQ_API_KEY) {
      return NextResponse.json(
        { error: "Missing GROQ_API_KEY environment variable" },
        { status: 500 }
      );
    }

    // Compact payload (token-friendly)
    const compact = itinerary.slice(0, 30).map((x: any) => ({
      id: x?.id,
      name: x?.name,
      date: x?.dates?.start?.localDate || null,
      venue: x?._embedded?.venues?.[0]?.name || null,
      city: x?._embedded?.venues?.[0]?.city?.name || null,
      country: x?._embedded?.venues?.[0]?.country?.name || null,
      url: x?.url || null,
      source: x?.source || null,
    }));

    const sys =
      `You are a meticulous, concise travel-planning assistant.\n` +
      `Return output as **GitHub-flavored Markdown** (no code fences).\n` +
      `Follow this structure EXACTLY:\n` +
      `# Day-by-Day Plan\n` +
      `For each day, print a level-3 heading: \n` +
      `### 📅 {YYYY-MM-DD} — {City}\n` +
      `Then three subsections:\n` +
      `#### Morning\n- one-line bullets (use emojis like 🚶‍♂️ 🚌 🎟️ 🍽️ 🕒 💡) with a price bracket (€, €€, €€€ or free)\n` +
      `#### Afternoon\n- one-line bullets (same rules)\n` +
      `#### Evening\n- one-line bullets (same rules)\n` +
      `After the last day include:\n` +
      `## 🎯 Top Picks\n- 3–5 best items with 1-line reasons\n` +
      `## 🧭 Pro Tips\n- 3–6 bullets on transport/booking/timing/weather\n` +
      `Rules: Respect given dates; if dates are missing, cluster sensibly by location; avoid overlaps; mark uncertain info as (approx). Keep **max 5 bullets per day** total. Keep lines short.`;

    const userPayload = {
      city: city || "",
      dateWindow: { startDate: startDate || "", endDate: endDate || "" },
      tone: tone || "Default",
      items: compact,
      notes:
        "Prefer walking/transit; keep hops ≤30 minutes when possible; include links if provided.",
    };

    const baseBody = {
      temperature: 0.6,
      max_tokens: 1200,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: JSON.stringify(userPayload, null, 2) },
      ],
    };

    async function callGroq(model: string) {
      return fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({ ...baseBody, model }),
      });
    }

    // Try default/env model first, then fallbacks if the model is decommissioned/invalid
    let response = await callGroq(DEFAULT_GROQ_MODEL);

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
          const retry = await callGroq(m);
          if (retry.ok) { response = retry; break; }
        }
      }
      if (!response.ok) {
        return NextResponse.json({ error: errText || "Groq API error" }, { status: 500 });
      }
    }

    const data = await response.json();
    const summary = data?.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({ summary });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}