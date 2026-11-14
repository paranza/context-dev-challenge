# Tender Fit Radar

Tender Fit Radar helps small construction suppliers find and review public tenders across the EU and EEA. It reads official notices and linked documents, then compares their requirements with evidence from the supplier's public website.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add your Context.dev key as `CONTEXT_DEV_API_KEY`.
3. Start the app with `npm run dev` and open `http://localhost:3000`.

The key is used only by the server route. Do not add it to source files or commit `.env.local`.

## Scan workflow

1. The server resolves the submitted supplier domain and requests a fresh brand profile.
2. It discovers the supplier sitemap and crawls up to 500 pages, following subdomains and parsing linked PDF content where available.
3. It retrieves the supplier's recent news and searches public sources for related company pages, crawling up to 12 additional results.
4. It searches TED and registered national procurement portals in 30 EU/EEA countries. TED notices are paginated through TED's public Search API. A curated portal list and each search outcome are returned with the scan.
5. It researches up to 20 notices per result page, follows up to 35 linked tender documents per notice, and provides a signed continuation cursor for later pages.
6. Context.dev Answers builds a requirement checklist from the successfully read tender and supplier pages. Each requirement keeps its evidence excerpts and verified source URLs. Missing fields are returned as not stated or unavailable rather than guessed.
7. `/api/search/stream` and `/api/search/page/stream` emit live stage, source, and completed-tender events. The existing frontend still calls the JSON route and does not display those events or request later pages.
8. A refresh forces new web reads and compares the result with the browser's last saved scan for that supplier.

The Context.dev API key is read from the server environment. The supplied challenge brief offers 50,000 free credits. The app reports the credits consumed during each scan.

## Data and decision limits

- TED and registered national procurement portals are the tender discovery sources. The official notice and its linked public documents remain primary evidence. Search-engine results from other sites are not used as proof.
- Crawls are bounded by Context.dev's current endpoint limits and request timeouts. The scan reports page and document failures instead of treating inaccessible sources as empty.
- Each request deeply researches up to 20 notices. TED supports continuation cursors; national portal discovery returns up to 25 indexed results per registered portal and may not be exhaustive. Coverage states identify failed or unavailable sources. Sweden has no single central public notice database, so the scan relies on TED there.
- Continuation cursors are signed with the server API key and expire after 24 hours. They carry the supplier profile and remaining discovered notices, so they are suitable for this prototype but are not durable job storage.
- Refresh is user initiated. Previous results are saved in the browser's local storage, so change comparisons are limited to that browser and device. Scheduled monitoring and webhook persistence need a shared database or job service.
- Supplier websites may omit real qualifications. “No evidence found” means the public pages searched did not establish the fact, not that the supplier fails the tender.
- Fit findings are research guidance, not a legal eligibility decision or a guarantee of award.

## Project notes

- [Challenge brief](docs/challenge.md)
- [Working brief](docs/working-brief.md)
- [Context.dev customer workflow notes](docs/customer-workflow-notes.md)
- [Economic viability validation plan](docs/economic-viability-plan.md)
