# Working brief

## Product direction

Tender Fit Radar researches public procurement opportunities for construction contractors, prioritizing their home region, neighboring countries and then wider Europe. A supplier provides its website. The service gathers public company information, searches TED and registered national procurement portals, reads linked documents, and builds a source-linked checklist that distinguishes evidence found, possible gaps, unknowns, and missing public evidence.

The app is a decision aid. A person must verify eligibility, tender documents, deadlines, and changes with the contracting authority.

## Approved data workflow

- Crawl and profile the supplier's public website, including relevant subdomains, sitemap pages, PDFs, project references, capabilities, locations, certifications, equipment, quality, safety, and sustainability material.
- Use company enrichment, company news search, and public web search to gather additional supplier context. Treat third-party pages as context, not proof of company eligibility.
- Discover current notices through TED's paginated Search API and country-specific official procurement portals. Record each source's URL, outcome, and returned result links. A portal search result is not treated as complete if the provider only returns an indexed subset. Coverage includes source caveats, such as inaccessible or partial portals.
- Read the official notice and its explicitly linked documents, including amendments and clarifications. Search-engine results from other sites are not used as tender proof.
- Extract requirements and match each one to specific supplier evidence. Keep source URL, evidence text, and freshness with each finding.
- Re-scan on demand, bypass cached reads, and show changes against the last scan stored in the user's browser. The page streams sources, queries, and tender research progress and can load later result pages.
- Allow a user to monitor one selected tender on a Context.dev 6-hour or daily schedule through a chosen end date. A public HTTPS `APP_BASE_URL` enables signed webhooks to pause the monitor when a run completes after the end date. Without that public endpoint, the dashboard pauses the monitor the next time it checks after the end date.
- Sign browser monitor capabilities with a stable `MONITOR_TOKEN_SECRET` when configured. The Context.dev API key remains a local fallback for development.
- Show external EU-level evidence of procurement burden, while explicitly showing that direct supplier product trials have not been recorded.
- Use the public Context.dev customer workflows as patterns: Zero's company enrichment and fresh signals, Upstash's recurring crawl/index freshness, and Supermemory's scheduled site/PDF sync. Do not represent them as tender-product competitors.

The public stories and the exact workflow patterns adapted for this prototype are documented in [customer workflow notes](customer-workflow-notes.md). They do not confirm that these are the three customers mentioned by the founder or that they build tender-matching products.

## Current implementation boundaries

- Up to 35 pages are crawled from the contractor site, with additional cited pages verified separately. Each result page deeply researches up to six notices and twelve linked documents per notice; results are not padded to reach that count.
- TED results use a signed continuation cursor. National portal searches return up to 25 indexed results per source and can be incomplete. Source outcomes show search failures, partial coverage, and sources that cannot be publicly searched.
- Up to 35 explicitly linked documents are scraped for each tender. Unsupported or inaccessible sources are reported, not treated as evidence that information is absent.
- `/api/search/stream` and `/api/search/page/stream` expose live stage, source, and tender events. The page displays a live research timeline and controls for later result pages.
- Refresh and change comparison work in one browser. Scheduled monitors are held by Context.dev and controlled by a signed browser token. User accounts and shared scan history are not implemented.
- Only buyer and requirement values linked to successfully read official pages are presented as verified. When the buyer is not named, the app says so and does not add a citation for absence.
- Context.dev credentials and monitor signing secrets remain server-side in `.env.local`.

## Next work

1. Review scan quality against real supplier websites and open tenders, then tune evidence extraction and source coverage.
2. Collect direct supplier interviews or product trials. External reports document procurement friction, but do not validate this product.
3. Decide whether the demo needs persistent accounts and a larger asynchronous scan pipeline.
4. Revisit the economic viability plan with buyer interviews and measured usage costs.
