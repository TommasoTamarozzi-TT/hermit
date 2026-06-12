import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

import { createModelRegistry } from "../src/anthropic-models.js";
import { collectModelPreferences, parseModelReference, resolveConfiguredModel } from "../src/model-auth.js";

describe("provider-aware model resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses slashless model names as OpenAI models", () => {
    expect(parseModelReference("gpt-5.4")).toEqual({
      raw: "gpt-5.4",
      provider: "openai",
      modelId: "gpt-5.4",
    });
  });

  it("collects preferred and fallback models in order", () => {
    expect(collectModelPreferences("openai/gpt-5.4", ["anthropic/claude-sonnet-4-6"])).toEqual([
      {
        raw: "openai/gpt-5.4",
        provider: "openai",
        modelId: "gpt-5.4",
      },
      {
        raw: "anthropic/claude-sonnet-4-6",
        provider: "anthropic",
        modelId: "claude-sonnet-4-6",
      },
    ]);
  });

  it("uses a configured fallback model when the preferred provider has no auth", () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const authStorage = AuthStorage.inMemory({
      anthropic: {
        type: "api_key",
        key: "test-key",
      },
    });
    const modelRegistry = ModelRegistry.create(authStorage);

    const resolved = resolveConfiguredModel(
      authStorage,
      modelRegistry,
      "openai/gpt-5.4",
      ["anthropic/claude-sonnet-4-6"],
    );

    expect(resolved.selectionSource).toBe("fallback");
    expect(resolved.model.provider).toBe("anthropic");
    expect(resolved.model.id).toBe("claude-sonnet-4-6");
  });

  it("falls back to the first available configured model when preferences do not match", () => {
    const authStorage = AuthStorage.inMemory({
      anthropic: {
        type: "api_key",
        key: "test-key",
      },
    });
    const modelRegistry = ModelRegistry.create(authStorage);

    const resolved = resolveConfiguredModel(
      authStorage,
      modelRegistry,
      "openai/not-a-real-model",
      ["google/missing-model"],
    );

    expect(resolved.selectionSource).toBe("best-available");
    expect(resolved.model.provider).toBe("anthropic");
  });

  it("auto-selects the best available configured model when no override is set", () => {
    const authStorage = AuthStorage.inMemory({
      openai: {
        type: "api_key",
        key: "openai-key",
      },
      anthropic: {
        type: "api_key",
        key: "anthropic-key",
      },
    });
    const modelRegistry = ModelRegistry.create(authStorage);

    const resolved = resolveConfiguredModel(authStorage, modelRegistry, "", []);

    expect(resolved.selectionSource).toBe("best-available");
    expect([
      "openai/gpt-5.4-pro",
      "openai/gpt-5.4",
      "anthropic/claude-opus-4-8",
      "anthropic/claude-opus-4-7",
      "anthropic/claude-opus-4-6",
      "anthropic/claude-sonnet-4-6",
    ]).toContain(`${resolved.model.provider}/${resolved.model.id}`);
  });

  it("makes the supplemental claude-opus-4-8 model resolvable and preferred via createModelRegistry", () => {
    const authStorage = AuthStorage.inMemory({
      anthropic: {
        type: "api_key",
        key: "anthropic-key",
      },
    });
    const modelRegistry = createModelRegistry(authStorage);

    const pinned = resolveConfiguredModel(authStorage, modelRegistry, "anthropic/claude-opus-4-8", []);
    expect(pinned.selectionSource).toBe("preferred");
    expect(pinned.model.id).toBe("claude-opus-4-8");
    expect(pinned.model.api).toBe("anthropic-messages");
    expect(pinned.model.reasoning).toBe(true);

    const auto = resolveConfiguredModel(authStorage, modelRegistry, "", []);
    expect(auto.selectionSource).toBe("best-available");
    expect(`${auto.model.provider}/${auto.model.id}`).toBe("anthropic/claude-opus-4-8");
  });

  it("resolves the officially supported claude-opus-4-7 model with an Anthropic key", () => {
    const authStorage = AuthStorage.inMemory({
      anthropic: {
        type: "api_key",
        key: "anthropic-key",
      },
    });
    const modelRegistry = ModelRegistry.create(authStorage);

    const resolved = resolveConfiguredModel(authStorage, modelRegistry, "anthropic/claude-opus-4-7", []);

    expect(resolved.selectionSource).toBe("preferred");
    expect(resolved.model.provider).toBe("anthropic");
    expect(resolved.model.id).toBe("claude-opus-4-7");
    expect(resolved.model.api).toBe("anthropic-messages");
  });

  it("prefers claude-opus-4-7 during auto-select when only Anthropic is configured", () => {
    const authStorage = AuthStorage.inMemory({
      anthropic: {
        type: "api_key",
        key: "anthropic-key",
      },
    });
    const modelRegistry = ModelRegistry.create(authStorage);

    const resolved = resolveConfiguredModel(authStorage, modelRegistry, "", []);

    expect(resolved.selectionSource).toBe("best-available");
    expect(`${resolved.model.provider}/${resolved.model.id}`).toBe("anthropic/claude-opus-4-7");
  });
});
