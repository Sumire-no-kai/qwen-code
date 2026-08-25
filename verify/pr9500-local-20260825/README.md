# PR #9500 — maintainer local real-stack verification (2026-08-25)

- head tested: `7a63afba0e` (`feat/sync-skill-eviction`)
- base tested: `3892ca32ca` (merge base)
- macOS Darwin 25.6.0 arm64, Node.js v24.18.1

Both arms were built in ONE worktree with ONE `node_modules`. The BASE bundle was
produced by reverting exactly the 11 non-test source files to the merge base and
re-bundling, so the only variable is this PR's production diff.

## Layout

- `01-reinvoke-ab.png` — automatic-microcompaction leg, BEFORE vs AFTER
- `02-context-detail-ab.png` — `/context detail` after the same eviction
- `03-compress-fast-ab.png` — manual `/compress-fast` leg
- `04-mutation-matrix.png` — 7 mutations, all killed
- `05-carryforward-blockers.png` — the previous review's two blockers, re-run at this head
- `raw/<arm>/verdict.json` — machine verdict per arm
- `raw/<arm>/wire-ledger.slim.jsonl` — every provider request; Skill tool results kept verbatim
- `raw/<arm>/final-screen.txt` — final TUI screen text
- `raw/mutation-matrix.json` — unit-level mutation results
- `harness/` — the driver used to produce all of the above

## Arms

| arm | mode | expectation |
|---|---|---|
| `base-auto` / `head-auto` | idle microcompaction fires on its own | base returns the dedup message, head returns the body |
| `base-manual` / `head-manual` | user types `/compress-fast` | same split |
| `base-control` / `head-control` | no eviction at all | BOTH return the dedup message (guard must stay armed) |
| `base-context` / `head-context` | `/context detail` after eviction | base still reports `active` + `body loaded` |
| `head-hooks` | skill reload cycle with a PostToolUse hook | hook fires exactly 2x |
| `mut-m1` | HEAD bundle with the `setHistory` reconcile deleted | regresses to base behaviour |
| `mut-m5` | HEAD bundle with the skill-hook dedup deleted | hook fires 3x |

## Reproduce

```
harness/setup-fixture.sh <fixture-dir> 0            # 0 = idle microcompaction threshold in minutes
npx tsx harness/drive.ts <label> <bundleDir> <fixtureDir> <outDir> auto
```
