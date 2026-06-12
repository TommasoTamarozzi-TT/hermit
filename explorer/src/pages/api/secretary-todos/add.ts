import { promises as fs } from "node:fs";
import path from "node:path";

import type { APIRoute } from "astro";

import { getWorkspaceRoot } from "../../../lib/workspace.js";

const recordPath = path.join(getWorkspaceRoot(), "agents", "secretary", "agent", "record.md");
const userHeading = "### User-requested todo list";
const nextHeading = "### Secretary-managed todo list";

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.]$/, "");
}

function cleanLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/[.]$/, "");
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    const rawLabel = typeof body?.label === "string" ? body.label.trim() : "";
    const label = cleanLabel(rawLabel);

    if (!label) {
      return new Response(JSON.stringify({ error: "Missing todo label." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (label.length > 200) {
      return new Response(JSON.stringify({ error: "Todo label is too long." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const markdown = await fs.readFile(recordPath, "utf8");
    const sectionStart = markdown.indexOf(userHeading);
    if (sectionStart === -1) {
      throw new Error("User-requested todo section not found.");
    }

    const sectionBodyStart = sectionStart + userHeading.length;
    const sectionEnd = markdown.indexOf(`\n${nextHeading}`, sectionBodyStart);
    if (sectionEnd === -1) {
      throw new Error("Secretary-managed todo section boundary not found.");
    }

    const sectionBody = markdown.slice(sectionBodyStart, sectionEnd);
    const target = normalizeLabel(label);

    const alreadyExists = sectionBody
      .split("\n")
      .some((line) => {
        const trimmed = line.trim();
        return trimmed.startsWith("- ") && normalizeLabel(trimmed.slice(2)) === target;
      });

    if (alreadyExists) {
      return new Response(JSON.stringify({ error: "That item is already on the list." }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }

    // Insert the new bullet immediately after the heading so it lands as a
    // default (medium-priority) user-requested item without disturbing the
    // existing priority groupings.
    const nextMarkdown =
      `${markdown.slice(0, sectionBodyStart)}\n- ${label}${markdown.slice(sectionBodyStart)}`
        .replace(
          /^updated_at:\s+.*$/m,
          `updated_at: ${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}`,
        );

    await fs.writeFile(recordPath, nextMarkdown, "utf8");

    return new Response(JSON.stringify({ ok: true, addedLabel: label }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
};
