# JalaSai — Strategy & Execution Plan

**Plan started:** 25 April 2026 (Saturday)
**Last updated:** 25 April 2026
**Owner:** Priyansh Patel
**Location:** Bhimrad, Surat, Gujarat
**Review cadence:** Daily closeout + weekly review (every Sunday)

---

## 0. How to Use This Document

This is a living planning document. It captures the strategic direction agreed on 25 April 2026, the low-overwhelm 90-day validation roadmap, what to measure, and what to decide at each checkpoint. Update the **Daily Operating Queue** every working day and the **Progress Log** every Sunday. Revisit the **Decision Gates** at day 30, 60, and 90. Do not revise the strategic direction unless a decision gate concludes the original hypothesis was wrong. The whole point of this document is to commit to a plan long enough to collect honest data without overwhelming the two-person management team.

---

## 1. Executive Summary

JalaSai Auto Garage generates ₹3-4 lakh monthly revenue as a general-purpose two-wheeler garage in Bhimrad, Surat. The operator has rare technical depth in EV systems (Ola VCU, battery cell-level diagnostics) and a fully-built internal management PWA (JalaSai Garage System) already in production use.

The strategy is to **reposition the garage as Surat's EV specialist** — "EV ka Doctor" — over the next 6-9 months. The first target is steady growth from ₹3-4 lakh/month toward ₹5-6 lakh/month, while protecting energy and service quality. The longer-term ₹8-12 lakh/month ambition remains valid, but it is not the first 90-day operating target.

The next 90 days (25 April - 24 July 2026) are a validation phase, not a build phase. The operating constraint is two management people at 6 focused hours per day each. The core rule is: **maximum two active growth experiments at one time.** Everything else goes into a later queue. The internal management software stays unchanged during validation. Only after 90-day validation will software changes be scoped based on what actually worked in the real market.

---

## 2. Current State (as of 25 April 2026)

**Revenue & operations.** The garage operates out of Bhimrad and generates approximately ₹3-4 lakh in monthly revenue. Profit margin estimated at ₹1-1.5 lakh monthly. Approximately 80 active repeat customers. Primary work today is general two-wheeler repair across petrol and EV scooters, with EV work representing an increasing but not dominant share.

**Software stack.** The internal management system (JalaSai Garage System) is a production-grade PWA built over 14+ months. It covers jobs, invoices, stock, customers, expenses, income, mechanics, reports, QR labels, catalog import, and cloud sync via Supabase. It is for internal staff use only — there is no customer-facing portal planned. Deployed on Cloudflare Workers at `long-dust-7034.1-priyannsh.workers.dev`. Architecture includes 15 shadow tables, realtime heartbeat sync (~5s latency between devices), prompt-copy AI assist (no paid API), and Apps Script daily Drive backups.

**Skills and assets.** Operator has MSc AI (Distinction) from London Metropolitan University, worked at D'light Technologies London through early 2026, currently runs the garage in Surat. Has built Chitr (retail CV platform) with production metrics. Has hands-on EV hardware experience including Ola VCU EDL diagnostics. Family owns Jalasai Auto Parts (separate but related business). Has approximately 4-6 months of financial runway.

**Market context.** Surat has accelerating EV adoption. OEM service centers (Ola, Ather, TVS, Bajaj Chetak, Hero Vida) operate as franchises with long wait times and aggressive replacement quotes (₹60-80K for battery issues often resolvable at ₹15-20K with cell-level repair). Local garages are not equipped to service EVs. No identified independent EV specialist garage in Surat/Navsari area.

---

## 3. Strategic Direction

The core strategic bet is that **an independent EV specialist garage in Surat can capture the underserved out-of-warranty EV owner segment and the fleet maintenance segment, priced significantly below OEM but with higher trust signals than other local garages.**

Four revenue lines remain strategically interesting, but they will not all be pushed at full speed in parallel. The first is **general EV repair and diagnostics**, positioned as a "second opinion" alternative to OEM service centers. The second is **two annual subscription plans**: Sampurna Suraksha at ₹4,999/year (bundled services, discounts, battery checks) targeting repeat daily riders, and Battery Bachao at ₹2,999/year (cell-level diagnostics, replacement discounts, health certificates) targeting battery-anxious owners. The third is **doorstep service** in three tiers (home diagnostic at ₹399, pickup-drop free to 5km, battery emergency response at ₹699). The fourth is **fleet maintenance contracts** at ₹500/scooter/month targeting delivery fleets (Swiggy, Zomato, Zypp, Yulu) and corporate EV fleets in Surat.

During validation, the active focus is narrowed to **EV diagnostics/repair plus existing-customer plan conversion** first. Google Business Profile, WhatsApp, and reviews support those two experiments. Doorstep service is accepted only when demand appears naturally and can be scheduled into fixed slots. Fleet outreach is capped and does not become a daily activity unless one prospect becomes serious.

Brand positioning is "EV ka Doctor" — JalaSai EV Care, Battery and Diagnostic Specialist. Trust differentiators (what competitors do not do) are: original parts with empty packet handed to customer, written 6-month warranty, quarterly printed Battery Health Certificate, transparent quote before work begins, and WhatsApp documentation of every job with photos plus voice note.

---

## 4. What We're NOT Doing (Equally Important)

To preserve focus during the 90-day validation window, the following are explicitly out of scope:

**No software changes to JalaSai Garage System.** The internal management app stays exactly as-is until after the 90-day validation concludes. No new features, no branding refresh, no subscription tracking, no fleet account structure. Any operational gaps during validation are filled with Google Sheets, paper, and WhatsApp.

**No customer-facing portal or app.** The management system remains internal staff tool only. Customer communication happens via WhatsApp, printed documents, and in-person interaction.

**No new business ventures.** Chitr scaling, AI agent platform, expert network consulting, and any other parallel revenue stream is paused during this 90-day window. Remote work already stopped due to relocation from London to Surat. The only business being built is the garage.

**No physical expansion.** No second branch, no pickleball courts, no unrelated physical business ideas. Single garage location at Bhimrad, Surat.

**No team hiring during validation.** No new technicians, no junior developers, no sales staff. Operator runs the experiments personally to learn what works. Hiring decisions come after 90-day results.

**No full-speed multi-channel marketing.** Do not run ads, flyers, doorstep, subscriptions, and fleet outreach all at full speed together. At any point, there are at most two active growth experiments.

**No discounting plans too early.** Do not discount Sampurna Suraksha or Battery Bachao before hearing real objections from at least 20 customers.

---

## 5. Management Capacity & Daily Operating Queue

The two-person management team has 12 focused hours per day total. Use a flexible queue each morning, but respect these capacity limits:

| Work Block | Daily Capacity | Owner | Purpose |
|---|---:|---|---|
| Garage/customer operations | 6h | Person B leads, Person A supports | Keep service quality and current revenue stable |
| Sales/follow-up | 2h | Person A | WhatsApp leads, existing-customer plan pitches, follow-ups |
| Documentation and money tracking | 1.5h | Person B | Job photos, voice notes, quotes, collections, expenses, revenue |
| Marketing/reviews | 1h | Person A | Google Business Profile, review requests, simple ad/review tasks |
| Buffer | 1h | Both | Absorb urgent work without stealing from rest/recovery |
| Daily closeout | 0.5h | Both | Record five numbers and tomorrow's top queue items |

**Role split.**

- **Person A: Sales + Customer Growth.** Owns WhatsApp leads, existing-customer pitches, Google Business Profile, reviews, follow-ups, and simple ads.
- **Person B: Operations + Quality.** Owns job documentation, quote discipline, service quality, collections, expense/revenue tracking, and daily summary.

**Daily queue rules.**

- Start each day by choosing the top 3 actions only: one revenue action, one trust/review action, and one operations clarity action.
- If a task does not create revenue, trust, reviews, repeat customers, or operational clarity, it waits.
- If the 1-hour buffer is consumed for 3 working days in a row, pause new outreach for 2 working days.
- If both people feel overloaded, cut marketing first, not service quality.
- If a channel produces no paid customer after 2 weeks, pause it and review the pitch/source.

---

## 6. 90-Day Validation Roadmap

### Phase 1 — Foundation (25 April 2026 to 25 May 2026)

**Days 1-30 priority:** Foundation + existing customers. The only active growth experiments are (1) EV specialist trust-building and (2) plan conversion from the best existing customers.

**Week 1: 25 April - 1 May 2026**

Set up the infrastructure for low-overwhelm validation: Google Business Profile claim/optimization with photos, WhatsApp Business conversion with quick replies from the Gujarati playbook, simple Google Sheets tracking for leads/source/plans, and review request process. Prepare signage and visiting cards, but do not launch flyers, Meta ads, doorstep push, and fleet outreach all at once.

**Week 2: 2 May - 8 May 2026**

Physical setup: signboard installation and visiting cards distributed. Begin photographing every EV job with the 5-photo + voice note protocol regardless of whether customer is plan-holder or not — this builds the habit before plans launch. Purchase the doorstep toolkit only if there is clear immediate demand or it is needed for current operations.

**Week 3: 9 May - 15 May 2026**

Soft-launch Sampurna Suraksha and Battery Bachao only to the first batch of best existing customers using the Gujarati sales script after service visits. Do not pitch all 80 customers. Month 1 total limit: best 20 existing customers. Track each conversation: customer, plan pitched, response, objection, follow-up date, result.

**Week 4: 16 May - 22 May 2026**

Ask for Google reviews after every successful EV job and plan conversion. If Google Business Profile + WhatsApp are producing inquiries, keep improving those before spending on ads. If there are fewer than 5 qualified leads by this week, test one small channel only: either a ₹2,000 Meta ad test or limited flyer distribution, not both.

**Week 5: 23 May - 25 May 2026 (Month 1 review window)**

Three-day review block. No new experiments. Tally results from the 30-day period. Populate the Month 1 column of the tracking tables in Section 8. Write honest assessment: what worked, what did not, what was harder than expected, what was easier, and whether the team stayed within the 12-hour/day capacity limit.

---

**Targets by 25 May 2026:**

- 10 new Google reviews.
- 5 WhatsApp leads that become service visits.
- 3 Sampurna Suraksha plans sold.
- 2 Battery Bachao plans sold.
- No more than ₹5,000 marketing spend.
- Both managers' weekly energy score stays at 7/10 or higher.

---

### Phase 2 — Double Down on What Works (26 May 2026 to 24 June 2026)

Choose only the best-performing growth channel from Month 1. This phase is intentionally selective because the right actions depend on what Month 1 data shows.

**If existing-customer plans converted well:** Expand the pitch to remaining repeat customers in batches of 10/week. Keep tracking objections and do not discount before 20 real objections are recorded.

**If Google/WhatsApp leads converted well:** Add a small Meta ad test, capped at ₹2,000/week. Keep the ad promise narrow: second opinion, battery diagnosis, OEM quote comparison, and EV specialist trust.

**If doorstep service showed natural demand:** Offer only fixed time slots. Do not create all-day on-demand doorstep expectations. Track doorstep-customer lifetime value vs walk-in customer.

**Fleet outreach limit:** Contact only 5 fleet prospects total in Month 2. Do not chase fleets daily unless one becomes serious.

**If nothing converted well in Month 1:** Something is fundamentally wrong with positioning, pricing, or pitch. Do not continue spending — pause ads, stop flyer printing, and spend Week 5-6 in direct customer interviews (10 existing customers, 10 fleet operators, 10 OEM-refused prospects) to understand why. This is a critical failure mode and must not be ignored.

**Targets by 24 June 2026:**

- ₹75,000-₹1L new revenue from growth activities.
- 8-10 active plan holders.
- 15+ new Google reviews total.
- WhatsApp lead-to-customer conversion rate above 20%.
- Weekly energy score stays at 7/10 or higher.

---

### Phase 3 — Stabilize, Don't Add More (25 June 2026 to 24 July 2026)

Month 3 is measurement and stabilization, not more experimentation. The goal is to end Day 90 with clean data for the decision gates in Section 7.

**Weeks 10-11 (25 June - 8 July 2026):** Stabilize the one or two running channels. Do not launch new channels unless one current channel is clearly failing. Build a repeatable EV diagnostic process and collect customer proof: before/after photos, OEM quote comparison, battery reports, and review requests.

**Week 12 (9 July - 15 July 2026):** Customer satisfaction interviews. Call or visit 20 customers who used the new services. Understand what they valued, what was confusing, what would make them refer someone else, and what plan objections keep repeating.

**Week 13 (16 July - 24 July 2026):** Decision gate review. Populate all final metrics. Make the explicit go/no-go/pivot decisions outlined in Section 7.

**Targets by 24 July 2026:**

- Monthly revenue run rate: ₹5-6L+.
- 15+ active plan holders.
- 20+ total Google reviews.
- 15+ new customers/month.
- At least one scalable channel clearly identified.
- No sustained overwhelm.

---

## 7. Decision Gates

Three explicit checkpoints where decisions are made based on data, not feelings. These are not optional. Missing the date means reviewing within 7 days regardless.

### Decision Gate 1 — Day 30 (25 May 2026)

**Question:** Are the top-of-funnel activities producing leads?

**Minimum viable signal:** At least 5 WhatsApp leads from any channel that resulted in a service visit. At least 3 Sampurna Suraksha plans and 2 Battery Bachao plans sold at full price. At least 10 new Google reviews. Marketing spend no more than ₹5,000. Weekly energy score for both managers is 7/10 or higher.

**If yes:** Continue as planned into Month 2.

**If no:** Pause all outbound spending. Conduct customer interviews. Identify why the positioning is not resonating. Revise pitch, pricing, or target segment before spending any more on ads/flyers. Extend Phase 1 by 2 weeks before proceeding.

---

### Decision Gate 2 — Day 60 (24 June 2026)

**Question:** Is the economic model working?

**Minimum viable signal:** Cumulative new revenue attributable to the pivot is ₹75,000-₹1 lakh over the 60-day period. There are 8-10 active plan holders, 15+ total new Google reviews, no angry customers demanding refunds, and WhatsApp lead-to-customer conversion rate is at least 20%. Weekly energy score stays at 7/10 or higher. One serious fleet conversation is useful but not required if existing-customer or Google/WhatsApp growth is working.

**If yes:** Commit to the narrowed 6-month pivot. Continue the winning channel and begin light scoping of software changes needed to scale (see Section 9), but do not build them during validation. Consider operational help only if service quality is suffering.

**If no:** Make a hard decision. Either (a) the pivot hypothesis is wrong — stop and return to general garage operations with the small improvements we've made, or (b) the execution is wrong — identify which specific thing (positioning, pricing, channel, target segment) is broken and fix that one thing in Month 3 before extending the timeline. Do not simply "try harder" without identifying the specific broken component.

---

### Decision Gate 3 — Day 90 (24 July 2026)

**Question:** Should this become the permanent business model?

**Minimum viable signal:** Monthly revenue run rate at ₹5-6 lakh+ (vs ₹3-4L baseline), active subscription base of 15+ paying plan holders, 20+ total Google reviews, 15+ new customers/month, at least one scalable channel clearly identified, and clear evidence the two-person management team can continue without sustained overwhelm.

**If yes:** Commit. Begin scoping the software changes identified in Section 9. Start planning the next operating capacity step only if the winning channel is repeatable. Build toward ₹8-12L/month over months 4-9 without adding more than one new growth channel at a time.

**If no, but close:** Extend validation by 60 more days with a focused fix on the weakest link (use customer interview data to identify).

**If no, and nothing worked:** Honest retreat. Return to general garage operations. Use the learnings to try a different positioning (e.g., fleet-only, or commercial/delivery-vehicle focused) or accept that the location/market does not support specialist positioning yet.

---

## 8. Metrics to Track (Daily Closeout + Weekly Updates)

Every working day, record the five daily closeout numbers. Every Sunday, update the following tables in this document. Use a Google Sheet for detailed data; this section is the summary.

### 8.1 Daily Closeout

| Date | Total revenue | New EV jobs | New leads by source | Plans sold | Energy score A/B | Buffer used? | Tomorrow's top 3 |
|---|---:|---:|---|---:|---|---|---|
| | | | | | | | |

### 8.2 Revenue & Customer Metrics

| Metric | Baseline (Apr 2026) | Month 1 | Month 2 | Month 3 | Target (Day 90) |
|---|---|---|---|---|---|
| Total monthly revenue | ₹3-4L | | | | ₹5-6L+ |
| Active plan holders (Sampurna) | 0 | | | | 15+ |
| Active plan holders (Battery Bachao) | 0 | | | | Included in 15+ total plan holders |
| Doorstep visits/month | 0 | | | | Only if naturally demanded |
| Active fleet contracts | 0 | | | | Optional, not required by Day 90 |
| New customers acquired | ~5/month | | | | 15+/month |
| Repeat customer rate | unmeasured | | | | 60%+ |
| Google Business Profile reviews | current baseline TBD | | | | 20+ total reviews |

### 8.3 Channel Performance

| Channel | Leads (Mo 1) | Conversions | Revenue | Cost | ROI | Notes |
|---|---|---|---|---|---|---|
| Google My Business | | | | ₹0 | | |
| Meta Ads (FB/Insta) | | | | Max ₹2,000/week only after Month 1 signal | | |
| Google Ads | | | | Not active unless chosen as the one paid test | | |
| WhatsApp broadcast | | | | ₹0 | | |
| Flyers | | | | Only if chosen as the one small test | | |
| Society watchmen | | | | Paused unless flyers are the chosen test | | |
| Word-of-mouth/referral | | | | ₹0 | | |
| Walk-in (pre-pivot baseline) | | | | ₹0 | | |

### 8.4 Plan & Service Health

| Metric | Measurement | Month 1 | Month 2 | Month 3 |
|---|---|---|---|---|
| Plans sold this month | count | | | |
| Plan cancellation requests | count | | | |
| Free services used (Sampurna) | count | | | |
| Battery diagnostics performed | count | | | |
| Cell-level repairs done | count | | | |
| Avg savings vs OEM quote | ₹ | | | |
| Google Business Profile reviews | count, avg rating | | | |
| Real plan objections heard | count + top themes | | | |

### 8.5 Fleet Pipeline

| Fleet | First Contact Date | Status | Next Action | Notes |
|---|---|---|---|---|
| (Add rows as you outreach) | | | | |

Month 2 limit: contact only 5 fleet prospects total unless one becomes serious.

### 8.6 Operational Stress Indicators

Subjective self-assessment, 1-10 scale, updated weekly. This is a leading indicator for burnout and strategic drift.

| Week | Person A energy | Person B energy | Buffer consumed 3 days in a row? | Execution discipline | Clarity of next action | Notes |
|---|---:|---:|---|---|---|---|
| W1 (25 Apr - 1 May) | | | | | | |
| W2 (2-8 May) | | | | | | |
| W3 (9-15 May) | | | | | | |
| ... | | | | | | |

---

## 9. Future Software Changes (Post-Validation Only)

These are scoped for reference but NOT to be built until after Day 90 validation concludes. Listed in priority order if the pivot is validated:

**Priority 1 — Subscription tracking.** A plans table with plan type, start date, end date, remaining free services, remaining battery checks, renewal status. Integration with customer card to display "Plan: Sampurna Suraksha | Expires: 15 Mar 2027 | 1 free service left | 2 battery checks remaining." Estimated build: 10 days. Required before month 4 if plans are working.

**Priority 2 — Fleet account structure.** Ability to create a parent "Fleet" account (e.g., "Swiggy Bhimrad Hub") with child vehicles and consolidated monthly billing. Estimated build: 7 days. Required before signing second fleet contract.

**Priority 3 — WhatsApp deep links.** Replace the AI Assist prompt-copy flow with `wa.me/<number>?text=<encoded message>` links so staff can send drafted messages in one tap instead of manual copy-paste. Estimated build: 1 day. Low effort, high daily-use impact.

**Priority 4 — Marketing source attribution.** Add a dropdown field on new customer creation: "How did you hear about us?" (Google, Facebook ad, flyer, referral, fleet, walk-in, OEM referral, watchman). Estimated build: half day. Enables data-driven ad budget allocation.

**Priority 5 — Service type classification.** Extend job card with EV-specific service types: battery diagnostic, cell replacement, balancing, dashboard repair, fastboot recovery, software update. Helps reporting show which work is most profitable. Estimated build: 2 days.

**Priority 6 — Battery Health Certificate template.** Printable PDF output from customer card showing quarterly cell-level readings, comparison trend, recommendation. Estimated build: 3 days. Only needed if Battery Bachao plan validates.

Total estimated build time if all six are done: ~25 working days. Can be sequenced over 2-3 months post-validation without disrupting operations.

---

## 10. Progress Log (Update Every Sunday)

### Entry: 25 April 2026 (Plan start)

- Plan document created and committed to.
- Gujarati customer-facing playbook created (separate file).
- No experiments launched yet. Day 0 baseline.
- Current garage revenue: ₹3-4L/month, ~80 active customers.
- Low-overwhelm plan implemented: two managers, 6 focused hours/day each, maximum two active growth experiments at a time.
- Software status: JalaSai Garage System running in production, no changes planned during validation.
- Next action: Execute Week 1 setup tasks (Google Business Profile, WhatsApp Business, simple tracking sheet, review process, signage/visiting cards).

### Entry: (Next update due 3 May 2026)

*Add weekly updates here. Format: date, what was done this week, what was learned, what's blocking next week.*

---

## 11. Reference Documents

- **Gujarati customer-facing playbook.** Contains all signage text, visiting card design, WhatsApp templates, ad scripts, flyer design, sales scripts, fleet pitch scripts, Battery Health Certificate template, and review request scripts in Gujarati. Use when creating physical or digital customer-facing materials.
- **Low-overwhelm tracking templates.** CSV templates live beside this plan: `low_overwhelm_daily_queue.csv`, `low_overwhelm_growth_tracker.csv`, and `low_overwhelm_weekly_review.csv`. Import these into Google Sheets or use them directly as the manual tracker during validation.
- **JalaSai Garage System documentation.** Internal management software docs at the project's `docs/` folder, including IMPLEMENTATION.md, OPERATIONS.md, SYSTEM_DATA_MAP.md, DEPLOYMENT.md, AI_OPERATING_MODEL.md.
- **Live management app.** `https://long-dust-7034.1-priyannsh.workers.dev/` — for internal staff use only, not customer-facing.

---

## 12. Open Questions & Decisions Pending

Items that need resolution but don't block Phase 1 execution. Revisit monthly.

- **Pricing test:** Is Sampurna Suraksha priced correctly at ₹4,999? Should there be a ₹2,999 "Basic" tier to lower the objection threshold? Decide after Month 1 based on objections heard.
- **Geographic scope:** Stay Bhimrad-only during validation. Revisit Vesu/Adajan only after Day 90.
- **OEM dealership partnership:** Explore formal referral agreements with local Ola/Ather dealerships only after Day 60 if current channels are working and the team is not overloaded.
- **Pricing on doorstep:** Is ₹399 too low to be profitable? Is ₹699 too high? Adjust at Day 30 based on conversion data.
- **Technology decision:** If validation succeeds, is the next technical hire a junior dev (to execute software changes in Section 9 under our direction) or a technician (to take operational load)? Decide at Day 60.

---

## 13. Commitments

Five things the operator commits to doing regardless of daily pressure, for the next 90 days:

1. **Photo + voice note documentation on every EV job**, starting Week 2. This habit is free and compounds into referral revenue within 60 days.
2. **Record the daily closeout**, even if it takes only 5 minutes: revenue, EV jobs, leads/source, plans sold, and energy score.
3. **Update this document every Sunday**, even if the update is only one line ("no material progress this week, reasons: X"). Honest tracking beats optimistic forgetting.
4. **Honor the decision gates.** If Day 30 or Day 60 results are negative, face the data honestly. Do not rationalize continuation. Do not skip decision reviews.
5. **Protect the two-person capacity limit.** If buffer is consumed for 3 days in a row, pause new outreach for 2 working days.

---

*Document structure and 90-day validation plan designed on 25 April 2026. Revisit strategy sections (1-4) only at Day 90 decision gate. Update the daily closeout every working day and the progress log every Sunday.*
