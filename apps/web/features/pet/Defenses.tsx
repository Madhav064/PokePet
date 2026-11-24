import type { ElementDef, ElementMatchup } from "@pokepet/core";
import { ElementBadge } from "@pokepet/ui";

const ROWS: { key: string; label: string }[] = [
  { key: "4", label: "Takes 4× from" },
  { key: "2", label: "Takes 2× from" },
  { key: "0.5", label: "Takes ½× from" },
  { key: "0.25", label: "Takes ¼× from" },
  { key: "0", label: "Immune to" },
];

export function Defenses({ defenses, elements }: { defenses: ElementMatchup; elements: Map<string, ElementDef> }) {
  const rows = ROWS.filter((r) => defenses[r.key]?.length);
  return (
    <dl className="grid gap-3">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[8rem_1fr] gap-3 items-start">
          <dt className="text-sm text-muted pt-0.5">{r.label}</dt>
          <dd className="flex flex-wrap gap-1.5">
            {defenses[r.key]!.map((id) => {
              const el = elements.get(id);
              return el ? <ElementBadge key={id} element={el} size="sm" /> : null;
            })}
          </dd>
        </div>
      ))}
    </dl>
  );
}
