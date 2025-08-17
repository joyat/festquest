import { NextResponse } from "next/server";

type UnifiedEvent = {
  id: string;
  name: string;
  date?: string;        // YYYY-MM-DD
  venueName?: string;
  city?: string;
  country?: string;
  url?: string;
  source: "ticketmaster" | "eventbrite" | "seatgeek" | "konzertkasse" | "reservix";
  image?: string;
};

async function fetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v && String(v).trim().length) p.set(k, String(v));
  });
  return p.toString();
}

async function fetchText(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.text();
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

/* ---------- Konzertkasse (via proxy) ---------- */
// For MVP, we expect a proxy that returns JSON array of events with fields comparable to UnifiedEvent
// Set KONZERTKASSE_PROXY_URL in env, e.g., a serverless function that scrapes and caches results.
async function fromKonzertkasse(q: any): Promise<UnifiedEvent[]> {
  const base = process.env.KONZERTKASSE_PROXY_URL;
  if (!base) return [];
  const url = `${base}?${qs({ q: q.keyword, city: q.city, start: q.startDate, end: q.endDate })}`;
  const data = await fetchJson(url);
  const list: any[] = Array.isArray(data?.events) ? data.events : Array.isArray(data) ? data : [];
  return list.map((ev: any) => ({
    id: ev.id ? `kk_${ev.id}` : `kk_${(ev.name||'').slice(0,24)}_${ev.date||''}_${ev.city||''}`,
    name: ev.name || ev.title || "Event",
    date: ev.date || ev.start?.slice?.(0,10),
    venueName: ev.venueName || ev.venue || ev.location?.name,
    city: ev.city || ev.location?.city,
    country: ev.country || "DE",
    url: ev.url,
    image: ev.image,
    source: "konzertkasse",
  }));
}

/* ---------- Reservix (via proxy) ---------- */
// Same pattern: a proxy that returns JSON with array under `events` or the root.
async function fromReservix(q: any): Promise<UnifiedEvent[]> {
  const base = process.env.RESERVIX_PROXY_URL;
  if (!base) return [];
  const url = `${base}?${qs({ q: q.keyword, city: q.city, start: q.startDate, end: q.endDate })}`;
  const data = await fetchJson(url);
  const list: any[] = Array.isArray(data?.events) ? data.events : Array.isArray(data) ? data : [];
  return list.map((ev: any) => ({
    id: ev.id ? `rx_${ev.id}` : `rx_${(ev.name||'').slice(0,24)}_${ev.date||''}_${ev.city||''}`,
    name: ev.name || ev.title || "Event",
    date: ev.date || ev.start?.slice?.(0,10),
    venueName: ev.venueName || ev.venue || ev.location?.name,
    city: ev.city || ev.location?.city,
    country: ev.country || "DE",
    url: ev.url,
    image: ev.image,
    source: "reservix",
  }));
}

async function runAggregate(q: any) {
  const requested: string[] = Array.isArray(q.providers)
    ? q.providers
    : typeof q.providers === "string"
      ? String(q.providers).split(",").map((s) => s.trim()).filter(Boolean)
      : ["ticketmaster","eventbrite","seatgeek","konzertkasse","reservix"]; // default: all

  const tasks: Promise<UnifiedEvent[]>[] = [];
  const add = (cond: boolean, fn: () => Promise<UnifiedEvent[]>) => { if (cond) tasks.push(fn()); };

  add(requested.includes("ticketmaster"), () => fromTicketmaster(q));
  add(requested.includes("eventbrite"), () => fromEventbrite(q));
  add(requested.includes("seatgeek"), () => fromSeatGeek(q));
  add(requested.includes("konzertkasse"), () => fromKonzertkasse(q));
  add(requested.includes("reservix"), () => fromReservix(q));

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
  const providers = sp.get("providers") || undefined; // comma-separated list
  return runAggregate({
    city: sp.get("city") || undefined,
    keyword: sp.get("keyword") || undefined,
    countryCode: sp.get("countryCode") || undefined,
    startDate: sp.get("startDate") || undefined,
    endDate: sp.get("endDate") || undefined,
    providers,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return runAggregate(body || {});
}