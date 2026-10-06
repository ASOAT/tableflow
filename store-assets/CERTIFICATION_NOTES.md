# Certification notes — TableFlow 0.5.1

Purpose: Export web tables to Excel-compatible clipboard data or CSV.

Testing:

1. Install the extension in Microsoft Edge.
2. Open a public HTML table, for example https://www.w3.org/WAI/tutorials/tables/one-header/. Local test pages are also provided in `manual-qa/pages/`; enable file URL access in Edge only when testing those local files.
3. Click the TableFlow extension icon and complete the first-use explanation.
4. Select a detected table and inspect its preview and row/column counts.
5. Choose Copy to Excel, then paste into a spreadsheet, or choose Export CSV.
6. If a risk warning appears, review the available scope before confirming.

No account, payment, API key, or TableFlow server is required. The user must click the extension to start a normal scan. `activeTab` gives access to the current active page following that action. Table data is processed locally in the browser and is not uploaded. Optional on-page copy icons are off by default; enabling them requests permission for the chosen website.

Known limitations: pagination exports the current page without turning pages automatically. Cross-origin frames, closed Shadow DOM, unloaded rows, and horizontally virtualized columns may be inaccessible. Collecting more visible virtual rows is initiated by the user and remains subject to the displayed completeness warnings. “No missing data detected” is a page-structure assessment, not a guarantee of all underlying data.
