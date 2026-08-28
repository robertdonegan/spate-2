/* The teaching sequence. Targets are set below measured achievable
   values — see test/lessons.test.js, which fails if a brief becomes
   impossible to complete. */

export const ZONE_A = { i0: 46, i1: 84, j0: 88, j1: 118, name: "Village" };
export const ZONE_B = { i0: 38, i1: 92, j0: 52, j1: 80, name: "Meadow" };

export const LESSONS = [
  {
    id: "read", title: "Read the ground",
    idea: "Rain falls evenly. Flooding never does.",
    brief: "Nothing you do changes the storm. The only thing deciding where water ends up is the shape of the ground it lands on.",
    task: "Before running anything, drop at least 3 floats where you think water will gather. Then run the storm.",
    kind: "absolute", metric: "floatDepth", better: "higher", target: 0.05,
    unit: "m", label: "Average depth under your floats",
    hint: "Use the Drop float tool. Follow the contours downhill: hollows and the valley floor are where it collects.",
    debrief: "You changed nothing and the water still went somewhere specific. Every flood map ever made starts here: the terrain is the model, and everything else is detail.",
    setup: { scene: "teaching", aep: 4, dur: 1, mode: 0, tool: "drop", outletOnly: true },
  },
  {
    id: "seal", title: "Seal the surface",
    idea: "Land cover changes the hydrograph more than people expect.",
    brief: "Same ground, same storm. The only thing changing is what the surface is made of.",
    task: "Run once for a baseline. Then pave the grass and pasture, reset, and run again. Push peak outflow up by 40%.",
    kind: "compare", metric: "peakQ", better: "higher", delta: 0.40,
    unit: "m3/s", label: "Peak outflow",
    hint: "Pick Paved in the Surface panel and paint the valley sides with a wide brush. Watch the infiltrated volume collapse.",
    debrief: "Paving does two things at once. It stops water soaking in, so more of it is available, and it drops Manning's n, so what is there arrives faster. Same rain, sharper peak.",
    setup: { scene: "teaching", aep: 1, dur: 5, mode: 0, tool: "paint", landIdx: 4, brush: 40, outletOnly: true },
  },
  {
    id: "peak", title: "Cut the peak",
    idea: "Storage delays water. It does not remove it.",
    brief: "The outlet downstream can only take so much at once. Dig somewhere for the water to wait.",
    task: "Run once for a baseline. Then dig storage into the valley floor, reset, and run again. Bring peak outflow down by 25%.",
    kind: "compare", metric: "peakQ", better: "lower", delta: 0.25,
    unit: "m3/s", label: "Peak outflow",
    hint: "Use Lower with a wide brush across the meadow, upstream of the village. Broad and shallow beats deep and narrow.",
    debrief: "Peak down by roughly half. Now read the volume rows: far less water reached the outlet, and almost exactly that much is still standing in the hollow you dug. Nothing vanished. But note what you actually built. A hole with no outlet is dead storage: it fills, holds, and only empties by soaking away. A real attenuation basin has a throttled outlet so it drains between events and works again next week. Dig this instead and the second storm of the winter arrives to find your storage already full.",
    setup: { scene: "teaching", aep: 4, dur: 1, mode: 0, tool: "lower", brush: 38, outletOnly: true },
  },
  {
    id: "rough", title: "Buy time",
    idea: "Roughness is a delay, not a capacity.",
    brief: "No digging this time. You may only change how rough the surface is.",
    task: "Run once for a baseline. Then make the catchment rougher, reset, and run again. Push the time of peak outflow 15% later.",
    kind: "compare", metric: "tPeak", better: "higher", delta: 0.15,
    unit: "min", label: "Time to peak outflow",
    hint: "Raise the roughness multiplier in the Surface panel, or paint dense scrub across the valley floor.",
    debrief: "Later peak, same volume. That extra time is what a flood warning is made of, and it is why upstream land management counts as a real intervention rather than a soft one.",
    setup: { scene: "teaching", aep: 4, dur: 0, mode: 2, tool: "paint", landIdx: 2, brush: 40, outletOnly: true },
  },
  {
    id: "intensity", title: "Rain that arrives too fast",
    idea: "Infiltration is a rate, not a sponge.",
    brief: "The ground can only swallow so many millimetres an hour. Past that, everything else runs off, no matter how much or how little fell in total.",
    task: "Run the 6 hour storm for a baseline. Then switch the duration to 15 minutes at the same rarity, reset, and run again. Push peak outflow up by 80%.",
    kind: "compare", metric: "peakQ", better: "higher", delta: 0.80,
    unit: "m3/s", label: "Peak outflow",
    hint: "Change only Storm duration in the Design rainfall panel. Note the total depth going down as you do it.",
    debrief: "The short storm drops about a fifth as much rain and produces roughly three times the peak. Infiltration is a rate: exceed it and the surplus runs off immediately. This is why a summer cloudburst floods streets that shrug off a week of drizzle.",
    setup: { scene: "teaching", aep: 1, dur: 5, mode: 0, tool: "orbit", outletOnly: true },
  },
  {
    id: "move", title: "Move the problem",
    idea: "Defending one place spends the water somewhere else.",
    brief: "There is a village in the hollow at the bottom of this valley and a meadow on the floor above it. Protect the village.",
    task: "Get the village below 0.25 m while the meadow goes above 0.30 m. Both have to be true at once.",
    kind: "zones", unit: "m", label: "Village depth / Meadow depth",
    hint: "Build an embankment across the valley just above the village with Raise or Stamp, then watch where the water you turned away decides to sit.",
    debrief: "You could not pass by protecting the village alone. The water had to go somewhere and it went to the meadow. Every defence is a redistribution, which is why schemes are appraised on their catchment-wide effect and not on the dry side of the wall.",
    setup: { scene: "teaching", aep: 4, dur: 1, mode: 4, tool: "raise", brush: 24, outletOnly: true },
  },
];
