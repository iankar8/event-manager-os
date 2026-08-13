import { FormEvent, useState } from "react";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../lib/api";

const evaluatorAccounts = [
  ["Organizer", "sbek-organizer@example.com", "SbekTest!2027-org"],
  ["Reviewer", "sbek-reviewer@example.com", "SbekTest!2027-rev"],
  ["Speaker", "sbek-speaker@example.com", "SbekTest!2027-spk"],
] as const;

export function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState<string>(evaluatorAccounts[0][1]);
  const [password, setPassword] = useState<string>(evaluatorAccounts[0][2]);
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      if (mode === "password") {
        await apiRequest("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        navigate("/app", { replace: true });
        return;
      }
      const result = await apiRequest<{ message: string; previewUrl?: string }>("/api/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
      setPreviewUrl(result.previewUrl ?? null);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <Link className="wordmark" to="/">
          Event Manager OS
        </Link>
        <div>
          <p className="eyebrow">One record. Every handoff.</p>
          <h1>Return to your program workspace.</h1>
          <p>Use a password or an email-bound magic link. Demo access remains available without an inbox.</p>
        </div>
        <Link className="button button-quiet" to="/demo">
          Explore Demo <ArrowRight size={16} />
        </Link>
      </section>

      <section className="auth-panel" aria-labelledby="sign-in-heading">
        <div className="segmented-control" aria-label="Sign-in method">
          <button type="button" aria-pressed={mode === "password"} onClick={() => setMode("password")}>
            <KeyRound size={15} /> Password
          </button>
          <button type="button" aria-pressed={mode === "magic"} onClick={() => setMode("magic")}>
            <Mail size={15} /> Magic link
          </button>
        </div>

        <form onSubmit={submit}>
          <div>
            <p className="eyebrow">Secure access</p>
            <h2 id="sign-in-heading">Sign in</h2>
          </div>
          <label>
            Email address
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          {mode === "password" ? (
            <label>
              Password
              <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          ) : null}
          <button className="button button-ink" disabled={pending} type="submit">
            {pending ? "Working…" : mode === "password" ? "Continue to workspace" : "Send magic link"}
          </button>
          {message ? <p className="form-message">{message}</p> : null}
          {previewUrl ? (
            <a className="outbox-link" href={previewUrl}>
              Open local outbox link <ArrowRight size={15} />
            </a>
          ) : null}
        </form>

        <div className="fixture-accounts">
          <div>
            <p className="eyebrow">Evaluator access</p>
            <p>Seeded credentials use the same persisted permissions as real accounts.</p>
          </div>
          {evaluatorAccounts.map(([role, accountEmail, accountPassword]) => (
            <button
              type="button"
              key={role}
              onClick={() => {
                setMode("password");
                setEmail(accountEmail);
                setPassword(accountPassword);
              }}
            >
              <span>{role}</span>
              <code>{accountEmail}</code>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
