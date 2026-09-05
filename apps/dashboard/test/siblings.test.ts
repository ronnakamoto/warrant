import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashLeaf } from "../src/lib/leaf.ts";
import {
  applyRevokeLocal,
  mirrorFromMembers,
  revokeSiblings,
} from "../src/lib/tree.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixture = JSON.parse(
  readFileSync(join(root, "contracts/test/fixtures/registry.json"), "utf8"),
);

describe("@warrant/dashboard LeanIMT revoke siblings", function () {
  it("matches registry fixture siblings and post-revoke root", function () {
    const members = [
      BigInt(fixture.alice.leaf0),
      BigInt(fixture.bob.leaf0),
      BigInt(fixture.carol.leaf0),
    ];
    assert.equal(
      mirrorFromMembers(members).root.toString(),
      fixture.rootAfterCarol,
    );

    const siblings = revokeSiblings(members, Number(fixture.revokeIndex ?? 0));
    assert.deepEqual(
      siblings.map(String),
      fixture.revokeSiblings.map(String),
    );

    const alice1 = hashLeaf(
      BigInt(fixture.alice.pkX),
      BigInt(fixture.alice.pkY),
      2n,
      1n,
    );
    assert.equal(alice1.toString(), fixture.alice.leaf1);

    const after = applyRevokeLocal(members, 0, alice1);
    assert.equal(after.root.toString(), fixture.rootAfterRevoke);
  });
});
