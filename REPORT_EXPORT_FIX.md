# Report export fix — v2.0.1

## Changes

- User Mode monthly summary export now captures the summary table **and** the benchmark/performance review together.
- Summary export has its own filename: `monthly-summary-YYYY-MM.pdf`.
- Detailed monthly report export remains separate and is named `monthly-report-YYYY-MM.pdf`.
- Long exports are split across A4 pages instead of shrinking the entire report onto one page.
- Export captures current form values (including profile, benchmark percentage and income fields).
- Export errors are logged to the browser console and a user-facing Bengali message is shown.

## Verification status

The source changes have been reviewed and the ZIP archive is integrity-checked. A full build and browser download test could not be run in this environment because the dependency installation did not complete; `node_modules` was incomplete (`vite` and several TypeScript type packages were missing). Run `npm ci`, `npm test`, and `npm run build` on a machine with working npm registry access, then test both PDF buttons in Chrome desktop and Android.
