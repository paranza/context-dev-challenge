# Context.dev customer workflow notes

These public Context.dev customer stories were reviewed as workflow references for Tender Fit Radar. They describe data collection and freshness patterns, not public tender-matching products.

## Zero: company profile enrichment

[Zero keeps data fresh on 20 million companies](https://www.context.dev/customers/zero-keeps-data-on-20m-companies-fresh-with-context-dev)

Workflow pattern: combine company crawling, search, brand details, people, funding, and news into a continually refreshed profile that downstream CRM workflows and agents can use.

Applied here: build a broad supplier profile from its website, public references, brand data, and news, then use first-party supplier pages as eligibility evidence. Third-party company results provide context only.

## Upstash: crawl and index current documentation

[Upstash powers Context7 with documentation crawling](https://www.context.dev/customers/upstash-powers-context7-docs-crawling-with-context-dev)

Workflow pattern: crawl source sites and keep a searchable corpus current so downstream software can retrieve information when needed.

Applied here: discover supplier pages through the site crawl and sitemap, and read tender notices and their linked documents before constructing a requirement checklist.

## Supermemory: sync websites and documents

[Supermemory replaces its web crawler with Context.dev](https://www.context.dev/customers/supermemory-replaces-its-web-crawler-with-context-dev)

Workflow pattern: start from a website, crawl linked pages and PDFs, and synchronize changes over time with history.

Applied here: parse linked tender files, retain the last scan in the browser, and summarize differences after a user-triggered refresh.

## What these references establish

These stories support reusable patterns for company enrichment, site and document crawling, and freshness. They do not establish that these companies offer tender matching or that they are the three clients the founder referred to in the meeting. No tender workflow is copied as a product claim. The demo adapts the data workflow patterns to the tender decision problem.
