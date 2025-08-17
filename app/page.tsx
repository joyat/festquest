
"use client";
import type React from "react";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "../components/Toast";

/* ---------- UI utility classes ---------- */
const inputCls =
  "px-3 py-2 rounded-lg bg-[#2B2B3D] border border-white/10 text-white " +
  "placeholder:text-[#B0B0B0] focus:border-[#007BFF] focus:ring-2 " +
  "focus:ring-[#007BFF]/30 outline-none";
const btnPrimary =
  "px-4 py-2 rounded-lg bg-[#007BFF] hover:bg-[#6C63FF] text-white " +
  "font-medium shadow-lg shadow-[#007BFF]/20 transition disabled:opacity-60";
const cardCls =
  "p-5 rounded-2xl border border-white/10 bg-[#2B2B3D] shadow-[0_10px_30px_-10px_rgba(0,123,255,0.25)]";

/* ---------- Types ---------- */
type UnifiedEvent = {
  id: string;
  name: string;
  date?: string;
  venueName?: string;
  city?: string;
  country?: string;
  url?: string;
  image?: string;
  source: "ticketmaster" | "eventbrite" | "seatgeek" | "konzertkasse" | "reservix";
};

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/* ---------- Adaptive heading for wiki box ---------- */
function infoTitle(term: string, blurb: string) {
  const t = (term || "").trim();
  if (!t) return "Highlights";

  const tl = t.toLowerCase();
  const b = (blurb || "").toLowerCase();

  const festivalWords = [
    "festival","fest","fair","carnival","fiesta","parade","market",
    "mela","puja","oktoberfest","karneval","concert","tour",
    "cup","open","championship","grand slam","world cup","tournament"
  ];
  const personSignals = [
    "singer","rapper","dj","band","artist","composer","playwright","actor",
    "guitarist","born","is an","is a","was an","footballer","tennis player"
  ];
  const placeSignals = [
    "city","capital","town","municipality","located in","region","district",
    "province","state of","country","metropolitan"
  ];

  const isFestival = festivalWords.some(k => tl.includes(k) || b.includes(k));
  const isPerson = !isFestival && personSignals.some(k => b.includes(k));
  const isPlace  = !isFestival && !isPerson && placeSignals.some(k => b.includes(k));

  if (isPerson) return `About ${t}`;
  if (isFestival) return b.includes("sport") || tl.includes("cup") || tl.includes("open")
    ? "Event Highlights"
    : "Festival Highlights";
  if (isPlace) return `${t} at a glance`;
  return `About ${t}`;
}

export default function Home() {
  /* ---------- Filters ---------- */
  const [keyword, setKeyword] = useState(""); // general search term
  const [city, setCity] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [startDate, setStartDate] = useState(isoToday());
  const [endDate, setEndDate] = useState("");
  const [tone, setTone] = useState("");

  /* ---------- Provider selection (Phase 2+) ---------- */
  const [providers, setProviders] = useState<string[]>([
    "ticketmaster",
    "eventbrite",
    "seatgeek",
    "konzertkasse",
    "reservix",
  ]);
  const toggleProvider = (p: string) =>
    setProviders((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );

  /* ---------- Results & UX ---------- */
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  /* ---------- AI summary ---------- */
  const [aiSummary, setAiSummary] = useState<string>("");
  const [aiInfo, setAiInfo] = useState<string>("");

  /* ---------- Itinerary state (disable “Add” after save) ---------- */
  const [added, setAdded] = useState<Set<string>>(new Set());

  /* ---------- Autocomplete + Wiki blurb ---------- */
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [wikiText, setWikiText] = useState("");
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiImage, setWikiImage] = useState("");
  const [wikiUrl, setWikiUrl] = useState("");
  const sugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- Nice-to-have: auto guess country for known cities ---------- */
  useEffect(() => {
    if (!city || countryCode) return;
    const c = city.toLowerCase();
    const guess =
      c.includes("berlin") || c.includes("munich") ? "DE" :
      c.includes("paris") ? "FR" :
      c.includes("rome") ? "IT" :
      c.includes("london") ? "GB" :
      c.includes("san francisco") || c.includes("new york") || c.includes("los angeles") ? "US" :
      "";
    if (guess) setCountryCode(guess);
  }, [city, countryCode]);

  /* ---------- Load saved itinerary IDs on first render ---------- */
  useEffect(() => {
    const saved: any[] = JSON.parse(localStorage.getItem("fq_itinerary") || "[]");
    setAdded(new Set(saved.map((e: any) => e.id)));
  }, []);

  /* ---------- Save to itinerary & toast feedback ---------- */
  function saveToItineraryUnified(ev: UnifiedEvent) {
    try {
      const mapped = {
        id: ev.id,
        name: ev.name,
        url: ev.url,
        dates: { start: { localDate: ev.date || "" } },
        images: ev.image ? [{ url: ev.image }] : [],
        _embedded: {
          venues: [
            {
              name: ev.venueName || "",
              city: { name: ev.city || "" },
              country: {
                name: ev.country || "",
                countryCode: (ev.country || "").slice(0, 2).toUpperCase(),
              },
            },
          ],
        },
        source: ev.source,
      };

      if (added.has(mapped.id)) {
        toast("Already in your itinerary", "info");
        return;
      }

      const key = "fq_itinerary";
      const current: any[] = JSON.parse(localStorage.getItem(key) || "[]");
      if (current.some((e) => e.id === mapped.id)) {
        setAdded((prev) => new Set(prev).add(mapped.id));
        toast("Already in your itinerary", "info");
        return;
      }

      const next = [...current, mapped];
      localStorage.setItem(key, JSON.stringify(next));

      setAdded((prev) => {
        const s = new Set(prev);
        s.add(mapped.id);
        return s;
      });

      toast("Added to itinerary 🎉", "success");
    } catch {
      toast("Could not save to itinerary", "error");
    }
  }

  /* ---------- Autocomplete (debounced) ---------- */
  function debouncedSuggest(q: string) {
    if (sugTimerRef.current) clearTimeout(sugTimerRef.current);
    if (!q || q.length < 2) {
      setSuggestions([]);
      setShowSug(false);
      return;
    }
    sugTimerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        setSuggestions(j?.suggestions || []);
        setShowSug(true);
      } catch {
        setSuggestions([]);
        setShowSug(false);
      }
    }, 200);
  }

  /* ---------- Wiki blurb ---------- */
  async function loadWikiBlurb(term: string) {
    try {
      setWikiLoading(true);
      setWikiText("");
      setWikiImage("");
      setWikiUrl("");
      const r = await fetch("/api/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: term }),
      });
      const j = await r.json();
      setWikiText(j?.blurb || "");
      setWikiImage(j?.image || "");
      setWikiUrl(j?.url || "");
    } finally {
      setWikiLoading(false);
    }
  }

  /* ---------- Search ---------- */
  async function handleSearch() {
    setLoading(true);
    setError("");
    setAiSummary("");
    setAiInfo("");
    setEvents([]);

    try {
      const payload = {
        city: city.trim() || undefined,
        keyword: keyword.trim() || undefined,
        countryCode: countryCode.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        providers,
        tone: tone || undefined,
      };

      // 1) Multi-source events
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Search failed");
      const evts: UnifiedEvent[] = data?.events || [];
      setEvents(evts);

      // reflect existing itinerary
      const saved: any[] = JSON.parse(localStorage.getItem("fq_itinerary") || "[]");
      setAdded(new Set(saved.map((e: any) => e.id)));

      // 2) AI summary (best effort)
      if (evts.length) {
        const ai = await fetch("/api/ai-recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            events: evts.slice(0, 10),
            city: city.trim() || undefined,
            keyword: keyword.trim() || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            tone: tone || undefined,
          }),
        });

        if (!ai.ok) {
          const aiErr = await ai.json().catch(() => ({}));
          const msg = (aiErr?.error || "").toString().toLowerCase();
          if (msg.includes("quota") || msg.includes("429") || msg.includes("rate")) {
            setAiInfo("AI summary temporarily unavailable. Event results are still shown below.");
          } else if (aiErr?.error) {
            setAiInfo(`AI summary unavailable: ${aiErr.error}`);
          } else {
            setAiInfo("AI summary unavailable.");
          }
        } else {
          const aiData = await ai.json();
          setAiSummary(aiData?.summary || "");
        }
      } else {
        setAiSummary("No events match your filters. Try widening the dates or clearing country.");
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Sample / keyboard helpers ---------- */
  async function sampleBerlinJazz() {
    setKeyword("jazz");
    setCity("Berlin");
    setCountryCode("DE");
    setStartDate(isoToday());
    setEndDate("");
    await handleSearch();
  }

  function onFormKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!loading) handleSearch();
    }
  }

  /* ---------- Render ---------- */
  return (
    <main className="min-h-screen bg-[#1E1E2F] text-white">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Brand */}
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">FestQuest</h1>
          <p className="text-[#B0B0B0] mt-2 text-base md:text-lg">
            Discover, plan, and chase all the events of the world!
          </p>
          <p className="mt-2">
            <Link href="/itinerary" className="text-[#6C63FF] hover:underline">
              View Itinerary →
            </Link>
          </p>
        </div>

        {/* ---------- Search card ---------- */}
        <div className={`${cardCls} mt-8`} onKeyDown={onFormKeyDown}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">FIND your Fest</h2>
            <button onClick={sampleBerlinJazz} className="text-sm text-[#60A5FA] hover:underline">
              Try sample: Berlin + jazz
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Keyword (7/12) */}
            <div className="relative md:col-span-7">
              <label className="block text-xs uppercase tracking-wide text-white/60 mb-1">
                Event I&apos;m Looking for
              </label>
              <input
                className={`${inputCls} w-full`}
                placeholder="e.g., Libori, Durga Puja, Wimbledon, Oktoberfest…"
                value={keyword}
                onChange={(e) => {
                  const v = e.target.value;
                  setKeyword(v);
                  debouncedSuggest(v);
                  if (v.length >= 2) loadWikiBlurb(v);
                  else { setWikiText(""); setWikiImage(""); setWikiUrl(""); }
                }}
                onFocus={() => { if (suggestions.length) setShowSug(true); }}
                onBlur={() => setTimeout(() => setShowSug(false), 150)}
              />
              {showSug && suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-[#1E1E2F] shadow-lg">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setKeyword(s); setShowSug(false); loadWikiBlurb(s); }}
                      className="block w-full text-left px-3 py-2 hover:bg-white/5"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* City (3/12) */}
            <div className="md:col-span-3">
              <label className="block text-xs uppercase tracking-wide text-white/60 mb-1">City</label>
              <input
                className={`${inputCls} w-full`}
                placeholder="City (e.g., Berlin)"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>

            {/* Country (2/12) */}
            <div className="md:col-span-2">
              <label className="block text-xs uppercase tracking-wide text-white/60 mb-1">Country</label>
              <input
                className={`${inputCls} w-full`}
                placeholder="US, DE…"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                maxLength={2}
              />
            </div>

            {/* Start date (3/12) */}
            <div className="md:col-span-3">
              <label className="block text-xs uppercase tracking-wide text-white/60 mb-1">Start date</label>
              <input
                type="date"
                className={`${inputCls} w-full [color-scheme:dark]`}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* End date (3/12) */}
            <div className="md:col-span-3">
              <label className="block text-xs uppercase tracking-wide text-white/60 mb-1">End date</label>
              <input
                type="date"
                className={`${inputCls} w-full [color-scheme:dark]`}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {/* Tone (2/12) */}
            <div className="md:col-span-2">
              <label className="block text-xs uppercase tracking-wide text-white/60 mb-1">Tone</label>
              <select
                className={`${inputCls} w-full`}
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              >
                <option value="">Default</option>
                <option value="Fun">Fun</option>
                <option value="Family">Family</option>
                <option value="Cultural">Cultural</option>
                <option value="Budget">Budget</option>
              </select>
            </div>

            {/* Providers (full width) */}
            <div className="md:col-span-12">
              <label className="block text-xs uppercase tracking-wide text-white/60 mb-2">
                Data sources
              </label>
              <div className="flex flex-wrap gap-3 text-sm">
                {[
                  { id: "ticketmaster", label: "Ticketmaster" },
                  { id: "eventbrite", label: "Eventbrite" },
                  { id: "seatgeek", label: "SeatGeek" },
                  { id: "konzertkasse", label: "Konzertkasse" },
                  { id: "reservix", label: "Reservix" },
                ].map((p) => (
                  <label key={p.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-[#007BFF]"
                      checked={providers.includes(p.id)}
                      onChange={() => toggleProvider(p.id)}
                    />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Search button (3/12) */}
            <div className="md:col-span-3 flex items-end">
              <button onClick={handleSearch} disabled={loading} className={`${btnPrimary} w-full`}>
                {loading ? "Searching…" : "Search"}
              </button>
            </div>
          </div>
        </div>

        {/* Errors */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-900/30 border border-red-700/60 text-red-200">
            ❌ {error}
          </div>
        )}

        {/* ---------- Context strip (Wiki + AI) ---------- */}
        <div className="grid md:grid-cols-2 gap-4 md:items-stretch mt-6">
          <div className="bg-slate-800 p-4 rounded-xl flex flex-col">
            {/* Wiki Section */}
            <h2 className="font-semibold text-white/90 mb-2">
              {infoTitle(keyword, wikiText)}
            </h2>
            {wikiLoading ? (
              <div className="animate-pulse">
                <div className="w-full h-40 rounded-lg bg-white/10 mb-3" />
                <div className="h-4 bg-white/10 rounded w-5/6 mb-2" />
                <div className="h-4 bg-white/10 rounded w-4/6" />
              </div>
            ) : wikiText ? (
              <div>
                {wikiImage && (
                  <a
                    href={wikiUrl || undefined}
                    target={wikiUrl ? "_blank" : undefined}
                    rel={wikiUrl ? "noreferrer" : undefined}
                  >
                    <img
                      src={wikiImage}
                      alt={keyword || "Preview image"}
                      className="w-full max-h-72 object-contain rounded-xl border border-white/10 mb-2 bg-black/20"
                      loading="lazy"
                    />
                  </a>
                )}
                {wikiUrl && (
                  <a href={wikiUrl} target="_blank" rel="noreferrer" className="block text-xs text-white/50 hover:text-white underline mb-2">
                    From Wikipedia
                  </a>
                )}
                <p className="text-white/80 whitespace-pre-line max-w-prose leading-relaxed hyphens-auto">{wikiText}</p>
              </div>
            ) : (
              <p className="text-white/50">Type an event name to see a quick background.</p>
            )}
          </div>
          <div className="bg-slate-800 p-4 rounded-xl flex flex-col">
            {/* PLAN your Fest Section */}
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-white/90">PLAN your Fest</h2>
              {tone && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/80">{tone}</span>
              )}
            </div>
            {aiSummary ? (
              <div className="text-white/80 space-y-2 max-w-prose leading-relaxed [>&*:first-child]:mt-0 [>&*:last-child]:mb-0">
                {(() => {
                  const lines = aiSummary.split(/\n+/);
                  const out: JSX.Element[] = [];
                  let buf: string[] = [];
                  let currentHeadingKey: string | null = null;

                  const flushParagraph = () => {
                    if (!buf.length) return;
                    const text = buf.join(" ");
                    const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
                    out.push(
                      <p key={`p-${out.length}`}>
                        {parts.map((seg, i) =>
                          /^\*\*.*\*\*$/.test(seg) ? (
                            <strong key={i} className="text-white">{seg.slice(2, -2)}</strong>
                          ) : (
                            <span key={i}>{seg}</span>
                          )
                        )}
                      </p>
                    );
                    buf = [];
                  };

                  const bullets: string[] = [];
                  const flushList = () => {
                    if (!bullets.length) return;
                    const isTop = currentHeadingKey === "top picks";
                    const ListTag = (isTop ? "ol" : "ul") as any;
                    const listCls = isTop
                      ? "list-decimal pl-6 space-y-1.5 marker:text-[#60A5FA] leading-6"
                      : "list-disc list-outside pl-5 space-y-1.5 marker:text-white/60 leading-6";
                    out.push(
                      <ListTag key={`list-${out.length}`} className={listCls}>
                        {bullets.map((b, i) => (
                          <li key={i}>{b.replace(/^[-–*]\s*/, "")}</li>
                        ))}
                      </ListTag>
                    );
                    bullets.length = 0;
                  };

                  for (const raw of lines) {
                    const line = raw.trim();
                    if (!line) { flushParagraph(); flushList(); continue; }

                    // Headings like **Top Picks** or Top Picks (with icons + dividers)
                    const headingMatch = line.replace(/\*/g, "").match(/^(Top Picks|Suggested Itinerary|Pro Tips)\s*:?$/i);
                    if (headingMatch) {
                      flushParagraph();
                      flushList();
                      const labelRaw = headingMatch[1];
                      const labelKey = labelRaw.toLowerCase();
                      const iconMap: Record<string, string> = {
                        "top picks": "🎯",
                        "suggested itinerary": "🎟️",
                        "pro tips": "🚇",
                      };
                      currentHeadingKey = labelKey;
                      const icon = iconMap[labelKey] || "✨";
                      // Divider before each section (except very first item)
                      if (out.length) {
                        out.push(<div key={`div-${out.length}`} className="h-px bg-white/10 my-2" />);
                      }
                      out.push(
                        <div
                          key={`h-${out.length}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white text-[13px] font-semibold"
                        >
                          <span className="leading-none">{icon}</span>
                          <span className="leading-none">{labelRaw.replace(/\b\w/g, (m) => m.toUpperCase())}</span>
                        </div>
                      );
                      continue;
                    }

                    // Bullet item
                    if (/^[-–*]\s+/.test(line)) {
                      bullets.push(line);
                      continue;
                    }

                    // Default: part of a paragraph
                    buf.push(line);
                  }
                  flushParagraph();
                  flushList();
                  return out;
                })()}
              </div>
            ) : (
              <p className="text-white/50">
                {aiInfo || (loading ? "Planning your fest…" : "Your festival plan will appear here after a search.")}
              </p>
            )}
          </div>
        </div>

        {/* ---------- Results header ---------- */}
        <div className="mt-8 flex items-center justify-between">
          <div className="text-sm text-white/70">
            {loading
              ? "Searching events…"
              : events.length
              ? `${events.length} event${events.length === 1 ? "" : "s"} found`
              : "No results yet"}
          </div>
          <div className="flex gap-2 text-xs">
            {keyword && <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Keyword: {keyword}</span>}
            {city && <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">City: {city}</span>}
            {countryCode && <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">Country: {countryCode}</span>}
            {startDate && <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">From: {startDate}</span>}
            {endDate && <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">To: {endDate}</span>}
          </div>
        </div>

        {/* ---------- Results list ---------- */}
        <div className="mt-4 space-y-4">
          {events.map((ev) => (
            <div key={ev.id} className={cardCls}>
              <div className="flex gap-4">
                {ev.image && (
                  <img
                    src={ev.image}
                    alt={ev.name}
                    className="w-28 h-28 object-cover rounded-lg border border-white/10"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-white">{ev.name}</h3>
                    <span
                      className="text-[10px] uppercase px-2 py-1 rounded-full border border-white/10"
                      title="Data source"
                    >
                      {ev.source?.toUpperCase?.() || ev.source}
                    </span>
                  </div>
                  <p className="text-white/80">Date: {ev.date || "TBA"}</p>
                  <p className="text-white/60">
                    Location: {ev.venueName || "TBA"}
                    {ev.city ? `, ${ev.city}` : ""}
                    {ev.country ? `, ${ev.country}` : ""}
                  </p>
                  <div className="mt-3 flex gap-5">
                    {ev.url && (
                      <a
                        href={ev.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#60A5FA] hover:text-white underline underline-offset-4"
                      >
                        View Event
                      </a>
                    )}
                    <button
                      onClick={() => saveToItineraryUnified(ev)}
                      disabled={added.has(ev.id)}
                      className={`underline underline-offset-4 ${
                        added.has(ev.id)
                          ? "text-white/40 cursor-not-allowed"
                          : "text-[#34D399] hover:text-white"
                      }`}
                    >
                      {added.has(ev.id) ? "Added" : "Add to Itinerary"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!loading && !events.length && !error && (
            <p className="text-white/60">
              Try combining a city and a keyword (e.g., <b>Cologne</b> + <b>christmas</b>).
            </p>
          )}
        </div>
      </div>
    </main>
  );
}