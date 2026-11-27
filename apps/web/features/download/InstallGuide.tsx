"use client";
import { useEffect, useState } from "react";
import { usePlatform } from "@/lib/platform";

export interface Guide {
  steps: { title: string; body: string }[];
  faqs: { q: string; a: string }[];
}

type Choice = "windows" | "android";

/** Install steps and questions for Windows or Android, starting on the visitor's own. */
export function InstallGuide({ windows, android, shared }: { windows: Guide; android: Guide; shared: Guide["faqs"] }) {
  const platform = usePlatform();
  const [choice, setChoice] = useState<Choice>("windows");
  useEffect(() => setChoice(platform === "android" ? "android" : "windows"), [platform]);
  const guide = choice === "android" ? android : windows;
  const faqs = [...guide.faqs.slice(0, 1), ...shared, ...guide.faqs.slice(1)];

  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-medium">How to install</h2>
          <div role="group" aria-label="Platform" className="flex gap-2">
            {(["windows", "android"] as const).map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={choice === c} onClick={() => setChoice(c)}>
                {c === "windows" ? "Windows" : "Android"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {guide.steps.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-line bg-surface p-5 flex flex-col gap-2">
              <span className="font-display text-2xl text-accent">{i + 1}</span>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-medium">Questions</h2>
        <dl className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
          {faqs.map((f) => (
            <div key={f.q} className="p-5 flex flex-col gap-1">
              <dt className="font-semibold">{f.q}</dt>
              <dd className="text-sm text-muted leading-relaxed">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
