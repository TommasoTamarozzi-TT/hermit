import { promises as fs } from "node:fs";
import path from "node:path";

import type { APIRoute } from "astro";

import { getWorkspaceRoot } from "../../../lib/workspace.js";

const snapshotPath = path.join(
  getWorkspaceRoot(),
  "entities",
  "work-items",
  "wi-build-market-analysis-explorer-tab-with-company-business-research",
  "company-business-research.snapshot.json",
);

interface CompanyEntry {
  id?: string;
  name?: string;
}

interface Snapshot {
  generatedAt?: string;
  companies?: CompanyEntry[];
  [key: string]: unknown;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    const companyId = typeof body?.companyId === "string" ? body.companyId.trim() : "";

    if (!companyId) {
      return new Response(JSON.stringify({ error: "Missing company id." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const raw = await fs.readFile(snapshotPath, "utf8");
    const snapshot = JSON.parse(raw) as Snapshot;
    const companies = Array.isArray(snapshot.companies) ? snapshot.companies : [];

    const nextCompanies = companies.filter((company) => company?.id !== companyId);
    if (nextCompanies.length === companies.length) {
      return new Response(JSON.stringify({ error: "Company not found." }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    snapshot.companies = nextCompanies;
    snapshot.generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

    return new Response(JSON.stringify({ ok: true, removedId: companyId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
};
