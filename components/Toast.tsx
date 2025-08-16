"use client";

import { useEffect, useState } from "react";

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType };

let _id = 0;

/** Call this from anywhere in a client component to show a toast */
export function toast(message: string, type: ToastType = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("toast", { detail: { message, type } }));
}

/** Host that renders toasts (mount once in layout) */
export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const { message, type } = (e as CustomEvent).detail as {
        message: string;
        type: ToastType;
      };
      const id = ++_id;
      setItems((prev) => [...prev, { id, message, type: type || "success" }]);
      // auto-remove after 2.8s
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 2800);
    }
    window.addEventListener("toast", onToast as EventListener);
    return () => window.removeEventListener("toast", onToast as EventListener);
  }, []);

  const bg = (t: ToastType) =>
    t === "success" ? "bg-emerald-600" : t === "error" ? "bg-rose-600" : "bg-slate-700";

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto ${bg(
            t.type
          )} text-white px-4 py-2 rounded-lg shadow-lg shadow-black/30`}
          role="status"
          aria-live="polite"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}