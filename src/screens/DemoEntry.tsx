import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../lib/api";

export function DemoEntry() {
  const started = useRef(false);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    apiRequest<{ ok: true }>("/api/demo/start", { method: "POST" })
      .then(() => navigate("/app", { replace: true }))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "The demo could not start."));
  }, [navigate]);

  return (
    <main className="entry-shell">
      <Link className="wordmark" to="/">
        Program Desk
      </Link>
      <section className="entry-card" aria-live="polite">
        <LoaderCircle className="spinner" size={24} aria-hidden="true" />
        <p className="eyebrow">Preparing your workspace</p>
        <h1>{error ? "The demo did not start" : "Seeding DevFlow Conf 2027"}</h1>
        <p>
          {error ?? "Creating isolated organizer, reviewer, speaker, schedule, and public-program records."}
        </p>
        {error ? (
          <button className="button button-ink" type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        ) : null}
      </section>
    </main>
  );
}
