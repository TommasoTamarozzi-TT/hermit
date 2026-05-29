import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRoleSessionMock,
  runManagedOneShotCommandMock,
} = vi.hoisted(() => ({
  createRoleSessionMock: vi.fn(),
  runManagedOneShotCommandMock: vi.fn(),
}));

vi.mock("../src/session-runtime.js", () => ({
  createRoleSession: createRoleSessionMock,
  createHermitSession: vi.fn(),
}));

vi.mock("../src/cli-session.js", () => ({
  buildHermitPromptContext: vi.fn(),
  buildRolePromptContext: vi.fn(),
  runManagedOneShotCommand: runManagedOneShotCommandMock,
}));

import { runHeartbeatForRole } from "../src/cli-heartbeat.js";

describe("runHeartbeatForRole", () => {
  beforeEach(() => {
    createRoleSessionMock.mockReset();
    runManagedOneShotCommandMock.mockReset();
  });

  it("routes role heartbeat sessions through the heartbeat model tier", async () => {
    createRoleSessionMock.mockResolvedValue({
      session: { abort: vi.fn() },
      telemetry: {},
      modelLabel: "local/gemma4",
    });

    runManagedOneShotCommandMock.mockImplementation(async (options) => {
      await options.createSession({
        telemetryContext: { sessionId: "test-session" },
        promptContext: { gitBranch: "main" },
      });
      return { status: "ran" };
    });

    const role = {
      id: "secretary",
      roleDir: "/tmp/workspace/agents/secretary",
    } as never;

    await runHeartbeatForRole({
      root: "/tmp/workspace",
      role,
      promptContext: {
        workspaceRoot: "/tmp/workspace",
        roleId: "secretary",
        roleRoot: "agents/secretary",
      },
    });

    expect(createRoleSessionMock).toHaveBeenCalledTimes(1);
    expect(createRoleSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelRoutingPurpose: "heartbeat",
        telemetryCommandName: "heartbeat",
        sessionHistoryType: "heartbeat",
      }),
    );
  });
});
