# AI for JalaSai

Last updated: 2026-04-11

## Core Rule

Keep the business human-run, AI-assisted.

That means:

- human enters or approves important business data
- AI cleans, summarizes, suggests, and drafts
- AI does not become the accounting truth by itself
- AI does not send customer messages automatically
- AI does not create stock mappings without review

Short version:

- human decides
- AI prepares

## Main Business Uses

### 1. Customer Follow-up and Reminders

Use AI to draft:

- 7-day feedback message
- 75-day service reminder
- due payment reminder

Human action:

- review message
- send or skip

Do not:

- auto-send messages
- let AI decide whether a customer should be chased aggressively

### 2. Invoice and Job Note Cleanup

Use AI to convert messy note text into clean workshop notes.

Example:

- input: `brake noise front and wire issue maybe switch`
- output: `Front brake noise. Wiring issue near switch cluster. Check switch and front brake assembly.`

Human action:

- accept or edit before saving if needed

Best use:

- Quick Invoice notes
- Job Card problem description
- invoice completion notes

### 3. Supplier Part Normalization

Use AI to:

- read supplier invoice lines
- preserve supplier part number
- clean part name
- extract fitment models
- suggest internal SKU
- flag uncertain rows

Human action:

- confirm, edit, decline, or review later

Do not:

- auto-import all supplier rows directly into stock without review

### 4. Daily Summary Reporting

Use AI to draft a simple end-of-day summary:

- bikes added
- invoices made
- jobs completed
- total revenue
- cash
- UPI
- expenses
- net
- low-stock warnings

Human action:

- review and share

### 5. Stock Prediction

Use AI to suggest:

- fast-moving parts
- parts likely to run out soon
- reorder priority
- dead/slow stock

Human action:

- decide purchase order

Do not:

- auto-place supplier orders

### 6. Profit Analysis by Service Type

Use AI to group work into types:

- puncture
- brake
- oil/service
- wiring
- electrical
- suspension
- general repair

Then estimate:

- revenue by type
- parts cost by type
- discount impact
- rough profit or margin by type

Human action:

- pricing decisions
- stock planning
- promotion decisions

## Lowest-Cost Rollout

This is the cheapest practical rollout order.

### Stage 0: Prompt-first, no automation

Cost: lowest

Use AI only when needed, by copying data manually.

Start with:

- note cleanup
- follow-up message drafting
- daily closing summary drafting
- supplier part normalization from invoice images

Why this is cheapest:

- no background processing
- no automatic API usage
- no server complexity
- no risk of surprise monthly bills

### Stage 1: In-app assist, still human-triggered

Cost: low

Add buttons inside app such as:

- `Clean Note`
- `Draft Reminder`
- `Draft Closing Summary`
- `Normalize Supplier Row`

Only run AI when user taps the button.

Why this is still low-cost:

- AI usage only happens on demand
- no scheduled jobs
- no batch processing unless user asks

Current live status:

- partially implemented now as prompt-copy helpers inside the app
- no paid AI API is wired into the app yet
- user copies the prompt to an external AI agent and reviews the result manually

Important boundary:
- AI may help clean notes or draft messages
- AI does not decide final sync resolution, final workshop pricing, or stock movement truth

### Stage 2: Small scheduled summaries only

Cost: low to medium

Only after Stage 1 is stable, consider:

- daily closing summary draft
- low-stock reorder suggestion draft

Still keep:

- manual review before action

### Stage 3: Analysis and prediction

Cost: medium

Only after enough clean historical data exists:

- profit by service type
- stock prediction
- monthly trend analysis

This stage should come later because bad or incomplete historical data gives bad analysis.

## What To Build First

Best order for JalaSai:

1. AI note cleanup
2. AI WhatsApp follow-up drafts
3. AI closing summary draft
4. AI supplier part normalization helper
5. AI service-type profit grouping
6. AI stock prediction

Why this order is best:

- first items save daily time immediately
- first items do not risk money/accounting errors
- later items need cleaner data

## Minimum-Cost System Design

If cost must stay very low:

- use a small cheap model for cleanup/classification tasks
- use AI only on user action
- do not run AI on every keystroke
- do not auto-process every invoice in background
- store prompts/templates locally
- reuse one result instead of regenerating often

Practical cost rule:

- AI should help with exceptions, summaries, and cleanup
- not with every normal click in the app

## Safe Boundaries

AI can do:

- rewrite
- classify
- summarize
- suggest
- extract structure
- draft messages

AI should not be final authority for:

- invoice totals
- discount truth
- stock deduction truth
- customer balance truth
- supplier mapping without confirmation
- message sending

## JalaSai Workflow Mapping

### Jobs

Good AI use:

- clean work notes
- tag service type
- draft completion summary

### Invoices

Good AI use:

- clean invoice note
- draft feedback message
- draft service reminder

### Stock

Good AI use:

- normalize supplier names
- suggest fitment
- suggest SKU
- predict reorder risk

### Customers

Good AI use:

- follow-up message drafts
- reminder prioritization

### Reports

Good AI use:

- closing summary
- business performance explanation
- service-type profit grouping

## Suggested First In-App Buttons

If we implement this inside the app, start with:

- `Clean Note` on Job Card
- `Clean Note` on Quick Invoice
- `Draft Feedback Msg` in Customers
- `Draft Service Reminder` in Customers
- `Draft Closing Summary` in Reports
- `Normalize Part Row` in supplier import / catalog review

## Final Rule

The right AI model for JalaSai is not:

- full automation
- hidden decisions
- background over-processing

The right AI model is:

- visible
- optional
- cheap
- reviewable
- helpful in the exact places where workshop staff lose time
