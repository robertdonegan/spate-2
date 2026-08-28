# Read this before quoting a number from this model

This is an explainer, not an analysis tool. It exists so that people who do not
build hydraulic models can see what one is doing, and so that people who do can
show them. It has never been calibrated against a gauged event.

Three things in it are real:

- **The routing scheme.** Discharge between cells comes from Manning's equation
  applied to the water-surface slope, with the interface depth taken from the
  higher water surface and the higher bed. This is the standard simplified 2D
  approach.
- **The hazard rating.** `HR = ((v + 0.5) x d) + DF`, from the Defra and
  Environment Agency *Flood Risks to People* research (FD2320). **The debris
  factor is omitted here**, so every hazard figure this model reports is lower
  than the published method would give.
- **The mass balance.** Verified in CI to close within 0.05% on every scene.
  That proves the arithmetic. It says nothing about realism.

Several things in it are invented:

- **The rainfall depth-duration-frequency curve.** The coefficients are mine.
  This is **not** FEH. Real design work uses FEH22 or FEH13 via the UKCEH FEH
  Web Service. Replace `src/lib/rainfall.js` before anyone makes a decision.
- **The storm profile.** A symmetric Gaussian. Real profiles are asymmetric.
- **Infiltration.** A constant loss rate per land cover. No soil store, no
  saturation, no antecedent wetness.
- **The terrain.** Procedural. Not a DEM, no vertical datum, elevations are
  arbitrary metres above an arbitrary zero.

Known limits of the solver, in case they matter to what you are showing:

- Diffusive wave drops the inertia term, and the stability limiter caps how
  much water can cross a cell face per step. Together these hold velocities to
  roughly 1 to 2 m/s, so genuinely fast shallow flow cannot be reproduced. A
  planned lesson on depth-velocity hazard was dropped for this reason.
- Bridge decks are drawn but not hydraulically active. Piers are real: they are
  pushed into the bed and the solver routes around them. There is no pressure
  or orifice flow once a soffit drowns.
- Two cross-sections on the same channel only carry equal Q at steady state.

The in-app **"Where these numbers come from"** panel carries the same
information, per parameter, with links. Keep the two in step.
