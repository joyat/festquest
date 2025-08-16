import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    // Wikipedia REST v1 title search is more reliable than opensearch
    const url = `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(
      q
    )}&limit=8`;

    const r = await fetch(url, {
      headers: {
        "User-Agent": "FestQuest/1.0 (https://festquest.app)",
        "Accept": "application/json",
      },
      // ensure no caching on Vercel
      cache: "no-store",
    });

    if (!r.ok) {
      console.error("Suggest fetch failed", r.status, await r.text());
      return NextResponse.json({ suggestions: [] }, { status: 200 });
    }

    const j = await r.json();
    const suggestions =
      j?.pages?.map((p: any) => p?.title).filter(Boolean).slice(0, 8) ?? [];

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("Suggest error", err);
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
}