/* Where every number in the model comes from. Keep this honest. */

/* ====================================================== data provenance ==
   Every dial in this model is one of: a published formula, a typical value
   taken from the literature, or something I made up so the thing would run.
   This table exists so nobody ever has to guess which.                    */
export const PROV_STATUS = {
  formula:     { label: "Published formula", col: "#5FBF8F" },
  typical:     { label: "Typical value",     col: "#C9A227" },
  placeholder: { label: "Placeholder",       col: "#E05A4E" },
  userset:     { label: "You set it",        col: "#7A919C" },
};
export const PROVENANCE = [
  {
    param: "Manning's n by land cover",
    url: "https://pubs.usgs.gov/publication/wsp2339",
    urlLabel: "USGS Water-Supply Paper 2339 (Arcement & Schneider, 1989)",
    status: "typical",
    used: "0.016 paved to 0.10 dense scrub",
    source: "Open-channel roughness tables in the Chow lineage, reproduced across UK modelling guidance.",
    caveat: "Mid-range figures picked by hand. Not calibrated to any site, and real n varies with depth and season.",
  },
  {
    param: "Infiltration rate by land cover",
    status: "placeholder",
    used: "0 to 20 mm/hr, constant",
    source: "Indicative soil infiltration ranges, chosen to be plausible by cover type.",
    caveat: "Constant-rate loss. No soil store, no saturation, no antecedent wetness. Green-Ampt or SCS curve numbers would be the real answer.",
  },
  {
    param: "Rainfall depth by AEP and duration",
    url: "https://fehweb.ceh.ac.uk/",
    urlLabel: "FEH Web Service, UK Centre for Ecology & Hydrology",
    status: "placeholder",
    used: "12.5 x D^0.48 x growth factor",
    source: "Invented curve. The shape mimics a depth-duration-frequency relationship; the coefficients are mine.",
    caveat: "This is NOT FEH. Swap in real DDF data before anyone quotes a depth from this. The growth factors are shaped to look FEH-ish and nothing more.",
  },
  {
    param: "Storm profile",
    url: "https://www.ceh.ac.uk/data/software-models/flood-estimation-handbook",
    urlLabel: "Flood Estimation Handbook, UKCEH",
    status: "placeholder",
    used: "Uniform, or a Gaussian centre-peak",
    source: "A normalised bell curve, area-preserving.",
    caveat: "Real design work uses FEH or ReFH summer and winter profiles, which are asymmetric and nothing like a Gaussian.",
  },
  {
    param: "Climate change uplift",
    url: "https://www.gov.uk/guidance/flood-risk-assessments-climate-change-allowances",
    urlLabel: "Flood risk assessments: climate change allowances, GOV.UK",
    status: "userset",
    used: "0 to 50% on rainfall depth",
    source: "No dataset. A free slider.",
    caveat: "Real allowances come from UKCP18 and vary by river basin district, epoch and percentile. Picking one is a policy decision, not a modelling one.",
  },
  {
    param: "Flood hazard rating",
    url: "https://assets.publishing.service.gov.uk/media/602d04a98fa8f5037d371a08/FLOOD_HAZARD_RATINGS_AND_THRESHOLDS_explanatory_note.pdf",
    urlLabel: "Supplementary note on flood hazard ratings and thresholds (EA / HR Wallingford)",
    status: "formula",
    used: "HR = d x (v + 0.5)",
    source: "Defra and Environment Agency Flood Risks to People research, FD2320. The published form is HR = ((v + 0.5) x d) + DF, where DF is a debris factor.",
    caveat: "This model omits DF entirely, so it reads low. FD2320/TR2 applies a default debris factor of 0.5 below 0.25 m depth and 1.0 above it, which would shift every band here. The 2.5 threshold for danger to all is used as published.",
  },
  {
    param: "Hydraulic solver",
    status: "formula",
    used: "Manning diffusive wave on a raster",
    source: "Standard simplified 2D routing: discharge between cells from Manning's equation on the water-surface slope, with the interface depth taken from the higher water surface and the higher bed.",
    caveat: "Diffusive wave drops the inertia term, and the stability limiter caps how much water can cross a cell face per step. Together these hold velocities to roughly 1 to 2 m/s, so genuinely fast shallow flow cannot be reproduced here. A depth-velocity hazard lesson had to be dropped for exactly this reason. A full inertial or shallow-water scheme is the next step up.",
  },
  {
    param: "Terrain",
    status: "placeholder",
    used: "Synthetic heightfield, 256 x 256 m at 2 m cells",
    source: "Procedural. Sculpted by hand from here.",
    caveat: "Not a DEM. No real catchment, no real levels, no vertical datum. The elevations are arbitrary metres above an arbitrary zero.",
  },
  {
    param: "Boundary conditions",
    status: "typical",
    used: "Free overfall, or a fixed stage",
    source: "Both are standard raster-model boundary treatments.",
    caveat: "The free overfall assumes dry ground just outside the domain regardless of what the terrain is doing at the edge.",
  },
];
