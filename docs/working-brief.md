# Working brief

## Product direction

Tender Fit Radar researches public procurement opportunities for small Finnish construction suppliers. A supplier provides its website. The service gathers public company information, searches current tender notices, reads linked documents, and builds a source-linked checklist that distinguishes evidence found, possible gaps, unknowns, and missing public evidence.

The app is a decision aid. A person must verify eligibility, tender documents, deadlines, and changes with the contracting authority.

## Approved data workflow

- Crawl and profile the supplier's public website, including relevant subdomains, sitemap pages, PDFs, project references, capabilities, locations, certifications, equipment, quality, safety, and sustainability material.
- Use company enrichment, company news search, and public web search to gather additional supplier context. Treat third-party pages as context, not proof of company eligibility.
- Discover current notices from Hilma and TED. Treat these as the initial authoritative announcement sources.
- Read the notice, linked public documents, amendments and clarifications, plus relevant pages on the buyer's site.
- Extract requirements and match each one to specific supplier evidence. Keep source URL, evidence text, and freshness with each finding.
- Re-scan on demand, bypass cached reads, and show changes against the last scan stored in the user's browser.
- Use the public Context.dev customer workflows as patterns: Zero's company enrichment and fresh signals, Upstash's recurring crawl/index freshness, and Supermemory's scheduled site/PDF sync. Do not represent them as tender-product competitors.

The public stories and the exact workflow patterns adapted for this prototype are documented in [customer workflow notes](customer-workflow-notes.md). They do not confirm that these are the three customers mentioned by the founder or that they build tender-matching products.

## Current implementation boundaries

- Up to 500 pages are crawled from the supplier site and up to 5 tender notices are researched in a scan.
- Up to 35 explicitly linked documents are scraped for each tender, plus closely matching buyer-side search results.
- Refresh and change comparison work in one browser. Scheduled monitors, shared scan history, and background processing require persistent storage and a job runner.
- Context.dev credentials remain server-side in `.env.local`.

## Next work

1. Review scan quality against real supplier websites and open tenders, then tune evidence extraction and source coverage.
2. Decide whether the demo needs persistent accounts, scheduled monitors, and a larger asynchronous scan pipeline.
3. Discuss and design the final UI after the data workflow is agreed.
4. Revisit the economic viability plan with buyer interviews and measured usage costs.
