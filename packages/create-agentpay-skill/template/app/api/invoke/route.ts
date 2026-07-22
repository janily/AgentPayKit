import { createNextPaidSkillRoute } from "@agentpaykit/server/next";
import skill from "../../../agentpay.skill";

export const runtime = "nodejs";
export const { POST } = createNextPaidSkillRoute(skill);
