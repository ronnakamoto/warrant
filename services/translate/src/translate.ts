/** Upstream translation — MyMemory (no API key for light testnet use). */

export type TranslateArgs = {
  text: string;
  source?: string;
  target?: string;
};

export type Translator = (args: TranslateArgs) => Promise<string>;

const MYMEMORY = "https://api.mymemory.translated.net/get";

export function createMyMemoryTranslator(
  fetchImpl: typeof fetch = fetch,
): Translator {
  return async (args) => {
    const text = args.text.trim();
    if (!text) return "";
    const source = args.source ?? "en";
    const target = args.target ?? "es";
    const url = new URL(MYMEMORY);
    url.searchParams.set("q", text);
    url.searchParams.set("langpair", `${source}|${target}`);
    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new Error(`translate upstream HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number;
    };
    const out = json.responseData?.translatedText;
    if (!out || json.responseStatus === 403) {
      throw new Error("translate upstream returned no text");
    }
    return out;
  };
}

export const translate: Translator = createMyMemoryTranslator();
