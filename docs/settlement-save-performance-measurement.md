# Settlement draft-save performance measurement

Automated measurement for **guide draft save** (`임시저장`) using the existing opt-in server debug timings.

This is a **measurement/reporting tool only**. It does not change save behavior, business rules, or production configuration permanently.

## Prerequisites

1. A **QA settlement** in `draft`, `rejected`, or `edit_requested` status (editable).
2. Guide test credentials (never commit these).
3. Temporarily enable server debug timings on the target deployment.

## Full automated workflow (recommended)

The wrapper script manages Vercel Production env toggling, redeploys, measurement, cleanup, and summary output.

```bash
PERF_BASE_URL=https://mtour-settlement.vercel.app \
PERF_GUIDE_EMAIL=your-guide@example.com \
PERF_GUIDE_PASSWORD='your-password' \
PERF_SETTLEMENT_EDIT_URL=/guide/settlements/<settlement-id>/edit \
PERF_RUNS=3 \
PERF_OUTPUT=./artifacts/settlement-save-performance.json \
npm run measure:settlement-save:workflow
```

### What the workflow automates

1. Resolves the Vercel project (`mtour-settlement` when `PERF_BASE_URL` points there, or `WORKFLOW_VERCEL_PROJECT`).
2. Temporarily links the local repo to that project if needed (restores `.vercel/project.json` afterward).
3. Sets `SAVE_TIMING_DEBUG=1` on **Vercel Production**.
4. Redeploys Production and waits until **Ready**.
5. Runs `scripts/measure-settlement-save-performance.mjs` (draft save / `임시저장` only).
6. Writes measurement JSON to `PERF_OUTPUT`.
7. Removes `SAVE_TIMING_DEBUG` from Production in a `finally` cleanup step.
8. Redeploys Production again to disable debug.
9. Writes `artifacts/settlement-save-workflow-summary.json` and prints a final summary.

### Manual confirmation required

Before any Production env change, the workflow prints:

- target Vercel project
- target environment: **Production**
- env var: `SAVE_TIMING_DEBUG=1`
- that Production will be redeployed **twice**

You must type **`YES`** to proceed. To skip the prompt (CI/advanced use only):

```bash
WORKFLOW_AUTO_CONFIRM=YES npm run measure:settlement-save:workflow
```

### Semi-automated fallback

If Vercel CLI env commands fail in your environment, set:

```bash
WORKFLOW_SEMI_AUTO=1 npm run measure:settlement-save:workflow
```

The script prints exact `vercel` commands, pauses for Enter after each step, then runs measurement.

### Workflow-only environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKFLOW_VERCEL_PROJECT` | derived from `PERF_BASE_URL` | Vercel project name (e.g. `mtour-settlement`) |
| `WORKFLOW_AUTO_CONFIRM` | off | Set `YES` to skip the `YES` confirmation prompt |
| `WORKFLOW_SEMI_AUTO` | off | Set `1` for manual Vercel CLI steps with pauses |

### Safety

- Modifies **Vercel Production env only** — not app source, SQL, RLS, auth, or save logic.
- Never prints guide password or Vercel tokens (CLI output is sanitized).
- Cleanup runs in `finally`; if removal fails, the script warns you to manually remove `SAVE_TIMING_DEBUG` and redeploy.
- Measurement still clicks **`임시저장` only** — never submit/pay/approve/reopen/recall/send-for-confirmation.

## Manual path: enable debug yourself

1. Open the Vercel project → **Settings** → **Environment Variables**.
2. Add **Production** variable:
   - Name: `SAVE_TIMING_DEBUG`
   - Value: `1`
3. **Redeploy production** (env changes do not apply until redeploy).
4. Confirm deployment is **Ready** before measuring.

The flag is server-only. When enabled, `saveSettlementDraft` attaches sanitized `_debugTimings` to the server action response and mirrors it to the browser console as `[settlement-form-action]`.

## Run the measurement script only

From the repo root:

```bash
PERF_BASE_URL=https://mtour-settlement.vercel.app \
PERF_GUIDE_EMAIL=your-guide@example.com \
PERF_GUIDE_PASSWORD='your-password' \
PERF_SETTLEMENT_EDIT_URL=/guide/settlements/<settlement-id>/edit \
PERF_RUNS=3 \
PERF_OUTPUT=./artifacts/settlement-save-performance.json \
npm run measure:settlement-save
```

Or resolve by tour code:

```bash
PERF_TOUR_CODE=YOUR-TOUR-CODE npm run measure:settlement-save
```

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PERF_BASE_URL` | No | `https://mtour-settlement.vercel.app` | App base URL |
| `PERF_GUIDE_EMAIL` | **Yes** | — | Guide login email |
| `PERF_GUIDE_PASSWORD` | **Yes** | — | Guide login password |
| `PERF_SETTLEMENT_EDIT_URL` | One of URL/tour | — | Edit path, e.g. `/guide/settlements/<id>/edit` |
| `PERF_TOUR_CODE` | One of URL/tour | — | Finds editable settlement on guide history |
| `PERF_RUNS` | No | `3` | Number of draft saves to measure |
| `PERF_OUTPUT` | No | `./artifacts/settlement-save-performance.json` | JSON output path |
| `PERF_HEADED` | No | off | Set `1` to run browser headed (debug UI) |
| `PERF_SUPABASE_URL` | No | `NEXT_PUBLIC_SUPABASE_URL` from `.env.local` | Optional read-only child row counts |
| `PERF_SUPABASE_ANON_KEY` | No | `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local` | Optional read-only child row counts |

Optional child row counts use **read-only** `SELECT` with guide credentials. No DB writes.

## What the script does

1. Logs in as guide (env credentials only).
2. Opens the settlement edit page.
3. Waits for the form footer (`임시저장`).
4. Clicks **`임시저장` only** — does **not** click submit, pay, approve, reopen, recall, or send-for-confirmation.
5. Does **not** mutate form fields.
6. Repeats `PERF_RUNS` times.
7. Writes JSON summary to `PERF_OUTPUT`.

Captured per run:

- `browserDurationMs` — click → “저장됨”
- `_debugTimings` from network response (when debug enabled)
- `debugTimings` from `[settlement-form-action]` console mirror
- Aggregated: `totalMs`, `preLoad.totalMs`, `postSaveReload.totalMs`, `lineItemRequests`, `totalRequests`, `updatesSkipped`, `inserts`, `deletes`, `revalidate_paths` ms
- Optional before/after child table row counts

## Disable debug after measurement

1. Remove `SAVE_TIMING_DEBUG` from Vercel Production (or set to empty).
2. **Redeploy production** again.

Do not leave debug enabled permanently.

## Interpreting JSON output

Example shape:

```json
{
  "meta": {
    "baseUrl": "https://mtour-settlement.vercel.app",
    "editPath": "/guide/settlements/…/edit",
    "settlementId": "…",
    "runCount": 3,
    "measuredAt": "2026-06-10T12:00:00.000Z",
    "saveTimingDebugEnabled": true,
    "thresholds": { "totalMs": 5000, "postSaveReloadTotalMs": 1000, "totalRequests": 100 }
  },
  "runs": [ { "run": 1, "browserDurationMs": 4200, "extracted": { "totalMs": 3800 }, "warnings": [] } ],
  "summary": {
    "browserDurationMs": { "count": 3, "avg": 4100, "min": 3900, "max": 4300, "p50": 4100 },
    "totalMs": { "count": 3, "avg": 3700, "min": 3500, "max": 3900, "p50": 3700 }
  },
  "warnings": [],
  "warningFlags": { "totalMsOver5000": false }
}
```

### Warning thresholds (non-blocking)

Warnings are recorded only; the script exits `0` by default (no CI fail).

| Flag | Condition |
|------|-----------|
| `totalMsOver5000` | Server `totalMs` > 5000 |
| `postSaveReloadOver1000` | `postSaveReload.totalMs` > 1000 |
| `totalRequestsOver100` | `totalRequests` > 100 |
| `insertsOnNoChangeResave` | `inserts` > 0 on no-field-change save |
| `deletesOnNoChangeResave` | `deletes` > 0 on no-field-change save |
| `childRowCountIncreased` | Read-only child row count increased after save |

If `saveTimingDebugEnabled` is `false`, enable `SAVE_TIMING_DEBUG=1` and redeploy — browser duration is still captured, but server step breakdown will be missing.

## QA data warning

Use **dedicated QA settlements** only. The script performs real draft saves against the target environment. Do not run against live guide production data without approval.

## Related code

- Opt-in debug: `src/lib/settlement/save-timing-debug.ts`
- Full workflow wrapper: `scripts/run-settlement-save-performance-workflow.mjs`
- Measurement script: `scripts/measure-settlement-save-performance.mjs`
- Workflow helpers: `scripts/lib/settlement-save-workflow.mjs`
- Summary/parser tests: `src/lib/settlement/save-performance-measurement.test.ts`
- Workflow helper tests: `src/lib/settlement/save-performance-workflow.test.ts`
