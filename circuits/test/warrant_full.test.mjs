/**
 * warrant.circom — circom_tester witness + constraint checks (binding & attenuation).
 */
import { nullifierHash, tagCommitment } from "./lib/hashes.mjs";
import { buildFullFixture } from "./lib/fixtures.mjs";
import { assertInvalidWitness, assertValidWitness, loadCircuit } from "./lib/tester.mjs";

describe("warrant full (circom_tester)", function () {
  this.timeout(300_000);

  let circuit;
  let fx;

  before(async function () {
    circuit = await loadCircuit("warrant.circom");
    fx = buildFullFixture();
  });

  it("accepts valid 2-hop chain and satisfies all constraints", async function () {
    await assertValidWitness(circuit, fx.input());
  });

  it("rejects tampered request signature", async function () {
    await assertInvalidWitness(
      circuit,
      fx.input({ reqS: (BigInt(fx.reqSig.S) + 1n).toString() }),
    );
  });

  it("rejects rotated humanTag (quota bypass)", async function () {
    const evilTag = 99n;
    await assertInvalidWitness(
      circuit,
      fx.input({
        humanTag: evilTag.toString(),
        nullifier: nullifierHash(evilTag, fx.contextHash).toString(),
      }),
    );
  });

  it("rejects mandates signed under wrong tagCommitment", async function () {
    const wrongTagSigs = fx.buildMandateSigs(tagCommitment(99n));
    await assertInvalidWitness(
      circuit,
      fx.input({
        sigS: wrongTagSigs.map((s) => s.S.toString()),
        sigR8x: wrongTagSigs.map((s) => s.R8[0].toString()),
        sigR8y: wrongTagSigs.map((s) => s.R8[1].toString()),
      }),
    );
  });

  it("rejects wrong nullifier", async function () {
    await assertInvalidWitness(circuit, fx.input({ nullifier: "1" }));
  });

  it("rejects widened scope on enabled hop", async function () {
    await assertInvalidWitness(
      circuit,
      fx.input({
        scopes: ["7", "7", "7", "7"],
        effectiveScope: "7",
      }),
    );
  });
});
