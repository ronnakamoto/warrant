import { wellKnownSkillsIndex, skillIndexHeaders } from "../../../../lib/skill-discovery";

export function GET(req: Request): Response {
  const origin = new URL(req.url).origin;
  return Response.json(wellKnownSkillsIndex(origin), { headers: skillIndexHeaders() });
}
