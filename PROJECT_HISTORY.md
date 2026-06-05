# JalaSai Project History

Last updated: 2026-04-03

## Why This File Exists

This file documents the actual journey of the JalaSai system:
- how the project started
- what problems were discovered during real use
- what was implemented step by step
- what we learned from the business process
- what the current system state is now

This is not an operations manual.  
This is the build history and product reasoning log.

## 1. Starting Point

The project started as a simple garage management app for a two-wheeler workshop.

Main needs at the beginning:
- track jobs
- generate invoices
- manage stock
- track customers and dues
- keep expenses and daily income
- make the system usable on phone in the workshop

Initial direction:
- static app
- no heavy backend
- no framework
- simple local-first flow
- later shared across devices

## 2. Early Reality We Learned

Very quickly, real workshop behavior showed that a basic CRUD app was not enough.

Important business realities:
- staff enter many invoices daily
- typing too much in forms slows down work badly
- invoice numbers matter operationally
- parts naming from supplier invoices is messy
- old OCR exports are corrupted
- many parts fit multiple bikes
- customer data may come from old imported sources
- photo attachments are useful for reference but should not clutter printed invoices
- money collection does not always happen as clean “invoice paid in full”
- some income comes outside the formal invoice flow

This changed the project from a simple tracker into a practical workflow system.

## 3. Cloud and Multi-Device Direction

One major milestone was moving from purely local usage toward shared multi-device data.

What was implemented:
- Supabase-based shared state
- auth-based sign-in
- admin email configuration
- local cache + shared cloud state
- PWA-friendly usage

What we learned:
- owner/admin and staff need different access
- some pages must stay admin-only
- local resilience is still important even with cloud sync

Current admin emails:
- `1.priyannsh@gmail.com`
- `jalasaiautogarage@gmail.com`

## 4. Trial Stock and Cleanup

In the beginning, the stock system had trial/demo items for testing.

Later decision:
- remove all trial stock
- migrate old saved data safely
- keep only real business stock going forward

Why:
- test items confused live work
- fake SKUs polluted stock state

## 5. Supplier Invoice and Catalog Learning

This was one of the biggest product-learning phases.

At first, there was a thought to merge imported supplier rows directly into app SKUs.
That turned out to be unsafe.

### What we learned from invoice/catalog data

Supplier data had these issues:
- OCR corruption
- renamed parts over time
- missing or inconsistent item codes
- multiple bike fitments inside one line
- spelling differences
- abbreviations like `N/M`, `O/M`, `3G/4G/5G`
- same physical item described in different ways

### Important realization

Supplier `Part No.` is important and should be preserved, but it should not automatically become the internal SKU.

We learned:
- one supplier part can fit many bike models
- one internal SKU should represent one sellable part
- fitment should be metadata, not the entire SKU
- supplier code is a reference, not the operational truth

### Catalog workflow we built

We processed:
- pasted extracted catalog data
- `.xlsx` catalog source
- PDF extraction validation

We compared the sources, merged them, reviewed them, and produced:
- `catalog/final_catalogue.csv`
- `catalog/safe_final_sku_candidates.csv`
- `catalog/manual_sku_review_queue.csv`

### Important outcome

We did not force direct auto-SKU import.

Instead we built:
- a safer catalog review flow
- row-by-row confirmation
- duplicate warning
- edit-before-confirm
- stop/resume later
- immediate confirm into stock

This matches the real business need much better.

## 6. Add Part / Stock Intake Evolution

The stock form originally had too many fields visible all the time.

Feedback from real use:
- too many inputs for normal entry
- supplier invoice-only details should not be in the face all the time

So we simplified the form:

Main visible fields:
- part name
- fits models
- bike / brand
- category
- variant / subtype
- qty / min stock
- buy price / sell price
- supplier
- bin / location

Hidden under `More details`:
- manufacturer
- supplier part no.
- previous buy/sell price
- notes

### Search learning

Another important improvement:
- stock search must work by fitment and supplier reference, not just exact name/SKU

So search was extended to:
- part name
- SKU
- supplier part no.
- fitment models
- typo/near spelling

Example business need:
- searching `brake pad activa 5g`
- searching misspellings like `lamb` and still finding `lamp`

## 7. Invoice and Job Flow Evolution

This was the biggest UX change in the whole system.

### Original issue

The original job/invoice flow was too heavy for real daily work.

Problems:
- too many fields
- too many dropdowns
- if popup closed, users lost entered data
- adding 30+ invoices per day became painful
- “one big form for everything” was slowing the workshop

### What we learned

There are actually two different workflows:

1. Quick billing
- walk-in jobs
- puncture
- brake work
- oil
- wiring
- small service

2. Full open job card
- repair stays in workshop
- mechanic tracking
- pending work
- parts-added-later workflow

So we split the system conceptually.

### New result

We kept both:
- `Quick Invoice`
- `New Job Card`

### Quick Invoice improvements

Implemented:
- photo support
- sticky drafts
- recent customer chips
- recent bike chips
- service shortcut chips
- invoice date
- invoice number suggestion
- duplicate invoice warning
- chip-based mechanic selection
- chip-based payment method selection
- discount
- `Save Invoice`
- `Save as Job Card`
- `Save & Next`

### Job Card improvements

Implemented:
- simpler customer entry
- bike suggestion field
- chip-based mechanic selection including `N/A`
- optional invoice number
- discount
- notes visible on dashboard card
- `Save Job Card`
- `Save & Next`
- `Save as Invoice`

### Important behavioral improvement

Sticky draft behavior was added so accidental popup close or interruption does not force retyping work.

## 8. Customer Flow Learning

### Customer card problem

At one point, customer cards showed a rupee amount that looked wrong in clear cases.

We learned that:
- users care about current balance state
- showing lifetime amount in the wrong place is confusing

So customer cards were changed to show:
- actual current balance
- `Clear`
- `Owe`
- `Advance`

### Customer history from invoice list

Another important improvement:
- clicking customer in invoice list should not throw the user to another tab

So now customer history opens in-place as a popup from invoices.

## 9. Follow-up and Reminder Learning

The workshop imported older customer history from outside sources.

Problem:
- old historical invoices should not trigger new reminder logic

So follow-up logic was changed:
- start only from the new tracking period
- old imported history is ignored

Current reminder rules:
- feedback after 7 days
- service reminder after 75 days
- each new service resets the timer

## 10. Invoice Photo Learning

Original thought:
- invoice photo might be shown everywhere

Real use showed:
- photo is useful for internal reference
- photo is useful for WhatsApp/reference flow
- photo is not required in customer invoice PDF/print

So we changed:
- photos stay in system
- photos open full-screen on click
- invoice print/PDF does not include photo

## 11. Income and Payment Learning

### Manual income

Real business behavior:
- some money is not captured as full normal invoice flow
- puncture / small work / random cash collection happens

So manual income was added with:
- `Regular`
- `Other`
- `Cash`
- `UPI`
- optional invoice reference
- shortcut chips:
  - `Puncture`
  - `Brake`
  - `Oil`
  - `Wiring`
  - `Service`

### Linked income

We also added invoice-number-based reference linking from income to invoice list.

Important design choice:
- linked income is currently a visible reference
- it does not silently rewrite invoice paid math

That avoids accidental accounting corruption.

### Collect Payment improvement

We learned customers sometimes close balance by discount, not by payment.

So `Collect Payment` was expanded to allow:
- amount
- method
- note
- discount

Now a due can reduce by:
- payment only
- discount only
- payment + discount

## 12. Navigation Simplification Learning

At one stage, too many top-level tabs made the app feel noisy.

We experimented with reducing tabs, then learned some screens still needed to remain easy to reach.

Current balanced result:
- keep core daily tabs visible
- keep `Print QR` under Admin
- keep `Invoices` accessible
- reduce clutter but not hide important daily operations too deeply

## 13. QR and Label Workflow Learning

Label printing also needed real-world adjustment.

Important improvements:
- quantity field controls duplicate label generation
- UI widened so the selection table is still readable
- multiple labels for the same part now work properly

## 14. Search and Data Entry Learning

Many micro-improvements came from real typing pain:
- search boxes now select old text on click
- editable fields now select old text on focus/click
- customer search no longer force-replaces partially typed text
- vehicle field now uses suggestions instead of rigid brand/model split
- invoice number and register number fields were tuned for faster keypad-friendly input

## 15. End-of-Day and Reporting Learning

Another practical need appeared later:
- at closing time, the garage needs one simple summary message
- not just total revenue, but also mode split and work count

So we added a closing summary that now reports:
- bikes added
- invoices
- done jobs
- revenue
- cash
- UPI
- expenses
- net

We also learned that date filters were not flexible enough for real daily review.
So `Yesterday` was added to reporting and expenses because that is a very common real-world check.

## 16. Mobile Polish Learning

As more of the app shifted into fast-entry phone usage, layout polish became important.

What we improved:
- bigger touch targets
- tighter but clearer spacing
- better chip wrapping
- improved modal layout on small screens
- better stacking of action buttons
- safer horizontal table scrolling
- better bottom toast placement on phone

The goal was not visual redesign.  
The goal was reducing friction in daily mobile workshop use.

## 17. Documentation Learning

We learned that usage docs alone were not enough.

There are different kinds of documentation needed:

1. operations guide
- how to use the current app

2. deployment guide
- how to host and configure it

3. project reference
- current structure and major system shape

4. project history
- how we got here and what we learned

This file is the fourth one.

## 18. Current System State

As of now, the system is in a practical working state with:

### Core flows working
- Quick Invoice
- Job Card
- Invoice creation/edit
- Customer history popup
- Stock add/edit/search
- Catalog CSV review import
- Agent JSON stock import
- Manual income
- Due collection with discount
- Photo reference viewer
- QR printing with quantity
- Closing summary sharing
- Yesterday filters in reports and expenses

### Major UX direction now
- fewer dropdowns
- more tap chips
- faster mobile entry
- safer invoice numbering
- more practical stock review
- separation of quick billing and open job work
- stronger mobile usability

## 19. What We Learned Overall

Biggest lessons from the project:

### Business truth beats clean theory
Supplier catalog, OCR exports, invoice wording, and payment behavior are messy in real life.
The system had to adapt to real workshop behavior, not idealized software rules.

### One workflow was not enough
Quick billing and open repair-job management are different jobs.
Trying to force them into one form made the app slower.

### Simplicity is not “fewer features”
The right simplification was:
- showing fewer fields at once
- keeping common actions faster
- moving advanced fields out of the way
- preserving flexibility underneath

### Review is more important than blind import
This was especially true for stock/catalog data.
Safe review flows beat risky automation.

## 20. Related Documents

- [OPERATIONS.md](/Users/priyansh/Projects/JalaSai/OPERATIONS.md)
- [DEPLOYMENT.md](/Users/priyansh/Projects/JalaSai/DEPLOYMENT.md)
- [catalog/README.md](/Users/priyansh/Projects/JalaSai/catalog/README.md)
