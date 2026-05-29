# Model Tier Routing

Current lightweight model-tier wrapper scripts:

- `scripts/with-model-tier.sh`
- `scripts/ask-with-model-tier.sh`

## Tiers

- `free` -> `local/gemma4`
  - fallback: `openai/gpt-4.1-mini`
- `cheap` -> `openai/gpt-4.1-mini`
  - fallback: `openai/gpt-5-mini`
- `workhorse` -> `openai/gpt-5-mini`
  - fallback: `openai/gpt-4.1-mini`
- `heavy` -> `openai/gpt-5.4`
  - fallback: `openai/gpt-5-mini`

## Purpose

- `free`: first-pass local work and experiments when latency is acceptable.
- `cheap`: simple checks, short summaries, and lower-cost role asks.
- `workhorse`: normal interactive or role work where quality still matters.
- `heavy`: complex synthesis and higher-stakes reasoning.

## Examples

Run a role ask on the cheap tier:

```bash
./scripts/ask-with-model-tier.sh cheap head-of-operations "Give a one-sentence coordination status update."
```

Run any command with the heavy tier model env:

```bash
./scripts/with-model-tier.sh heavy npm run -s cli -- ask --role head-of-operations "..."
```

## Current limitation

This is a practical first step, not full automatic task routing inside the live chat runtime. The wrappers make tier selection explicit for scripted asks and checks. The terminal chat should still report which tier was used for which validation run.
