# Opportunity fit and bid eligibility

The badge recommends whether an opportunity fits the contractor. It does not certify that a bid is eligible.

- **Likely fit:** a sourced positive match to the actual trade, a verified future deadline and credible delivery geography, with no unresolved material requirement. Routine declarations, electronic submission, language and generic selection-document checks remain in the checklist.
- **Needs review:** uncertain specialist work, references, named qualifications, project-scale capacity, execution geography or bidding status. A false `mandatory` flag cannot hide a real delivery obligation.
- **Possible mismatch:** cited tender and company evidence contradict a material requirement. Silence or a missing source is never sufficient.

Each requirement may carry a `role`: `delivery`, `qualification`, `bid_check` or `scored`. Specific requirement text can override a wrong role tag. Existing results without role metadata use the same conservative inference. `fitAssessment` records the version, reason, checks and separate eligibility state; unknown checklist evidence is never relabeled as supported.

The shared classifier runs on server results and when restoring an older saved scan. Old badges are reassessed from the stored evidence without fetching new company data. This updates the interpretation, not the source freshness: dates, quotations and unread documents stay unchanged.

Tests cover routine paperwork, multilingual requirements, false mandatory flags, deep foundations, hospital BIM, SOA contradictions, unknown foreign execution, missing sources, cached result migration and both HTTP transports. The previously verified live company scans were replayed separately to check natural outcomes; no label proportions are enforced.
