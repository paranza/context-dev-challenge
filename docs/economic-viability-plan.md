# Economic viability validation plan

## Purpose

The founder's view that Tender Fit Radar can be economically viable is an encouraging starting hypothesis. This plan turns it into evidence about who pays, what they pay for, and whether serving them can leave a sustainable margin.

The plan is for the product direction already sketched: help small Finnish construction suppliers find and assess public tenders, with evidence from company and tender websites. It does not assume that a particular price or billing model has already been proven.

## Questions to answer

1. **Who has the urgent problem?** Which small suppliers regularly spend meaningful time finding tenders and checking eligibility?
2. **What measurable value do they receive?** Does the service save review time, surface relevant opportunities, or prevent missed deadlines?
3. **Will they pay?** Which buyer and budget would pay, at what price, and how often?
4. **Can delivery scale profitably?** What does one company's research and ongoing monitoring actually cost, including Context.dev usage, hosting, support, and sales?
5. **Can we reach buyers repeatedly?** Which sales channel can produce customers beyond personal introductions?

## Working assumptions

- **Initial customer:** a small Finnish construction supplier that can bid on public tenders.
- **Buyer:** the owner or employee who currently decides whether to pursue a tender.
- **Core outcome:** spend less time screening opportunities and make a better-informed decision to investigate or skip one.
- **Business model to test:** compare a recurring subscription with a paid pilot or usage-based offer. Treat neither as decided until buyers react to concrete offers.
- **Product boundary:** recommendations help prioritize review. They do not guarantee eligibility, a bid win, or legal compliance.

## Milestones

### 1. Set the baseline

Write down the target customer profile and the current workflow. For each interviewed company, record how tenders are found, how often they review them, time spent per opportunity, who does the work, and what happens when a suitable tender is missed.

**Deliverable:** a one-page customer and workflow baseline, with assumptions separated from observed facts.

### 2. Validate the problem with buyers

Interview 8 to 10 people from separate target companies. Ask about their last real tender search and review rather than asking whether they like the idea. Record current tools, alternatives, frequency, time, decision authority, and existing spend. Do not count polite interest as demand.

**Proposed pass signal:** at least 6 of 10 describe tender discovery or screening as a recurring, costly problem, and can point to a recent example. If interviews are hard to recruit, record that as a distribution risk rather than substituting friends or generic opinions.

**Deliverable:** anonymized interview notes and a ranked list of painful tasks.

### 3. Test value and willingness to pay

Prepare the same short example for each interested buyer: a small set of current tenders, a fit checklist, source evidence, deadline, and any unclear requirements. Ask the buyer to compare it with their present process. Then present concrete offers, including a recurring plan and a paid pilot, and ask for a specific next step.

**Proposed pass signal:** at least 3 target companies agree to a pilot with a named user, start date, and success measure; at least 1 accepts a paid pilot or gives a comparably strong purchasing commitment. Track the price and terms tested. A positive reaction without a commitment is not a pass.

**Deliverable:** offer and pricing test log, plus pilot commitments.

### 4. Measure delivery cost and model unit economics

Run the actual workflow against a representative company and tender set. Measure Context.dev requests and credits, retries, latency, storage, hosting, and human review/support time. Use current Context.dev pricing for paid usage, and model free challenge credits separately as a temporary subsidy. Include customer acquisition and onboarding effort in a separate estimate.

Model conservative, expected, and high-usage cases for 10, 100, and 500 customers. Compare the tested price with recurring service costs. Make assumptions editable and show which ones drive the result.

**Proposed pass signal:** the expected case supports at least 70% gross margin after recurring API, hosting, and support costs, and the conservative case does not lose money on each active customer. Treat 70% as a project hurdle to approve or change, not as an established market fact.

**Deliverable:** a simple unit-economics spreadsheet with source dates, formulas, and sensitivity to tender volume and refresh frequency.

### 5. Run a small concierge pilot

For 3 to 5 companies, manually review the system's recommendations during a defined pilot period. Track relevant tenders surfaced, irrelevant results, missing opportunities, time saved, evidence corrections, repeat use, and whether each company would continue at the offered price. Make manual work visible in the cost model so it is not mistaken for scalable automation.

**Proposed pass signal:** pilot users return for a second review cycle, most surfaced tenders are judged worth reviewing, and at least one customer converts to a paid continuation. Set the exact relevance threshold with pilot users before starting.

**Deliverable:** pilot scorecard, customer quotes with permission, and revised cost model.

### 6. Make the investment decision

Review the evidence and choose one outcome:

- **Proceed:** problem, purchasing commitment, repeat usage, and unit economics meet the proposed pass signals.
- **Narrow or revise:** buyers value one part (for example, change monitoring or document screening), but the current customer, offer, or cost structure does not pass.
- **Stop:** buyers do not show a costly recurring problem or concrete willingness to pay after testing a clear offer with the target segment.

**Deliverable:** a one-page decision memo stating evidence, unresolved risks, selected buyer and offer, and the next investment requested.

## Evidence standards

- Use dated primary evidence for competitor offers, public procurement workflow, and Context.dev pricing. Link each source in the working notes.
- Separate observed facts, interview statements, estimates, and assumptions.
- Do not treat free API credits as proof of sustainable margins.
- Do not claim a tender was missed, a bid was won, or time was saved unless the pilot records support it.
- Keep company interview data private and obtain permission before using names or quotes in the demo or submission.

## Approval requested

Approve or adjust these four proposed choices before execution:

1. Start with small Finnish construction suppliers.
2. Interview 8 to 10 buyers and aim for 3 pilot commitments, including at least 1 paid commitment.
3. Use 70% expected gross margin as the initial project hurdle, with the assumptions shown.
4. Test both a recurring subscription and a paid pilot instead of assuming a single pricing model.

Once approved, the next step is to execute the validation, starting with buyer interviews and current-source research, then populate the unit-economics model with measured usage.
