/**
 * warrant_lean.circom — circom_tester witness + constraint checks.
 */
import { buildLeanFixture } from "./lib/fixtures.mjs";
import { assertInvalidWitness, assertValidWitness, loadCircuit } from "./lib/tester.mjs";

describe("warrant_lean (circom_tester)", function () {
  this.timeout(180_000);

  let circuit;
  let fx;

  before(async function () {
    circuit = await loadCircuit("warrant_lean.circom");
    fx = buildLeanFixture();
  });

  it("valid epoch-0 leaf against live root", async function () {
    await assertValidWitness(
      circuit,
      fx.input({ merkleRoot: fx.rootBefore, epoch: 0n, proof: fx.proofBefore }),
    );
  });

  it("valid after revoke with matching epoch", async function () {
    await assertValidWitness(
      circuit,
      fx.input({ merkleRoot: fx.rootAfter, epoch: 1n, proof: fx.proofAfter }),
    );
  });

  it("rejects wrong merkle root", async function () {
    await assertInvalidWitness(
      circuit,
      fx.input({ merkleRoot: fx.rootAfter, epoch: 0n, proof: fx.proofBefore }),
    );
  });

  it("rejects stale epoch", async function () {
    await assertInvalidWitness(
      circuit,
      fx.input({ merkleRoot: fx.rootAfter, epoch: 0n, proof: fx.proofAfter }),
    );
  });

  it("rejects widened scope", async function () {
    await assertInvalidWitness(
      circuit,
      fx.input({
        merkleRoot: fx.rootAfter,
        epoch: 1n,
        proof: fx.proofAfter,
        overrides: { scopes: ["1", "7", "7", "7"], effectiveScope: "7" },
      }),
    );
  });

  it("rejects widened budget", async function () {
    await assertInvalidWitness(
      circuit,
      fx.input({
        merkleRoot: fx.rootAfter,
        epoch: 1n,
        proof: fx.proofAfter,
        overrides: {
          budgets: ["2000000", "3000000", "3000000", "3000000"],
          effectiveBudgetCap: "3000000",
        },
      }),
    );
  });

  it("rejects widened expiry", async function () {
    const n = fx.now;
    await assertInvalidWitness(
      circuit,
      fx.input({
        merkleRoot: fx.rootAfter,
        epoch: 1n,
        proof: fx.proofAfter,
        overrides: {
          expiries: [
            (n + 3600n).toString(),
            (n + 86400n).toString(),
            (n + 86400n).toString(),
            (n + 86400n).toString(),
          ],
        },
      }),
    );
  });

  it("rejects wrong nullifier", async function () {
    await assertInvalidWitness(
      circuit,
      fx.input({
        merkleRoot: fx.rootAfter,
        epoch: 1n,
        proof: fx.proofAfter,
        overrides: { nullifier: "1" },
      }),
    );
  });
});
