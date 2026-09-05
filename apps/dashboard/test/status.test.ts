import assert from "node:assert/strict";
import {
  friendlyError,
  formatLogTime,
  logKindLabel,
  rootsMatch,
  shortRoot,
  shortWallet,
  treeStatus,
} from "../src/lib/status.ts";

describe("dashboard status copy", function () {
  it("shortens roots and treats 0 as empty", function () {
    assert.equal(shortRoot("0"), "—");
    assert.equal(shortRoot(""), "—");
    assert.equal(
      shortRoot("20861805211526232938070923571816977949781638472570023897298154932774932160018"),
      "20861805…160018",
    );
  });

  it("classifies empty / local-only / sync / drift", function () {
    assert.equal(treeStatus(0, "", "0").kind, "empty");
    assert.equal(treeStatus(1, "", "99").kind, "local-only");
    assert.equal(treeStatus(1, "99", "99").kind, "sync");
    assert.equal(treeStatus(1, "1", "2").kind, "drift");
    assert.equal(rootsMatch("99", "99"), true);
    assert.equal(rootsMatch("—", "99"), false);
  });

  it("rewrites jargon errors", function () {
    assert.match(friendlyError("Expected property name in JSON at position 1"), /valid JSON/);
    assert.match(friendlyError("Private key must be 0x-prefixed"), /stays in this browser/);
    assert.equal(friendlyError("rpc timeout"), "rpc timeout");
    assert.equal(shortWallet("0xa16d90c5f9D2B14133Db64D57ac81F46DD1161eF"), "0xa16d…61eF");
    assert.equal(logKindLabel("info"), "note");
    assert.equal(logKindLabel("checked"), "checked");
  });

  it("formats log timestamps", function () {
    const out = formatLogTime("2026-09-05T10:24:38.810Z");
    assert.notEqual(out, "2026-09-05T10:24:38.810Z");
    assert.match(out, /Sep/);
  });
});
