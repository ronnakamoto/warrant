import assert from "node:assert/strict";
import { createMyMemoryTranslator } from "../src/translate.ts";

describe("MyMemory translator", function () {
  it("maps a successful upstream payload", async function () {
    const translator = createMyMemoryTranslator(async () =>
      new Response(
        JSON.stringify({
          responseStatus: 200,
          responseData: { translatedText: "hola" },
        }),
        { status: 200 },
      ),
    );
    assert.equal(await translator({ text: "hello", source: "en", target: "es" }), "hola");
  });

  it("fails closed when upstream is empty", async function () {
    const translator = createMyMemoryTranslator(async () =>
      new Response(JSON.stringify({ responseStatus: 200, responseData: {} }), { status: 200 }),
    );
    await assert.rejects(() => translator({ text: "hello" }), /no text/);
  });
});
