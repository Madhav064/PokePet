import type { AtlasSpec, EvolutionNode } from "@pokepet/core";
import type { LinkComponent } from "./link.ts";
import { Sprite } from "./Sprite.tsx";

export interface EvolutionTreeProps {
  root: EvolutionNode;
  current: string;
  atlas: AtlasSpec;
  spriteUrl: (slug: string) => string;
  hrefFor: (slug: string) => string;
  Link: LinkComponent;
  numberLabel: string;
  /** Text on the arrow into a stage. Defaults to the pack's own conditions (e.g. "Level 16"). */
  conditionText?: (node: EvolutionNode) => string;
}

/** Renders a (possibly branching) chain. Stages missing from the pack show as greyed placeholders. */
export function EvolutionTree(props: EvolutionTreeProps) {
  return (
    <div className="pp-evo" role="list">
      <Stage node={props.root} {...props} />
    </div>
  );
}

function Stage({ node, current, atlas, spriteUrl, hrefFor, Link, numberLabel, ...rest }: EvolutionTreeProps & { node: EvolutionNode }) {
  const isCurrent = node.slug === current;
  const card = (
    <>
      {node.slug ? (
        <Sprite src={spriteUrl(node.slug)} atlas={atlas} scale={0.42} lazy label={node.name} className="pp-evo-sprite" />
      ) : (
        <div className="pp-evo-missing" aria-hidden="true">?</div>
      )}
      <span className="pp-evo-name">{node.name}</span>
      <span className="pp-evo-num">
        {numberLabel} {String(node.number).padStart(3, "0")}
      </span>
      {!node.slug && <span className="pp-evo-note">Not in roster</span>}
    </>
  );
  return (
    <div className="pp-evo-branch" role="listitem">
      {node.slug && !isCurrent ? (
        <Link href={hrefFor(node.slug)} className="pp-evo-card">
          {card}
        </Link>
      ) : (
        <div className={`pp-evo-card ${isCurrent ? "is-current" : ""} ${node.slug ? "" : "is-missing"}`} aria-current={isCurrent ? "page" : undefined}>
          {card}
        </div>
      )}
      {node.children.length > 0 && (
        <div className={`pp-evo-children${node.children.length > 3 ? " is-fan" : node.children.length > 1 ? " is-branch" : ""}`}>
          {node.children.map((c) => (
            <div key={c.key} className="pp-evo-edge">
              <div className="pp-evo-arrow">
                <span className="pp-evo-cond">{rest.conditionText?.(c) ?? (c.conditions.join(" · ") || "Evolves")}</span>
                <span aria-hidden="true">→</span>
              </div>
              <Stage node={c} current={current} atlas={atlas} spriteUrl={spriteUrl} hrefFor={hrefFor} Link={Link} numberLabel={numberLabel} {...rest} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
