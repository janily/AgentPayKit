import { createNextPaidSkillDescriptorRoute } from "@agentpaykit/server/next";
import skill from "../../../agentpay.skill";

export const runtime = "nodejs";
export const { GET } = createNextPaidSkillDescriptorRoute(skill);
