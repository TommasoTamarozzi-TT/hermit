---
id: business-analyst-agent-inbox
type: agent-inbox
name: Business Analyst Agent Inbox
status: active
owner: Business Analyst
updated_at: 2026-03-17T12:20:42Z
source_refs:
  - type: chat
    date: 2026-03-16
    note: Created during first-role bootstrap for the Raidyn workspace.
  - type: chat
    date: 2026-03-16
    note: User plans to add Figma files in coming days and asked for a reminder tomorrow morning.
  - type: strategic_review
    date: 2026-03-16
    note: Review promoted the Figma reminder to the agent calendar and captured follow-up items for user review.
  - type: strategic_review
    date: 2026-03-17
    note: Review kept telemetry and environment follow-ups open and added a structure decision follow-up for user review.
---

## Purpose

Raw internal commitments, reminders, and follow-up ideas that still need clarification into `agents/business-analyst/agent/record.md`.
This file is for the role's internal task capture, not for uncategorized user-dropped files in the shared workspace `inbox/` directory.

## Open Inbox Items

- captured_at: 2026-03-16T21:18:31.912Z
  source: strategic_review
  raw_input: User-review follow-up: ensure a telemetry report exists before strategic review, or update the strategic review prompt/process to handle missing reports explicitly.
  desired_outcome: Future strategic reviews can read fresh telemetry summaries without manual raw-event inspection.
  why_it_matters: Today's review found no files under `.hermit/telemetry/reports/` even though the prompt requires them, which reduced confidence and added avoidable manual work.
  notify: user
  not_before:
  due_at:
  status: open

- captured_at: 2026-03-16T21:18:31.912Z
  source: strategic_review
  raw_input: User-review follow-up: adjust environment or prompt guidance so command suggestions do not assume `rg` is installed in `nono`.
  desired_outcome: Future sessions avoid avoidable bash tool errors when searching the workspace.
  why_it_matters: Today's strategic review hit `/bin/bash: rg: command not found`, which is friction from guidance not matching the actual environment.
  notify: user
  not_before:
  due_at:
  status: open

- captured_at: 2026-03-17T12:20:42Z
  source: strategic_review
  raw_input: User-review follow-up: decide whether next-vertical tracking should stay inside the active work item first or expand into shared prospect/contact/outreach entities.
  desired_outcome: Use the lightest durable structure that still keeps candidate verticals, target accounts, contacts, and outreach history explorer-friendly.
  why_it_matters: The active initiative now clearly needs structured tracking, but only one initiative exists so far, so adding shared entity definitions immediately may be premature.
  notify: user
  not_before:
  due_at:
  status: open
