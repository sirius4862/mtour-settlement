# Settlement save — browser vs server duration gap

## Observed (production, commit `0645332`)

| Metric | p50 |
|--------|-----|
| `browserDurationMs` | ~9138 ms |
| Debug `totalMs` (step sum) | ~5293 ms |
| Debug `preLoad` | ~1522 ms |
| Debug `postSaveReload` | ~586 ms |

Gap: **~3.8 s** browser minus server step sum.

## Measurement semantics (after timing fix)

| Field | Meaning |
|-------|---------|
| `actionWallMs` | True wall-clock of `saveSettlementDraft` on the server |
| `stepSumMs` | Sum of all recorded steps (may double-count overlapped work) |
| `effectiveStepSumMs` | Step sum excluding steps with `overlappedWith` |
| `parallelGroupWallMs` | Wall time of edit-path `Promise.all([upsert, line-item pre-load])` |
| `serverResponseMs` | Playwright time from click until save server-action HTTP response |
| `browserDurationMs` | Click until footer shows “저장됨” |

**Interpretation:** Compare `actionWallMs` (or `serverResponseMs` + network overhead) to `browserDurationMs`, not raw `stepSumMs` alone.

## Why browser > server

### 1. Measurement window includes post-response UI work (primary)

`scripts/measure-settlement-save-performance.mjs`:

```javascript
await saveButton.click()
const saveResponse = await saveResponsePromise  // server action completes
// ... read response body ...
await footer.getByText(/저장됨/).waitFor(...)   // still counted in browserDurationMs
```

`browserDurationMs` ends **after** the footer shows “저장됨”, not when the server action returns.

After the server responds, the client still:

1. Deserializes the server-action payload.
2. Runs `applyDraftSaveResult` → `markSaved` + `mergeServerSync` (Zustand store update).
3. Re-renders footer with `saveStatus === 'saved'`.

That client work is **included in browser duration** but **outside** server `actionWallMs`.

### 2. Step sum is not server wall time

`stepSumMs` adds step durations sequentially. Overlapped steps (header upsert inside pre-load batch) previously inflated totals; `effectiveStepSumMs` and `actionWallMs` address this.

Nested `getSettlementFull` query sums inside `postSaveReload` are parallel batch internals — `postSaveReload.totalMs` is wall time for that call, not additive with every sub-query.

### 3. Network + serialization (secondary)

Round-trip latency, TLS, and Next.js flight serialization sit between server finish and `serverResponseMs`. Typically hundreds of ms, not ~4 s alone.

### 4. Unlikely: script bug on “saved” wait

Footer text `저장됨 ${formatTime(lastSavedAt)}` appears when `saveStatus === 'saved' && !dirty` (`SettlementFormFooter.tsx`). `markSaved` sets this synchronously after `saveSettlementDraft` resolves — no intentional delay.

If gap remains large after comparing `serverResponseMs` vs `browserDurationMs`, inspect React render batching or heavy `mergeServerSync` work — **no UI change in this phase**.

## Next measurement run

After deploy, check:

```
browserDurationMs - serverResponseMs  →  client UI + refetch tail
serverResponseMs - actionWallMs       →  network + serialization
actionWallMs vs effectiveStepSumMs    →  uninstrumented server overhead
```

## Conclusion

The ~9 s vs ~5 s gap is **expected given current measurement definition**: browser time includes post-response client handling and “저장됨” visibility, while debug timings measure server-side steps. This is **not primarily a measurement-script bug**; splitting `serverResponseMs` (added in this change) will quantify the client tail on the next run.
