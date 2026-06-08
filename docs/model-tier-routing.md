# Model Tier Routing

Hermit now supports model tiers in two places:

- wrapper scripts for explicit one-off runs
- workspace runtime config for automatic routing by session type

## Tier map

- `free` -> `local/gemma4`
  - fallback: `openai/gpt-4.1-mini`
- `cheap` -> `openai/gpt-4.1-mini`
  - fallback: `openai/gpt-5-mini`
- `workhorse` -> `openai/gpt-5-mini`
  - fallback: `openai/gpt-4.1-mini`
- `heavy` -> `openai/gpt-5.4`
  - fallback: `openai/gpt-5-mini`

## Wrapper scripts

Current helper scripts:

- `scripts/with-model-tier.sh`
- `scripts/ask-with-model-tier.sh`

Examples:

```bash
./scripts/ask-with-model-tier.sh cheap head-of-operations "Give a one-sentence coordination status update."
./scripts/with-model-tier.sh heavy npm run -s cli -- ask --role head-of-operations "..."
```

## Automatic runtime routing

You can now set default tiers per session type in `workspace/.hermit/runtime.json`.

Example:

```json
{
  "modelRouting": {
    "defaults": {
      "interactive": "workhorse",
      "ask": "workhorse",
      "heartbeat": "workhorse",
      "strategic-review": "heavy"
    }
  }
}
```

Supported routing purposes:

- `interactive`
- `ask`
- `heartbeat`
- `strategic-review`

You can also pin one workspace purpose directly in `.hermit/config.json` when you want a hard local override without changing the tier map.

Example:

```json
{
  "modelOverrides": {
    "heartbeat": "openai/gpt-5.1-mini"
  }
}
```

This workspace-local override is checked before `workspace/.hermit/runtime.json` tier defaults and before generic `ROLE_AGENT_*` env defaults, but after purpose-specific env overrides such as `ROLE_HEARTBEAT_MODEL` or `ROLE_HEARTBEAT_TIER`.

You can also override routing through env vars when needed:

- generic: `ROLE_AGENT_MODEL`, `ROLE_AGENT_FALLBACK_MODELS`, `ROLE_AGENT_TIER`
- heartbeat-only: `ROLE_HEARTBEAT_MODEL`, `ROLE_HEARTBEAT_FALLBACK_MODELS`, `ROLE_HEARTBEAT_TIER`
- ask-only: `ROLE_ASK_MODEL`, `ROLE_ASK_FALLBACK_MODELS`, `ROLE_ASK_TIER`
- strategic-review-only: `ROLE_STRATEGIC_REVIEW_MODEL`, `ROLE_STRATEGIC_REVIEW_FALLBACK_MODELS`, `ROLE_STRATEGIC_REVIEW_TIER`

Purpose-specific env model settings win over tier defaults.

For non-interactive routed work such as `ask`, `heartbeat`, and `strategic-review`, workspace runtime routing now takes precedence over the generic `ROLE_AGENT_*` model pin. That prevents a live interactive model pin from accidentally forcing all background work onto the same expensive model. The generic `ROLE_AGENT_*` env vars still act as the interactive default and as a fallback when no purpose-specific routing is configured.

## Heartbeat scheduling

The same `workspace/.hermit/runtime.json` file can slow down heartbeat cadence for quieter roles.

Example:

```json
{
  "heartbeat": {
    "roleIntervals": {
      "secretary": "1h",
      "sales-representative": "1h",
      "head-of-operations": "1h",
      "business-analyst": "6h",
      "head-of-procurement": "6h",
      "application-engineer": "6h"
    }
  }
}
```

The daemon still wakes on its normal global interval, but it now skips roles whose per-role cadence is not due yet. That reduces background model spend without hiding the schedule in prompts.
