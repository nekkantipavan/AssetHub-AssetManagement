# AssetHub 100,000-asset benchmark

Run on 10 November 2026 against a disposable local PostgreSQL database cloned from the configured schema. The script generated twenty CSVs of 5,000 synthetic assets and submitted each through the app's Bulk Upload preview and apply endpoints. It verified 100,000 assets, including 10,000 linked sub-assets. The temporary database and servers were shut down after the run.

- Preview took 0.54–1.03 seconds per file. Save took 3.74–8.31 seconds per file in the initial run.
- A separate update saved 5,000 assets in 3.41 seconds. The API rejected duplicates and invalid dates in preview. The browser preview of a previously imported CSV reported 5,000 unchanged rows and zero errors.
- The initial read-under-import test at five clients recorded a list p95 of 780 ms and a status filter p95 of 491 ms. The later indexed profiles measured reads on the completed inventory.

Read profiles use 30 requests per route at one, five, and ten concurrent clients. The second pass added migration 013, ran `VACUUM (ANALYZE)` on `assets` and `audit_logs`, and restarted the test API against the same dataset.

| Request | Initial p95 at 10 clients | Indexed p95 at 10 clients |
| --- | ---: | ---: |
| Assets, first page | 1,053 ms | 171 ms |
| Asset Report, first page | 2,228 ms | 168 ms |
| Assets, last page | 2,972 ms | 165 ms |
| Asset code search | 3,311 ms | 31 ms |
| Serial number search | 3,088 ms | 24 ms |
| Broad name search | 2,454 ms | 356 ms |
| Custodian search | 3,379 ms | 183 ms |
| Plant, category, and status with matches | — | 27 ms |
| Search with no results | 3,681 ms | 25 ms |
| Asset Detail | 830 ms | 46 ms |

Browser spot checks on the indexed instance took 747 ms to display the register, 183 ms to apply the status filter, 434 ms for a serial search, and 214 ms to display the report. These include browser automation and, for search, the input debounce. Three paired detail opens had medians of 307 ms with photos and 316 ms without photos. The detail API returned the same 3,795-byte JSON with zero or three photos attached to the same asset. The UI test verified upload, gallery navigation, and viewing at a 390 px viewport.

The benchmark uses local hardware, synthetic records, and synthetic image fixtures. The JSON files contain raw timings and payload sizes.

- [API and import results](benchmark-100k-results.json)
- [Browser timings](benchmark-100k-browser.json)

## Rerun and deployment

From `server`, run `node scripts/benchmark_100k.cjs --serve` in a terminal that accepts input. The script uses the configured local database as its schema source. Set `PG_BIN` to the PostgreSQL tools directory if it differs from the default. It uses ports 3301 and 5174 and leaves the isolated instance available for browser checks. Before ending that run, use `node scripts/benchmark_100k.cjs --compare=<isolated-database-name> --serve` to measure the indexed workload on ports 3302 and 5175. Stop the comparison instance before ending the first run. Generated fixtures and logs are under `.asset-benchmark/`.

Install server dependencies and run `node scripts/migrate_asset_photos.cjs` before restarting an existing API. It applies migrations 012 and 013. The migration role needs permission to create `pg_trgm` where it is unavailable. Asset photos accept JPEG, PNG, or WebP up to 10 MB and 25 megapixels, with five per asset. Set `ASSET_PHOTO_DIR` to a persistent directory outside the public web root. Its default is `server/private-asset-photos`. Include this directory in deployment backups alongside the database. PostgreSQL holds the photo metadata and the private directory holds WebP thumbnails and gallery images.
