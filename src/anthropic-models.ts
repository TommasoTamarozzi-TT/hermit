import type { Model } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

/**
 * Anthropic models Hermit guarantees are selectable even when the installed
 * `@mariozechner/pi-ai` catalog predates them.
 *
 * Each entry mirrors the catalog metadata shape so the `anthropic-messages`
 * provider can execute the model with a standard `ANTHROPIC_API_KEY`. These are
 * only used as a safety net: a catalog model (or a user `models.json` override)
 * with the same `provider`/`id` always wins, so the official metadata supersedes
 * these definitions automatically once pi-ai ships them.
 */
export const SUPPLEMENTAL_ANTHROPIC_MODELS: readonly Model<any>[] = [
  {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    api: "anthropic-messages",
    provider: "anthropic",
    baseUrl: ANTHROPIC_BASE_URL,
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    api: "anthropic-messages",
    provider: "anthropic",
    baseUrl: ANTHROPIC_BASE_URL,
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 1_000_000,
    maxTokens: 64_000,
  },
];

/**
 * Add any supplemental Anthropic models that are missing from the registry's
 * resolved catalog. Existing entries are left untouched so official pi-ai
 * metadata and user `models.json` overrides always take precedence.
 *
 * `ModelRegistry.getAll()` returns the registry's live model list, so pushing
 * into it makes the models visible to `find()`, `getAvailable()`, and therefore
 * to Hermit's model resolution without disturbing other providers.
 */
export function ensureSupplementalAnthropicModels(registry: ModelRegistry): void {
  const models = registry.getAll();
  for (const supplemental of SUPPLEMENTAL_ANTHROPIC_MODELS) {
    const alreadyPresent = models.some(
      (model) => model.provider === supplemental.provider && model.id === supplemental.id,
    );
    if (!alreadyPresent) {
      models.push({ ...supplemental });
    }
  }
}

/**
 * Create a `ModelRegistry` with Hermit's supplemental Anthropic models ensured.
 * Use this everywhere Hermit resolves models so newer Claude models stay
 * selectable regardless of the installed pi-ai catalog version.
 */
export function createModelRegistry(authStorage: AuthStorage): ModelRegistry {
  const registry = new ModelRegistry(authStorage);
  ensureSupplementalAnthropicModels(registry);
  return registry;
}
