import type { StatDef } from "@pokepet/core";

export function StatBars({ schema, stats }: { schema: StatDef[]; stats: Record<string, number> }) {
  const total = schema.reduce((n, s) => n + (stats[s.id] ?? 0), 0);
  return (
    <dl className="pp-stats">
      {schema.map((s) => {
        const v = stats[s.id] ?? 0;
        return (
          <div key={s.id} className="pp-stat">
            <dt>{s.label}</dt>
            <dd className="pp-stat-val">{v}</dd>
            <dd className="pp-stat-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (v / s.max) * 100)}%` }} data-tier={v >= 100 ? "high" : v >= 60 ? "mid" : "low"} />
            </dd>
          </div>
        );
      })}
      <div className="pp-stat pp-stat-total">
        <dt>Total</dt>
        <dd className="pp-stat-val">{total}</dd>
        <dd />
      </div>
    </dl>
  );
}
