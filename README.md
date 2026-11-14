# Tender Fit Radar

Tender Fit Radar helps small Finnish suppliers decide which public tenders deserve a closer look. It researches live procurement notices, reads linked documents, and connects requirements to public supplier evidence.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add your Context.dev key as `CONTEXT_DEV_API_KEY`.
3. Start the app with `npm run dev` and open `http://localhost:3000`.

The key is used only by the server route. Do not add it to source files or commit `.env.local`.

## Frontend

The entry page includes an interactive requirement preview and a supplier website form. The workspace provides opportunity filters and search, paired requirement/source evidence, supplier profiles, coverage, and refresh comparisons.

Use **Explore demo** or **Explore the sample workspace** to open a fictional dataset without a key or API credits. Sample sources are labeled and cannot be opened as real notices. Exploring the demo does not overwrite the last live scan saved in this browser.

Live scans accept a domain such as `yourcompany.fi` or a full URL. After a successful scan, **Continue your last scan** restores the saved result; **Refresh research** compares fresh data with that result. Run `npm run typecheck` and `npm run build` for project checks.

Research streams actual supplier, discovery, and document updates to an animated source feed. Pausing motion keeps the research running, and reduced-motion preferences are respected. The thinking indicator and log primitives adapt BoardUI's free MIT source; attribution and its license are in `src/components/boardui/`.

## Current scan workflow

1. The server resolves the submitted supplier domain and requests a fresh brand profile.
2. It discovers the supplier sitemap and crawls up to 500 pages, following subdomains and parsing linked PDF content where available.
3. It retrieves the supplier's recent news and searches public sources for related company pages, crawling up to 12 additional results.
4. It searches Hilma and TED for Finnish construction opportunities, then deeply researches up to 5 candidate notices.
5. It follows and scrapes up to 35 linked tender documents per opportunity, then searches and reads closely matching buyer-side pages.
6. Context.dev Answers returns a structured requirement checklist. The app keeps source links, evidence excerpts, and uncertainty beside each item. Facts shown as supported or a possible gap must point to a successfully read supplier page.
7. A refresh forces new web reads and compares the result with the browser's last saved scan for that supplier.

The Context.dev API key is read from the server environment. The supplied challenge brief offers 50,000 free credits. The app reports the credits consumed during each scan.

## Data and decision limits

- Hilma and TED are the initial tender discovery sources. The tender notice and its linked public documents remain the primary evidence.
- Crawls are bounded by Context.dev's current endpoint limits and request timeouts. The scan reports page and document failures instead of treating inaccessible sources as empty.
- The initial implementation deeply researches at most 5 notices in one scan. Search coverage can find more, but larger workloads need a durable background job and result store.
- Refresh is user initiated. Previous results are saved in the browser's local storage, so change comparisons are limited to that browser and device. Scheduled monitoring and webhook persistence need a shared database or job service.
- Supplier websites may omit real qualifications. “No evidence found” means the public pages searched did not establish the fact, not that the supplier fails the tender.
- Fit findings are research guidance, not a legal eligibility decision or a guarantee of award.

## Project notes

- [Challenge brief](docs/challenge.md)
- [Working brief](docs/working-brief.md)
- [Context.dev customer workflow notes](docs/customer-workflow-notes.md)
- [Economic viability validation plan](docs/economic-viability-plan.md)
