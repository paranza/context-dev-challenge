import type { ScanResult, TenderChange } from "./types";

/** Shared comparison logic keeps later researched pages in refresh comparisons. */
export function compareScanSnapshots(previous: ScanResult | null, current: ScanResult): TenderChange[] {
  if (!previous || !Array.isArray(previous.tenders) || previous.companyUrl !== current.companyUrl) return [];
  const oldById = new Map(previous.tenders.map(tender => [tender.id, tender]));
  const newById = new Map(current.tenders.map(tender => [tender.id, tender]));
  const changes: TenderChange[] = [];
  for (const tender of current.tenders) {
    const old = oldById.get(tender.id);
    if (!old) { changes.push({ tenderId: tender.id, tenderTitle: tender.title, kind: "new", details: ["New opportunity found since the previous scan."] }); continue; }
    const details: string[] = [];
    if (old.deadline !== tender.deadline) details.push(`Deadline changed from ${old.deadline} to ${tender.deadline}.`);
    if (old.status !== tender.status) details.push(`Fit assessment changed from ${old.status.replaceAll("_", " ")} to ${tender.status.replaceAll("_", " ")}.`);
    if (tender.documentsRead > old.documentsRead) details.push(`${tender.documentsRead - old.documentsRead} additional tender or buyer pages/documents were read.`);
    const oldRequirements = new Map(old.requirements.map(item => [item.id, item]));
    for (const requirement of tender.requirements) {
      const prior = oldRequirements.get(requirement.id);
      if (prior && prior.status !== requirement.status) details.push(`“${requirement.criterion}” changed from ${prior.status.replaceAll("_", " ")} to ${requirement.status.replaceAll("_", " ")}.`);
      if (!prior) details.push(`New requirement found: “${requirement.criterion}”.`);
    }
    if (details.length) changes.push({ tenderId: tender.id, tenderTitle: tender.title, kind: "changed", details });
  }
  // A failed research read is not a removed notice, even on the final page.
  const unresolvedIds = new Set((current.unresearchedTenders ?? []).map(tender => tender.id));
  const unresolvedUrls = new Set((current.unresearchedTenders ?? []).map(tender => tender.url));
  if (!current.pagination?.hasMore) for (const tender of previous.tenders) {
    if (!newById.has(tender.id) && !unresolvedIds.has(tender.id) && !unresolvedUrls.has(tender.url)) changes.push({ tenderId: tender.id, tenderTitle: tender.title, kind: "removed", details: ["This opportunity did not appear in the completed current scan. It may have closed, moved, or fallen outside the available source results."] });
  }
  return changes;
}
