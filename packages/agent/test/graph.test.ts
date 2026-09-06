import assert from "node:assert/strict";
import { AGENT0_BASE_SEPOLIA_ID, WARRANT_STATUS_QUERY } from "../src/graph.ts";

describe("graph queries", function () {
  it("pins Agent0 Base Sepolia id and a registry query", function () {
    assert.equal(AGENT0_BASE_SEPOLIA_ID.length, 44);
    assert.match(WARRANT_STATUS_QUERY, /registry\(id: "1"\)/);
    assert.match(WARRANT_STATUS_QUERY, /bindings/);
  });
});
