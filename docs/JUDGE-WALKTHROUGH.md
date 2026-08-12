# Program Desk judge walkthrough

**Live application:** https://program-desk.ian-208.workers.dev

**Source:** https://github.com/iankar8/program-desk

**Fastest entry:** choose **Explore demo**. Each visit creates an isolated persisted event and opens as Organizer.

## Evaluator credentials

| Persona | Email | Password |
|---|---|---|
| Organizer | `sbek-organizer@example.com` | `SbekTest!2027-org` |
| Reviewer | `sbek-reviewer@example.com` | `SbekTest!2027-rev` |
| Speaker | `sbek-speaker@example.com` | `SbekTest!2027-spk` |
| Co-speaker | `sbek-speaker2@example.com` | `SbekTest!2027-spk2` |

The password accounts use the same persisted role and event boundaries as real accounts. Magic links, application email, Accelevents changes, and reminders remain in the local outbox or destination mirror; the deployment does not claim external delivery.

## Three-minute walkthrough

### 0:00–0:25 — the thesis

1. Open the live URL and choose **Explore demo**.
2. On **Overview**, use the **One record trace** to establish the core model: `Submitted → Reviewed → Accepted → Onboarding → Approved → Scheduled → Published`.
3. Point out **Needs attention**: the system names the missing assignment, speaker deliverable, and unpublished draft instead of hiding them in separate modules.

### 0:25–1:05 — review and decision handoff

1. Open **Review plans**. The seeded plan has separate rounds, criteria, reviewer capacity, and explicit assignment controls.
2. Use the persona switcher to open **Reviewer**. The reviewer sees only their queue, can score or recuse, and never receives organizer navigation.
3. Return to **Organizer**, open **Proposals**, and inspect the proposal record. Submitted information, research, AI advice, human review, and decision provenance stay separate.

### 1:05–1:40 — speaker operations

1. Open **People** to show the event-scoped roster, readiness state, invitation, filtering, and bulk operations.
2. Switch to **Speaker** and edit the seeded profile or complete a task. Switch back to Organizer to confirm the same canonical record changed.
3. Open **Speaker resources**. Event-wide, session, track, and individual resources use draft/published state; a speaker sees only published pages inside their scope. Approved iframe HTML is normalized to a safe HTTPS embed before storage.

### 1:40–2:20 — schedule rules and publishing

1. As Organizer, open **Schedule**. Drag or resize a session in the draft revision.
2. Try an occupied room/time or a double-booked speaker. The placement is blocked with a specific conflict explanation.
3. Publish the conflict-free revision, then open **Publish**. Sessions, speakers, agenda, itinerary, and speaker gallery all read from the same approved published revision.

### 2:20–3:00 — replacement credibility

1. Open **Communications** to preview recipients, merge data, exclusions, attachments, and outbox receipts without claiming a real send.
2. Open **Settings → Accelevents**. The first approved simulation records speaker/session creates; an unchanged second preview produces zero mutations, and deletions become reconciliation warnings.
3. Open `/api/v1/openapi.json` to show the versioned public contract. Finish on the Accelevents receipt: every outgoing change carries its source revision, exact scope, payload, actor, outcome, and stable destination identity.

## Verification receipt

- TypeScript, six unit/API tests, and production build pass with `pnpm check`.
- The cross-role Playwright suite passes against the deployed URL, including persistence, role scoping, conflicts, public surfaces, Speaker Resources, API isolation, and the safe Accelevents round trip.
- The official `killmysaas-evals` offline browser smoke suite and six-area `--dry-run` validate without a paid judge call.
