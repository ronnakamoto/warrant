import { skillMarkdown } from "../../lib/guest-copy";

export function GET(req: Request): Response {
  let origin = "https://warrant-beta.vercel.app";
  try {
    origin = new URL(req.url).origin;
  } catch {
    /* keep public host */
  }
  return new Response(skillMarkdown(origin), {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
