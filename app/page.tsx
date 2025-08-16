"use client";

import { useEffect, useState } from "react";

/* ---------- Brand utility classes ---------- */
const inputCls =
  "px-3 py-2 rounded-lg bg-[#2B2B3D] border border-white/10 text-white " +
  "placeholder:text-[#B0B0B0] focus:border-[#007BFF] focus:ring-2 " +
  "focus:ring-[#007BFF]/30 outline-none";
const btnPrimary =
  "px-4 py-2 rounded-lg bg-[#007BFF] hover:bg-[#6C63FF] text-white " +
  "font-medium shadow-lg shadow-[#007BFF]/20 transition disabled:opacity-60";
const cardCls =
  "p-5 rounded-2xl border border-white/10 bg-[#2B2B3D] shadow-[0_10px_30px_-10px_rgba(0,123,255,0.25)]";

type UnifiedEvent = {
  id: string;
  name: string;
  date?: string;
  venueName?: string;
  city?: string;
  country?: string;
  url?: string;
  image?: string;
  source: "ticketmaster" | "eventbrite" | "seatgeek";
};

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function Home() {
  // Filters
  const [city, setCity] = useState("");
  const [keyword, setKeyword] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [startDate, setStartDate] = useState(isoToday());
  const [endDate, setEndDate] = useState("");

  // Results + UX
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // AI summary
  const [aiSummary, setAiSummary] = useState<string>("");
  const [aiInfo, setAiInfo] = useState<string>("");

  // Auto-guess country for common cities (optional nicety)
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

  // Map unified event -> TM-like shape used by /itinerary page
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

      const key = "fq_itinerary";
      const current = JSON.parse(localStorage.getItem(key) || "[]");
      if (current.some((e: any) => e.id === mapped.id)) {
        alert("Already in your itinerary!");
        return;
      }
      localStorage.setItem(key, JSON.stringify([...current, mapped]));
      alert("Added to itinerary 🎉");
    } catch {
      alert("Could not save to itinerary.");
    }
  }

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
      };

      // 1) Multi-source search
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Search failed");
      const evts: UnifiedEvent[] = data?.events || [];
      setEvents(evts);

      // 2) AI summary (optional; handles quota limits gracefully)
      if (evts.length) {
        const ai = await fetch("/api/ai-recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: evts.slice(0, 10) }),
        });

        if (!ai.ok) {
          const aiErr = await ai.json().catch(() => ({}));
          const msg = (aiErr?.error || "").toString();
          if (msg.includes("quota") || msg.includes("429")) {
            setAiInfo(
              "AI summary unavailable (OpenAI quota exceeded). Event results are still shown below."
            );
          } else if (msg) {
            setAiInfo(`AI summary unavailable: ${msg}`);
          } else {
            setAiInfo("AI summary unavailable.");
          }
          return;
        }

        const aiData = await ai.json();
        setAiSummary(aiData?.summary || "");
      } else {
        setAiSummary(
          "No events match your filters. Try widening the dates or removing the country."
        );
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Handy demo
  async function sampleBerlinJazz() {
    setCity("Berlin");
    setKeyword("jazz");
    setCountryCode("DE");
    setStartDate(isoToday());
    setEndDate("");
    await handleSearch();
  }

  return (
    <main className="min-h-screen bg-[#1E1E2F] text-white">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Brand header inside page (layout header shows logo/nav) */}
        <div className="text-center">
          <h1 className="text-5xl font-extrabold tracking-tight">FestQuest</h1>
          <p className="text-[#B0B0B0] mt-2 text-lg">
            Discover, plan, and chase all the events of the world!
          </p>
          <p className="mt-2">
            <a href="/itinerary" className="text-[#6C63FF] hover:underline">
              View Itinerary →
            </a>
          </p>
        </div>

        {/* Search form */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-6 gap-3">
          <input
            className={`${inputCls} md:col-span-2`}
            placeholder="City (e.g., Berlin)"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <input
            className={`${inputCls} md:col-span-2`}
            placeholder="Festival type / keyword (e.g., jazz, film, carnival)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="Country (US, DE, FR…)"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            maxLength={2}
          />
          <button onClick={handleSearch} disabled={loading} className={btnPrimary}>
            {loading ? "Searching…" : "Search"}
          </button>

        {/* Dates */}
          <div className="md:col-span-3 flex items-center gap-2">
            <span className="text-sm text-[#B0B0B0] w-24">Start date</span>
            <input
              type="date"
              className={`${inputCls} flex-1 [color-scheme:dark]`}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="md:col-span-3 flex items-center gap-2">
            <span className="text-sm text-[#B0B0B0] w-24">End date</span>
            <input
              type="date"
              className={`${inputCls} flex-1 [color-scheme:dark]`}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-2">
          <button onClick={sampleBerlinJazz} className="text-sm text-[#60A5FA] hover:underline">
            Try sample: Berlin + jazz
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-900/30 border border-red-700/60 text-red-200">
            ❌ {error}
          </div>
        )}

        {/* AI Summary */}
        <div className={`${cardCls} mt-6`}>
          <h2 className="font-semibold text-white/90 mb-2">AI Travel Guide</h2>
          {aiSummary ? (
            <p className="text-white/80">{aiSummary}</p>
          ) : (
            <p className="text-white/50">
              {aiInfo ||
                (loading ? "Generating ideas…" : "AI summary will appear here after a search.")}
            </p>
          )}
        </div>

        {/* Results */}
        <div className="mt-6 space-y-4">
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
                      {ev.source}
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
                      className="text-[#34D399] hover:text-white underline underline-offset-4"
                    >
                      Add to Itinerary
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!loading && !events.length && !error && (
            <p className="text-white/60">
              No results yet — try setting a city and a festival type (e.g., <b>Berlin</b> + <b>jazz</b>).
            </p>
          )}
        </div>
      </div>
    </main>
  );
}