export type BindingRow = {
  wallet: string;
  pkX: string;
  pkY: string;
  tier: number;
  epoch: number;
  label?: string;
};

export type MirrorDoc = {
  members: string[];
  bindings: BindingRow[];
};

export const STORAGE_KEY = "warrant.dashboard.mirror.v1";

export const emptyMirror = (): MirrorDoc => ({ members: [], bindings: [] });

export function loadMirror(): MirrorDoc {
  if (typeof window === "undefined") return emptyMirror();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMirror();
    const parsed = JSON.parse(raw) as MirrorDoc;
    return {
      members: Array.isArray(parsed.members) ? parsed.members.map(String) : [],
      bindings: Array.isArray(parsed.bindings) ? parsed.bindings : [],
    };
  } catch {
    return emptyMirror();
  }
}

export function saveMirror(doc: MirrorDoc): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}

export function formatMirrorJson(doc: MirrorDoc): string {
  return JSON.stringify(doc, null, 2);
}

export function parseMirrorJson(raw: string): MirrorDoc {
  const doc = JSON.parse(raw || "{}") as MirrorDoc;
  if (!Array.isArray(doc.members)) throw new Error("members[] required");
  return {
    members: doc.members.map(String),
    bindings: Array.isArray(doc.bindings) ? doc.bindings : [],
  };
}
