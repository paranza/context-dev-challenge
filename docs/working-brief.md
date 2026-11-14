# Working brief

## Product direction

Tender Fit Radar researches public procurement opportunities for small construction suppliers across the EU and EEA. A supplier provides its website. The service gathers public company information, searches TED and registered national procurement portals, reads linked documents, and builds a source-linked checklist that distinguishes evidence found, possible gaps, unknowns, and missing public evidence.

The app is a decision aid. A person must verify eligibility, tender documents, deadlines, and changes with the contracting authority.

## Approved data workflow

- Crawl and profile the supplier's public website, including relevant subdomains, sitemap pages, PDFs, project references, capabilities, locations, certifications, equipment, quality, safety, and sustainability material.
- Use company enrichment, company news search, and public web search to gather additional supplier context. Treat third-party pages as context, not proof of company eligibility.
- Discover current notices through TED's paginated Search API and country-specific official procurement portals. Record each source's URL, outcome, and returned result links. A portal search result is not treated as complete if the provider only returns an indexed subset.
- Read the official notice and its explicitly linked documents, including amendments and clarifications. Search-engine results from other sites are not used as tender proof.
- Extract requirements and match each one to specific supplier evidence. Keep source URL, evidence text, and freshness with each finding.
- Re-scan on demand, bypass cached reads, and show changes against the last scan stored in the user's browser.
- Use the public Context.dev customer workflows as patterns: Zero's company enrichment and fresh signals, Upstash's recurring crawl/index freshness, and Supermemory's scheduled site/PDF sync. Do not represent them as tender-product competitors.

The public stories and the exact workflow patterns adapted for this prototype are documented in [customer workflow notes](customer-workflow-notes.md). They do not confirm that these are the three customers mentioned by the founder or that they build tender-matching products.

## Current implementation boundaries

- Up to 500 pages are crawled from the supplier site. Each result page deeply researches up to 20 notices; results are not padded to reach that count.
- TED results use a signed continuation cursor. National portal searches return up to 25 indexed results per source and can be incomplete. Source outcomes show search failures and countries without a central public notice database.
- Up to 35 explicitly linked documents are scraped for each tender. Unsupported or inaccessible sources are reported, not treated as evidence that information is absent.
- `/api/search/stream` and `/api/search/page/stream` expose live stage and source events. The frontend is unchanged and does not yet consume the stream or offer load-more controls.
- Refresh and change comparison work in one browser. Scheduled monitors, shared scan history, and background processing require persistent storage and a job runner.
- Context.dev credentials remain server-side in `.env.local`.

## Next work

1. Review scan quality against real supplier websites and open tenders, then tune evidence extraction and source coverage.
2. Decide whether the demo needs persistent accounts, scheduled monitors, and a larger asynchronous scan pipeline.
3. Discuss and design the final UI after the data workflow is agreed.
4. Revisit the economic viability plan with buyer interviews and measured usage costs.
