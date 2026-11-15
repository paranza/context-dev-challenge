# Tender Fit Radar

Tender Fit Radar helps small construction suppliers find and review public tenders across European public procurement sources. It reads official notices and linked documents, then compares their requirements with evidence from the supplier's public website.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add your Context.dev key as `CONTEXT_DEV_API_KEY`.
3. Set a stable random `MONITOR_TOKEN_SECRET` to keep saved monitor links valid if you rotate the Context.dev key. This is optional for local use.
4. Start the app with `npm run dev` and open `http://localhost:3000`.

The key is used only by the server route. Do not add it to source files or commit `.env.local`.

## Scan workflow

1. The server resolves the submitted supplier domain and requests a fresh brand profile.
2. It discovers the supplier sitemap and crawls up to 500 pages, following subdomains and parsing linked PDF content where available.
3. It retrieves the supplier's recent news and searches public sources for related company pages, crawling up to 12 additional results.
4. It searches TED and registered national procurement portals across the EU, EEA, UK, Switzerland, Western Balkans, and other European states. TED notices are paginated through TED's public Search API. National portal searches use indexed Context.dev results, not complete portal exports. Each registered source reports whether it was searched, failed, or was not publicly searchable.
5. It researches up to 20 notices per result page, follows up to 35 linked tender documents per notice, and provides a signed continuation cursor for later pages.
6. Context.dev Answers builds a requirement checklist from the successfully read tender and supplier pages. Each requirement keeps its evidence excerpts and verified source URLs. Missing fields are returned as not stated or unavailable rather than guessed.
7. `/api/search/stream` and `/api/search/page/stream` feed the live research log in the page. The log shows source links, search queries, completed notices, and error stages. Users can request later pages while the TED continuation cursor remains available.
8. A refresh forces new web reads and compares the result with the browser's last saved scan for that supplier. Buyer and requirement values are shown as verified only when a cited page was successfully read. If a notice does not name its buyer, the app says so without inventing a citation.
9. A selected tender can be monitored with Context.dev on a 6-hour or daily schedule until a chosen date. Set `APP_BASE_URL` to the deployed public HTTPS URL for unattended webhook expiry. Without it, monitoring runs on schedule but pauses after its end date only when the dashboard next checks the monitor.

Set `MONITOR_TOKEN_SECRET` to a stable random value in deployment. If it is omitted, monitor capability links use the Context.dev API key and become invalid when that key changes.

The Context.dev API key is read from the server environment. The supplied challenge brief offers 50,000 free credits. The app reports the credits consumed during each scan.

## Data and decision limits

- TED and registered national procurement portals are the tender discovery sources. The official notice and its linked public documents remain primary evidence. Search-engine results from other sites are not used as proof.
- Crawls are bounded by Context.dev's current endpoint limits and request timeouts. The scan reports page and document failures instead of treating inaccessible sources as empty.
- Each result page deeply researches up to 20 notices. TED supports continuation cursors; national portal discovery returns up to 25 indexed results per registered portal and may not be exhaustive. Source status and search results are visible in scan coverage. Some sources are limited to municipal portals, require authentication, use local languages, or are only partially indexed.
- Continuation cursors are signed with the server API key and expire after 24 hours. They carry the supplier profile and remaining discovered notices, so they are suitable for this prototype but are not durable job storage.
- Refresh is user initiated. Previous results and signed monitor capabilities are saved in the browser's local storage, so scan history and monitor controls are limited to that browser and device. Context.dev runs scheduled page checks. A public webhook pauses expired monitors while the browser is closed; local development without `APP_BASE_URL` cannot guarantee unattended end-date stopping.
- Supplier websites may omit real qualifications. “No evidence found” means the public pages searched did not establish the fact, not that the supplier fails the tender.
- Fit findings are research guidance, not a legal eligibility decision or a guarantee of award. European Commission and Court of Auditors reports show procurement burden and cross-border barriers, but this demo has not recorded direct supplier interviews or product trials.

## Project notes

- [Challenge brief](docs/challenge.md)
- [Working brief](docs/working-brief.md)
- [Context.dev customer workflow notes](docs/customer-workflow-notes.md)
- [Economic viability validation plan](docs/economic-viability-plan.md)
