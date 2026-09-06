import assert from "node:assert/strict";
import { assertProductionProveEnv } from "../src/prod-guard.ts";

const base = {
  PROVE_SECRET: "s",
  BIND_PRIVATE_KEY: "0x11",
  GAS_SPONSOR_PRIVATE_KEY: "0x22",
  REGISTRY_ADDRESS: "0x103749E5529c3Ce31A1EB8e0657280AaE7e9dA89",
  BASE_SEPOLIA_RPC: "https://sepolia.base.org",
  GRAPH_WARRANT_QUERY_URL: "https://api.studio.thegraph.com/query/1/warrant/latest",
};

describe("assertProductionProveEnv", function () {
  it("accepts distinct bind and gas-sponsor keys", function () {
    assert.doesNotThrow(() => assertProductionProveEnv(base));
  });

  it("rejects a missing Graph query URL", function () {
    const { GRAPH_WARRANT_QUERY_URL: _, ...rest } = base;
    assert.throws(() => assertProductionProveEnv(rest), /prod-guard:.*GRAPH_WARRANT_QUERY_URL/);
  });

  it("rejects a gas sponsor that is the bind key", function () {
    assert.throws(
      () =>
        assertProductionProveEnv({
          ...base,
          GAS_SPONSOR_PRIVATE_KEY: base.BIND_PRIVATE_KEY,
        }),
      /prod-guard:.*GAS_SPONSOR_PRIVATE_KEY/,
    );
  });

  it("rejects falling back to the bind key when the sponsor is unset", function () {
    const { GAS_SPONSOR_PRIVATE_KEY: _, ...rest } = base;
    assert.throws(() => assertProductionProveEnv(rest), /prod-guard:.*GAS_SPONSOR_PRIVATE_KEY/);
  });
});
