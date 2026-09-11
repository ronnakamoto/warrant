import assert from "node:assert/strict";
import { rootFromReceipt } from "../src/bind.ts";
import type { Hex } from "viem";

describe("rootFromReceipt", function () {
  it("reads Bound.root from a mined forest bind", function () {
    const root = rootFromReceipt(
      {
        logs: [
          {
            address: "0x8704606Bde5E257dC009cCe55214Df70975f89c5",
            topics: [
              "0xa45e7c1c75c6313e3f9027619134aa5675b481e4f45c9979b6532e9b69503089",
              "0x000000000000000000000000a565b30be466e71984d15c46cbe479bcce907e17",
            ] as [Hex, ...Hex[]],
            data: "0x0de2d0ed63c22e4c1e1e9dbddf75c761513f0b15d91ee3d86482a498ce5fda6e0de2d0ed63c22e4c1e1e9dbddf75c761513f0b15d91ee3d86482a498ce5fda6e0000000000000000000000000000000000000000000000000000000000000000",
          },
        ],
      },
      "Bound",
    );
    assert.equal(
      root,
      0x0de2d0ed63c22e4c1e1e9dbddf75c761513f0b15d91ee3d86482a498ce5fda6en,
    );
  });

  it("returns undefined when the event is missing", function () {
    assert.equal(rootFromReceipt({ logs: [] }, "Bound"), undefined);
  });
});
