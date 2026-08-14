# Anchor Automated Gauntlet

The Automated Gauntlet turns permanent planted-issue screenplays into repeatable Draft Scan evaluations. It uses the same prompt, structured schema, Story Memory, issue reconciliation, and ledger code as the editor.

It never writes story prose, changes a writer's project, or makes AI output canonical.

## What runs on every commit

`npm test` runs 41 Node regression tests. Five of those tests validate the Gauntlet itself and execute two complete deterministic passes.

Anchor CI also runs:

```bash
npm run gauntlet -- --repeat 2 --quiet --report artifacts/gauntlet/fixture-report.json
```

That creates a downloadable GitHub Actions artifact without calling Anthropic or spending model tokens.

## Current permanent suite

The versioned cases live in `gauntlet/cases/`.

- 7 screenplay cases
- 22 chronological revisions per pass
- hard factual continuity
- reasonable-audience inference
- unsupported character knowledge
- missing-object mystery suppression
- dialogue-versus-objective-truth suppression
- character life state
- explicit timeline impossibility
- character reversal
- relationship reversal
- writer dismissal
- unchanged-draft cache reuse
- incremental changed-scene scans
- evidence-backed resolution
- reopening after a bridge is removed
- stable issue identity across revisions and repeated passes
- provider retry and permanent-failure behavior

Every revision declares expected active, resolved, and dismissed issue keys plus forbidden writer-facing topics. Titles are not used as identity. Matching is based on category family, integrity basis, characters, exact evidence, and the ledger's stable issue ID.

## What the grader rejects

- a planted issue was missed
- a forbidden mystery, lie, reasonable inference, or weak motivation note reached the writer
- more than five findings
- evidence that is not an exact quote from the current draft
- a location that is not a current scene heading
- missing or duplicated decisions for an existing ledger issue
- disagreement between decisions and `active_issue_ids`
- a prescriptive question or possible interpretation
- an unchanged draft that calls the provider again
- a changed draft that incorrectly reuses the saved review
- a resolved issue that fails to reopen after its bridge disappears
- an issue ID that changes across revisions or repeated passes
- a scan that exceeds the 55-second user deadline

## Live model evaluation

The manual **Anchor Live Gauntlet** GitHub workflow runs the same cases against the configured Anthropic Draft Scan model. It retries one temporary provider failure, records every revision's latency and outcome, and uploads `live-report.json` even when a check fails.

The live workflow is manual because it spends model tokens. It can run one case or the full suite for 1, 2, 3, or 5 complete passes.

One server-only GitHub Actions secret is required:

`ANTHROPIC_API_KEY`

Never put this value in a fixture, commit, issue, pull request, report, browser console, screenshot, or chat. The optional `ANTHROPIC_DRAFT_SCAN_MODEL` belongs in **GitHub Actions variables**, not source.

Once the secret exists, the workflow can be launched from GitHub's **Actions → Anchor Live Gauntlet → Run workflow**. Justin does not need to paste screenplay revisions or operate Scan Draft manually.

Before that workflow reaches the default branch, the current release PR can run one complete live pass without merging. The PR title must temporarily include `[live-gauntlet]`, the triggering actor must be `emailjustin13-beep`, and the ordinary CI verification must pass first. Remove the title marker as soon as the run starts. Forked pull requests never receive the repository secret.

## Adding a permanent case

1. Add one JSON file under `gauntlet/cases/`.
2. Define named planted issues with canonical findings and evidence-based matching rules.
3. Add chronological revisions with expected active, resolved, or dismissed keys.
4. List every false-positive topic that must stay out of the writer-facing review.
5. Add fixture decisions that exercise reconciliation and ledger behavior.
6. Run `npm test` and the deterministic Gauntlet twice.
7. Run the live workflow for at least three passes before changing the production scanner.

Do not tune a case to exact model wording. A real fix must improve the general evidence and reconciliation rules.
