import { db } from "./db";
import { canViewCase, type Actor } from "./authz";
import { notFound } from "./http";

// Who may see a handoff: its two participants, a manager of the team, admins
// and auditors. Everyone else gets a 404, not a 403.
export async function loadHandoffFor(user: Actor, id: string) {
  const h = await db.handoff.findUnique({ where: { id }, include: { case: true } });
  if (!h) throw notFound("Handoff");
  const participant = h.fromUserId === user.id || h.toUserId === user.id;
  if (!participant && !(await canViewCase(user, h.case))) throw notFound("Handoff");
  return h;
}

export const ACTIVE_HANDOFF_STATES = ["DRAFT", "PENDING_ACCEPT"];
