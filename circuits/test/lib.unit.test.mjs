/**
 * Unit tests for circuit library templates via circom_tester.
 * Compiles each template as main and checks constraints / JS hash parity.
 */
import { assert } from "chai";
import {
  leafHash,
  mandateHash,
  nullifierHash,
  tagCommitment,
} from "./lib/hashes.mjs";
import { assertInvalidWitness, assertValidWitness, loadCircuit } from "./lib/tester.mjs";

describe("circuits/lib (circom_tester)", function () {
  this.timeout(120_000);

  describe("ScopeSubset", function () {
    let circuit;

    before(async function () {
      circuit = await loadCircuit("lib/scope_subset.circom", {
        templateName: "ScopeSubset",
      });
    });

    it("accepts child ⊆ parent", async function () {
      await assertValidWitness(circuit, { parent: "7", child: "1" });
    });

    it("rejects child with bit outside parent", async function () {
      await assertInvalidWitness(circuit, { parent: "1", child: "7" });
    });
  });

  describe("hash templates ↔ JS", function () {
    let tagCircuit;
    let leafCircuit;
    let nfCircuit;
    let mandateCircuit;

    before(async function () {
      tagCircuit = await loadCircuit("lib/warrant_hashes.circom", {
        templateName: "TagCommitment",
      });
      leafCircuit = await loadCircuit("lib/warrant_hashes.circom", {
        templateName: "WarrantLeafHash",
      });
      nfCircuit = await loadCircuit("lib/warrant_hashes.circom", {
        templateName: "WarrantNullifier",
      });
      mandateCircuit = await loadCircuit("lib/warrant_hashes.circom", {
        templateName: "WarrantMandateHash",
      });
    });

    it("TagCommitment matches poseidon-lite", async function () {
      const humanTag = 42n;
      const w = await assertValidWitness(tagCircuit, { humanTag: humanTag.toString() });
      await tagCircuit.assertOut(w, { out: tagCommitment(humanTag).toString() });
    });

    it("WarrantLeafHash matches poseidon-lite", async function () {
      const input = { pkX: "3", pkY: "5", tier: "2", epoch: "1" };
      const expected = leafHash(3n, 5n, 2n, 1n).toString();
      const w = await assertValidWitness(leafCircuit, input);
      await leafCircuit.assertOut(w, { out: expected });
    });

    it("WarrantNullifier matches poseidon-lite", async function () {
      const input = { humanTag: "42", contextHash: "99" };
      const expected = nullifierHash(42n, 99n).toString();
      const w = await assertValidWitness(nfCircuit, input);
      await nfCircuit.assertOut(w, { out: expected });
    });

    it("WarrantMandateHash matches poseidon-lite", async function () {
      const args = {
        childPkX: 11n,
        childPkY: 13n,
        scope: 7n,
        budget: 1000n,
        expiry: 1_700_000_000n,
        tier: 2n,
        epoch: 0n,
        parentHash: 0n,
        tagCommitment: tagCommitment(42n),
      };
      const input = Object.fromEntries(
        Object.entries(args).map(([k, v]) => [k, v.toString()]),
      );
      const expected = mandateHash(args).toString();
      const w = await assertValidWitness(mandateCircuit, input);
      await mandateCircuit.assertOut(w, { out: expected });
    });
  });

  describe("EnabledPrefix", function () {
    let circuit;

    before(async function () {
      circuit = await loadCircuit("lib/enabled_prefix.circom", {
        templateName: "EnabledPrefix",
        templateParams: [4],
      });
    });

    it("accepts [1,1,0,0]", async function () {
      await assertValidWitness(circuit, { enabled: ["1", "1", "0", "0"] });
    });

    it("rejects gap [1,0,1,0]", async function () {
      await assertInvalidWitness(circuit, { enabled: ["1", "0", "1", "0"] });
    });

    it("rejects disabled hop 0", async function () {
      await assertInvalidWitness(circuit, { enabled: ["0", "0", "0", "0"] });
    });
  });
});
