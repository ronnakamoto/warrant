import { createHash } from "node:crypto";
import { skillDescription, skillMarkdown, skillUrl } from "./guest-copy";

export const SKILL_SLUG = "warrant";

export function skillDigest(origin: string): string {
  const hex = createHash("sha256").update(skillMarkdown(origin), "utf8").digest("hex");
  return `sha256:${hex}`;
}

export function wellKnownSkillsIndex(origin: string) {
  return {
    skills: [
      {
        name: SKILL_SLUG,
        description: skillDescription(),
        files: ["SKILL.md"],
      },
    ],
  };
}

export function wellKnownAgentSkillsIndex(origin: string) {
  const host = origin.replace(/\/$/, "");
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        name: SKILL_SLUG,
        type: "skill-md",
        description: skillDescription(),
        url: skillUrl(host),
        digest: skillDigest(host),
      },
    ],
  };
}

export function skillMarkdownHeaders(): HeadersInit {
  return {
    "content-type": "text/markdown; charset=utf-8",
    "cache-control": "public, max-age=300",
    "access-control-allow-origin": "*",
  };
}

export function skillIndexHeaders(): HeadersInit {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300",
    "access-control-allow-origin": "*",
  };
}
