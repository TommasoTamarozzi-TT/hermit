import { describe, expect, it } from "vitest";

import { appendLiveModelContext } from "../src/session-runtime.js";

describe("appendLiveModelContext", () => {
  it("appends authoritative runtime model metadata to the system prompt", () => {
    const result = appendLiveModelContext("Base prompt", "openai/gpt-5-mini", "interactive");

    expect(result).toContain("Base prompt");
    expect(result).toContain("# Live Runtime Context");
    expect(result).toContain("Current session model: openai/gpt-5-mini");
    expect(result).toContain("Current session routing purpose: interactive");
    expect(result).toContain("authoritative runtime metadata");
  });
});
