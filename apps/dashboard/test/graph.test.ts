import assert from "node:assert/strict";
import {
  AGENT0_BASE_SEPOLIA_ID,
  agent0ByOwner,
  countAgent0Overlap,
  expectedLeafByWallet,
  rowFromOnchain,
  walletsFromWarrantData,
  type WarrantGraphData,
} from "../src/lib/graph.ts";

const sample: WarrantGraphData = {
  registry: { currentRoot: "9", size: "1", updatedAt: "1" },
  bindings: [
    {
      id: "0xa11ce",
      wallet: "0xA11CE00000000000000000000000000000000000",
      leaf: "111",
      tier: 0,
      epoch: 1,
      index: "0",
      revokedOnce: true,
    },
  ],
  revokeEvents: [],
};

describe("graph mirror helpers", function () {
  it("normalizes wallets and expected leaves", function () {
    const wallets = walletsFromWarrantData(sample);
    assert.equal(wallets[0], "0xa11ce00000000000000000000000000000000000");
    assert.equal(expectedLeafByWallet(sample).get(wallets[0]!), "111");
  });

  it("counts Agent0 overlap by owner", function () {
    const row = rowFromOnchain(sample.bindings[0]!.wallet, {
      pkX: 1n,
      pkY: 2n,
      tier: 0,
      epoch: 1,
    });
    const n = countAgent0Overlap(
      [row],
      [
        {
          id: "84532:1",
          owner: "0xA11CE00000000000000000000000000000000000",
          registrationFile: { name: "demo", x402Support: true },
        },
      ],
    );
    assert.equal(n, 1);
    assert.equal(agent0ByOwner([{ id: "x", owner: row.wallet }]).has(row.wallet), true);
  });

  it("pins the public Agent0 Base Sepolia subgraph id", function () {
    assert.equal(AGENT0_BASE_SEPOLIA_ID, "4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u");
  });
});
