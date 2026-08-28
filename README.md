# Spate Sandbox

An interactive 2D shallow-water sandbox for explaining how hydraulic modelling
works. Sculpt ground, set what the surface is made of, run a design storm, and
watch where the water goes — with the hydrograph, the mass balance and the 1D
section quantities all readable while it happens.

It was built as an explainer. It is not calibrated and must not be used for
analysis. **Read [`NOTICE.md`](./NOTICE.md) before quoting any number from it.**

> **Licence undecided.** [`LICENSE.md`](./LICENSE.md) is a placeholder. Do not
> make this repository public until that conversation has happened.

## Quick start

```bash
npm ci
npm run dev      # http://localhost:5173
npm run lint
npm test
npm run build    # static output in dist/
```

Node 20 or newer. No API keys, no services, no backend — it is a static site.

## What it does

**Sculpt and paint.** Raise, lower, smooth, or stamp ground to a target level
with a pickable datum. Paint land cover, which sets both Manning's n and the
infiltration rate for those cells.

**Run a design storm.** Choose an annual exceedance probability, a duration, a
uniform or centre-peaked profile, and a climate change uplift. Run at up to
1800x with an honest readout of the rate actually achieved.

**Watch it route.** Refractive water shaded by absorption with depth, live
rainfall, flow lines coloured by speed, and neon floats that drift with the
current and strand where it goes shallow. Display modes for depth, velocity,
hazard rating and maximum extent.

**Read it like a model.** A chart recorder for rainfall and outflow, live
gauges, a full volume balance with the mass balance error stated, and a
blueprint level gauge on whichever domain edge faces the camera.

**Lay 1D units over the 2D field.** Cross-sections integrate flow, area, wetted
perimeter, hydraulic radius, Froude number and conveyance from the real terrain.
Interpolate units draw the bed a 1D model *assumes* against the ground actually
there. Bridges can be placed and resized, with piers that genuinely obstruct the
bed.

**Teach with it.** Six lessons, each aimed at one wrong intuition. Three use the
baseline-then-option structure real modelling work uses.

## Layout

```
src/
  SandboxHydraulics.jsx   the component: scene graph, interaction, panels
  lib/
    solver.js             Sim: diffusive-wave shallow water, no render deps
    scenes.js             ready-made catchments
    rainfall.js           design storm — PLACEHOLDER DDF, see NOTICE.md
    landcover.js          Manning's n and loss rate per surface type
    fields.js             sampling, and render-only smoothing
    units1d.js            cross-section, interpolate and bridge maths
    particles.js          floats and streaklines
    occlusion.js          horizon-scan ambient occlusion
    vegetation.js         scattered planting
    grid.js  math.js      meshes and numeric helpers
  render/shaders.js       all GLSL
  data/
    provenance.js         where every number comes from
    lessons.js            the teaching sequence
  ui/                     tokens, atoms, formatting
test/                     see below
```

`src/lib/` has no React and only `units1d`, `vegetation` and `grid` touch
three.js, so the physics is importable and testable on its own. That is
deliberate — it is what makes the test suite below possible.

## Tests

`npm test` runs 27 checks under `node:test`. No test framework dependency.

- **`solver.test.js`** — mass balance closes under 0.05% on every scene; depth
  and velocity stay finite and non-negative; single-outlet drainage sheds less
  than open-on-all-sides; render smoothing conserves volume; normals are unit
  length; occlusion stays in range.
- **`units1d.test.js`** — a 200 m by 0.5 m flat channel returns A = 100.000 m²
  and R = 0.5000 exactly; `V = Q/A`, `R = A/P`, `Fr = V/sqrt(gD)` and
  `K = A R^(2/3)/n` all hold; bridge piers restore the bed bit-exact after
  repeated edits; Kc and Ke stay inside their published ranges.
- **`lessons.test.js`** — plays each lesson the way a competent user would and
  asserts the target is still beatable. **This is the important one.** Every
  brief sets a numeric goal, and a change to the solver, a scene or the rainfall
  can quietly make one impossible, leaving a learner stuck with no signal that
  the tool is at fault. These tests are the guard rail against that.
- **`provenance.test.js`** — every parameter row is complete, honestly
  classified, and placeholders are not dressed up with a plausible-looking link.

The lesson tests are slow, around 70 seconds, because they run full storms.

## Things worth knowing before changing anything

**The solver is the only thing that decides where water goes.** A lot of what
looks like physics is render-side and deliberately so: temporal easing and
spatial smoothing of the drawn depth field, vertical exaggeration of the water
surface, smooth vertex normals. None of it feeds back. The gauges, hydrograph
and section quantities all read raw cell values. If you move a filter across
that line, say so in the UI.

**Lesson targets are set below measured achievable values, not guessed.** The
margins came from sweeping the parameter space. If you retune the solver, run
`npm test` and expect to re-measure.

**A lesson was dropped for a real reason.** Depth-velocity hazard needs water
under 0.25 m moving above 4 m/s. This scheme cannot produce that. It is recorded
in `NOTICE.md` and in the in-app provenance panel; please do not quietly add it
back without changing the solver first.

**Keep the provenance panel honest.** It is the thing that stops somebody
treating an invented rainfall depth as a design figure. If you add a parameter,
add a row.

## Possible next steps

- Port the solver to GPU ping-pong render targets, which is what unlocks 512²
  grids and day-length runs at speed
- Real DEM import so an actual catchment can be dropped in
- Inertial formulation instead of diffusive wave, for the momentum term that
  matters in steep channels and would make a hazard lesson possible
- Throttled-outlet storage so attenuation can be shown properly rather than as
  dead storage
- FEH DDF input to replace the placeholder rainfall curve
