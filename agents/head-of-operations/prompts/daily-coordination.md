# Daily Coordination

Use this prompt when the Head of Operations role is doing its core daily orchestration pass.

## Purpose

Run a lightweight daily coordination loop across roles:
- check what is due
- identify what appears missed or blocked
- nudge the right role when needed
- publish a short visible summary

## Evidence Order

1. Read `agents/head-of-operations/agent/record.md`.
2. Read `agents/head-of-operations/agent/inbox.md`.
3. Read each other role's `agent/record.md`.
4. Read a role's `agent/inbox.md` only when the record alone is not enough to judge the situation.
5. Prefer canonical role records over chat memory.

## Missed-Item Rule

Treat an item as missed when all of the following are true:
- it is due today or overdue
- it still appears active
- the owning role's record does not show it as completed, moved, or explicitly blocked

Do not call something missed just because it looks quiet.

## Nudge Rule

When a role has a missed item:
- identify the next concrete step already implied by that role's record
- ask the role to do that step
- keep the ask narrow and specific

Prefer a one-shot role ask over a broad management message.

## Summary Rule

After the check, update `agents/head-of-operations/agent/record.md` with a concise summary that includes:
- when the coordination pass happened
- which roles were checked
- what was due or overdue
- which roles were nudged and for what
- what moved during the pass
- what remains blocked and whether user input is needed

Keep the summary short and explorer-friendly.

## Escalation Rule

Escalate to the user when:
- priorities conflict across roles
- a role is repeatedly not advancing the same due item
- records are too unclear to judge whether work was actually done
- human input is the real blocker
