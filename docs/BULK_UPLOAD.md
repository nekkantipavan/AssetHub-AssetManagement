# Bulk asset import and report export

Updated: 6 November 2026

## User workflow

1. Export Excel from Reports → Asset Report. The export contains the filtered records, including every import field followed by report-only columns. Export a fresh report after deploying this change; earlier exports lack revision metadata.
2. Edit the values you want to change. Keep Asset Code and Sub Asset Number unchanged. Keep Asset Record ID and Record Version for existing records.
3. Open Bulk Upload. Select Update existing (default), Create new, or Create and update. Choose an .xlsx, .xls or .csv file, with headers in the first row of the first worksheet. Maximum: 5,000 data rows.
4. The server validates without saving. Review counts, before/after changes, warnings and errors. Download the full change report or error report when needed. The screen shows up to 100 asset rows and 200 errors.
5. Fix every error and validate again. Confirm the preview to save the entire batch. If validation, concurrency checks, audit logging or any database write fails, nothing is saved.

## Matching and modes

Asset identity is the case-sensitive, trimmed Asset Code plus integer Sub Asset Number. Codes are text so leading zeros survive export. Sub Asset Number 0 is the main asset; new sub-assets use 1, 2, etc. and need a main asset in the file or database. Main assets are inserted first regardless of worksheet order.

| Mode | Existing identity | New identity |
|---|---|---|
| Update existing (default) | Update changed fields; skip unchanged | Error |
| Create new | Error | Create |
| Create and update | Update changed fields; skip unchanged | Create |

Duplicate identities within one file are errors. Asset Description is editable and is not unique: different assets may have the same name. Existing IDs, parent links, assignments and transfer history are preserved. Bulk import does not delete or renumber records. Export record ID is checked against the identity pair to catch accidental renumbering, even in mixed mode. For new rows added to an exported workbook, leave Asset Record ID and Record Version blank.

## Field rules

For updates, missing columns and blank cells mean leave unchanged. Use [CLEAR] to empty an optional field; required fields cannot be cleared. New records must supply all required values. Numeric zero is a value, not an empty cell.

Dates accept DD/MM/YYYY or YYYY-MM-DD and must be valid calendar dates. Fiscal Year must have four digits. Acquisition Value must be non-negative; commas, ₹ and $ are accepted. Sub Asset Number must be an integer from 0 to 2147483647.

Master values match configured spelling and case. Plant and department lookup accepts names or codes without case sensitivity; departments are resolved within the selected plant. Ambiguous matches are rejected. New or changed references must be active. Existing unchanged master values and inactive references are preserved.

Existing plant, department and assigned employee changes must use the transfer workflow. Assets with workflow statuses outside Active/Inactive cannot receive bulk changes. Unchanged exported workflow statuses are accepted.

| Import/export field | Required for new assets |
|---|---|
| Asset Code | Yes |
| Sub Asset Number | Yes |
| Capitalized On | Yes |
| Asset Description | Yes |
| Acquisition Value | Yes |
| Company Code | Yes |
| Business Area Code | Yes |
| Asset Class | Yes |
| Cost Center | Yes |
| Serial Number | No |
| Reference / Invoice No | Yes |
| Supplier Name | Yes |
| Manufacturer of Asset | Yes |
| Fiscal Year | Yes |
| Category | Yes |
| Department | Yes |
| Assigned Employee | Yes |
| Status | Yes |
| Asset Status | Yes |
| Warranty Date | No |
| Note | No |

These 21 fields are the first columns in both the generated template and report export. The report then adds Sub Asset Code, Plant, Cost Center Desc., Created Date, Last Updated, Asset Record ID, and Record Version. Report-only and unknown columns are ignored as asset values. Keep ID and Version together: they are validation metadata, not editable fields. Extra report columns may otherwise be kept or removed. Use the canonical Status column; the old Record Status header is not required in new exports.

## Preview and concurrency

POST /api/assets/bulk accepts { rows, mode, action }. Preview action defaults to preview and mode defaults to update. It returns summary, errors, warnings, plans with field-level before/after values, and a previewToken only if there are no errors. Preview makes no writes.

Confirm sends the same rows/mode with action apply and previewToken. The signed token expires after 15 minutes, belongs to the authenticated user, and is bound to the exact request and calculated changes. Confirmation recomputes and compares the plan under a database write lock. A changed record or relevant lookup invalidates the preview; validate again. There is no direct apply without a valid preview.

Record Version uses PostgreSQL xmin (exported as text), so edits are detected even when another writer does not maintain updated_at. A stale exported version blocks changed rows; an already-applied file whose values now match is harmless and is reported unchanged. Files without revision metadata remain supported with a visible warning: only changes after preview can be detected. For historical exports after a database restore, obtain a fresh report.

Commits hold a table-level asset write lock and reference-table share locks, with a five-second lock timeout. This is intentionally bounded to 5,000 rows for this app; large background imports would need a separate queued job design. Asset reads remain available. Database uniqueness on (asset_code, sub_sequence) protects simultaneous writes.

## Audit, deployment and verification

Only Admin and Manager can preview/apply. Existing authentication and password-change middleware remain in place. Each changed asset gets Asset Created or Asset Modified audit metadata with batch ID, asset ID and before/after values. A batch audit records totals and mode. Asset writes and these audit records commit together.

The field definition is shared/assetFields.json, used by server/assetFieldSpec.js, server/bulkAssets.js, the generated download template and src/data/assetWorkbook.js. The report endpoint supplies all fields plus record_version and ISO calendar dates.

Before deploying, apply server/migrations/008_bulk_import_identity.sql if the composite unique constraint is missing. It is additive and idempotent; existing duplicates cause failure rather than data removal. The local database already has uq_asset_code_sub. Restart the backend and rebuild/restart the frontend as appropriate.

Verification commands:

- Frontend: npm run build (from asset-management).
- Syntax: node --check server/bulkAssets.js and node --check server/index.js.
- Integration: node scripts/test_bulk_import.cjs (from server with configured .env). Uses session-local temporary tables only; application records are never changed. Covers export/Excel round trip, parent/child order, duplicate prevention, partial patches, clearing, stale exports and previews, mode rules, custody safeguards, audit and atomic rollback.

Local verification on 6 November 2026: frontend production build passed, 29 isolated database checks passed, and a fresh 1,200-asset Excel report was uploaded through the live UI with 1,200 unchanged, 0 creates, 0 updates and 0 errors. No application assets were modified during this verification.

UI update, 6 November 2026: restored the original orange-gradient step indicator, template card, drop zone, master reference and file preview styling. Import modes, server validation, confirmation and audit behavior remain in place. Production build and live 1,200-row unchanged-file preview passed after the UI restoration.

Help placement: How It Works is now opened by the info (i) icon beside Import mode. The default page hides the guide; the popup remains available at every step and closes with its close button, Escape, or a backdrop click. Verified in the local browser.
