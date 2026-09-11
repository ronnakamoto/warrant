import assert from "node:assert/strict";
import { createGraphLeafLoader, mergeForestLeaves, mergeGuestLeaf } from "../src/members.ts";

describe("forest members", function () {
  it("keeps insertion order and skips duplicates", function () {
    assert.deepEqual(mergeForestLeaves(["1"], ["1", "2", ""]), ["1", "2"]);
    assert.deepEqual(mergeGuestLeaf(["1"], "3"), ["1", "3"]);
  });

  it("loads forestLeaves when the graph has a forest", async function () {
    const load = createGraphLeafLoader({
      queryUrl: "https://graph.example/query",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            data: {
              forestLeaves: [
                { leaf: "10", index: "0" },
                { leaf: "0", index: "1" },
                { leaf: "12", index: "2" },
              ],
            },
          }),
        ),
    });
    assert.deepEqual(await load(), ["10", "0", "12"]);
  });

  it("falls back to bindings when the forest is empty", async function () {
    let n = 0;
    const load = createGraphLeafLoader({
      queryUrl: "https://graph.example/query",
      fetchImpl: async (_url, init) => {
        n += 1;
        const query = String((init as { body?: string })?.body ?? "");
        if (query.includes("forestLeaves")) {
          return new Response(JSON.stringify({ data: { forestLeaves: [] } }));
        }
        return new Response(
          JSON.stringify({ data: { bindings: [{ leaf: "99", index: "0" }] } }),
        );
      },
    });
    assert.deepEqual(await load(), ["99"]);
    assert.equal(n, 2);
  });
});
