import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVENANCE, PROV_STATUS } from "../src/data/provenance.js";

test("every provenance row is complete and honestly classified", () => {
  for (const r of PROVENANCE) {
    assert.ok(r.param && r.used && r.source && r.caveat, `${r.param}: missing field`);
    assert.ok(PROV_STATUS[r.status], `${r.param}: unknown status "${r.status}"`);
  }
});

test("placeholder rows are not dressed up with a source link", () => {
  for (const r of PROVENANCE) {
    if (r.status === "placeholder" && r.url) {
      assert.ok(/FEH|Flood Estimation/i.test(r.urlLabel || ""),
        `${r.param}: a placeholder should only link out to what ought to replace it`);
    }
  }
  assert.ok(PROVENANCE.some((r) => r.status === "placeholder"),
    "the invented numbers must stay flagged as invented");
});

test("linked sources use absolute https URLs", () => {
  for (const r of PROVENANCE) {
    if (!r.url) continue;
    assert.match(r.url, /^https:\/\//, `${r.param}: link must be absolute https`);
    assert.ok(r.urlLabel, `${r.param}: link needs a human label`);
  }
});
