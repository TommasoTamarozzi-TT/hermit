import type { Model } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

/**
 * Anthropic models Hermit makes selectable even though the installed
 * `@mariozechner/pi-ai` catalog (0.73.x) does not ship metadata for them yet.
 *
 * Currently this only covers `claude-opus-4-8`. The companion patch in
 * `patches/@mariozechner+pi-ai+0.73.1.patch` teaches the Anthropic provider to
 * send adaptive thinking (`thinking.type: "adaptive"` + `output_config.effort`)
 * for this model; without that patch Anthropic rejects the request with a
 * `thinking.type` 400 error.
 *
 * Each entry mirrors the catalog metadata shape so the `anthropic-messages`
 * provider can execute the model with a standard `ANTHROPIC_API_KEY`. A real
 * catalog entry (or a user `~/.pi/agent/models.json` override) with the same
 * `provider`/`id` always wins, so these definitions are superseded automatically
 * once pi-ai ships official metadata.
 */
export const SUPPLEMENTAL_ANTHROPIC_MODELS: readonly Model<any>[] = [
  {
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    api: "anthropic-messages",
    provider: "anthropic",
    baseUrl: ANTHROPIC_BASE_URL,
    reasoning: true,
    thinkingLevelMap: { xhigh: "xhigh" },
    input: ["text", "image"],
    cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
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
  const registry = ModelRegistry.create(authStorage);
  ensureSupplementalAnthropicModels(registry);
  return registry;
}
