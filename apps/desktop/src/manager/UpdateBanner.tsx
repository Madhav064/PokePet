import { useState } from "react";
import { isPhone } from "../shared/phone.ts";
import type { AvailableUpdate } from "../shared/updates.ts";

/** "A new version of PokePet is ready", with a button that installs it. */
export function UpdateBanner({ update, onError }: { update: AvailableUpdate; onError: (message: string) => void }) {
  const [state, setState] = useState<"ready" | "installing" | "hidden">("ready");
  if (state === "hidden") return null;

  const install = () => {
    setState("installing");
    update.install().then(
      // Android shows its own install screen; once the user is back here, let them try again if needed.
      () => isPhone && setState("ready"),
      (e: unknown) => {
        setState("ready");
        onError(typeof e === "string" ? e : "Couldn't update PokePet. Please try again later.");
      },
    );
  };

  return (
    <section className="panel p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3" role="status">
      <div className="flex flex-col gap-0.5 flex-1">
        <h2 className="font-semibold">A new version of PokePet is ready</h2>
        <p className="text-sm text-muted">
          {state === "installing"
            ? isPhone
              ? "Downloading… Android will ask you to confirm the update."
              : "Downloading… PokePet will restart by itself."
            : `Version ${update.version} is out. Your pets and their time are kept.`}
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost" disabled={state === "installing"} onClick={() => setState("hidden")}>
          Later
        </button>
        <button type="button" className="btn btn-primary" disabled={state === "installing"} onClick={install}>
          {state === "installing" ? "Updating…" : "Update"}
        </button>
      </div>
    </section>
  );
}
