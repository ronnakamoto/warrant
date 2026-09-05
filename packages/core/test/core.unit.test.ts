import assert from "node:assert/strict";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  DEPTH,
  FETCH,
  MAX_MERKLE_DEPTH,
  PUBLIC_INPUT_COUNT,
  SNARK_SCALAR_FIELD,
  TRANSLATE,
  buildWitness,
  createGroup,
  createMandate,
  fromArray,
  hashChallenge,
  hashLeaf,
  hashMandate,
  hashNullifier,
  isSubset,
  keygen,
  padSiblings,
  tagCommitment,
  toArray,
} from "../src/index.ts";

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt(hex);
}

describe("@warrant/core unit", function () {
  describe("scope", function () {
    it("TRANSLATE is a subset of TRANSLATE|FETCH", function () {
      assert.equal(isSubset(TRANSLATE | FETCH, TRANSLATE), true);
    });

    it("rejects a child bit outside the parent", function () {
      assert.equal(isSubset(TRANSLATE, TRANSLATE | FETCH), false);
    });
  });

  describe("domain hashes", function () {
    it("matches circuit-style Poseidon(DST, …) for tag / leaf / nullifier / mandate", function () {
      const tagC = tagCommitment(42n);
      assert.equal(
        tagC,
        4549777286600784174718678484675446482127744232177423456862222568218645223680n,
      );
      assert.equal(
        hashLeaf(3n, 5n, 2n, 1n),
        19046931918507764192933391003423037343388012440751921256456719471532387224669n,
      );
      assert.equal(
        hashNullifier(42n, 99n),
        9011151809632616701748402300217200460908436654495226930098180519798544030456n,
      );
      assert.equal(
        hashMandate({
          childPkX: 11n,
          childPkY: 13n,
          scope: 7n,
          budgetCap: 1000n,
          expiry: 1_700_000_000n,
          tier: 2n,
          epoch: 0n,
          parentHash: 0n,
          tagCommitment: tagC,
        }),
        19544028308308890761844252421537373104263960329909119131456717842076870810099n,
      );
    });
  });

  describe("public inputs", function () {
    it("encodes length 8 in toArray / fromArray", function () {
      const p = fromArray([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n]);
      const arr = toArray(p);
      assert.equal(arr.length, PUBLIC_INPUT_COUNT);
      assert.equal(PUBLIC_INPUT_COUNT, 8);
      assert.throws(() => fromArray([1n, 2n, 3n]));
    });
  });

  describe("hashChallenge", function () {
    const parts = {
      method: "POST",
      path: "/v1/translate",
      nonce: "n1",
      merkleRoot: "1",
      amount: "0",
      payTo: "0x00",
      bodyHash: "",
    };

    it("is keccak256(method|path|nonce|merkleRoot|amount|payTo|bodyHash) mod r", function () {
      const canonical = "POST|/v1/translate|n1|1|0|0x00|";
      const expected = bytesToBigInt(keccak_256(utf8(canonical))) % SNARK_SCALAR_FIELD;
      assert.equal(hashChallenge(parts), expected);
      assert.ok(hashChallenge(parts) < SNARK_SCALAR_FIELD);
    });

    it("changes when the nonce changes", function () {
      assert.notEqual(hashChallenge(parts), hashChallenge({ ...parts, nonce: "n2" }));
    });
  });

  describe("tree pad", function () {
    it("pads siblings to MAX_MERKLE_DEPTH", function () {
      const padded = padSiblings([1n, 2n]);
      assert.equal(padded.length, MAX_MERKLE_DEPTH);
      assert.equal(padded[0], 1n);
      assert.equal(padded[19], 0n);
    });
  });

  describe("createMandate", function () {
    it("rejects a widened scope", function () {
      const parent = keygen("wp4-parent");
      const child = keygen("wp4-child");
      assert.throws(
        () =>
          createMandate({
            parent,
            child,
            scope: TRANSLATE | FETCH,
            budgetCap: 100n,
            expiry: 1_800_000_000n,
            tier: 2n,
            epoch: 0n,
            parentHash: 0n,
            humanTag: 42n,
            parentScope: TRANSLATE,
          }),
        /subset/,
      );
    });

    it("signs hop 0 with the parent key", function () {
      const parent = keygen("wp4-parent-ok");
      const child = keygen("wp4-child-ok");
      const signed = createMandate({
        parent,
        child,
        scope: TRANSLATE,
        budgetCap: 200_000n,
        expiry: 1_800_000_000n,
        tier: 2n,
        epoch: 0n,
        parentHash: 0n,
        humanTag: 42n,
      });
      assert.equal(signed.childPkX, child.publicKey[0]);
      assert.notEqual(signed.signature.S, 0n);
    });
  });

  describe("dummy hops", function () {
    it("reuses an on-curve identity (Ax != 0) for disabled hops", function () {
      const root = keygen("wp4-dummy-root");
      const agent = keygen("wp4-dummy-agent");
      const translator = keygen("wp4-dummy-translator");
      const now = BigInt(Math.floor(Date.now() / 1000));
      const hop0 = createMandate({
        parent: root,
        child: agent,
        scope: 7n,
        budgetCap: 2_000_000n,
        expiry: now + 86400n,
        tier: 2n,
        epoch: 0n,
        parentHash: 0n,
        humanTag: 42n,
      });
      const hop1 = createMandate({
        parent: agent,
        child: translator,
        scope: TRANSLATE,
        budgetCap: 200_000n,
        expiry: now + 3600n,
        tier: 2n,
        epoch: 0n,
        parentHash: hop0.hash,
        humanTag: 42n,
        parentScope: hop0.scope,
        parentBudgetCap: hop0.budgetCap,
        parentExpiry: hop0.expiry,
      });
      const leaf = hashLeaf(root.publicKey[0], root.publicKey[1], 2n, 0n);
      const group = createGroup([leaf, 11n, 22n]);
      const { witness } = buildWitness({
        root,
        children: [agent, translator],
        mandates: [hop0, hop1],
        group,
        leafIndex: 0,
        humanTag: 42n,
        contextHash: 99n,
        requestHash: 123456789n,
        minExpiry: now,
      });
      assert.equal(witness.enabled.length, DEPTH);
      assert.deepEqual(witness.enabled, [1n, 1n, 0n, 0n]);
      assert.notEqual(witness.childPkX[2], 0n);
      assert.notEqual(witness.childPkX[3], 0n);
      assert.equal(witness.childPkX[2], translator.publicKey[0]);
      assert.equal(witness.siblings.length, MAX_MERKLE_DEPTH);
    });
  });
});
