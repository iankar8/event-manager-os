# Program Desk Product Specification

**Date:** August 11, 2026
**Status:** Implemented and locally verified; external deployment and competition submission remain approval-gated
**Primary objective:** Ship the smallest complete, persisted event-program workflow that is easy for a competition judge to exercise and credible for a real conference team.

## Decision Receipt

Program Desk will be an event-program operating system, not a generic event CRM and not a pixel clone of SessionBoard. One record will move visibly through:

`Submitted -> Reviewed -> Accepted -> Onboarding -> Approved -> Scheduled -> Published`

Every stage must preserve the record, enforce role boundaries, expose its history, and hand the correct data to the next stage. The application will optimize scope for the competition rubric while presenting a believable product for conference program directors and event teams.

Rejected directions:

- A broad but shallow recreation of every SessionBoard feature.
- A generic chatbot as the primary differentiator.
- A freeform website builder unrelated to the public-program data model.
- Reviewer assignment that operates outside an explicit evaluation plan.
- AI research mixed into or presented as applicant-submitted information.
- Email-only reviewer recruitment with no copyable join path.

Revisit the rejected platform scope only after the complete workflow passes evaluation and the public surfaces remain consistent with organizer data.

## 1. Problem Statement

Conference teams assemble a program through disconnected handoffs: collecting proposals, recruiting and allocating reviewers, selecting content, onboarding speakers, arranging sessions, sending communications, and publishing an attendee-facing agenda. The operational difficulty is not any individual form or table. It is preserving one reliable record across every transition while keeping applicants, reviewers, speakers, organizers, and public viewers inside the correct permission boundaries. Existing tools make these transitions slow, opaque, or administratively tedious, especially when several companies collaborate on an event.

## 2. Demand Evidence

The current evidence is competition and workflow evidence, not validated paid demand:

- The competition brief explicitly asks for an open-source replacement for a product reportedly costing more than $40,000 per year.
- The official walkthrough centers the organizer workflow of receiving speaker submissions, evaluating them, scheduling accepted sessions, communicating with speakers, and publishing the program.
- Ian identified concrete organizer friction: session management is confusing; schedules need drag-and-drop editing, saved drafts, publication control, and deliberate overrides.
- Ian repeatedly prioritized administrative leverage: multiple host-company domains, Slack-shareable join links, reviewer self-onboarding, balanced workloads, internal notifications, bulk actions, and editable communication templates.
- The evaluation rewards persisted round-trips, role scoping, rules, and cross-surface handoffs rather than feature inventory alone.

Commercial demand remains unproven until an actual program team depends on the workflow, pays for it, or becomes meaningfully upset when it is unavailable.

## 3. Status Quo

A typical team currently combines some mixture of form software, spreadsheets, shared documents, email, calendar tools, a website CMS, and a specialized event platform. Reviewers are recruited through email threads, expertise and capacity are tracked manually, assignments are balanced by spreadsheet, decisions are copied into speaker communications, and schedule changes must be repeated across the organizer system and public website. Collaborative events add another access problem because organizers may come from several companies.

SessionBoard is the closest reference product. Program Desk will preserve its essential program workflow while making the state transitions, assignment logic, communication previews, and public-data handoffs more legible and faster.

## 4. Target User and Narrowest Wedge

### Target user

The primary user is a conference program director or event-team organizer running a multi-track event with approximately:

- 300 to 3,000 attendees
- 50 to 250 proposals
- 20 to 100 sessions
- Internal organizers from one or more collaborating companies
- External reviewers and speakers

The competition judge is the audience for this build, but not the fictional product user. The judge should encounter a coherent system designed for the program team.

### Narrowest wedge

The narrowest complete product is a persisted proposal-to-public-program journey:

1. An applicant submits a proposal with one or more speakers.
2. An organizer receives and inspects it.
3. A reviewer joins, declares expertise and capacity, receives only assigned work, and completes a scorecard.
4. The organizer accepts the proposal, creating a draft session.
5. The speaker completes their profile and assigned tasks.
6. The organizer places and edits the session on a draft schedule.
7. The organizer publishes a schedule revision.
8. The same approved information appears on the event site, widgets, embeds, and API.

## 5. Approaches Considered

### A. Feature-parity clone

Build every visible SessionBoard area at shallow depth.

**Tradeoff:** Broad screenshot coverage, but weak persistence, scoping, and handoffs. This is unlikely to differentiate and creates too many failure points.

### B. AI-first conference planner

Lead with automatic evaluation, research, and schedule generation.

**Tradeoff:** Memorable demo, but it risks looking theatrical if the underlying workflow is incomplete. AI recommendations without role-scoped records and human overrides are less credible.

### C. One-record program operations system

Build the complete vertical workflow, then add AI and publishing as transparent layers over the same records.

**Tradeoff:** Fewer peripheral features, but substantially stronger judgeability and product coherence.

**Decision:** Choose C.

## 6. Recommended Product

### 6.1 Product thesis

**Program Desk is the event-program system that proves every handoff.** It carries one record from proposal through review, speaker readiness, scheduling, and public delivery, with rules enforced at each transition.

The UI should always make five things apparent:

- Current state
- Responsible person or role
- What changed and who changed it
- What prevents the next transition
- Where the record will appear next

### 6.2 Core entities

- Organization workspace
- Approved company domain
- Event
- Member and role
- Applicant/speaker profile
- Proposal
- Proposal participant
- Evaluation plan
- Review round
- Scorecard and criterion
- Reviewer profile
- Reviewer invitation or join link
- Reviewer pool membership
- Assignment
- Review
- AI research brief
- AI recommendation
- Decision
- Session
- Speaker task and deliverable
- Room, track, and format
- Draft schedule
- Published schedule revision
- Communication template
- Communication and delivery event
- Public component/embed
- Audit event

### 6.3 Roles and permissions

#### Owner

- Full organization control
- Add or remove Owners
- Transfer ownership
- Manage approved domains
- Manage all members and events
- Perform destructive workspace actions

#### Admin

- Manage members and approved domains
- Access every event
- Manage organization and event settings
- Promote or suspend Organizers
- Cannot transfer or delete the organization unless promoted to Owner

#### Organizer

- Access assigned events
- Manage proposals, reviewers, rounds, assignments, decisions, speakers, sessions, schedules, communications, and publishing
- Cannot manage organization ownership or unrelated events

#### Reviewer

- Access only assigned rounds and proposals
- Complete onboarding, declare conflicts, and submit scorecards
- Cannot see unassigned proposals or other reviewers' work unless explicitly released after the round

#### Speaker/applicant

- Access their own submissions, speaker profile, tasks, uploads, decisions, and session information
- Cannot see internal research, reviews, or organizer commentary

#### External guest

- Access only the explicitly shared snapshot
- May comment if the share permission allows it
- Does not receive formal scoring rights

### 6.4 Workspace access and multi-company events

An organization may approve multiple company domains. Owners and Admins can add, inspect, and remove domains and see every person who currently has access.

For organizers:

1. An Owner or Admin creates an event-specific Organizer join link.
2. The link can be shared in Slack or another internal channel.
3. The recipient enters a work email.
4. Program Desk sends a one-time passwordless magic link to prove control of that address.
5. The recipient joins only if the address matches one of the event workspace's approved domains.
6. The recipient becomes an Organizer for that event.

Join links are revocable and rotatable. Public consumer-email domains cannot be approved for domain-based organizer joining.

### 6.5 Real authentication and Demo Mode

Real users authenticate through passwordless magic links bound to their email addresses.

Competition evaluation uses a separate Demo Mode:

- A visible **Explore Demo** action on the login page
- An isolated, seeded demo workspace per demo visitor
- Organizer, Reviewer, and Speaker personas
- Role switching within the same persisted event
- Realistic completed and incomplete records
- State that survives refreshes and role changes
- A visible **Reset Demo** action
- A banner making the demo state explicit

Demo Mode must exercise the same permission checks and workflow logic as normal access. It cannot be a disconnected static prototype.

### 6.6 Event and CFP setup

Organizers create events with dates, location, event hours, tracks, rooms, session formats, and public branding.

The proposal form supports:

- Configurable fields
- At least numeric, selection, short-text, long-text, and file inputs where appropriate
- Required-field validation
- One or more attached speakers/participants with role labels
- Open and close dates
- Draft and published form states
- A configurable post-submit redirect
- An editable submitter-confirmation template
- An editable internal new-submission notification

The form submits a **Proposal**, not a speaker. A proposal contains content and one or more participant records. Accepted proposals create draft Sessions. Organizers may also create Direct Invitation sessions without a proposal.

Applicants have a portal showing their proposals, statuses, participants, editable information while allowed, and later speaker tasks.

### 6.7 Organizer proposal workspace

The proposal list includes:

- Title
- Speakers
- Track and format
- Submission date
- Lifecycle status
- Current review round
- Assigned and completed review counts
- Aggregate score
- AI research and recommendation state
- Communication state

The detail view keeps the following visibly separate:

1. **Submitted Information** — the applicant's original information, stored without AI rewriting.
2. **AI Research & Context** — citations, source dates, uncertainty, and generated findings.
3. **Reviews & Recommendation** — human scorecards and the Program Advisor's separate recommendation.
4. **History** — changes, actors, timestamps, transitions, communications, and overrides.

### 6.8 Evaluation plan

The Evaluation Plan is the permanent container for reviewer recruitment, rules, assignments, and progress. It is created before reviewers need to be ready.

Each plan contains one or more independent rounds. Every round has:

- Name
- Open and close dates
- Reviewer pool
- Scorecard
- Numeric, dropdown, and free-text criteria
- Optional criterion weights
- Reviewer instructions
- Required human reviews per proposal
- Capacity and assignment policy
- Blind review switch
- Reminder policy

Default plan:

- Initial Screening: one human reviewer per proposal
- Final Review: two human reviewers per shortlisted proposal

The organizer may configure one to three human reviews per proposal. The Program Advisor recommends a plan using proposal count, confirmed reviewer capacity, estimated minutes per review, deadline, number of rounds, and selection stakes. The recommendation never activates without organizer approval.

### 6.9 Reviewer recruitment

Reviewers can enter through either path:

#### Direct invitation

- Organizer adds an individual email, pastes a list, or imports CSV.
- Organizer previews and edits the invitation.
- Reviewer opens an email-bound magic link.

#### Shareable Reviewer join link

- Organizer creates a round-specific or event-specific Reviewer join link.
- The link may be pasted into Slack, a committee channel, or a private message.
- The visitor enters an email and receives a one-time magic link to verify the address.
- Reviewer domains do not need to match organizer domains.
- The verified person joins the reviewer pool as **Onboarding incomplete**, with no proposal access.
- The link is revocable and may have an expiration or use limit.

A leaked Reviewer join link cannot expose proposals because joining the pool does not create assignments.

### 6.10 Reviewer onboarding

The onboarding form collects:

- Name
- Organization and title
- Event tracks of expertise
- Freeform expertise topics
- Self-assessed expertise strength where useful
- Maximum review capacity for the round
- Availability and deadline acknowledgment
- Known conflict-of-interest disclosures
- Review-policy acknowledgment

Expertise can be reused across future events. Capacity and availability are always round-specific. Organizers can correct or override both.

Reviewer lifecycle:

`Invited/Joined -> Opened -> Onboarding incomplete -> Ready -> Assigned -> Reviewing -> Complete`

The reviewer invitation provides an estimated workload. The assignment notification provides the exact number and deadline after activation.

### 6.11 Assignment model

The review plan and the Ready section are complementary, not competing flows.

#### Initial allocation

1. Organizer creates the plan and opens reviewer recruitment.
2. Reviewers complete onboarding and move to Ready.
3. The system shows total required work, confirmed capacity, expertise coverage, and any shortfall.
4. The Program Advisor recommends round structure and assignment targets.
5. The deterministic allocator proposes assignments.
6. The organizer previews and activates the batch.

#### Incremental allocation

When another reviewer becomes Ready after the plan is active:

- A row action, **Assign work**, proposes the best open assignments for that reviewer up to their capacity.
- A plan-level action, **Assign ready reviewers**, fills all remaining open review slots using every unassigned Ready reviewer.
- The preview explains expertise match, load, and exclusions before the organizer commits.
- Existing in-progress or completed assignments are never moved.
- An optional **Rebalance unstarted work** action may move only untouched assignments and requires explicit approval.

Assignment priorities:

1. Exclude conflicts, ineligible reviewers, and unavailable reviewers.
2. Satisfy required proposal coverage.
3. Maximize expertise alignment.
4. Respect stated reviewer capacity.
5. Balance load proportionally to capacity, keeping comparable reviewers within one assignment where feasible.
6. Use a deterministic tie-break so repeated runs are explainable.

The AI may classify expertise and recommend a plan. Deterministic rules make the assignments.

### 6.12 Reviewer experience

The Reviewer portal opens on **My Reviews** and contains exactly the assigned proposals for the active round.

Reviewers can:

- See assignment count, deadline, and progress
- Open only assigned proposals
- Complete the configured scorecard
- Save a draft review
- Submit and reopen their stored review where allowed
- Declare a conflict or recuse from a single proposal
- See reminders and completion state

A recused proposal returns to the assignment pool. The system recommends a replacement, but the organizer approves reassignment.

### 6.13 Blind review and AI research

The product does not need three elaborate research modes. Every round has a single **Blind review** switch:

- Off: assigned reviewers can see submitted information and the separately labeled AI Research & Context.
- On: reviewers cannot see speaker identity or AI research; Owners, Admins, and Organizers retain access.

AI research is visible only to Owners, Admins, Organizers, and assigned Reviewers when the round is not blind. It is never visible to speakers, applicants, public viewers, or unrelated reviewers.

Research briefs must:

- Cite sources
- Show when information was retrieved
- Mark stale, missing, or conflicting information
- Separate facts from inference
- Avoid protected-trait inference
- Avoid follower counts or popularity as a quality proxy
- Never modify the submitted proposal

### 6.14 Configurable Program Advisor

The AI feature is called **Program Advisor**. Its starting persona adapts to the event type:

- Academic program committee chair
- Technical or AI conference curator
- Industry conference content director
- Association education-program director

Event settings include:

- Advisor name and persona
- Event goals
- Audience
- Themes and tracks
- Selection philosophy
- Desired subject-matter and format mix
- Required qualities
- Avoidances
- Editable evaluation instructions
- Advanced prompt editor

The organizer may generate a starting configuration from the event brief and edit it. A platform-controlled integrity layer remains fixed so the Advisor must cite evidence, distinguish AI from human judgment, avoid demographic inference, and remain advisory.

Per proposal, the default surface is concise:

- Recommended disposition
- Confidence
- Two or three evidence-backed reasons
- Main concern or disagreement
- Link to detailed analysis

The detailed view adds source evidence, counterarguments, reviewer agreement/disagreement, missing information, portfolio fit, and an optional decision brief. The final decision always belongs to an authorized human, and human overrides persist.

Across the program, the Advisor may surface track gaps, duplicate subjects, audience-level imbalance, score outliers, and reviewer calibration issues.

### 6.15 Decisions and acceptance handoff

Organizers can accept, reject, waitlist, or return a proposal for changes. Decision actions support previewable, recipient-specific email communication.

Acceptance creates a draft Session carrying:

- Title and description
- Track and format
- Participants and roles
- Approved content fields
- Proposal and review history link
- Speaker onboarding status
- Scheduling status

The organizer may edit the session without silently rewriting the applicant's original proposal.

### 6.16 Speaker onboarding

Accepted speakers receive an editable invitation with a passwordless portal link. Their portal supports:

- Profile and biography updates
- Headshot and deliverable uploads
- Session information
- Assigned tasks and due dates
- Task completion
- Automated reminders
- Schedule information after publication

Speaker changes must round-trip back to the organizer and, after approval where required, to public surfaces.

### 6.17 Session and schedule management

Accepted proposals appear as draft Sessions in an unscheduled tray. Direct Invitation sessions may be created separately.

The schedule workspace uses:

- Event days as tabs
- Rooms as columns
- Time as the vertical axis
- Configurable time increments, defaulting to 30 minutes
- Drag-and-drop movement
- Drag-to-resize duration
- Search and filters
- An unscheduled-session tray
- Automatic draft saving with visible saved state

The schedule has two simultaneous states:

- **Working draft:** receives organizer edits and is never public.
- **Published revision:** remains public until another revision is deliberately published.

Editing a published schedule creates unpublished changes. Publishing creates a new immutable revision and records the actor and timestamp.

Hard publication checks:

- Room overlap
- Speaker overlap
- Session outside event hours
- Missing required public information

An Admin or authorized Organizer may override a blocking issue after entering a reason. The override remains visible in history.

**Lock session** freezes a fixed session, such as a keynote, against accidental movement or resizing. Unlocking requires confirmation and is recorded.

### 6.18 Communications

Communications use a provider-neutral internal model, with Resend as the first delivery provider.

Required event-level templates:

- Submitter confirmation
- Internal new-submission notification
- Reviewer invitation
- Reviewer assignments ready
- Reviewer reminder
- Speaker invitation
- Acceptance, rejection, and waitlist
- Speaker task reminder
- Schedule published or changed

Automatic messages have editable templates, previews, test sends, and enable/disable state. Deliberate messages have exact recipient previews, merged variables, recipient counts, exclusions, send-now/schedule controls, and a final approval step.

New-submission internal notifications support:

- Immediate
- Daily digest
- Off

Recipients are selected explicitly rather than defaulting to every workspace member.

Schedule-change emails are drafted from the affected sessions but always require organizer preview and approval. No email is silently sent because a card moved.

Every communication records template version, sender, recipient, related record, send time, provider state, delivery events, and failures.

### 6.19 Bulk operations and data portability

Required bulk actions include:

- CSV proposal and speaker import
- CSV/XLSX review-results export
- Bulk reviewer invitation
- Bulk assignment and reminder
- Bulk status change
- Bulk tag or track update
- Bulk email with preview
- Bulk export

Bulk actions display scope and affected record counts before committing.

### 6.20 External feedback

An organizer may create a recipient-bound, expiring, revocable share for a proposal or session. The external guest sees a read-only snapshot and may comment if enabled. Guest comments remain distinct from formal reviewer scorecards.

### 6.21 Public site, widgets, and embeds

The canonical event data powers five public components:

1. Sessions List
2. Speakers List
3. Agenda
4. Schedule Itinerary with personal schedule and iCal
5. Speaker Gallery

The same components can be delivered through:

- A complete hosted event-program site
- Individual script or iframe embeds
- Direct share URLs
- JSON feeds
- iCal feeds

The **Instant Event Site** is a modular composer, not a freeform website builder. Organizers can:

- Upload a logo
- Set colors and typography
- Edit introductory and footer copy
- Reorder sections
- Toggle components
- Preview desktop and mobile surfaces
- Publish the site

The embed builder lets organizers choose component type, output format, branding, content filters, visible fields, and enable/disable state. Saved embeds retain a name and retrievable code or feed URL.

Organizer edits propagate from the canonical session and speaker records to every public surface without duplicating data.

### 6.22 API-first publishing

The application and public components consume the same API.

Public read access covers:

- Events
- Published sessions
- Published speakers
- Tracks, rooms, and formats
- Agenda
- Public files
- Update timestamps

Authenticated access covers:

- Proposals
- Review plans, rounds, pools, and assignments
- Reviews and decisions
- Speaker tasks
- Draft sessions and schedule revisions
- Communications

The API should have documented schemas, pagination, filters, CORS, API keys, permission scopes, webhooks, and JSON/iCal outputs. An MCP adapter is a later layer over the API, not a replacement for it.

### 6.23 Multi-event isolation and auditability

An organization may manage several events. Every proposal, reviewer pool, assignment, session, schedule, template, public component, and API credential is scoped to an event unless deliberately defined as an organization-level default.

Users cannot infer or access records from events outside their role scope. Audit history records authentication, membership, transitions, assignments, decisions, overrides, publications, and communications.

## 7. Deadline Scope

### Must prove

- Real persistence and multi-event isolation
- Demo Mode with role-scoped personas
- Proposal form, applicant portal, organizer list, and detail
- Reviewer join link, onboarding, plan, two distinct rounds, scorecards, assignment scoping, review completion, and aggregates
- AI score/reasoning visibly distinct from human reviews, with human override
- Decision and accepted-proposal-to-session handoff
- Speaker profile/task round-trip
- Draft and published schedule states with drag, resize, conflicts, and a public agenda
- All five non-admin public components
- Retrievable embed/share output and cross-surface consistency
- Editable communication previews and logged message state
- CSV/XLSX import/export where evaluated

### Differentiators if the core is healthy

- Capacity-aware incremental reviewer assignment
- Source-cited speaker research
- Configurable Program Advisor
- Instant Event Site composer
- External read-only feedback links
- Advanced bulk operations

### Explicitly defer

- Full speaker CRM
- Sponsor-sales pipeline
- Payments
- Autonomous acceptance or rejection
- Popularity-based speaker scoring
- Freeform website canvas
- Direct Google or Outlook calendar writes
- Multiple production email providers beyond the provider-neutral boundary
- MCP until the REST API and widgets are stable

## 8. Judge Journey

A judge should be able to complete this story without documentation:

1. Enter Demo Mode as Organizer.
2. Inspect the CFP and proposal list.
3. Copy a Reviewer join link.
4. Switch to Reviewer, join, complete onboarding, and become Ready.
5. Switch to Organizer and use **Assign ready reviewers**.
6. Switch to Reviewer and see only the assigned proposal.
7. Complete and submit the scorecard.
8. Switch to Organizer and inspect the aggregate, AI recommendation, and record history.
9. Accept the proposal and see the draft Session appear.
10. Switch to Speaker and complete a profile/task update.
11. Switch to Organizer and see the update, place the session, resize it, resolve or override a conflict, and publish a schedule revision.
12. Open the public site and confirm the same session and speaker data appear across the agenda, lists, gallery, itinerary, and generated embed.

The journey should show persisted confirmations at every handoff.

## 9. Acceptance Principles

- **Round-trip:** A saved change is visible after reload and from the next authorized role.
- **Rule:** Invalid state transitions and conflicts are blocked or explicitly overridden.
- **Scoping:** Every role sees exactly the intended records and nothing else.
- **Handoff:** Accepted, approved, scheduled, and published records retain consistent data.
- **Judgeability:** Entry points, personas, seeded records, and success confirmations are obvious.
- **Human authority:** AI suggests; authorized humans decide and can override.
- **Provenance:** Submitted, researched, reviewed, and edited information remain visibly distinct.
- **Operational honesty:** Demo data is labeled, communications are logged accurately, and no public claim implies unvalidated demand.

## 10. Open Questions

These do not block the product definition but must be resolved during implementation:

- Final public product name and domain
- Exact email provider credentials and sender domain
- Whether approved organizer domains require DNS verification or Owner attestation for the competition build
- AI research provider, cost ceiling, timeouts, and source policy
- Hosting, database, file-storage, and deployment choices
- Which Organizer permission can publish schedules and override blocking conflicts by default
- Reviewer join-link default expiration and use limit

## 11. What I Noticed About How You Think

- You repeatedly make hidden state visible: "some of them are going to be drafts and then you lock it in" became a working draft and published revision model.
- You remove administrative toil through controlled self-service: "a link to join so then they can just share that in their Slack" led to domain-bound organizer joining and verified Reviewer join links.
- You care about fairness as a system property: "make sure everyone has an even amount" became capacity-aware allocation with visible workload projections.
- You want AI to add judgment without laundering its output into human input: "separate what's the submitted information versus the AI powered information" became a core provenance rule.

## 12. One More Thing

Reviewer recruitment and capacity planning may be the strongest standalone wedge hiding inside the broader SessionBoard clone. A private link that turns an ad hoc committee into verified, expertise-tagged, capacity-aware reviewers—and then fills open work without rebuilding a spreadsheet—solves an immediate coordination problem even before the rest of the event platform is adopted. If Program Desk survives beyond the competition, this is the first workflow to test independently with real program teams.
