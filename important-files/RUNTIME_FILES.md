# Runtime-Critical Website Files

These files directly power the running JalaSai website:

- `index.html`
- `style.css`
- `manifest.webmanifest`
- `sw.js`
- `assets/jalasai-logo-premium.jpg`
- `icons/favicon.png`
- `icons/jalasai-icon-192.png`
- `icons/jalasai-icon-512.png`
- `js/qrgen.js`
- `js/cloud-config.js`
- `js/data.js`
- `js/utils.js`
- `js/jobs.js`
- `js/stock.js`
- `js/customers.js`
- `js/reminders.js`
- `js/mechanics.js`
- `js/expenses.js`
- `js/reports.js`
- `js/scanner.js`
- `js/print.js`
- `js/new-ui.js`
- `js/vendor/supabase.js`
- `js/sync.js`

Everything else in the workspace is support, docs, imports, tools, or deployment material.

Recent runtime-sensitive areas:

- quick-invoice manual entry, input speed, and recommendation throttling live in `js/jobs.js` and the `qi-cust-search` markup in each UI HTML file
- local-first startup, startup overlay behavior, and appState render freshness live in `js/data.js`, `js/sync.js`, and each UI bootstrap block in `index.html` / `NEW UI/index.html`
- customer ownership and Khatabook balance cleanup live mainly in `js/data.js` and `js/customers.js`
- menu/tab speed improvements live in `js/utils.js`, `js/customers.js`, `js/reminders.js`, and the invoice render block in `index.html`
- cloud table sync safety and shadow-table performance live in `js/sync.js`
- service-worker cache bumps in `sw.js` are required when runtime JS changes must reach installed PWA clients
