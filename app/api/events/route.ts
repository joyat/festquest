import { NextResponse } from "next/server";

type UnifiedEvent = {
  id: string;
  name: string;
  date?: string;        // YYYY-MM-DD
  venueName?: string;
  city?: string;
  country?: string;
  url?: string;
  source: "ticketmaster" | "eventbrite" | "seatgeek";
  image?: string;
};

async function fetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

/* ---------- Ticketmaster ---------- */
async function fromTicketmaster(q: any): Promise<UnifiedEvent[]> {
  const key = process.env.TM_API_KEY;
  if (!key) return [];
  const p = new URLSearchParams({ apikey: key, size: "20", sort: "date,asc" });
  if (q.keyword) p.set("keyword", q.keyword);
  if (q.city) p.set("city", q.city);
  if (q.countryCode) p.set("countryCode", q.countryCode.toUpperCase());
  if (q.startDate) p.set("startDateTime", `${q.startDate}T00:00:00Z`);
  if (q.endDate) p.set("endDateTime", `${q.endDate}T23:59:59Z`);
  const data = await fetchJson(`https://app.ticketmaster.com/discovery/v2/events.json?${p}`);
  const list: any[] = data?._embedded?.events ?? [];
  return list.map((ev) => {
    const v = ev._embedded?.venues?.[0];
    return {
      id: `tm_${ev.id}`,
      name: ev.name,
      date: ev?.dates?.start?.localDate,
      venueName: v?.name,
      city: v?.city?.name,
      country: v?.country?.name || v?.country?.countryCode,
      url: ev.url,
      image: ev?.images?.[0]?.url,
      source: "ticketmaster",
    };
  });
}

/* ---------- Eventbrite ---------- */
async function fromEventbrite(q: any): Promise<UnifiedEvent[]> {
  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) return [];
  const p = new URLSearchParams({ expand: "venue", "page_size": "20" });
  if (q.keyword) p.set("q", q.keyword);
  if (q.city) p.set("location.address", q.city);
  if (q.startDate) p.set("start_date.range_start", `${q.startDate}T00:00:00Z`);
  if (q.endDate) p.set("start_date.range_end", `${q.endDate}T23:59:59Z`);

  const data = await fetchJson(`https://www.eventbriteapi.com/v3/events/search/?${p}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const list: any[] = data?.events ?? [];
  return list.map((ev) => {
    const v = ev?.venue;
    return {
      id: `eb_${ev.id}`,
      name: ev?.name?.text || "Event",
      date: ev?.start?.local?.slice(0, 10),
      venueName: v?.name,
      city: v?.address?.city,
      country: v?.address?.country,
      url: ev?.url,
      image: ev?.logo?.url,
      source: "eventbrite",
    };
  });
}

/* ---------- SeatGeek ---------- */
async function fromSeatGeek(q: any): Promise<UnifiedEvent[]> {
  const id = process.env.SEATGEEK_CLIENT_ID;
  if (!id) return [];
  const p = new URLSearchParams({ client_id: id, per_page: "20", sort: "datetime_utc.asc" });
  if (q.keyword) p.set("q", q.keyword);
  if (q.city) p.set("venue.city", q.city);
  if (q.startDate) p.set("datetime_utc.gte", `${q.startDate}T00:00:00Z`);
  if (q.endDate) p.set("datetime_utc.lte", `${q.endDate}T23:59:59Z`);

  const data = await fetchJson(`https://api.seatgeek.com/2/events?${p}`);
  const list: any[] = data?.events ?? [];
  return list.map((ev) => ({
    id: `sg_${ev.id}`,
    name: ev?.title || "Event",
    date: (ev?.datetime_local || ev?.datetime_utc || "").slice(0, 10),
    venueName: ev?.venue?.name,
    city: ev?.venue?.city,
    country: ev?.venue?.country,
    url: ev?.url,
    image: ev?.performers?.find((p: any) => p?.image)?.image,
    source: "seatgeek",
  }));
}

async function runAggregate(q: any) {
  const tasks = [fromTicketmaster(q), fromEventbrite(q), fromSeatGeek(q)];
  const settled = await Promise.allSettled(tasks);
  const merged = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Deduplicate by name+date+city
  const dedup: UnifiedEvent[] = [];
  const seen = new Set<string>();
  for (const ev of merged) {
    const key = `${(ev.name || "").toLowerCase()}|${ev.date || ""}|${(ev.city || "").toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(ev);
    }
  }

  dedup.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return NextResponse.json({ events: dedup });
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return runAggregate({
    city: sp.get("city") || undefined,
    keyword: sp.get("keyword") || undefined,
    countryCode: sp.get("countryCode") || undefined,
    startDate: sp.get("startDate") || undefined,
    endDate: sp.get("endDate") || undefined,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return runAggregate(body || {});
}