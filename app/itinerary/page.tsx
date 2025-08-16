"use client";

import { useEffect, useMemo, useState } from "react";

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

  // Load saved itinerary on mount
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("fq_itinerary") || "[]");
    setItems(stored);
  }, []);

  const count = items.length;
  const hasCalendarData = useMemo(
    () => items.some((e) => e?.dates?.start?.localDate),
    [items]
  );

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
    <main className="min-h-screen bg-neutral-900 text-neutral-100">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <h1 className="text-3xl font-extrabold">Your Itinerary</h1>
          <a href="/" className="text-blue-400 hover:underline">
            ← Back to search
          </a>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span className="text-neutral-300">
            {count} item{count === 1 ? "" : "s"}
          </span>
          <button
            onClick={exportICS}
            disabled={!items.length}
            className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            Export to Calendar (.ics)
          </button>
          <button
            onClick={clearAll}
            disabled={!items.length}
            className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700 disabled:opacity-50"
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
          <div className="text-neutral-300">
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
                  className="p-4 rounded border border-neutral-700 bg-neutral-800"
                >
                  {img && (
                    <img
                      src={img}
                      alt={ev.name}
                      className="w-full h-40 object-cover rounded mb-3"
                    />
                  )}
                  <h3 className="font-semibold">{ev?.name || "Untitled Event"}</h3>
                  <p className="text-neutral-300">
                    Date: {ev?.dates?.start?.localDate || "TBA"}
                  </p>
                  <p className="text-neutral-400">
                    Location: {venue?.name || "TBA"}
                    {venue?.city?.name ? `, ${venue.city.name}` : ""}
                    {venue?.country?.name ? `, ${venue.country.name}` : ""}
                  </p>
                  <div className="mt-3 flex gap-4">
                    {ev?.url && (
                      <a
                        href={ev.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        Tickets / Details
                      </a>
                    )}
                    <button
                      onClick={() => removeItem(ev.id)}
                      className="text-red-300 hover:underline"
                    >
                      Remove
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