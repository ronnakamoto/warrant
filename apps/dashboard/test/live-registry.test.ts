import assert from "node:assert/strict";
import {
  LIVE_REGISTRY_ADDRESS,
  RETIRED_REGISTRY_ADDRESS,
  defaultRegistryAddress,
} from "../src/lib/live-registry.ts";

describe("live registry default", function () {
  it("uses the forest address when env is missing or retired", function () {
    assert.equal(defaultRegistryAddress(undefined), LIVE_REGISTRY_ADDRESS);
    assert.equal(defaultRegistryAddress(""), LIVE_REGISTRY_ADDRESS);
    assert.equal(defaultRegistryAddress(RETIRED_REGISTRY_ADDRESS), LIVE_REGISTRY_ADDRESS);
    assert.equal(
      defaultRegistryAddress(RETIRED_REGISTRY_ADDRESS.toLowerCase()),
      LIVE_REGISTRY_ADDRESS,
    );
  });

  it("keeps a non-retired override", function () {
    const other = "0x1111111111111111111111111111111111111111";
    assert.equal(defaultRegistryAddress(other), other);
  });
});
