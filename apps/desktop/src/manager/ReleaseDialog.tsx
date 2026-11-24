import type { OwnedPet } from "../shared/store.ts";
import { formatDuration } from "./data.ts";

/** Confirms releasing a pet, which can't be undone. */
export function ReleaseDialog({ pet, name, onCancel, onConfirm }: {
  pet: OwnedPet;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div className="panel dialog" role="alertdialog" aria-modal="true" aria-labelledby="release-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="release-title" className="font-display text-xl font-bold">
          Release {name}?
        </h2>
        <p className="text-muted text-sm">
          {pet.onScreenMs >= 60_000
            ? `It leaves your collection for good, along with its ${formatDuration(pet.onScreenMs)} of growth. This can't be undone.`
            : "It leaves your collection for good. This can't be undone."}
        </p>
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" className="btn" autoFocus onClick={onCancel}>
            Keep it
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            Release
          </button>
        </div>
      </div>
    </div>
  );
}
