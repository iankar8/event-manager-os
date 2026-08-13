import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

import { chromium } from "playwright";

const baseURL = process.env.PROGRAM_DESK_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const browserErrors = [];
function captureErrors(target) {
  target.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
  });
  target.on("pageerror", (error) => browserErrors.push(error.message));
}
captureErrors(page);

await mkdir("docs/qa", { recursive: true });

try {
  await page.goto(`${baseURL}/demo`);
  await page.getByRole("heading", { name: "Program command center" }).waitFor();
  await page.screenshot({ path: "docs/qa/2026-08-11-workbench-desktop-real.png", fullPage: true });
  assert.equal(await page.getByRole("button", { name: "Proposals", exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Desktop workspace must not overflow horizontally");
  const organizerProposals = await page.evaluate(async () => {
    const response = await fetch("/api/proposals");
    return response.json();
  });
  const unassignedProposal = organizerProposals.proposals.find((proposal) => proposal.title.startsWith("Docs That Answer Back"));
  assert.ok(unassignedProposal, "Organizer should see the unassigned fixture proposal");

  // The lifecycle trace is the first thing a reader sees, so it has to be derived
  // from persisted rows rather than asserted by the UI.
  const traceResponse = await page.evaluate(async () => (await fetch("/api/context/trace")).json());
  const traceStages = traceResponse.trace.stages;
  assert.equal(traceStages.length, 7, "The trace must cover all seven lifecycle stages");
  assert.equal(traceStages.every((stage) => stage.complete), true,
    `Every stage of the canonical record must carry persisted evidence: ${JSON.stringify(traceStages.filter((stage) => !stage.complete))}`);
  assert.equal(traceStages.every((stage) => stage.receiptId && stage.actorName && stage.occurredAt), true,
    "Each recorded stage must cite a real row id, an actor, and a timestamp");
  const traceTimestamps = traceStages.map((stage) => Date.parse(stage.occurredAt));
  assert.deepEqual(traceTimestamps, [...traceTimestamps].sort((a, b) => a - b),
    "Lifecycle evidence must be chronologically ordered, not stamped at one instant");
  const reviewedStage = traceStages.find((stage) => stage.key === "reviewed");
  assert.ok(reviewedStage.receiptId, "The published record must have a submitted review behind its acceptance");
  const proposalIdsInTrace = new Set(traceStages.map((stage) => stage.receiptId));
  assert.equal(proposalIdsInTrace.has(unassignedProposal.id), false,
    "The trace must not mix in records from a different proposal");

  const organizerSections = new Set(["proposals", "reviews", "people", "resources", "tasks", "content", "schedule", "communications", "integrations", "publish", "settings"]);
  assert.deepEqual(traceStages.map((stage) => stage.section).filter((section) => !organizerSections.has(section)), [],
    "Every trace stage must point at a real organizer surface");
  await page.getByRole("tab", { name: /Onboarding/ }).click();
  await page.getByRole("button", { name: /Open Deliverables/ }).click();
  await page.getByRole("heading", { name: "Deliverables pipeline" }).waitFor();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("heading", { name: "Program command center" }).waitFor();

  const otherDemoContext = await browser.newContext();
  const otherDemoPage = await otherDemoContext.newPage();
  await otherDemoPage.goto(`${baseURL}/demo`);
  await otherDemoPage.getByRole("heading", { name: "Program command center" }).waitFor();
  const otherTrace = await otherDemoPage.evaluate(async () => (await fetch("/api/context/trace")).json());
  assert.notEqual(otherTrace.trace.proposalId, traceResponse.trace.proposalId,
    "Each isolated demo event must trace its own proposal");
  assert.deepEqual(otherTrace.trace.stages.map((stage) => stage.receiptId).filter((id) => proposalIdsInTrace.has(id)), [],
    "A trace must never expose row ids belonging to another event");
  await otherDemoContext.close();
  const formSetup = await page.evaluate(async () => {
    const [workspaceResponse, fieldResponse] = await Promise.all([
      fetch("/api/context"),
      fetch("/api/publishing/cfp/fields", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        label: "Target audience outcome", fieldType: "short_text", required: true, options: [],
        helpText: "What will attendees do differently?", conditionFieldKey: null, conditionValue: null,
      }) }),
    ]);
    return { workspace: await workspaceResponse.json(), field: { status: fieldResponse.status, body: await fieldResponse.json() } };
  });
  assert.equal(formSetup.field.status, 200, `Organizer should be able to add a custom CFP field: ${JSON.stringify(formSetup.field.body)}`);
  const demoSlug = formSetup.workspace.session.eventSlug;

  // The public call for speakers must open empty. It previously arrived carrying a
  // seeded proposal's title and another speaker's bio, which reads to a reader as
  // one submitter's content leaking to anonymous visitors.
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto(`${baseURL}/events/${demoSlug}/cfp`);
  await anonPage.getByRole("heading", { name: /Bring the talk only you can give/ }).waitFor();
  const prefilled = await anonPage.evaluate(() => [...document.querySelectorAll(".public-form input, .public-form textarea")]
    .map((el) => el.value).filter((value) => value.trim().length > 0));
  assert.deepEqual(prefilled, [], `The anonymous submission form must open empty, got: ${JSON.stringify(prefilled)}`);
  await anonContext.close();

  const publicApi = await context.request.get(`${baseURL}/api/v1/events/${demoSlug}/sessions`);
  assert.equal(publicApi.status(), 200, "The documented public API must serve the published event without a session cookie");
  const publicApiBody = await publicApi.json();
  assert.equal(publicApiBody.data.length, 1, "The public API must expose only the approved session in the published revision");
  assert.equal(publicApiBody.data[0].speaker_names[0], "Priya Raman", "Public API speaker data must come from the canonical session record");
  const missingPublicEvent = await context.request.get(`${baseURL}/api/v1/events/not-this-event/sessions`);
  assert.equal(missingPublicEvent.status(), 404, "A public API slug must never fall through to another event");
  const openapi = await context.request.get(`${baseURL}/api/v1/openapi.json`);
  assert.equal(openapi.status(), 200, "The versioned API contract must be directly discoverable");

  const integration = await page.evaluate(async () => {
    const json = { "content-type": "application/json" };
    const connect = await fetch("/api/integrations/accelevents/connection", { method: "PUT", headers: json,
      body: JSON.stringify({ eventUrl: "devflow-conf-sandbox", eventId: "1001", sessionTypeFormat: "IN_PERSON" }) });
    const preview = await fetch("/api/integrations/accelevents/preview", { method: "POST", headers: json, body: "{}" });
    const previewBody = await preview.json();
    const apply = await fetch(`/api/integrations/accelevents/runs/${previewBody.runId}/apply`, { method: "POST", headers: json,
      body: JSON.stringify({ confirm: true }) });
    const secondPreview = await fetch("/api/integrations/accelevents/preview", { method: "POST", headers: json, body: "{}" });
    return { connect: { status: connect.status, body: await connect.json() },
      preview: { status: preview.status, body: previewBody }, apply: { status: apply.status, body: await apply.json() },
      secondPreview: { status: secondPreview.status, body: await secondPreview.json() } };
  });
  assert.equal(integration.connect.status, 200, `Organizer should connect an Accelevents target: ${JSON.stringify(integration.connect.body)}`);
  assert.equal(integration.preview.status, 201, "Accelevents preview should persist before any apply step");
  assert.deepEqual(integration.preview.body.summary, { creates: 2, updates: 0, skips: 0, warnings: 0, applied: 0, failed: 0 },
    "The first preview should show one speaker and one session create");
  assert.equal(integration.apply.status, 200, "Explicitly approved local sync should complete in outbox mode");
  assert.equal(integration.apply.body.deliveryMode, "outbox", "Local verification must never claim an external Accelevents mutation");
  assert.deepEqual(integration.secondPreview.body.summary, { creates: 0, updates: 0, skips: 2, warnings: 0, applied: 0, failed: 0 },
    "An unchanged repeat sync must produce zero mutations");
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  await page.getByRole("heading", { name: "Accelevents handoff", exact: true }).waitFor();
  assert.match(await page.getByText("No-ops", { exact: true }).locator("..").innerText(), /2\s+No-ops/,
    "The organizer UI should expose the unchanged Accelevents receipt");

  const resourceBoundary = await page.evaluate(async () => {
    const before = await (await fetch("/api/speaker-resources")).json();
    const priya = before.scopes.speakers.find((speaker) => speaker.name === "Priya Raman");
    const permitted = await fetch("/api/speaker-resources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      title: "Priya production room", summary: "Private stage and recording notes for Priya.",
      body: "Join the production room fifteen minutes before the session begins.", status: "published",
      scopeType: "speaker", scopeId: priya.id, sortOrder: 40,
      linkLabel: "Open production checklist", linkUrl: "https://example.com/devflow-production-checklist",
      embedHtml: '<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE" title="AV rehearsal example"></iframe>',
    }) });
    const unsafe = await fetch("/api/speaker-resources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      title: "Unsafe resource", summary: "Must not persist.", body: "Rejected content.", status: "published",
      scopeType: "all", scopeId: null, sortOrder: 50, linkLabel: "", linkUrl: "",
      embedHtml: '<script>window.parent.postMessage("unsafe", "*")</script>',
    }) });
    const after = await (await fetch("/api/speaker-resources")).json();
    return { before, permitted: { status: permitted.status, body: await permitted.json() },
      unsafe: { status: unsafe.status, body: await unsafe.json() }, after };
  });
  assert.equal(resourceBoundary.before.resources.some((item) => item.title === "DevFlow speaker handbook" && item.scope_type === "all"), true,
    "The seeded event-wide handbook must be available to organizers");
  assert.equal(resourceBoundary.before.resources.some((item) => item.title === "AI track rehearsal notes" && item.scope_type === "session"), true,
    "The seeded session resource must preserve its scope");
  assert.equal(resourceBoundary.permitted.status, 201, `A permitted embed should persist: ${JSON.stringify(resourceBoundary.permitted.body)}`);
  assert.equal(resourceBoundary.permitted.body.resource.embed_url, "https://www.youtube.com/embed/M7lc1UVf-VE",
    "Permitted iframe HTML must be normalized to a validated URL before storage");
  assert.equal(resourceBoundary.unsafe.status, 400, "An unsafe script embed must be rejected");
  assert.match(String(resourceBoundary.unsafe.body.error), /iframe|unsafe|supported/i, "Unsafe embed rejection must explain the boundary");
  assert.equal(resourceBoundary.after.resources.some((item) => item.title === "Unsafe resource"), false, "Rejected embed content must never persist");
  assert.equal(resourceBoundary.after.resources.some((item) => item.title === "Priya production room"), true, "A resource must survive a fresh read");

  const unrelatedContext = await browser.newContext();
  const unrelatedPage = await unrelatedContext.newPage();
  await unrelatedPage.goto(`${baseURL}/login`);
  await unrelatedPage.getByLabel("Email address").fill("sbek-speaker2@example.com");
  await unrelatedPage.getByLabel("Password").fill("SbekTest!2027-spk2");
  await unrelatedPage.getByRole("button", { name: "Continue to workspace", exact: true }).click();
  await unrelatedPage.getByRole("heading", { name: "My speaker portal", exact: true }).waitFor();
  const unrelatedResources = await unrelatedPage.evaluate(async () => (await fetch("/api/speaker-resources")).json());
  assert.equal(unrelatedResources.resources.some((item) => item.title === "DevFlow speaker handbook"), true,
    "An unrelated speaker must see the event-wide handbook");
  assert.equal(unrelatedResources.resources.some((item) => item.title === "AI track rehearsal notes"), false,
    "An unrelated speaker must not see another speaker's session resource");
  assert.equal(unrelatedResources.resources.some((item) => item.status === "draft"), false, "Speakers must never receive draft resources");
  await unrelatedContext.close();

  await page.getByRole("button", { name: "Reviewer", exact: true }).click();
  await page.getByRole("heading", { name: "My review queue" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "People", exact: true }).count(), 0, "Reviewer must not see organizer navigation");
  assert.match(await page.getByText("1 remaining", { exact: true }).innerText(), /1 remaining/);
  const reviewerData = await page.evaluate(async () => {
    const response = await fetch("/api/reviews");
    return response.json();
  });
  const reviewerBoundaries = await page.evaluate(async (proposalId) => {
    const hidden = await fetch(`/api/proposals/${proposalId}`);
    const sync = await fetch("/api/integrations/accelevents/preview", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const trace = await fetch("/api/context/trace");
    return { hidden: hidden.status, sync: sync.status, trace: trace.status };
  }, unassignedProposal.id);
  assert.equal(reviewerBoundaries.hidden, 404, "Reviewer must not read an unassigned proposal through the API");
  assert.equal(reviewerBoundaries.sync, 403, "Reviewers must not inspect or trigger organizer integration state");
  assert.equal(reviewerBoundaries.trace, 403, "Reviewers must not read the organizer record trace");
  // Select the outstanding assignment explicitly; the queue also holds a completed
  // review, and depending on sort order for the default selection is brittle.
  await page.getByRole("button", { name: /Taming 40-Minute CI/ }).click();
  await page.getByRole("combobox", { name: /Recommendation/ }).selectOption({ label: "Accept" });
  await page.getByRole("textbox", { name: /Comments/ }).fill("Strong practical content and a clear narrative arc; abstract could name the specific tooling used. Recommend accept for the Platform track.");
  await page.getByRole("button", { name: "Submit review", exact: true }).click();
  await page.getByText("0 remaining", { exact: true }).waitFor();
  const resubmission = await page.evaluate(async ({ assignmentId, criteria }) => {
    const values = criteria.map((criterion) => ({ criterionId: criterion.id,
      value: criterion.criterion_type === "numeric" ? 4 : criterion.criterion_type === "dropdown" ? "Accept" : "Strong practical content and a clear narrative arc; abstract could name the specific tooling used. Recommend accept for the Platform track." }));
    const response = await fetch(`/api/reviews/assignments/${assignmentId}/submit`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values }),
    });
    return { status: response.status, body: await response.json() };
  }, { assignmentId: reviewerData.assignments.find((item) => String(item.title).startsWith("Taming 40-Minute CI")).id, criteria: reviewerData.criteria });
  assert.equal(resubmission.status, 200, `Review resubmission should update the canonical review: ${JSON.stringify(resubmission.body)}`);

  // A submitted scorecard must read back as what was written. Qualitative answers
  // used to vanish on reload while numeric ones appeared to survive only because
  // they matched the form's default.
  const redisplayed = await page.evaluate(async () => (await fetch("/api/reviews")).json());
  const ciAssignmentId = redisplayed.assignments.find((item) => String(item.title).startsWith("Taming 40-Minute CI")).id;
  const storedValues = (redisplayed.reviewValues ?? []).filter((value) => value.assignment_id === ciAssignmentId);
  assert.equal(storedValues.length > 0, true, "A submitted review must return its stored criterion values");
  assert.equal(storedValues.some((value) => String(value.value_json).includes("Accept")), true,
    "The reviewer's recommendation must survive a reload");
  assert.equal(storedValues.some((value) => String(value.value_json).includes("Strong practical content")), true,
    "The reviewer's written comments must survive a reload");

  await page.getByRole("button", { name: "Organizer", exact: true }).click();
  await page.getByRole("button", { name: "Proposals", exact: true }).click();
  await page.getByRole("row", { name: /Taming 40-Minute CI/ }).click();
  await page.getByText(/Strong practical content and a clear narrative arc/).waitFor();
  await page.getByRole("button", { name: "Accept + hand off", exact: true }).click();
  await page.getByText(/accepted recorded and notification logged/i).waitFor();
  const onboarding = await page.evaluate(async () => {
    const response = await fetch("/api/speakers");
    return response.json();
  });
  const handedOffTasks = onboarding.tasks.filter((task) => String(task.session_title).startsWith("Taming 40-Minute CI"));
  assert.equal(handedOffTasks.length, 10, "Acceptance must create five onboarding tasks for each of the two session participants");
  const roundTripPlan = await page.evaluate(async (proposalId) => {
    const before = await (await fetch("/api/reviews")).json();
    const create = await fetch("/api/reviews/rounds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      planId: before.plans[0].id, name: "Boundary Review", opensAt: "2026-10-16", closesAt: "2026-11-30", requiredReviews: 1, blindReview: true,
      instructions: "Independent blind review.",
    }) });
    const createdBody = await create.json();
    const created = await (await fetch("/api/reviews")).json();
    const round = created.rounds.find((item) => item.name === "Boundary Review");
    const poolBefore = created.poolMembers.filter((item) => item.round_id === round?.id);
    const reviewerId = created.reviewers[0].id;
    const poolResponse = await fetch(`/api/reviews/rounds/${round.id}/reviewers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reviewerId }) });
    const assignmentResponse = await fetch("/api/reviews/assign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roundId: round.id, proposalId, reviewerId }) });
    const after = await (await fetch("/api/reviews")).json();
    return { createStatus: create.status, createdBody, round, poolBefore: poolBefore.length, poolStatus: poolResponse.status,
      assignmentStatus: assignmentResponse.status, after };
  }, unassignedProposal.id);
  assert.equal(roundTripPlan.createStatus, 200, `Independent review round should persist: ${JSON.stringify(roundTripPlan.createdBody)}`);
  assert.equal(roundTripPlan.poolBefore, 0, "A new round must begin with an isolated reviewer pool");
  assert.equal(roundTripPlan.poolStatus, 200, "Organizer should be able to add a reviewer only to the selected round");
  assert.equal(roundTripPlan.assignmentStatus, 200, "Organizer should be able to manually assign a proposal to a reviewer in that round's pool");
  assert.equal(roundTripPlan.after.poolMembers.some((item) => item.round_id === roundTripPlan.round.id), true, "Round-scoped reviewer membership must persist");
  assert.equal(roundTripPlan.after.assignments.some((item) => item.round_id === roundTripPlan.round.id && item.proposal_id === unassignedProposal.id), true, "Manual assignment must persist in the selected round");
  const scheduleRules = await page.evaluate(async () => {
    const schedule = await (await fetch("/api/schedule")).json();
    const ci = schedule.sessions.find((item) => item.title.startsWith("Taming 40-Minute CI"));
    const publishedTalk = schedule.items.find((item) => item.title.startsWith("Your AI Pair Programmer") && item.revision_status === "draft");
    const otherRoom = schedule.rooms.find((item) => item.id !== publishedTalk.room_id);
    const place = async (roomId, startsAt) => {
      const response = await fetch("/api/schedule/place", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        sessionId: ci.id, roomId, startsAt, durationMinutes: 30, locked: false,
      }) });
      return { status: response.status, body: await response.json() };
    };
    const roomConflict = await place(publishedTalk.room_id, "2027-05-12T10:00:00-07:00");
    const speakerConflict = await place(otherRoom.id, "2027-05-12T10:00:00-07:00");
    const placed = await place(otherRoom.id, "2027-05-12T11:00:00-07:00");
    const moved = await place(publishedTalk.room_id, "2027-05-12T12:00:00-07:00");
    const after = await (await fetch("/api/schedule")).json();
    return { roomConflict, speakerConflict, placed, moved, ci, after };
  });
  assert.equal(scheduleRules.roomConflict.status, 409, "Overlapping sessions in one room must be blocked");
  assert.match(String(scheduleRules.roomConflict.body.error), /Room conflict/, "Room conflict must be explained visibly");
  assert.equal(scheduleRules.speakerConflict.status, 409, "A speaker overlap in different rooms must be blocked");
  assert.match(String(scheduleRules.speakerConflict.body.error), /Speaker double-booked/, "Speaker conflict must be explained visibly");
  assert.equal(scheduleRules.placed.status, 200, "An unscheduled session should persist in a conflict-free slot");
  assert.equal(scheduleRules.moved.status, 200, "A scheduled session should move after the conflict is cleared");
  assert.equal(scheduleRules.after.items.some((item) => item.session_id === scheduleRules.ci.id && item.room_name === "Main Stage" && String(item.starts_at).startsWith("2027-05-12T19:00:00")), true, "The moved draft placement must survive a fresh schedule read");

  await page.getByRole("button", { name: "Speaker", exact: true }).click();
  await page.getByRole("heading", { name: "My speaker portal" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "People", exact: true }).count(), 0, "Speaker must not see organizer navigation");
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("Biography").fill("Priya Raman leads build tooling at Latticework Systems. SBEK-PORTAL-BIO-01");
  await page.getByLabel("Profile photo").setInputFiles({
    name: "headshot.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  await page.getByRole("img", { name: "New profile preview" }).waitFor();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByText("Speaker profile saved and versioned.", { exact: true }).waitFor();
  const speakerReadback = await page.evaluate(async () => (await fetch("/api/speakers")).json());
  assert.match(String(speakerReadback.speakers[0].bio), /SBEK-PORTAL-BIO-01/, "Speaker bio must persist after portal save");
  assert.match(String(speakerReadback.speakers[0].headshot_url), /^data:image\/png;base64,/, "Speaker headshot must persist after portal save");
  await page.getByRole("img", { name: "Priya Raman profile" }).waitFor();
  await page.getByRole("button", { name: "Speaker resources", exact: true }).click();
  await page.getByRole("heading", { name: "Resources for your sessions" }).waitFor();
  await page.getByText("DevFlow speaker handbook", { exact: true }).waitFor();
  await page.getByText("AI track rehearsal notes", { exact: true }).waitFor();
  await page.getByText("Priya production room", { exact: true }).waitFor();
  assert.equal(await page.getByText("Main Stage arrival guide", { exact: true }).count(), 0, "Draft resources must stay hidden in the speaker UI");
  const embedDisclosure = page.getByText("Open AV rehearsal example", { exact: true }).first();
  await embedDisclosure.click();
  await page.getByTitle("AV rehearsal example").first().waitFor({ state: "visible" });
  await embedDisclosure.click();
  await page.screenshot({ path: "docs/qa/2026-08-12-speaker-resources.png", fullPage: true });
  const submissionPage = await context.newPage();
  captureErrors(submissionPage);
  await submissionPage.goto(`${baseURL}/events/${demoSlug}/cfp`);
  await submissionPage.getByLabel(/Session title/).fill("Boundary-Safe Program Operations");
  await submissionPage.getByLabel(/Abstract/).fill("A practical account of keeping one program record intact across review, onboarding, scheduling, and public publishing.");
  await submissionPage.getByLabel(/Track/).selectOption({ index: 1 });
  await submissionPage.getByLabel(/Session format/).selectOption({ label: "Talk (30 min)" });
  await submissionPage.getByLabel(/Audience level/).selectOption({ label: "Intermediate" });
  await submissionPage.getByLabel(/Speaker bio/).fill("Platform engineer who has run program operations for three community conferences.");
  await submissionPage.getByLabel(/Key takeaway/).fill("Treat handoffs as testable data contracts.");
  await submissionPage.getByLabel(/Target audience outcome/).fill("Attendees can audit every program transition.");
  // A speaker must be able to name their own co-presenter; the association could
  // previously only originate from seed data or the organizer side.
  await submissionPage.getByRole("button", { name: "Add a co-presenter", exact: true }).click();
  await submissionPage.getByRole("group", { name: "Co-presenters" }).getByLabel("Name").fill("Dana Whitlock");
  await submissionPage.getByRole("group", { name: "Co-presenters" }).getByLabel("Email").fill("dana.whitlock@example.com");
  await submissionPage.getByRole("button", { name: "Submit proposal", exact: true }).click();
  await submissionPage.getByText("Proposal submitted. A confirmation email has been logged.", { exact: true }).waitFor();
  await submissionPage.close();

  // The bio on the submission form is read on submit rather than discarded, but a
  // returning speaker's curated profile is authoritative and must survive it.
  const bioReadback = await page.evaluate(async () => (await fetch("/api/speakers")).json());
  assert.match(String(bioReadback.speakers[0].bio), /SBEK-PORTAL-BIO-01/,
    "A new submission must not overwrite a speaker's existing profile bio");

  const coSpeakerReadback = await page.evaluate(async () => {
    const list = await (await fetch("/api/proposals")).json();
    const created = list.proposals.find((item) => item.title === "Boundary-Safe Program Operations");
    return created ? (await (await fetch(`/api/proposals/${created.id}`)).json()) : null;
  });
  assert.ok(coSpeakerReadback, "The submitted proposal should be readable back");
  const names = coSpeakerReadback.participants.map((person) => person.name);
  assert.equal(names.includes("Dana Whitlock"), true,
    `A speaker-named co-presenter must reach the proposal record, got: ${JSON.stringify(names)}`);
  assert.equal(coSpeakerReadback.participants.filter((person) => person.is_primary).length, 1,
    "Adding a co-presenter must not disturb the primary speaker");
  const slideTask = speakerReadback.tasks.find((task) => task.title === "Upload final slides" && String(task.session_title).startsWith("Your AI Pair Programmer"));
  assert.ok(slideTask, "Speaker should have a session-scoped slide request");
  for (const version of [1, 2]) {
    const uploadStatus = await page.evaluate(async ({ taskId, fileVersion }) => {
      const data = new FormData();
      data.append("file", new File([`%PDF-1.4 Event Manager OS fixture version ${fileVersion}`], `slides-v${fileVersion}.pdf`, { type: "application/pdf" }));
      return (await fetch(`/api/speakers/tasks/${taskId}/upload`, { method: "POST", body: data })).status;
    }, { taskId: slideTask.id, fileVersion: version });
    assert.equal(uploadStatus, 200, `Deliverable upload version ${version} should succeed`);
  }
  const versionedFiles = await page.evaluate(async () => (await fetch("/api/speakers")).json());
  const taskVersions = versionedFiles.files.filter((file) => file.task_id === slideTask.id);
  assert.equal(taskVersions.length, 2, "Re-uploading a deliverable should retain two file versions");
  assert.equal(taskVersions.filter((file) => file.is_latest === 1).length, 1, "Exactly one deliverable version should be latest");
  const latestFile = taskVersions.find((file) => file.is_latest === 1);
  const commentResult = await page.evaluate(async (fileId) => {
    const response = await fetch(`/api/speakers/files/${fileId}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "Production review: title slide is ready; retain both versions." }) });
    return { status: response.status, body: await response.json() };
  }, latestFile.id);
  assert.equal(commentResult.status, 200, `Speaker file comment should persist: ${JSON.stringify(commentResult.body)}`);
  await page.getByRole("button", { name: "Tasks & files", exact: true }).click();
  await page.getByText("Upload final slides", { exact: true }).first().waitFor();

  await page.getByRole("button", { name: "Organizer", exact: true }).click();
  await page.getByRole("heading", { name: "Program command center" }).waitFor();
  const customRoundTrip = await page.evaluate(async () => {
    const list = await (await fetch("/api/proposals")).json();
    const proposal = list.proposals.find((item) => item.title === "Boundary-Safe Program Operations");
    const detail = proposal ? await (await fetch(`/api/proposals/${proposal.id}`)).json() : null;
    return { proposal, detail };
  });
  assert.ok(customRoundTrip.proposal, "Custom-field submission should appear in the organizer list");
  assert.equal(JSON.parse(customRoundTrip.detail.answers[0].value_json), "Attendees can audit every program transition.", "Custom CFP answer must round-trip to the organizer record");
  const organizerFiles = await page.evaluate(async () => (await fetch("/api/speakers")).json());
  assert.equal(organizerFiles.comments.some((comment) => comment.body.includes("retain both versions") && comment.author_name === "Priya Raman"), true, "File comments must cross the speaker-to-organizer boundary with attribution");
  const rosterOperations = await page.evaluate(async (priyaId) => {
    const create = await fetch("/api/speakers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      name: "Avery Chen", email: "avery.chen@sbek-test.example.com", title: "Engineering Director", company: "Helix Systems", bio: "Avery leads engineering systems.",
    }) });
    const created = await create.json();
    const invite = await fetch(`/api/speakers/${created.speakerId}/invite`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const inviteBody = await invite.json();
    const update = await fetch(`/api/speakers/${priyaId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflowStatus: "confirmed", organizerNote: "Ready for production review." }) });
    const roster = await (await fetch("/api/speakers")).json();
    const publishing = await (await fetch("/api/publishing")).json();
    return { createStatus: create.status, created, inviteStatus: invite.status, inviteBody, updateStatus: update.status, roster, publishing };
  }, organizerFiles.speakers.find((speaker) => speaker.name === "Priya Raman").id);
  assert.equal(rosterOperations.createStatus, 201, "Organizer should be able to add a speaker manually");
  assert.equal(rosterOperations.inviteStatus, 200, "Organizer should be able to invite the new speaker to a portal");
  assert.match(String(rosterOperations.inviteBody.portalUrl), /^\/api\/auth\/magic\//, "Speaker invite should contain a passwordless magic link");
  assert.equal(rosterOperations.roster.speakers.find((speaker) => speaker.name === "Priya Raman").workflow_status, "confirmed", "Speaker workflow status must persist");
  assert.equal(rosterOperations.publishing.communications.some((item) => item.related_type === "speaker_invitation" && item.recipient_email === "avery.chen@sbek-test.example.com"), true, "Speaker invitation must be logged in the outbox");
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByRole("button", { name: /Priya Raman.*Latticework Systems/ }).click();
  await page.getByText(/SBEK-PORTAL-BIO-01/).waitFor();
  await page.getByRole("img", { name: "Priya Raman profile" }).waitFor();
  await page.getByLabel("Filter by workflow status").selectOption("confirmed");
  await page.getByRole("button", { name: /Priya Raman.*Latticework Systems/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Marcus Okafor/ }).count(), 0, "Confirmed-status filter should hide non-matching speakers");

  // A broadcast must be composed and previewed, never fired on click with
  // hard-coded copy the organizer never saw.
  const outboxBefore = await page.evaluate(async () => (await (await fetch("/api/publishing")).json()).communications.length);
  await page.getByRole("button", { name: "Email filtered", exact: true }).click();
  await page.getByRole("heading", { name: /recipient/ }).waitFor();
  assert.equal(await page.evaluate(async () => (await (await fetch("/api/publishing")).json()).communications.length), outboxBefore,
    "Opening the compose step must not queue anything on its own");
  await page.getByLabel("Subject").fill("Your {speaker_name} session logistics");
  await page.getByLabel("Message").fill("Hi {speaker_name}, here is what we need before the event.");
  await page.getByText("Your Priya Raman session logistics", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^Queue \d+ message/ }).click();
  const broadcast = await page.evaluate(async () => (await (await fetch("/api/publishing")).json()).communications
    .filter((item) => item.related_type === "speaker_broadcast"));
  assert.equal(broadcast.length > 0, true, "Queued broadcast must reach the outbox");
  assert.equal(broadcast.every((item) => !String(item.subject).includes("{speaker_name}")), true,
    "Merge fields must be rendered per recipient, not queued literally");

  const publicPage = await context.newPage();
  captureErrors(publicPage);
  await publicPage.goto(`${baseURL}/events/devflow-conf-2027/cfp`);
  await publicPage.getByRole("heading", { name: "Bring the talk only you can give." }).waitFor();
  await publicPage.getByLabel(/Session format/).selectOption({ label: "Workshop (120 min)" });
  await publicPage.getByLabel(/Workshop prerequisites/).waitFor();
  await publicPage.getByLabel(/Session format/).selectOption({ label: "Talk (30 min)" });
  assert.equal(await publicPage.getByLabel(/Workshop prerequisites/).count(), 0, "Conditional workshop field should hide for a talk");
  assert.equal(await publicPage.locator("form.public-form").evaluate((form) => form.checkValidity()), false, "Required public form fields must block empty submission");
  await publicPage.goto(`${baseURL}/events/devflow-conf-2027/agenda`);
  await publicPage.getByRole("heading", { name: "The program, room by room." }).waitFor();
  await publicPage.getByText("Your AI Pair Programmer Is Lying to You: Verification Patterns That Scale", { exact: true }).waitFor();
  await publicPage.screenshot({ path: "docs/qa/2026-08-11-public-agenda-real.png", fullPage: true });
  assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Public agenda must not overflow horizontally");
  for (const [surface, heading] of [["sessions", "Ideas worth putting on your calendar."], ["speakers", "Meet the people behind the program."], ["itinerary", "Build your path through DevFlow."], ["gallery", "Meet the people behind the program."]]) {
    await publicPage.goto(`${baseURL}/events/devflow-conf-2027/${surface}`);
    await publicPage.getByRole("heading", { name: heading }).waitFor();
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  captureErrors(mobilePage);
  await mobilePage.goto(`${baseURL}/demo`);
  await mobilePage.getByRole("heading", { name: "Program command center" }).waitFor();
  await mobilePage.screenshot({ path: "docs/qa/2026-08-11-workbench-mobile-real.png", fullPage: false });
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Mobile workspace must not overflow horizontally");
  await mobilePage.getByRole("button", { name: "Open workspace navigation" }).click();
  await mobilePage.getByRole("navigation", { name: "organizer navigation" }).waitFor({ state: "visible" });
  await mobileContext.close();

  // Third-party embeds probe for features our iframe deliberately withholds, and the
  // browser reports the refusal on the console. That message is the sandbox working,
  // not a defect, and widening `allow` to silence it would be the wrong trade.
  const unexpectedErrors = browserErrors.filter((message) => !/status of (?:400|403|404|409)\b/.test(message)
    && !/Permissions policy violation/.test(message));
  assert.deepEqual(unexpectedErrors, [], `Browser console errors: ${unexpectedErrors.join(" | ")}`);
  console.log("Event Manager OS E2E: role scoping, speaker resources, API contract, safe Accelevents round trip, acceptance handoff, public surfaces, and mobile navigation passed.");
} finally {
  await context.close();
  await browser.close();
}
