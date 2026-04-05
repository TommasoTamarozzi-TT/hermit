export interface OrgPerson {
  id: string;
  name: string;
  title: string;
  reportsTo?: string;
}

export interface ExplorerRoleSummary {
  id: string;
  name: string;
  description: string;
}

export interface OrgRoleSummary extends ExplorerRoleSummary {
  href: string;
}

export const raidynChiefExecutive = {
  name: "Tommaso",
  title: "CEO",
};

export const humanColleagues: OrgPerson[] = [
  { id: "pavel", name: "Pavel", title: "Principal Developer" },
  { id: "bart", name: "Bart", title: "Algorithm Developer" },
  { id: "aga", name: "Aga", title: "Designer" },
  { id: "ruth", name: "Ruth", title: "Head of HR" },
  { id: "elisabeth", name: "Elisabeth", title: "Legal Counsel" },
  { id: "eduard", name: "Eduard", title: "Frontend Developer", reportsTo: "pavel" },
  { id: "vice", name: "Vice", title: "AI Engineer", reportsTo: "pavel" },
];

export const boardMembers: OrgPerson[] = [
  { id: "tommaso", name: "Tommaso", title: "CEO · Director" },
  { id: "ben", name: "Ben", title: "Director" },
  { id: "samir", name: "Samir", title: "Director" },
];

const virtualReportPriority = new Map<string, number>([
  ["business-analyst", 0],
  ["sales-representative", 1],
  ["secretary", 2],
]);

function withHref(role: ExplorerRoleSummary): OrgRoleSummary {
  return {
    ...role,
    href: `/agents/${role.id}`,
  };
}

function compareVirtualReports(a: ExplorerRoleSummary, b: ExplorerRoleSummary): number {
  const aPriority = virtualReportPriority.get(a.id) ?? Number.MAX_SAFE_INTEGER;
  const bPriority = virtualReportPriority.get(b.id) ?? Number.MAX_SAFE_INTEGER;
  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }
  return a.name.localeCompare(b.name);
}

export function getVirtualAgentsData(roles: ExplorerRoleSummary[]): {
  headOfOperations: OrgRoleSummary;
  reports: OrgRoleSummary[];
} {
  const headRole = roles.find((role) => role.id === "head-of-operations");
  const reports = roles.filter((role) => role.id !== "head-of-operations").sort(compareVirtualReports).map(withHref);

  return {
    headOfOperations: headRole
      ? withHref(headRole)
      : {
          id: "head-of-operations",
          name: "Head of Operations",
          description: "Coordinates the virtual-agent team and operational follow-through.",
          href: "/agents/head-of-operations",
        },
    reports,
  };
}
