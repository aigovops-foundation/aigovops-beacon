# Auditor Workshop — 90 minutes, one audit, zero PDF theater

A facilitator's guide to running Beacon with a non-technical audience and walking out with a signed checklist and a pull request.

**Audience:** governance leads, compliance officers, risk managers, board observers, internal auditors. People who own AI risk but don't run terminals.

**Format:** 90 minutes. 6–12 participants. One screen. One Beacon instance. Sticky notes.

**Outcome you commit to:** every participant leaves with (a) an inventory of AI running in their environment, (b) a signed audit checklist, and (c) a pull request open against their governance repo. No "we'll send the materials later." If you can't deliver this, change the agenda or change the room.

---

## Pre-flight (the day before)

| Task | Why it matters |
|---|---|
| Run Beacon locally on the facilitator's laptop. Verify the studio loads. | A failed demo wastes 90 minutes of expensive calendar time. |
| Pre-seed one demo source so Step 2 lights up in <10 seconds. | The "wow" moment is real-time discovery; long blank screens kill it. |
| Print the **field cards** (vendor · model · version · users · receipt) on index cards. | Sticky-note exercise. Tangible beats abstract. |
| Confirm participants can join a wifi network — even if they can't, your laptop is the demo target. | You're not asking them to install anything. |
| Charge two devices. Bring an HDMI/USB-C dongle. | Boring, true. |

---

## Agenda

### 00:00 — 00:05 · Welcome (5 min)
One sentence: *"In 90 minutes, you will have a signed audit checklist of every AI model running in your organization, and the checklist will be running as code."* Skip introductions if everyone knows each other.

### 00:05 — 00:15 · The Gap (10 min)
Show one slide. Three bullets:
- Where AI governance lives today: PDF, meeting, deck.
- Where it needs to live: code, evidence, signed.
- The distance between those is **The Gap**.

Then a single question to the room: *"In your org, what's the current answer to 'what AI models are running where?'"* Time-box to 4 minutes. Capture answers on a flip chart. Don't editorialize.

### 00:15 — 00:25 · Workshop the field cards (10 min)
Hand out the field cards. Three rules:
1. Each card represents one AI model in your environment.
2. Fill in: vendor · model · version · who uses it · what receipt or evidence you have.
3. Stick it on the wall under one of three columns: **Known · Suspected · Unknown**.

This is the exercise that earns the room. People realize how much they don't know. *That* is the problem Beacon solves.

### 00:25 — 00:30 · Switch to Beacon Studio (5 min)
Hand off the laptop. Open Studio. Show the five steps as labels on the wall. *"We're going to do exactly what's on these cards, but Beacon is going to do the looking for us."*

### 00:30 — 00:45 · Step 1 + Step 2 — discovery, live (15 min)
Pick a real source — your domain, your AWS account, the CSV you brought. Do *not* use the pre-seeded demo data unless the live source fails. Real beats canned.

Narrate as the tile board fills:
- Read the vendor and version aloud. *"OpenAI · gpt-4o-2024-08-06 · used 1,840 times this week."*
- Compare to the sticky-note wall. *"This card said we used GPT-4. We actually use GPT-4o. Different model. Different cutoff."*
- When something unexpected appears, pause. Ask: *"Who in this org would have approved this?"*

### 00:45 — 00:55 · Step 3 — pick what matters (10 min)
Walk the table. Read the plain-English explainer for each model. Ask the room which are in scope for this audit. *Make them vote with their hands.* Check the boxes accordingly.

### 00:55 — 01:05 · Step 4 — pick guardrails (10 min)
Read the five packs aloud. Two sentences each, from the card-front:
- *"NIST AI RMF — federal-grade risk management. The default if you're in the US."*
- *"EU AI Act Article 13 — transparency obligations for high-risk systems."*
- …etc.

Pick at least two packs. NIST + Human Flourishing is the recommended workshop default; it gives an interesting mix of pass/amber/red.

### 01:05 — 01:15 · Step 5 — the audit, live (10 min)
This is the moment. Read Step 5 out loud from the screen. Hover the receipts. Open one amber gap. Read the suggested action.

Then click **Make it Policy as Code**. Show the resulting bundle. Open the YAML. Read the first three lines aloud. *"This is the checklist you just built. As code. Signed."*

### 01:15 — 01:25 · Where it goes (10 min)
Hand the keyboard to a participant. Walk them through the destination choice. If they have a governance repo, push the PR live. If they don't, download the bundle and email it to themselves from Beacon.

### 01:25 — 01:30 · Close (5 min)
One sentence: *"You came in with sticky notes. You're leaving with a signed audit, evidence behind every green check, and a pull request a developer can merge."*

Hand each participant a printed copy of:
- The bundle hash
- The Beacon signing-key fingerprint
- A link to the audit log

That printed copy is their receipt. Use it.

---

## Facilitator scripts

### When someone says "we have an AI policy already"
> *"Wonderful. Is it running anywhere — or is it a document?"*

Wait for the answer. If "document": *"Then it's an aspiration, not a control. Let's make it a control today."*

### When someone says "this seems like a lot to do in 90 minutes"
> *"It seems like a lot because the current state took us two years to assemble. Beacon condenses the discovery and mapping into the part you can actually see while the slow part runs."*

### When discovery finds something embarrassing
> *"Good. That's the audit working. The point of the workshop is to find these now, with friends, instead of later, with regulators."*

Never name-and-shame in the room. Capture the finding in the gap; deal with it offline.

### When a participant gets stuck on a control
> *"Skip it. Park it as amber. We'll come back to it in the gap-closure session. The workshop is about coverage, not completeness."*

---

## What participants take home

1. **The bundle** — `.tar.gz` + `.sig` of everything generated in the session
2. **The receipt** — printed card with bundle hash, signing-key fingerprint, audit log link
3. **The PR** — open against their governance repo with the YAML and Rego they just authored
4. **The card-wall photo** — taken by you, sent by you, archived as evidence of the workshop itself

The card-wall photo matters. It's a Replay-style receipt of the workshop. It proves the audit existed and was attended by the people in the room.

---

## Materials checklist

- [ ] Beacon running locally, verified twice
- [ ] One real, working discovery source loaded in Step 1
- [ ] Pre-printed field cards (one stack per table)
- [ ] Sticky notes in three colors (Known / Suspected / Unknown)
- [ ] Flip chart + working markers
- [ ] HDMI/USB-C adapters (two of each)
- [ ] Printed bundle-receipt template
- [ ] Backup hotspot in case venue wifi fails
- [ ] Calendar invite for the follow-up gap-closure session (30 min, 1 week out)

---

## Variants

| Variant | Length | What changes |
|---|---|---|
| **Board briefing** | 30 min | Skip cards, skip Step 4 customization. Pre-pick NIST + Flourishing. Show only Steps 2 and 5. Outcome: board sees the gap and signs off on remediation. |
| **Vendor day** | 45 min | Bring in a vendor's models. Run discovery against their endpoint. Outcome: signed evidence pack you can attach to the next contract review. |
| **Regulator dry-run** | 2 hours | Add an extra 30 minutes between Step 5 and Close to walk through one amber and one red gap to full remediation. Outcome: dry-run rehearsal for an actual regulator visit. |
| **Internal Foundation onboarding** | 4 hours | Add a hands-on Rego authoring lab between Step 5 and Close. Outcome: new team members can extend Beacon. |
