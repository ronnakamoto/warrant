import { skillMarkdown } from "./guest-copy";
import { skillMarkdownHeaders } from "./skill-discovery";

export function skillMdResponse(req: Request): Response {
  let origin = "https://warrant-beta.vercel.app";
  try {
    origin = new URL(req.url).origin;
  } catch {
    /* keep public host */
  }
  return new Response(skillMarkdown(origin), {
    status: 200,
    headers: skillMarkdownHeaders(),
  });
}
