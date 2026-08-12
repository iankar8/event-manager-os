# Program Desk V2 Scope

**Date:** August 11, 2026
**Status:** Proposed scope; no V2 implementation authorized by this document
**Canonical V1:** `docs/designs/2026-08-11-program-desk-product-spec.md`
**V2 objective:** Convert a high-scoring program-workflow implementation into a buyer-credible replacement that can deliver communications, connect to the organizer's registration stack, expose speaker resources, and serve as a dependable data platform.

## Decision Receipt

V2 will not be a miscellaneous backlog of everything omitted from V1. It will be a **buyer-completeness release** built around the places where the current one-record workflow stops at the boundary of another system.

The five buyer-facing capabilities are:

1. Production email and portable calendar delivery.
2. One-way Accelevents synchronization.
3. Speaker resources and wiki pages with safe HTML embeds.
4. A documented, event-scoped API with webhooks.
5. A narrow cross-event Speaker Memory layer, not a full sales CRM.

Deployment, an open-source repository, evaluator credentials, and the competition submission form are not V2 product features. They are a separate **Submission Release Gate** and must be completed before optional V2 work can count.

Rejected framing:

- Calling deployment or repository publication a product feature.
- Building a generic integrations marketplace before the Accelevents handoff works.
- Building a broad HubSpot-style speaker CRM.
- Adding direct Google and Microsoft OAuth calendar writes before portable `.ics` delivery is reliable.
- Publishing an expansive write API before public reads, scopes, documentation, and webhook receipts are trustworthy.

Revisit those rejected directions only after the five V2 acceptance gates pass and a real event team demonstrates the need.

## 1. Problem Statement

Program Desk currently preserves a program record from proposal through public agenda, but several real-world handoffs still terminate inside the application. Organizers need messages to leave the system, accepted program data to reach their registration platform, speakers to receive durable reference material, and websites or AI-built tools to consume the same canonical data safely. Without those boundaries working, the product is an excellent program workbench but not yet a credible replacement for the complete paid stack.

## 2. Demand Evidence

The evidence is specific but not yet equivalent to paid product demand:

- The competition organizer is actively trying to replace a product reported to cost more than $40,000 per year.
- The brief explicitly names automated communications and calendar invitations, Accelevents, speaker resource/wiki pages, and an API as desired capabilities.
- Accelevents is not a hypothetical ecosystem choice; it is the organizer's existing registration platform.
- Ian repeatedly prioritized communication previews, magic-link onboarding, bulk operations, public data reuse, and AI-built websites consuming an API.
- The current judge audit suggests the V1 workflow is already strong against the required evaluator, so these additions affect buyer credibility more than core rubric coverage.

Missing evidence:

- No external program team has depended on Program Desk for a live event.
- No buyer has paid for the integration, resource, or API layer.
- No unaided organizer has yet completed the entire workflow on the deployed product.

## 3. Status Quo

The target organizer currently uses a specialized program platform, Accelevents, email, calendars, shared reference documents, and a website or CMS. Staff copy accepted speaker and session data between tools, send reminders manually, attach calendar files, maintain speaker instructions in separate documents, and ask developers or AI tools to recreate public program data for the event website.

Program Desk V1 already replaces the internal proposal-to-program chain. V2 replaces the five remaining boundary handoffs without turning the application into an all-purpose event suite.

## 4. Target User and Narrowest Wedge

### Primary user

A conference program director or event operations lead managing 50-250 proposals, 20-100 sessions, several collaborating organizers, external reviewers, and a separate registration platform.

They are evaluated on:

- Publishing a high-quality program on time.
- Preventing speaker and schedule mistakes.
- Keeping speakers informed and ready.
- Avoiding duplicate entry across program, registration, and website systems.
- Producing an audit trail when something changes or fails.

### Narrowest V2 wedge

**Publish once, hand off everywhere.** When an organizer publishes an approved schedule revision, Program Desk can:

1. Send the right recipient-specific messages and portable calendar invitations.
2. Preview and synchronize the approved speakers and sessions to Accelevents.
3. Show the correct event and session resources in each speaker's portal.
4. Expose the same published records through documented API endpoints and lifecycle webhooks.

The Speaker Memory layer comes after this wedge. It reuses people across events but does not block the publish-and-handoff promise.

## 5. Approaches Considered

### A. Full event-management platform

Add registration, ticketing, sponsors, attendee messaging, payments, websites, and speaker CRM.

**Tradeoff:** Large apparent market surface, but it abandons the program-operations wedge and creates direct competition with mature registration platforms.

### B. Integration marketplace

Create a generic connector framework and advertise support for many tools.

**Tradeoff:** Architecturally neat but weak as proof. One complete, observable Accelevents sync is more credible than ten connector logos with shallow behavior.

### C. Buyer-complete program system

Finish the specific boundaries immediately adjacent to the canonical program record: delivery, registration sync, resources, API, and later cross-event speaker reuse.

**Decision:** Choose C. It strengthens the existing product thesis and gives judges or buyers observable evidence that Program Desk can replace a real operating stack.

## 6. Recommended V2 Product

### 6.1 Submission Release Gate - required before V2

This is release work, not product scope:

- Public open-source repository with license, setup instructions, migrations, architecture, and known limitations.
- Cloudflare deployment with production D1 and stable URL.
- Seeded evaluator credentials and isolated Demo Mode.
- Production smoke test covering organizer, reviewer, speaker, and public roles.
- Full official six-area judge run against the deployed URL.
- Competition form submission with repository, deployed site, credentials, and walkthrough.

**Gate:** V2 work must not delay a valid submission.

### 6.2 Production communications and calendar delivery

Preserve the provider-neutral communication record and add one real provider first.

Required behavior:

- Resend is the initial delivery adapter; the internal message contract remains provider-neutral.
- Organizer can preview the exact subject, body, resolved merge fields, recipients, exclusions, and attachments before a deliberate send.
- Submitter confirmations, decision notifications, speaker invitations, reviewer reminders, speaker task reminders, and schedule-change messages can leave the application.
- Accepted or scheduled speakers receive an `.ics` attachment that opens in Gmail, Outlook, and iCal-compatible clients.
- Every recipient receives an individual calendar event rather than an organizer-owned shared invitation.
- Provider message ID, queued/sent/delivered/bounced/failed state, timestamps, and errors are stored and visible.
- Automatic reminders respect template enablement, due dates, recipient scope, and idempotency; rerunning a job cannot duplicate a message.
- Demo and local development remain in explicit outbox mode.

Non-goals:

- Direct writes through Google Calendar or Microsoft Graph.
- Multiple production email providers.
- Autonomous schedule-change messages without organizer approval.

Acceptance gate:

- A controlled inbox receives one submitter confirmation and one speaker reminder with resolved merge fields.
- The attached calendar event imports with the correct event, session, speaker, start/end, room, and update identifier.
- A provider webhook updates the visible receipt.
- Replaying the reminder job does not create a duplicate send.

**Tag:** Kernel. Delivery, idempotency, and receipts require line-by-line review.

### 6.3 One-way Accelevents synchronization

Synchronize only canonical, approved, published program data outward.

Required behavior:

- Organizer connects an Accelevents event using credentials stored as secrets.
- Field mapping covers speakers, sessions, tracks, formats, rooms, start/end times, biographies, headshots, and public descriptions where supported.
- A dry-run shows creates, updates, skips, conflicts, and unsupported fields before mutation.
- Organizer explicitly approves the exact sync scope.
- Sync stores Program Desk IDs alongside external Accelevents IDs.
- Repeating an unchanged sync is a no-op.
- Changed records produce a field-level diff and targeted update.
- Removed or unpublished Program Desk records are never silently deleted from Accelevents; they produce a reconciliation warning and require an explicit policy.
- Every attempt records actor, source revision, request outcome, external IDs, errors, retries, and final state.

Non-goals:

- Two-way sync.
- Registration, ticket, or attendee ingestion.
- A generic connector framework before Accelevents succeeds.

Acceptance gate:

- A sandbox or controlled Accelevents event receives one approved session and its speakers.
- The second unchanged sync reports zero mutations.
- A Program Desk title or time edit previews one targeted update and applies it after approval.
- A failed record can be retried without duplicating successful records.

**Tag:** Kernel. External mutation, idempotency, and reconciliation require line-by-line review.

### 6.4 Speaker resources and wiki

Add a bounded content layer inside the speaker portal.

Required behavior:

- Organizers create event-wide and session-specific resource pages.
- Pages support title, summary, rich text, links, files, and sanitized HTML embeds.
- Pages have draft/published state, ordering, audience, author, updated timestamp, and version history.
- Audience can be all speakers, selected sessions, tracks, or individual speakers.
- Speakers see only published resources in their scope.
- Resources can be linked from onboarding tasks without duplicating content.
- Embed validation blocks unsafe scripts, unsupported origins, and malformed HTML.

Non-goals:

- Freeform public website builder.
- General-purpose company wiki.
- Collaborative document editing.

Acceptance gate:

- An organizer publishes an event handbook plus one session-specific rehearsal page.
- The assigned speaker sees both; an unrelated speaker sees only the handbook.
- A permitted embed renders, an unsafe script is rejected, and both outcomes persist across reload.

**Tag:** Leaf over the existing event/role kernel, with security review for HTML sanitization.

### 6.5 Documented API and webhooks

The API is a product surface, not a collection of undocumented internal routes.

#### Public read API

- Events and public configuration.
- Published sessions and speakers.
- Tracks, formats, rooms, and event days.
- Current published agenda revision.
- Public resource metadata where allowed.
- JSON and iCal representations.
- `updated_at` and stable record identifiers.

#### Authenticated API

- Event-scoped API keys with named scopes and revocation.
- Read scopes for proposals, reviews, speakers, tasks, sessions, schedules, and communications.
- Narrow write scopes only where a concrete integration requires them.
- Pagination, filtering, consistent error envelopes, rate limits, and CORS policy.

#### Webhooks

- Proposal submitted or changed.
- Decision recorded.
- Speaker or task changed.
- Session approved or changed.
- Schedule revision published.
- Communication delivery state changed.
- Accelevents sync completed or failed.

Every webhook has a stable event ID, signature, timestamp, retry count, delivery receipt, and idempotency guidance.

Required product surfaces:

- Versioned `/api/v1` routes.
- Generated OpenAPI document.
- Human-readable API reference with copyable examples.
- Organizer key-management and webhook-delivery screens.
- Public feeds and widgets reading from the same canonical API response model.

Non-goals:

- GraphQL.
- MCP before the REST contract is stable.
- Broad writes that bypass application rules.
- Claiming API coverage based only on internal frontend endpoints.

Acceptance gate:

- A new developer or AI coding agent can discover the API, fetch the published agenda, and render a correct event page without reading the source repository.
- An event-scoped key cannot read another event.
- Revocation blocks the key immediately.
- Publishing a revision produces one signed webhook; replaying it is safely detectable.

**Tag:** Kernel. Auth, scoping, schemas, and compatibility require a plan and review before implementation.

### 6.6 Speaker Memory - V2.1, not the competition-critical path

Do not build a full CRM. Build the smallest cross-event reuse layer that eliminates repeated speaker entry.

Required behavior:

- Organization-level directory created from event speaker records.
- Search, company/title filters, tags, internal notes, and event/session history.
- Duplicate candidates are surfaced without automatic merge.
- Organizer can add an existing speaker to another event with profile fields intact.
- Event-specific fields and private notes remain scoped correctly.

Explicitly deferred:

- Sourcing kanban.
- Sales-style campaigns and sequences.
- Lead scoring.
- Automated enrichment.
- Complex saved segments.
- Destructive duplicate merging until provenance and field ownership are settled.

Acceptance gate:

- A returning speaker appears once in the organization directory with two event histories and can be added to a third event without re-keying biography, company, title, or headshot.

**Tag:** Kernel because it changes event-versus-organization ownership. Do not start before the competition submission and V2 boundary handoffs are complete.

## 7. Sequencing

### Release track

1. Complete the Submission Release Gate.
2. Run the official judge against the deployment.
3. Fix any high-weight required-rubric failures before adding V2 scope.

### V2 product track

1. Documented public API and stable schemas.
2. Production communications plus `.ics` delivery receipts.
3. Accelevents dry-run, mapping, and idempotent push.
4. Speaker resources/wiki.
5. Authenticated API keys and webhooks needed by integrations.
6. Speaker Memory only after the above works.

The public API is first because communications, Accelevents, resources, external websites, and AI-built clients all depend on stable record identities and event scoping. That does not mean building a large API platform first; it means freezing and documenting the small canonical read contract before integrations consume it.

## 8. V2 Definition of Done

V2 is complete only when one published session can be traced through all of these destinations:

`Approved session -> published revision -> public API/widgets -> speaker email/calendar -> Accelevents -> scoped speaker resources`

For every transition, the organizer can see:

- Source record and revision.
- Actor or automated policy.
- Exact payload or resolved content.
- Destination and external identifier.
- Success, skip, warning, or failure state.
- Retry or reconciliation action.

Build and browser tests must cover one happy path and one failure path per boundary. External integrations require a receipt from the destination, not only a successful enqueue.

## 9. Open Questions

- Which Accelevents API credentials, sandbox, and event permissions are available?
- Which sender domain and Resend account can be used for controlled delivery verification?
- Does the competition expect calendar invitations as `.ics` attachments, or direct Google/Microsoft calendar writes despite the brief naming iCal?
- Which HTML embed origins should be permitted by default in speaker resources?
- Which authenticated write endpoints are needed by a real integration rather than merely possible?
- Should the repository live on Forge, GitHub, or both?
- What deployment domain should be used for evaluator-facing links and email URLs?

These questions block production integration verification, not the V2 product boundary.

## 10. What I Noticed About How You Think

- You said the five judge-audit bullets were “pretty key,” which shows you correctly distinguish passing the evaluator from satisfying the buyer.
- You returned to “an API” after seeing the working product, suggesting you view Program Desk as canonical infrastructure for websites and agents, not only an admin interface.
- You use “etc etc” when the backlog begins expanding. That is the moment scope needs explicit buckets and non-goals before attractive extras become accidental commitments.
- Earlier, you prioritized the complete cross-role chain before integrations. That sequencing was correct; the core is now healthy enough that boundary work is no longer premature.

## 11. One More Thing

The strongest V2 differentiator is not the number of integrations. It is **observable handoffs**. Existing event software often says an email was sent or a sync completed without showing exactly what left, what destination accepted, and which revision it came from. Program Desk can extend its one-record thesis beyond the application: every outbound message, calendar file, API response, webhook, and Accelevents mutation can remain attached to the canonical program record with a destination receipt. That turns operational transparency into the product moat.
