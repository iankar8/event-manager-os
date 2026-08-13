# Event Manager OS — Claude Handoff

**Prepared:** August 12, 2026  
**Repository:** `/Users/iankar/Documents/Codex/2026-08-09/hope-you-are-all-having-fun`  
**GitHub:** https://github.com/iankar8/program-desk  
**Live evaluator build:** https://program-desk.ian-208.workers.dev  
**Branch / commit at handoff:** `main` at `cb2e5d0e22af25d542de963f27d1e98b5b74c26a`  
**Competition submission status:** Unknown and owner-controlled. Do not claim it has been submitted.

---

## Copy-paste starting prompt for Claude

Paste this prompt into Claude from the repository root:

```text
You are taking over Event Manager OS, an open-source SessionBoard alternative built for the killmysaas LLM-as-judge competition.

Read CLAUDE-HANDOFF.md completely before acting. Then read README.md, docs/JUDGE-WALKTHROUGH.md, docs/designs/2026-08-11-program-desk-product-spec.md, and docs/designs/2026-08-11-program-desk-v2-scope.md. Inspect git status and recent commits, then run pnpm check.

The product is already built, deployed, and working. Do not broaden the feature set. The remaining objective is to make the strongest behavior impossible for a cold judge to miss: one real persisted record moving from Submitted → Reviewed → Accepted → Onboarding → Approved → Scheduled → Published, with actor, time, rule, receipt, role boundary, and downstream destination visible.

The approved-direction candidate is docs/demos/2026-08-11-judge-proof-mode.html with screenshots in docs/qa/. It is a visual prototype only. It contains illustrative IDs, dates, and a reviewer name that are NOT all present in the seeded database. Never port those literals or present them as persisted evidence.

Before production edits, show Ian the demo and confirm whether he approves the direction. If he approves, write a short implementation plan because the UI is leaf work but the cross-entity, event-scoped trace endpoint and demo fixtures touch the product kernel. Then implement the smallest truthful version:

1. Make one seeded proposal genuinely contain all seven persisted lifecycle stages, including a submitted review for the same proposal that becomes the published session.
2. Add an organizer/event-scoped trace read contract derived from real database rows. Never synthesize nonexistent audit events, actors, IDs, timestamps, or delivery claims.
3. Port the proof ledger and seven-step guided navigation into Demo Mode while preserving the existing visual system and normal product navigation.
4. Each step must deep-link to a real product surface and show the real persisted record/receipt behind the claim.
5. Add minimalist acceptance coverage: happy path plus event/role scoping and incomplete-stage behavior.
6. Run pnpm check, pnpm test:e2e, and screenshot QA at 320/375/414/768/desktop. Check console state and horizontal overflow.
7. Stop for Ian's review. Do not deploy, push, upload the video, run a paid judge, or submit the competition form without explicit authorization.

The submission deadline is immediate. A valid submission package is more important than optional polish. If the competition form has not been submitted, surface that as P0 and do not let the proof-mode port delay a valid entry.
```

---

## 1. What this project is

Event Manager OS is a conference program operations system. It is not a generic event CRM, ticketing system, or pixel clone of SessionBoard.

The product thesis is:

> **Event Manager OS is the event-program system that proves every handoff.** One record moves from submission to review to speaker onboarding to agenda to public program, with rules enforced at every step.

The canonical lifecycle is:

`Submitted → Reviewed → Accepted → Onboarding → Approved → Scheduled → Published`

The judge should be able to observe five things at every meaningful transition:

1. The current state.
2. The responsible person or role.
3. What changed and who changed it.
4. The rule that allowed or blocked the transition.
5. The next record or public destination.

The competition rewards observable behavior more than feature inventory. Our most important concepts are:

- **Round-trip:** a saved change survives reload and appears for the next authorized role.
- **Rule:** invalid transitions, schedule conflicts, and publication violations are blocked or explicitly overridden.
- **Scoping:** roles and events see only their intended records.
- **Handoff:** acceptance, onboarding, approval, scheduling, public output, and integrations retain canonical data.
- **Provenance:** submitted facts, research, AI advice, human review, and human decisions remain visibly distinct.
- **Operational honesty:** logged/outbox/simulated work is never described as externally delivered.

## 2. Ian's product decisions

These decisions came from the full planning conversation and should be treated as settled unless Ian reopens them:

- Build for a conference program director and events team; the competition judge is the evaluator, not the fictional user.
- Use passwordless magic links for real flows and seeded password personas for deterministic evaluation.
- Collaborative events can allow multiple approved company domains.
- Roles are Owner, Admin/Organizer, Reviewer, and Speaker; Demo Mode switches among organizer, reviewer, and speaker personas.
- Reviewer onboarding captures expertise, conflicts, availability, policy acceptance, and maximum capacity.
- Reviewer auto-assignment prioritizes expertise, then conflicts, then balanced capacity. One reviewer per proposal is the default unless a round requires more.
- AI is an experienced program architect/advisor. It may research and recommend, but never autonomously accept or reject.
- Submitted information and AI-generated information must stay visually and structurally separate.
- Schedules need draft/published revisions, drag movement, resize/duration control, conflict blocking, explicit override, and deliberate publication.
- Communication needs exact previews, editable templates, merge data, recipient/exclusion visibility, and receipts.
- Demo/local email stays in an explicit outbox. Do not claim external delivery.
- Accelevents synchronization is one-way, preview-first, explicitly approved, idempotent, receipt-backed, and never silently deletes destination records.
- Public agenda, sessions, speakers, gallery, itinerary, embeds, JSON, ICS, and API read from the same approved published revision.
- An API is important because organizers will build websites and tools with AI; the read-only V1 contract is already implemented.
- Do not add a broad CRM, payments, sponsor pipeline, ticketing, generic integration marketplace, freeform website builder, or generic chatbot to the competition cut.

## 3. What is built now

The deployed application already includes:

- Custom CFP builder, public submission form, required/conditional fields, deadlines, drafts, custom answers, confirmations, and editing locks.
- Review plans with independent rounds, round-specific pools, join links, reviewer onboarding, capacity, manual assignment, expertise-first balanced auto-assignment, blind review, weighted scorecards, recusal, reminders, export, and human override of separate AI advice.
- Proposal detail with submitted facts, sourced research, AI advice, human review evidence, decisions, and shareable read-only/comment links.
- Acceptance-to-session propagation and speaker onboarding tasks.
- Event-scoped people/speaker operations, CSV import, filters, bulk actions, invitations, profile editing, task state, and status tracking.
- Speaker Resources with event/track/session/individual scope, draft/published state, safe HTTPS embeds, and speaker-only visibility rules.
- Session deliverable requests, file versions, latest markers, comments, reminders, central file library, and ZIP export.
- Content versions and approval state.
- Draft/published schedule revisions, rooms/tracks, drag placement, duration control, automatic placement, room and speaker conflict rules, explicit overrides, and publication history.
- Five public surfaces plus embeds, JSON feeds, and ICS.
- Event-scoped read-only REST API and OpenAPI document at `/api/v1/openapi.json`.
- Communications preview/outbox receipts.
- One-way Accelevents preview/apply flow with field-level diffs, stable external identities, no-op repeat sync, retryable failures, reconciliation warnings instead of deletion, and local outbox simulation.
- Isolated Demo Mode with one-click reset and organizer/reviewer/speaker persona switching.

Important honesty boundaries:

- Production email delivery is **not** connected. Current delivery is outbox/logged unless a future provider is explicitly configured.
- Accelevents is **not** proven against a live paid destination. The current competition-safe flow is a deterministic destination mirror/outbox simulation.
- A paid official LLM judge run was deliberately not performed.
- The official eval harness was validated through its offline browser smoke and six-area dry run.
- The competition form submission remains an external, owner-controlled action.

## 4. Architecture and canonical files

Stack:

- React 19 + Vite frontend.
- Hono Cloudflare Worker API.
- Cloudflare D1 persistence.
- Cloudflare-native deployment.
- TypeScript throughout.
- Vitest for unit/API tests.
- Playwright script for observable cross-role acceptance testing.

Key files:

| Area | Canonical location |
| --- | --- |
| Product summary/setup | `README.md` |
| Approved V1 product definition | `docs/designs/2026-08-11-program-desk-product-spec.md` |
| Proposed V2 / defer list | `docs/designs/2026-08-11-program-desk-v2-scope.md` |
| Judge path and credentials | `docs/JUDGE-WALKTHROUGH.md` |
| Current overview trace | `src/workspace/OverviewPanel.tsx` |
| Workspace shell/navigation/persona switching | `src/screens/Workspace.tsx` |
| Workspace types | `src/types.ts` |
| Core workspace styling | `src/workspace.css`, `src/workbench.css` |
| Summary/context API | `worker/routes/context.ts` |
| Demo fixture | `worker/services/seed.ts` |
| Schema | `migrations/0002_program_kernel.sql` through `migrations/0005_speaker_resources.sql` |
| Proposal/decision logic | `worker/routes/proposals.ts` |
| Review logic | `worker/routes/reviews.ts` |
| Schedule rules | `worker/routes/schedule.ts` |
| Public outputs | `worker/routes/public.ts`, `worker/routes/api-v1.ts` |
| Integration receipts | `worker/routes/integrations.ts`, `worker/services/accelevents.ts` |
| Cross-role E2E | `scripts/qa-e2e.mjs` |
| Approved-direction candidate | `docs/demos/2026-08-11-judge-proof-mode.html` |
| Demo screenshots | `docs/qa/2026-08-11-judge-proof-mode-desktop.png`, `docs/qa/2026-08-11-judge-proof-mode-mobile.png` |

Useful commands:

```bash
pnpm install
pnpm db:migrate
pnpm dev
pnpm check
pnpm test:e2e
pnpm run deploy
```

Do not run `pnpm run deploy` without Ian's explicit deploy authorization. Note `pnpm deploy` (without `run`) resolves to pnpm's own built-in deploy command and fails; the migration must also be applied with `--remote` before deploying, or production keeps serving the previous canonical fixture.

## 5. Repository and verification state at handoff

Verified on August 12, 2026:

- `main`, `origin/main`, and `origin/HEAD` all pointed to `cb2e5d0` before this handoff file was created.
- The repository was clean before this handoff file was added.
- Live root returned HTTP 200.
- Live `/api/v1/openapi.json` returned the Event Manager OS OpenAPI 3.1 document.
- `pnpm check` passed:
  - TypeScript passed.
  - 3 Vitest files passed.
  - 6 tests passed.
  - Worker and client production builds passed.
- The last proof-mode visual pass had clean browser console output.
- Responsive visual checks were performed at 320, 375, 414, 768, and desktop widths.

Recent commits:

```text
cb2e5d0 auto: 2026-08-11-2257               # proof-mode HTML demo + QA screenshots
9cd309f feat: expose receipt-backed Accelevents handoff
04ca58c Polish judge walkthrough
088560f Deploy and verify Event Manager OS release
97747b2 Release Event Manager OS competition build
```

The current live deployment predates the proof-mode production port because no production port exists yet.

## 6. Current visual state and the unfinished 9.5 push

The application was judged internally at approximately **8.5/10**: unusually complete and trustworthy for a competition build, but its strongest behavior is still easier to understand from documentation than from the first screen.

The production Overview currently renders a visually clean but mostly hard-coded seven-dot lifecycle in `src/workspace/OverviewPanel.tsx`:

- Record title is selected by role using literal strings.
- Completion depth is selected by role using a numeric constant.
- Dots say `Recorded`, `Next handoff`, or `Waiting`.
- It does not expose a real actor, timestamp, rule, receipt ID, or downstream record.

The 9.5 direction replaces that decorative lifecycle with an interactive evidence ledger:

- Seven guided lifecycle steps.
- One canonical proposal/session record.
- Actor and role.
- Persisted evidence.
- Server-enforced rule.
- Real record/receipt ID and timestamp.
- Downstream destination.
- Direct navigation to the corresponding product surface.

Visual prototype:

- `docs/demos/2026-08-11-judge-proof-mode.html`
- `docs/qa/2026-08-11-judge-proof-mode-desktop.png`
- `docs/qa/2026-08-11-judge-proof-mode-mobile.png`

### Approval status

Ian said “rip” to pursue the 9.5 plan, which authorized the demo exploration. The demo was then presented under the demo-first gate. Ian has **not yet explicitly approved the rendered direction for a production port**. The next Claude session should show or link the demo and obtain approval before editing production visual code.

### Critical truthfulness warning

The standalone HTML is a **visual prototype with realistic illustrative content**, not a database-backed proof.

In particular:

- The demo uses the reviewer name `Maya Chen`; the real seeded reviewer is `Sam Whitfield`.
- IDs such as `PD-1042`, `RV-882`, `DC-419`, and `SS-204` are illustrative, not the random persisted IDs created by `seedProgramWorkspace()`.
- The staged timestamps are illustrative.
- The currently published AI proposal does not have a submitted review for that same proposal in the seed. The review assignment belongs to the separate “Taming 40-Minute CI” proposal.

Do not port these literals. Do not label them as real receipts. The production feature must fix the fixture and render actual database rows.

## 7. Recommended production implementation after approval

This is a mixed-scope change:

- **Leaf:** guided proof-mode UI and styling.
- **Kernel:** cross-entity data derivation, event/role scoping, and canonical demo fixture.

Write and confirm a brief implementation plan before the kernel portion.

### 7.1 Make one fixture truthfully span the lifecycle

Use the already accepted/published proposal, `proposalAi`, as the canonical trace because it already has:

- A proposal and speaker.
- An acceptance decision.
- A derived approved session.
- Speaker onboarding tasks (4 complete, 1 incomplete).
- A published schedule item and a draft revision.
- Public program output.

Add only the missing persisted evidence required to tell the full story:

- A review assignment for `proposalAi` to the seeded reviewer.
- A submitted review and criterion values for that assignment.
- If required for an honest approval actor/time, a seeded `content_versions` record edited by the organizer.
- Explicit chronological fixture timestamps if the UI needs meaningful dates. Do not rely on several `CURRENT_TIMESTAMP` values and then imply a sequence they do not establish.

Be careful: adding another review assignment may change summary counts and E2E assumptions. Update expectations only when the changed behavior is intentional.

### 7.2 Add a truthful read contract

Prefer a narrowly scoped trace read over putting cross-entity logic in React.

One acceptable shape is a new organizer-only route inside the existing context router, such as:

```text
GET /api/context/trace
```

Requirements:

- Require a valid session.
- Restrict it to Organizer/Admin/Owner.
- Scope every query by `session.eventId`.
- Never accept an arbitrary event ID from the client.
- Select a canonical proposal in the active event that has a session in a published schedule revision.
- Return incomplete stages as incomplete; never invent actors or evidence.
- Use real database row IDs and timestamps as receipts.
- Keep rule descriptions backed by actual server behavior. Do not invent audit events just to make the UI look complete.
- Keep all intelligence/derivation in the Worker. React should render the returned contract and route the user.

Suggested data contract:

```ts
type ProofTrace = {
  proposalId: string;
  title: string;
  trackName: string | null;
  speakerName: string;
  currentState: string;
  stages: Array<{
    key: "submitted" | "reviewed" | "accepted" | "onboarding" | "approved" | "scheduled" | "published";
    label: string;
    complete: boolean;
    actorName: string | null;
    actorRole: string | null;
    occurredAt: string | null;
    evidence: string;
    rule: string;
    receiptType: string | null;
    receiptId: string | null;
    destination: string;
    section: "proposals" | "reviews" | "people" | "content" | "schedule" | "publish";
  }>;
};
```

Derive stages from canonical rows:

| Stage | Primary persisted evidence |
| --- | --- |
| Submitted | `proposals.submitted_at`, submitter user, proposal answers |
| Reviewed | `review_assignments`, `reviews.submitted_at`, reviewer user, aggregate/values |
| Accepted | `decisions`, `proposals.decided_at`, organizer, derived `sessions.proposal_id` |
| Onboarding | `speaker_tasks` counts, `completed_at`, speaker/session relationship |
| Approved | `sessions.content_status`, latest `content_versions` editor/time if present |
| Scheduled | `schedule_items`, room, revision creator, start/end, relevant revision |
| Published | `schedule_revisions.status/published_by/published_at` and public revision |

For a receipt, display the actual row type + shortened actual row ID. Action-like labels such as `review.submitted` are fine only if the corresponding `audit_events` row truly exists.

### 7.3 Port the UI without polluting the product

Recommended behavior:

- Keep normal Overview behavior for non-demo workspaces.
- In Demo Mode, expose a clear `Start proof tour` entry from the Overview or demo banner.
- Call it **Proof tour** or **Record trace** inside the product. Avoid plastering “judge mode” across normal product surfaces.
- The tour directs attention to real app state; it must not simulate successful actions.
- Clicking a stage should either:
  - select its evidence in the ledger, or
  - navigate to the actual section using the existing `open(section)` function.
- Preserve the existing palette, typography, spacing, role switcher, and information density.
- Keep motion minimal and state-led; no theatrical transitions.
- Honor `prefers-reduced-motion`.

Likely files:

- `worker/services/seed.ts`
- `worker/routes/context.ts`
- `src/types.ts`
- `src/workspace/OverviewPanel.tsx`
- `src/workspace.css`
- `scripts/qa-e2e.mjs`

Avoid creating a parallel “v2” route or duplicating the workspace shell.

### 7.4 Acceptance gates

Minimal observable tests:

1. **Happy path:** a fresh Demo Mode organizer opens the proof trace and sees seven stages derived from the same proposal/session chain.
2. **Role boundary:** reviewer and speaker sessions cannot read the organizer trace endpoint or receive organizer-only evidence.
3. **Event isolation:** a trace never includes another demo/event's IDs.
4. **Incomplete state:** if a record lacks a review or publication, the stage is visibly incomplete rather than fabricated.
5. **Navigation:** each complete stage opens its real destination surface.
6. **Responsive QA:** 320, 375, 414, 768, desktop; no horizontal page overflow, clipped controls, or two-line buttons.
7. **Console:** no errors or warnings during the tour.

Final commands:

```bash
pnpm check
pnpm test:e2e
```

Then run screenshot-based design QA before handoff.

## 8. Submission packaging after the product port

The submission package should make the thesis legible in under 30 seconds.

Recommended first-screen message:

> **Event Manager OS proves every handoff from proposal to published program.**

Then show four obvious links:

1. Live demo.
2. Short walkthrough video.
3. Judge walkthrough.
4. Source code.

Replace feature-inventory-first framing with a compact evidence map: evaluation behavior → exact click path → proof receipt.

Do not publish/upload externally without Ian's explicit approval.

### Walkthrough media already produced

Local artifacts:

- `output/program-desk-walkthrough/program-desk-walkthrough.mp4` — current final, ElevenLabs Ian clone.
- `output/program-desk-walkthrough/program-desk-walkthrough-ian-clone.mp4`
- `output/program-desk-walkthrough/program-desk-walkthrough-daniel-backup.mp4`
- `output/program-desk-walkthrough/RECORDING-SCRIPT.md`
- `output/program-desk-walkthrough/captures/`

Ian disliked the first generic voice. He approved the second Ian-clone audition as good and said he could record the narration himself. The ideal final video is a 90–120 second proof narrative using Ian's real voice if he records it:

1. One proposal is submitted.
2. A reviewer sees only the assignment.
3. The organizer receives the review and makes the human decision.
4. The session and speaker tasks are created.
5. An invalid schedule placement is blocked.
6. A valid revision is published.
7. The same data appears publicly and in the integration receipt.

The current three-minute video remains usable if there is no time to rerecord.

## 9. P0 deadline and external-action boundaries

The competition deadline is immediate. Before optional polish, determine whether Ian has a valid submitted entry.

Submission release gate:

- Public GitHub repository: complete.
- Stable Cloudflare deployment: complete and HTTP 200 at handoff.
- Seeded evaluator credentials: complete.
- Judge walkthrough: complete.
- Offline official harness smoke/dry-run: complete.
- Paid official LLM judge: intentionally not run.
- Competition form submission: **unknown / owner-controlled**.
- Hosted video URL: **unknown / owner-controlled**.

Never do any of these without Ian's explicit authorization:

- Submit the competition form.
- Deploy to Cloudflare.
- Push/commit unless he asks or the active environment explicitly owns that workflow.
- Upload the video or make it public.
- Send email.
- Mutate a live Accelevents event.
- Pay for an official LLM judge run.

If submission is not complete, prioritize a valid entry over proof-mode polish.

## 10. What not to build now

Do not add:

- Broad cross-event speaker CRM.
- Sponsor sales/outreach pipeline.
- Registration or ticketing.
- Payments.
- Generic integration marketplace.
- Production email provider unless Ian explicitly reopens V2.
- Direct Google/Microsoft calendar writes.
- Freeform website builder.
- Generic AI chatbot.
- Autonomous acceptance/rejection.
- Popularity-based speaker scoring.
- Another design-system rewrite.
- A parallel `v2` application or duplicate workspace route.

These ideas were considered and intentionally deferred because they increase failure surface without strengthening the judge-visible thesis.

## 11. Known risks and open questions

- **Submission status is unknown.** Ask Ian; do not infer it from deployment or git state.
- **Proof demo is illustrative.** It must be backed by a corrected fixture before production.
- **A full paid LLM judge result is absent.** Do not present dry-run validation as an official score.
- **Accelevents live proof is absent.** Keep the destination mirror claim exact.
- **Email is outbox-only.** Do not relabel queued/logged messages as sent externally.
- **The live deployment may lag repository docs-only commits.** Verify deployed behavior after any authorized deploy.
- **The current demo server on port 60150 is only a local static preview.** It is not production.
- **Cross-entity trace queries are authorization-sensitive.** Event scoping and role restrictions need direct tests.

## 12. Definition of done for the 9.5 push

The phase is done when:

- Ian has explicitly approved the proof-mode direction.
- A single seeded proposal truthfully has all seven persisted stages.
- The production trace renders database evidence, not visual-demo literals.
- Every stage exposes actor, time, rule, actual receipt, and destination or clearly reports missing evidence.
- Each stage reaches a real product surface.
- Role and event isolation tests pass.
- `pnpm check` and `pnpm test:e2e` pass.
- Screenshot QA passes at required widths with a clean console.
- README/judge walkthrough reflect the shipped behavior.
- A valid competition submission package is ready.
- Deployment, upload, and submission occur only with Ian's explicit approval.

## 13. Handoff recommendation

**Keep** the repository, V1 product spec, V2 scope, judge walkthrough, proof-mode demo, QA screenshots, and walkthrough media.

**Do not archive** this project until the competition submission is confirmed and its final URLs/receipts are captured.

**Do not extract** the proof-mode code into a generic framework. It is project-specific judgeability built around Event Manager OS's canonical record.

The next bounded action is: show Ian the proof-mode demo, obtain production-port approval, then implement the truthful persisted trace—or, if the entry is not yet submitted, finish the valid submission first.
