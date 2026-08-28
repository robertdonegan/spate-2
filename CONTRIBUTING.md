# Contributing

## Before you open a PR

```bash
npm run lint && npm test && npm run build
```

CI runs the same three. All must pass.

## House rules

**If you add a parameter, add a provenance row.** Every dial in this model is
declared in `src/data/provenance.js` as a published formula, a typical value, a
placeholder, or something the user sets. A parameter with no row is a parameter
somebody will mistake for a real one. `provenance.test.js` enforces the shape of
the row; it cannot enforce your honesty.

**Do not blur the line between the solver and the renderer.** Render-side
filtering is fine and there is plenty of it, but readouts must come from raw
cell values, and anything cosmetic must say so in the panel that controls it.

**If you change the solver, re-measure the lessons.** Targets in
`src/data/lessons.js` were set from measured sweeps with headroom.
`lessons.test.js` will tell you if you have broken one, but it will not tell you
the new right number. Measure, do not guess.

**Do not add a hazard lesson without fixing the solver first.** See `NOTICE.md`.

**No client data, no DEMs, no FEH output in this repo.** The absence of
proprietary data is what keeps the licensing question simple. Keep it that way.

## Style

ESLint is the arbiter. Comments should explain why, not what — the code already
says what. Copy in the UI is part of the product: plain English, no jargon
without a gloss, and never overstate what the model knows.
