import { NextResponse } from "next/server";

function buildUrl(paramsIn: {
  keyword?: string;
  city?: string;
  countryCode?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}) {
  const params = new URLSearchParams({
    apikey: process.env.TM_API_KEY || process.env.NEXT_PUBLIC_TICKETMASTER_API_KEY || "",
    size: "20",
    sort: "date,asc",
  });

  const { keyword, city, countryCode, startDate, endDate } = paramsIn;

  if (keyword) params.set("keyword", keyword);
  if (city) params.set("city", city);
  if (countryCode) params.set("countryCode", countryCode.toUpperCase());
  if (startDate) params.set("startDateTime", `${startDate}T00:00:00Z`);
  if (endDate)   params.set("endDateTime",   `${endDate}T23:59:59Z`);

  return `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;
}

async function runSearch(p: any) {
  const url = buildUrl(p);
  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text();
    return NextResponse.json({ error: `Ticketmaster ${r.status}: ${text.slice(0,200)}` }, { status: 502 });
  }
  const data = await r.json();
  return NextResponse.json({ events: data._embedded?.events ?? [] });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get("keyword") || "";
  const city = searchParams.get("city") || "";
  const countryCode = searchParams.get("countryCode") || "";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  return runSearch({ keyword, city, countryCode, startDate, endDate });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return runSearch(body || {});
}