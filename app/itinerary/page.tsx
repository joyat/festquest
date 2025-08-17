"use client";

import { useEffect, useMemo, useState } from "react";

// ---------- URL state (UTF-8 safe) ----------
function encodeState(obj: any) {
  try {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  } catch {
    return "";
  }
}
function decodeState(s: string) {
  try {
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

type TMEvent = any;

function escapeICS(txt: string = "") {
  return txt
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}
function ymd(dateStr?: string) {
  if (!dateStr) return "";
  return dateStr.replace(/-/g, ""); // YYYYMMDD
}
function addDaysYYYYMMDD(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export default function ItineraryPage() {
  const [items, setItems] = useState<TMEvent[]>([]);
  const [planning, setPlanning] = useState(false);

  // Load saved itinerary on mount
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("fq_itinerary") || "[]");
    setItems(stored);
    try {
      const url = new URL(window.location.href);
      const s = url.searchParams.get("s");
      if (s) {
        const st = decodeState(s);
        if (st && Array.isArray(st.itinerary)) {
          setItems(st.itinerary);
          localStorage.setItem("fq_itinerary", JSON.stringify(st.itinerary));
        }
      }
    } catch {}
  }, []);

  const count = items.length;
  const hasCalendarData = useMemo(
    () => items.some((e) => e?.dates?.start?.localDate),
    [items]
  );

  const inferredCity = useMemo(() => {
    const names = items
      .map((e:any) => e?._embedded?.venues?.[0]?.city?.name)
      .filter(Boolean);
    if (!names.length) return "";
    // if many cities, pick the most frequent
    const freq: Record<string, number> = {};
    for (const n of names) freq[n] = (freq[n] || 0) + 1;
    return Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0];
  }, [items]);

  const inferredDates = useMemo(() => {
    const ds = items
      .map((e:any) => e?.dates?.start?.localDate)
      .filter(Boolean) as string[];
    if (!ds.length) return { startDate: "", endDate: "" };
    const sorted = [...ds].sort();
    return { startDate: sorted[0], endDate: sorted[sorted.length-1] };
  }, [items]);

  function persist(next: TMEvent[]) {
    setItems(next);
    localStorage.setItem("fq_itinerary", JSON.stringify(next));
  }
  function removeItem(id: string) {
    persist(items.filter((e) => e?.id !== id));
  }
  function clearAll() {
    if (confirm("Clear your entire itinerary?")) {
      persist([]);
    }
  }

  function shareItinerary() {
    if (!items.length) {
      alert("Your itinerary is empty.");
      return;
    }
    const state = { itinerary: items };
    const s = encodeState(state);
    const url = new URL(window.location.href);
    // Share root page with state so planning UI can hydrate
    url.pathname = "/";
    url.searchParams.set("s", s);
    navigator.clipboard
      .writeText(url.toString())
      .then(() => alert("Shareable link copied to clipboard!"))
      .catch(() => alert("Could not copy link. You can manually copy from the address bar."));
  }

  function moveItem(index: number, dir: -1 | 1) {
    const i = index, j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    const [it] = next.splice(i, 1);
    next.splice(j, 0, it);
    persist(next);
  }

  async function planFromItinerary() {
    try {
      if (!items.length) {
        alert("Your itinerary is empty.");
        return;
      }
      setPlanning(true);
      const payload = {
        itinerary: items,
        city: inferredCity || undefined,
        startDate: inferredDates.startDate || undefined,
        endDate: inferredDates.endDate || undefined,
        tone: "Default",
      };
      const r = await fetch("/api/plan-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to plan");

      const state = {
        aiSummary: j?.summary || "",
        itinerary: items,
        city: inferredCity || "",
        startDate: inferredDates.startDate || "",
        endDate: inferredDates.endDate || "",
      };
      const s = encodeState(state);
      const url = new URL(window.location.origin);
      url.searchParams.set("s", s);
      // Navigate to the homepage which can hydrate and show the plan
      window.location.href = url.toString();
    } catch (e:any) {
      alert(e?.message || "Could not generate plan from itinerary.");
    } finally {
      setPlanning(false);
    }
  }

  function exportICS() {
    if (!items.length) {
      alert("No events to export.");
      return;
    }

    let ics =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//FestQuest//EN\r\nCALSCALE:GREGORIAN\r\n";

    items.forEach((ev: any) => {
      const name = ev?.name || "Untitled Event";
      const venue = ev?._embedded?.venues?.[0];
      const city = venue?.city?.name || "";
      const country =
        venue?.country?.name || venue?.country?.countryCode || "";
      const where = [venue?.name, city, country].filter(Boolean).join(", ");

      const start = ev?.dates?.start?.localDate || ""; // YYYY-MM-DD
      const dtStart = ymd(start);
      const dtEnd = start ? addDaysYYYYMMDD(start, 1) : "";

      ics += "BEGIN:VEVENT\r\n";
      ics += `UID:${ev?.id || crypto.randomUUID()}@festquest\r\n`;
      if (dtStart) ics += `DTSTART;VALUE=DATE:${dtStart}\r\n`;
      if (dtEnd) ics += `DTEND;VALUE=DATE:${dtEnd}\r\n`;
      ics += `SUMMARY:${escapeICS(name)}\r\n`;
      if (where) ics += `LOCATION:${escapeICS(where)}\r\n`;
      if (ev?.url) ics += `DESCRIPTION:${escapeICS(ev.url)}\r\n`;
      ics += "END:VEVENT\r\n";
    });

    ics += "END:VCALENDAR\r\n";

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "festquest-itinerary.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white/90">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <h1 className="text-3xl font-extrabold">Your Itinerary</h1>
          <a href="/" className="text-sky-400 hover:text-sky-300 underline underline-offset-2">
            ← Back to search
          </a>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span className="text-white/80">
            {count} item{count === 1 ? "" : "s"}
          </span>
          <button
            onClick={exportICS}
            disabled={!items.length}
            className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
          >
            Export to Calendar (.ics)
          </button>
          <button
            onClick={planFromItinerary}
            disabled={!items.length || planning}
            className="px-3 py-2 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white"
            aria-busy={planning}
          >
            {planning ? "Planning…" : "Plan from Itinerary"}
          </button>
          <button
            onClick={shareItinerary}
            disabled={!items.length}
            className="px-3 py-2 rounded bg-white/10 border border-white/10 hover:bg-white/15 text-white"
          >
            Share itinerary link
          </button>
          <button
            onClick={clearAll}
            disabled={!items.length}
            className="px-3 py-2 rounded bg-white/10 border border-white/10 hover:bg-white/15 text-white"
          >
            Clear all
          </button>
          {!hasCalendarData && items.length > 0 && (
            <span className="text-xs text-amber-300">
              Tip: some items have no date; add dates before exporting for best
              results.
            </span>
          )}
        </div>

        {/* List */}
        {items.length === 0 ? (
          <div className="text-white/80">
            Your itinerary is empty. Go back to the search page and click
            <span className="px-1 font-semibold">“Add to Itinerary”</span> on any
            event.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {items.map((ev: any) => {
              const venue = ev?._embedded?.venues?.[0];
              const img = ev?.images?.[0]?.url;
              return (
                <div
                  key={ev.id}
                  className="p-4 rounded-xl bg-white/5 border border-white/10"
                >
                  {img && (
                    <img
                      src={img}
                      alt={ev.name}
                      className="w-full h-40 object-cover rounded mb-3"
                    />
                  )}
                  <h3 className="font-semibold">{ev?.name || "Untitled Event"}</h3>
                  <div className="text-white/80 flex items-center gap-2">
                    <label className="text-sm">Date:</label>
                    <input
                      type="date"
                      value={ev?.dates?.start?.localDate || ""}
                      onChange={(e) => {
                        const val = e.target.value || "";
                        const next = items.map((x) =>
                          x.id === ev.id
                            ? {
                                ...x,
                                dates: { ...(x.dates || {}), start: { ...(x.dates?.start || {}), localDate: val } },
                              }
                            : x
                        );
                        persist(next);
                      }}
                      className="bg-white/5 border border-white/10 text-white/90 placeholder-white/40 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <p className="text-white/70">
                    Location: {venue?.name || "TBA"}
                    {venue?.city?.name ? `, ${venue.city.name}` : ""}
                    {venue?.country?.name ? `, ${venue.country.name}` : ""}
                  </p>
                  <div className="mt-3 flex gap-4">
                    {ev?.url && (
                      <a
                        href={ev.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:text-sky-300 underline underline-offset-2"
                      >
                        Tickets / Details
                      </a>
                    )}
                    <button
                      onClick={() => removeItem(ev.id)}
                      className="text-red-400 hover:text-red-300 underline"
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => moveItem(items.findIndex(i => i.id === ev.id), -1)}
                      className="text-white/80 hover:text-white underline"
                    >
                      ↑ Move up
                    </button>
                    <button
                      onClick={() => moveItem(items.findIndex(i => i.id === ev.id), 1)}
                      className="text-white/80 hover:text-white underline"
                    >
                      ↓ Move down
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}