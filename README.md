# Tender Fit Radar

Tender Fit Radar helps construction contractors find and review public tenders, starting with their home region, then nearby countries and wider Europe. It reads official notices and linked documents, then compares their requirements with evidence from the supplier's public website.

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

## Scan workflow

1. Context.dev reads the contractor website (up to 35 pages), its sitemap and source-cited company profile. Additional cited company pages are fetched before their facts are accepted. Registered headquarters are distinguished from other offices.
2. A construction-only discovery plan selects relevant trades: for example roads, buildings, tunnelling, rail, demolition, electrical installation, structural concrete or HVAC. A component supplier is not treated as a general contractor.
3. TED is queried separately for the home NUTS region, home country and physically neighboring countries, then for relevant works across Europe. Indexed national and regional procurement portals supplement TED. Headquarters establish search priority, not proof of eligibility abroad.
4. Specific trade overlap and geographic tiers rank candidates. Policy documents, news, awards and supply-only notices are excluded. A nearby foreign opportunity still requires verification of local execution and eligibility.
5. Each page researches up to six notices and twelve linked documents per notice. The official sources are read before requirements are compared with contractor evidence. A verified open bidding deadline is required before a notice appears as an opportunity.
6. Each field and requirement keeps its successfully read source URL. Missing facts, unavailable documents and conflicting values remain visible as uncertainty. Silence on a contractor website is not evidence of failure.
7. `/api/search/stream` sends actual stage, source and completed-tender events. `/api/search/page/stream` continues remaining notices while preserving the shortlist and accumulating coverage. JSON transports remain available. Signed cursors expire after 24 hours; incompatible older scans require a refresh.
8. Refresh compares against this browser's previous construction scan. Explicit tender monitoring supports daily or six-hour checks, an end date, pausing and detected changes. Tokens are stored separately from scan history; demo data never creates a monitor.

## Demonstration and limits

The landing-page company picker only includes contractors promoted after reviewing a real application run. Selecting a company fills the website field; it never starts a paid scan automatically. The independent fictional sample workspace illustrates all three fit assessments without spending API credits. These sample findings are clearly labeled.

Live test evidence and reviewed examples are recorded in [construction evaluation](docs/construction-evaluation.md). A successful scan is not a guarantee that every notice is a fit, that every source is available, or that the contractor is eligible. Formal qualifications and bid requirements still need confirmation in the original material.

National portal search is an indexed subset, not a complete export. TED query totals apply to their specific queries; discoveries from overlapping searches are deduplicated. Company websites and portal indexes can be incomplete. Research and document budgets are reported rather than represented as exhaustive coverage.

For monitors, `MONITOR_TOKEN_SECRET` supplies a stable signing key (the API key is the prototype fallback), and `APP_BASE_URL` must be public HTTPS for unattended webhook/expiry behavior. Check the monitoring API documentation before production use; this prototype has no shared application database.

The API key stays on the server. `.env.local` is ignored by Git, and responses redact the configured credential. Fit findings guide research; they are not legal eligibility decisions or promises of award.

## Project notes

- [Challenge brief](docs/challenge.md)
- [Working brief](docs/working-brief.md)
- [Context.dev customer workflow notes](docs/customer-workflow-notes.md)
- [Economic viability validation plan](docs/economic-viability-plan.md)
