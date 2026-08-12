import { ArrowRight, Check, CircleDot, Layers3, Sparkles } from "lucide-react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { DemoEntry } from "./screens/DemoEntry";
import { Login } from "./screens/Login";
import { PublicEvent } from "./screens/PublicEvent";
import { Workspace } from "./screens/Workspace";

const lifecycle = [
  "Submitted",
  "Reviewed",
  "Accepted",
  "Onboarding",
  "Approved",
  "Scheduled",
  "Published",
];

function Landing() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Primary navigation">
        <Link className="wordmark" to="/">
          Program Desk
        </Link>
        <div className="nav-actions">
          <Link className="button button-quiet" to="/login">
            Sign in
          </Link>
          <Link className="button button-ink" to="/demo">
            Explore demo <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">One record. Every handoff.</p>
          <h1>Your event program, from first proposal to published stage.</h1>
          <p className="hero-support">
            Collect proposals, coordinate reviewers, onboard speakers, build the schedule,
            and publish the program without losing the thread between systems.
          </p>
          <div className="hero-actions">
            <Link className="button button-accent" to="/demo">
              Open the working demo <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a className="button button-quiet" href="#workflow">
              See the workflow
            </a>
          </div>
        </div>

        <div className="hero-proof" aria-label="Program lifecycle preview">
          <div className="proof-heading">
            <div>
              <span className="mono-label">DEVFLOW CONF 2027</span>
              <h2>Taming 40-Minute CI</h2>
            </div>
            <span className="status-chip">On track</span>
          </div>
          <div className="proof-flow">
            {lifecycle.map((step, index) => (
              <div className="proof-step" key={step}>
                <span className={index < 5 ? "step-mark complete" : "step-mark"}>
                  {index < 5 ? <Check size={13} /> : <CircleDot size={13} />}
                </span>
                <span>{step}</span>
                {index < lifecycle.length - 1 ? <span className="step-line" /> : null}
              </div>
            ))}
          </div>
          <dl className="proof-metrics">
            <div>
              <dt>Human score</dt>
              <dd>4.6 / 5</dd>
            </div>
            <div>
              <dt>Speaker readiness</dt>
              <dd>4 of 5 tasks</dd>
            </div>
            <div>
              <dt>Public destination</dt>
              <dd>Agenda + 5 surfaces</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="workflow-strip" id="workflow" aria-label="Core product principles">
        <article>
          <Layers3 size={19} aria-hidden="true" />
          <h2>One canonical record</h2>
          <p>Proposal, review, session, speaker, schedule, and public program remain connected.</p>
        </article>
        <article>
          <CircleDot size={19} aria-hidden="true" />
          <h2>Rules you can see</h2>
          <p>Conflicts, missing work, overrides, and the next responsible person stay explicit.</p>
        </article>
        <article>
          <Sparkles size={19} aria-hidden="true" />
          <h2>AI with provenance</h2>
          <p>Submitted information, sourced research, human reviews, and advice never blur together.</p>
        </article>
      </section>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/demo" element={<DemoEntry />} />
      <Route path="/app/*" element={<Workspace />} />
      <Route path="/events/:slug/:surface?" element={<PublicEvent />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
