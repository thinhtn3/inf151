"use client";

import { useEffect, useRef, useState } from "react";
import { parseDegreeWorks, type DegreeWorksResult } from "@/lib/degreeworks";

type Props = {
  open: boolean;
  onClose: () => void;
  onUse: (courses: string[], inProgress: string[]) => void;
};

export function DegreeWorksDialog({ open, onClose, onUse }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [dw, setDw] = useState<DegreeWorksResult | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function find() {
    const r = parseDegreeWorks(text);
    setDw(r);
    setPicked(new Set(r.needed.map((_, i) => i)));
  }

  function use() {
    if (!dw) return;
    const codes = dw.needed.filter((_, i) => picked.has(i)).flatMap((n) => n.options.map((o) => o.label));
    onUse([...new Set(codes)], dw.inProgress.map((c) => c.label));
    onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dw-title"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-line-bar bg-panel p-0 text-fg shadow-2xl backdrop:bg-black/60"
    >
      <div className="max-h-[85dvh] space-y-4 overflow-y-auto p-5">
        <div>
          <h2 id="dw-title" className="text-lg font-semibold">
            Import from Degree Works
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Open your worksheet, select everything (Cmd/Ctrl+A), copy, and paste it here. It&apos;s read in your browser. Your name, ID and grades never
            leave it.
          </p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Paste your Degree Works page"
          aria-label="Degree Works text"
          className="w-full resize-y rounded-[10px] border border-line-bar bg-page p-3 text-sm"
        />
        <button
          type="button"
          onClick={find}
          disabled={!text.trim()}
          className="rounded-[10px] bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-40"
        >
          Find my remaining courses
        </button>

        {dw && (
          <div className="space-y-3 text-sm">
            {dw.needed.length === 0 ? (
              <p className="rounded-lg bg-warn-bg px-3 py-2 text-warn-fg">No remaining courses found. Make sure you copied the whole worksheet.</p>
            ) : (
              <>
                <p className="font-medium">
                  {dw.needed.length} {dw.needed.length === 1 ? "requirement" : "requirements"} left ({dw.completedCount} {dw.completedCount === 1 ? "course" : "courses"} completed)
                </p>
                <ul className="space-y-1.5">
                  {dw.needed.map((n, i) => (
                    <li key={i}>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 accent-[var(--accent)]"
                          checked={picked.has(i)}
                          onChange={() =>
                            setPicked((prev) => {
                              const next = new Set(prev);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              return next;
                            })
                          }
                        />
                        <span>
                          {n.options.map((o) => o.label).join("  or  ")}
                          {n.options.length > 1 && <span className="text-fg-muted"> (pick one)</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {dw.inProgress.length > 0 && <p className="text-fg-muted">Taking now, used to judge workload: {dw.inProgress.map((c) => c.label).join(", ")}</p>}
            {dw.needsInput.length > 0 && (
              <div className="rounded-lg bg-warn-bg px-3 py-2 text-warn-fg">
                <p>These requirements don&apos;t name a course. Add candidates in your message:</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {dw.needsInput.map((t) => (
                    <li key={t}>{t.length > 140 ? `${t.slice(0, 140)}…` : t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-[10px] px-4 py-2 text-sm text-fg-muted hover:text-fg">
            Cancel
          </button>
          <button
            type="button"
            onClick={use}
            disabled={!dw || (picked.size === 0 && dw.inProgress.length === 0)}
            className="rounded-[10px] bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-40"
          >
            Add to message
          </button>
        </div>
      </div>
    </dialog>
  );
}
