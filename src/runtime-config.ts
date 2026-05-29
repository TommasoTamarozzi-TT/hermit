import { promises as fs } from "node:fs";
import path from "node:path";

import { parseDuration } from "./duration.js";

export const MODEL_TIERS = ["free", "cheap", "workhorse", "heavy"] as const;
export type ModelTierId = (typeof MODEL_TIERS)[number];

export const MODEL_ROUTING_PURPOSES = ["interactive", "ask", "heartbeat", "strategic-review"] as const;
export type ModelRoutingPurpose = (typeof MODEL_ROUTING_PURPOSES)[number];

export interface TierModelPreferences {
  model: string;
  fallbacks: string[];
}

export interface RuntimeConfig {
  modelRouting?: {
    defaults?: Partial<Record<ModelRoutingPurpose, ModelTierId>>;
    tiers?: Partial<Record<ModelTierId, Partial<TierModelPreferences>>>;
  };
  heartbeat?: {
    roleIntervals?: Record<string, string>;
  };
}

export interface ResolvedSessionModelPreferences {
  preferredModel?: string;
  fallbackModels: string[];
  tierId?: ModelTierId;
  source: "env-model" | "env-tier" | "runtime-config";
}

export interface ResolvedHeartbeatSchedule {
  roleIntervalsMs: Record<string, number>;
}

const RUNTIME_CONFIG_PATH = path.join(".hermit", "runtime.json");

const DEFAULT_TIER_MODEL_PREFERENCES: Record<ModelTierId, TierModelPreferences> = {
  free: {
    model: "local/gemma4",
    fallbacks: ["openai/gpt-4.1-mini"],
  },
  cheap: {
    model: "openai/gpt-4.1-mini",
    fallbacks: ["openai/gpt-5-mini"],
  },
  workhorse: {
    model: "openai/gpt-5-mini",
    fallbacks: ["openai/gpt-4.1-mini"],
  },
  heavy: {
    model: "openai/gpt-5.4",
    fallbacks: ["openai/gpt-5-mini"],
  },
};

function parseStringList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isModelTierId(value: string | undefined): value is ModelTierId {
  return MODEL_TIERS.some((tier) => tier === value);
}

function purposeToEnvSegment(purpose: ModelRoutingPurpose): string {
  return purpose.replace(/-/g, "_").toUpperCase();
}

function resolveTierPreferences(config: RuntimeConfig, tierId: ModelTierId): TierModelPreferences {
  const override = config.modelRouting?.tiers?.[tierId];
  const base = DEFAULT_TIER_MODEL_PREFERENCES[tierId];
  return {
    model: typeof override?.model === "string" && override.model.trim().length > 0 ? override.model.trim() : base.model,
    fallbacks: Array.isArray(override?.fallbacks)
      ? override.fallbacks.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
      : base.fallbacks,
  };
}

export function resolveRuntimeConfigPath(root: string): string {
  return path.join(root, RUNTIME_CONFIG_PATH);
}

export async function loadRuntimeConfig(root: string): Promise<RuntimeConfig> {
  try {
    const raw = await fs.readFile(resolveRuntimeConfigPath(root), "utf8");
    const parsed = JSON.parse(raw) as RuntimeConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function resolveSessionModelPreferences(
  root: string,
  purpose: ModelRoutingPurpose,
): Promise<ResolvedSessionModelPreferences | undefined> {
  const purposeSegment = purposeToEnvSegment(purpose);
  const explicitModel = (process.env[`ROLE_${purposeSegment}_MODEL`] ?? process.env.ROLE_AGENT_MODEL ?? "").trim();
  const explicitFallbackModels = parseStringList(
    process.env[`ROLE_${purposeSegment}_FALLBACK_MODELS`] ?? process.env.ROLE_AGENT_FALLBACK_MODELS,
  );

  if (explicitModel || explicitFallbackModels.length > 0) {
    return {
      ...(explicitModel ? { preferredModel: explicitModel } : {}),
      fallbackModels: explicitFallbackModels,
      source: "env-model",
    };
  }

  const explicitTier = (process.env[`ROLE_${purposeSegment}_TIER`] ?? process.env.ROLE_AGENT_TIER ?? "").trim();
  if (isModelTierId(explicitTier)) {
    const tierPreferences = resolveTierPreferences({}, explicitTier);
    return {
      preferredModel: tierPreferences.model,
      fallbackModels: tierPreferences.fallbacks,
      tierId: explicitTier,
      source: "env-tier",
    };
  }

  const runtimeConfig = await loadRuntimeConfig(root);
  const configuredTier = runtimeConfig.modelRouting?.defaults?.[purpose];
  if (!configuredTier || !isModelTierId(configuredTier)) {
    return undefined;
  }

  const tierPreferences = resolveTierPreferences(runtimeConfig, configuredTier);
  return {
    preferredModel: tierPreferences.model,
    fallbackModels: tierPreferences.fallbacks,
    tierId: configuredTier,
    source: "runtime-config",
  };
}

export async function resolveHeartbeatSchedule(
  root: string,
): Promise<ResolvedHeartbeatSchedule> {
  const runtimeConfig = await loadRuntimeConfig(root);
  const roleIntervals = runtimeConfig.heartbeat?.roleIntervals ?? {};
  const roleIntervalsMs: Record<string, number> = {};

  for (const [roleId, duration] of Object.entries(roleIntervals)) {
    if (typeof duration !== "string" || duration.trim().length === 0) {
      continue;
    }
    roleIntervalsMs[roleId] = parseDuration(duration.trim());
  }

  return { roleIntervalsMs };
}
