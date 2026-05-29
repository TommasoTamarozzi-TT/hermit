import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveHeartbeatSchedule, resolveSessionModelPreferences } from "../src/runtime-config.js";

function makeWorkspaceRoot(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hermit-runtime-config-"));
}

describe("runtime-config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses workspace runtime tier defaults when no env override is set", async () => {
    vi.stubEnv("ROLE_AGENT_MODEL", "");
    vi.stubEnv("ROLE_AGENT_FALLBACK_MODELS", "");
    vi.stubEnv("ROLE_AGENT_TIER", "");
    vi.stubEnv("ROLE_HEARTBEAT_MODEL", "");
    vi.stubEnv("ROLE_HEARTBEAT_FALLBACK_MODELS", "");
    vi.stubEnv("ROLE_HEARTBEAT_TIER", "");
    vi.stubEnv("ROLE_STRATEGIC_REVIEW_MODEL", "");
    vi.stubEnv("ROLE_STRATEGIC_REVIEW_FALLBACK_MODELS", "");
    vi.stubEnv("ROLE_STRATEGIC_REVIEW_TIER", "");
    const root = makeWorkspaceRoot();
    mkdirSync(path.join(root, ".hermit"), { recursive: true });
    writeFileSync(
      path.join(root, ".hermit", "runtime.json"),
      JSON.stringify({
        modelRouting: {
          defaults: {
            heartbeat: "workhorse",
            "strategic-review": "heavy",
          },
        },
      }),
    );

    await expect(resolveSessionModelPreferences(root, "heartbeat")).resolves.toEqual({
      preferredModel: "openai/gpt-5-mini",
      fallbackModels: ["openai/gpt-4.1-mini"],
      tierId: "workhorse",
      source: "runtime-config",
    });

    await expect(resolveSessionModelPreferences(root, "strategic-review")).resolves.toEqual({
      preferredModel: "openai/gpt-5.4",
      fallbackModels: ["openai/gpt-5-mini"],
      tierId: "heavy",
      source: "runtime-config",
    });
  });

  it("prefers purpose-specific env model overrides over workspace runtime tiers", async () => {
    const root = makeWorkspaceRoot();
    mkdirSync(path.join(root, ".hermit"), { recursive: true });
    writeFileSync(
      path.join(root, ".hermit", "runtime.json"),
      JSON.stringify({
        modelRouting: {
          defaults: {
            heartbeat: "workhorse",
          },
        },
      }),
    );

    vi.stubEnv("ROLE_HEARTBEAT_MODEL", "openai/gpt-4.1-mini");
    vi.stubEnv("ROLE_HEARTBEAT_FALLBACK_MODELS", "openai/gpt-5-mini");

    await expect(resolveSessionModelPreferences(root, "heartbeat")).resolves.toEqual({
      preferredModel: "openai/gpt-4.1-mini",
      fallbackModels: ["openai/gpt-5-mini"],
      source: "env-model",
    });
  });

  it("does not let the generic interactive model override heartbeat runtime routing", async () => {
    const root = makeWorkspaceRoot();
    mkdirSync(path.join(root, ".hermit"), { recursive: true });
    writeFileSync(
      path.join(root, ".hermit", "runtime.json"),
      JSON.stringify({
        modelRouting: {
          defaults: {
            interactive: "workhorse",
            heartbeat: "free",
          },
        },
      }),
    );

    vi.stubEnv("ROLE_AGENT_MODEL", "openai/gpt-5.4");
    vi.stubEnv("ROLE_AGENT_FALLBACK_MODELS", "");
    vi.stubEnv("ROLE_AGENT_TIER", "");
    vi.stubEnv("ROLE_INTERACTIVE_MODEL", "");
    vi.stubEnv("ROLE_INTERACTIVE_FALLBACK_MODELS", "");
    vi.stubEnv("ROLE_INTERACTIVE_TIER", "");

    await expect(resolveSessionModelPreferences(root, "heartbeat")).resolves.toEqual({
      preferredModel: "local/gemma4",
      fallbackModels: ["openai/gpt-4.1-mini"],
      tierId: "free",
      source: "runtime-config",
    });

    await expect(resolveSessionModelPreferences(root, "interactive")).resolves.toEqual({
      preferredModel: "openai/gpt-5.4",
      fallbackModels: [],
      source: "env-model",
    });
  });

  it("parses heartbeat role intervals from runtime config", async () => {
    const root = makeWorkspaceRoot();
    mkdirSync(path.join(root, ".hermit"), { recursive: true });
    writeFileSync(
      path.join(root, ".hermit", "runtime.json"),
      JSON.stringify({
        heartbeat: {
          roleIntervals: {
            secretary: "1h",
            "business-analyst": "6h",
          },
        },
      }),
    );

    await expect(resolveHeartbeatSchedule(root)).resolves.toEqual({
      roleIntervalsMs: {
        secretary: 60 * 60 * 1000,
        "business-analyst": 6 * 60 * 60 * 1000,
      },
    });
  });
});
