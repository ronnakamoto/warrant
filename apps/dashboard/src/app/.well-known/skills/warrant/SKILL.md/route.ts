import { skillMdResponse } from "../../../../../lib/skill-md-response";

export function GET(req: Request): Response {
  return skillMdResponse(req);
}
