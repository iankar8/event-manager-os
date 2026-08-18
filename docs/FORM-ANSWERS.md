# Kill My SaaS — form answers (paste-ready)

Two fields need your input before submitting; both are flagged **[CONFIRM]**.

---

## Your Project URL *(required)*

```
https://program-desk.ian-208.workers.dev
```

Source: `https://github.com/iankar8/event-manager-os`

---

## (Optional) Instructions for Testing

They explicitly asked about email/login — this is the highest-value box on the form. Paste:

```
Two ways in, no inbox required:

1. Click "Explore demo" on the landing page — creates an isolated, fully seeded
   event and drops you in as Organizer, with a persona switcher (Organizer /
   Reviewer / Speaker) in the top bar so you can watch one record cross roles.

2. Password sign-in at /login:
   Organizer  sbek-organizer@example.com  SbekTest!2027-org
   Reviewer   sbek-reviewer@example.com   SbekTest!2027-rev
   Speaker    sbek-speaker@example.com    SbekTest!2027-spk
   Co-speaker sbek-speaker2@example.com   SbekTest!2027-spk2

Start on the organizer Overview. The lifecycle trace follows one proposal from
Submitted through Published; click any step and it shows who acted, when, the
rule the server enforced, and the database row id that is the receipt for that
claim — then links to the surface holding that record. Nothing on that panel is
asserted by the UI; it is read back from persisted rows through an
organizer-scoped, event-scoped endpoint, and a stage with no evidence reports
itself as unrecorded rather than filling itself in.

ON EMAIL — you asked, so plainly: this ships with no credentials of its own.
Every message is written to an outbox as a receipt, and by default nothing
leaves the system. Delivery is bring-your-own-key: paste a Resend key in
Settings -> Email delivery, and decision notifications and speaker broadcasts
genuinely deliver, each carrying that speaker's published schedule as an .ics
attachment. The receipt then records "delivered" with the provider's message id,
or "failed" — truthfully, either way. There is a "Send myself a test" button
that only ever mails the signed-in organizer.

Also worth clicking: Schedule (drag a session onto an occupied room/time — the
placement is refused with a specific conflict, and an override requires a
written reason), Publish (five attendee surfaces + embeds; the track filter you
set actually applies to the generated embed), and /api/v1/openapi.json.
```

---

## Which coding agent did you primarily utilize?

Recommended ticks:

| Agent | Planning | Computer Use | Normal Coding | Review | Bugfixing |
|---|---|---|---|---|---|
| **Codex** | X | X | X | | X |
| **Claude Code** | X | X | X | X | X |

Codex did the product build (spec through deployed app). Claude Code did the
final push: the lifecycle trace, defect fixes, the security audit, and every
verification run. Both drove real browsers (Playwright) for verification, hence
Computer Use on both.

## Comments on coding agent choice/performance *(required)*

```
Codex built the product over two days — spec, data model, cross-role workflows,
deployment. It was strongest with an explicit approval gate between planning and
implementation: it would produce a written spec, stop, and refuse to start until
I approved. That discipline is why the schema held up.

I moved to Claude Code for the last day when I ran out of Codex credits, via a
handoff doc Codex wrote. That handoff turned out to be the interesting failure:
it described the Accelevents integration as a "simulation" when a real REST
client was sitting in the repo. Claude Code initially repeated the doc's framing
rather than reading the source, then overcorrected to "implemented against the
live API," which oversold something never run against a live account. The
correct answer took three passes and only landed because I pushed back. The
lesson I'd pass on: an agent inheriting someone else's summary will trust it over
the code unless you force it to verify, and a handoff document is a lossy,
unreliable narrator.

Best single move of the project: having Claude Code run an independent read-only
audit of its own work using a different model. It found four cross-tenant scoping
holes the primary agent had walked past for hours — including a reviewer being
able to edit the proposal they were scoring, because a read check was being used
as a write gate. Agents don't catch their own blind spots; a second one with a
different prior does.
```

---

## Which model did you primarily utilize?

Recommended ticks:

| Model | Planning | Computer Use | Normal Coding | Review | Bugfixing |
|---|---|---|---|---|---|
| **Claude Opus** | X | X | X | X | X |
| **Claude Fable** | | | | X | |
| **Claude Sonnet/Haiku** | | X | | | |
| **[CONFIRM] GPT 5.6 Sol / Terra** | X | | X | | X |

**[CONFIRM #1]** — tick whichever GPT row matches what Codex was actually running
for you. I know Codex did the build; I don't know which model it was on, and I
won't guess on a form.

## Comments on model choice/performance *(required)*

```
Opus did the final day's engineering and verification. Fable ran the independent
audit — read-only, different model deliberately, and it earned its keep: four
cross-tenant scoping holes, plus catching that the deployed build was nine
commits behind the repo while the README instructed judges to click a panel that
did not exist in production. That last one would have sunk the submission on its
own headline claim.

Sonnet and Haiku drove the eval harness (Haiku for a cheap pilot to prove the
loop before spending, Sonnet as browser agent, Opus as judge). Running the
official killmysaas-evals kit against my own deployment was the highest-leverage
thing I did all week — it scored the build, named specific defects with
screenshot evidence, and every one of them was real. The byType breakdown was
more useful than the score: it showed roundtrip at 70% while crud sat at 100%,
which told me exactly where to spend the remaining hours.
```

---

## Estimated financial spend or token usage *(required)*

**[CONFIRM #2]** — check your Anthropic console for the exact API figure. Frame:

```
Two subscriptions plus metered API:

- Codex Pro subscription — the bulk of the product build across two days. One
  logged build phase alone reported ~1.15M tokens in 69 minutes; total across the
  project was several million.
- Claude Max subscription — the full final day, measured from the session
  transcript: 1,104 assistant turns, 836K output tokens, 16.5M cache writes and
  477M cache reads (~495M total, but that headline is mostly cached context
  re-read; 836K output is the number that reflects actual work). Split by model:
  Opus 5 664K output, Fable 5 173K output for the independent audit.
- Anthropic API, metered — roughly $25-35 running the official killmysaas-evals
  harness (Sonnet browser agent + Opus judge, ~20 scenarios across two full runs
  plus a Public Widgets re-run against production).

The API spend is the only line I actually paid per-token for, and it was the best
money in the project — it bought a scored, evidence-cited list of real defects.
```

Upload: screenshot of Anthropic console → Billing → Usage for Aug 12–13.

---

## Process Overview *(required)*

```
I built against your eval kit rather than against SessionBoard's screenshots.

Reading killmysaas-evals first changed the whole plan. The calibration notes say
clones cluster on `exists` and `crud` and fall over on rules, scoping, and
handoffs — so I stopped thinking about feature coverage and picked a thesis:
one record survives every handoff, with proof. Submitted -> Reviewed -> Accepted
-> Onboarding -> Approved -> Scheduled -> Published, enforced at each step.

Day 1-2 (Codex): product spec approved before any code, then the kernel —
Cloudflare Workers + D1, real sessions, event scoping in every query — then the
cross-role workflows, then deploy. I used your DevFlow Conf 2027 fixtures and
sbek-* personas deliberately so your harness would find the values it expects.

Day 3 (Claude Code): the part I'd actually point at. The Overview had a handsome
seven-dot lifecycle that was entirely hard-coded — completion depth was a
literal, the "needs attention" list asserted counts it never computed. It looked
fine and proved nothing. Worse, the seeded data couldn't have backed it: the
published talk had an acceptance decision with no review behind it, and every
timestamp was the same CURRENT_TIMESTAMP, so there was no chronology to show.

So I fixed the fixture to make the story true, then replaced the decoration with
an organizer-scoped endpoint that derives all seven stages from real rows and
reports a stage as unrecorded when the evidence genuinely isn't there.

Then I ran your harness against the deployment and fixed what it found —
including a critical one worth naming: the public submission form arrived
pre-filled with a seeded speaker's title and bio, and the bio field was
uncontrolled, so whatever a speaker typed was silently discarded on submit. The
judge read that as one submitter's data leaking to anonymous visitors. The server
route was always correct; the form was lying. Same species as the hard-coded
Overview, and the reason I spent the day hunting literals posing as data.

Finally an independent read-only audit with a different model, which found four
cross-tenant scoping holes and — more importantly — that production was nine
commits behind the repo while my README told you to click something that wasn't
deployed yet.

Result: ~87% area-weighted across all six required areas, full rubric coverage.
Every defect the harness reported that was fixable in the time was fixed,
redeployed, and verified against production rather than localhost.
```

---

## Notable Additions or Omissions

```
WORTH YOUR TIME
- The lifecycle trace on the organizer Overview. Every step cites the actor,
  timestamp, enforced rule, and the database row id backing it, and links to the
  surface holding that record. If a stage lacks evidence it says so.
- Read-only versioned REST API with a discoverable OpenAPI document at
  /api/v1/openapi.json. You mentioned building sites with AI — this is the
  contract for it, and the five public surfaces read from it.
- Speaker-named co-presenters. Linked by email, so a returning speaker keeps one
  identity across proposals rather than being duplicated.
- Schedule rules that actually refuse: room and speaker collisions are blocked,
  overrides require a written reason and are recorded.
- Bring-your-own-key email with .ics calendar attachments (Settings -> Email
  delivery).

DELIBERATELY SKIPPED — and why
- Speaker CRM. Extra credit, and cross-event scope would have diluted the core
  loop. Skipped on purpose, not missed.
- Airtable persistence. I saw the bonus. Swapping the data layer on the last day
  would have risked the whole build for a small bonus.
- Live Accelevents. The sync is written against their real REST API with stable
  external identities, but it has never been verified against a live account —
  their API requires an Enterprise/White Label plan I don't have. So it runs in
  outbox mode against a deterministic mirror, with receipts, and I say so
  everywhere rather than implying a live integration. Their documented write API
  also has no confirmed speaker-to-session assignment operation; the flow raises
  that as a reconciliation warning instead of claiming a success it can't prove.
- Shipped email credentials. Delivery is real but bring-your-own-key.

Known soft spots, since you're giving feedback: Speaker Management scored lowest
(78%, measured before two of its fixes landed), and the UI is clean and dense but
not Linear-grade — I spent the last day on correctness and provenance instead of
visual polish, and I'd make that trade again.
```

---

## Contact Socials/Email

`ian@iankar.com` (your call whether to add X/LinkedIn)

## Full-time opportunities at AIE

Your call — "Maybe, tell me more" is the low-commitment option given they said
they'd like to actually use this for AIE CODE.
