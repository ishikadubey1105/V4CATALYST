import { cookies } from "next/headers";
import type { Case, User } from "@prisma/client";
import { db } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";
import { forbidden, notFound, unauthorized } from "./http";

export type Actor = Pick<User, "id" | "name" | "email" | "role" | "team" | "title">;

export async function currentUser(): Promise<Actor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await verifySession(token);
  if (!claims) return null;
  return db.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, name: true, email: true, role: true, team: true, title: true },
  });
}

export async function requireUser(): Promise<Actor> {
  const user = await currentUser();
  if (!user) throw unauthorized();
  return user;
}

export function requireRole(user: Actor, ...roles: string[]) {
  if (!roles.includes(user.role)) throw forbidden();
}

export type CaseAction =
  | "view"
  | "edit" // change case contents
  | "handoff" // initiate or submit a handoff
  | "reassign" // manager override
  | "close";

// MEMBER sees a case they own, owned before, are part of a handoff on, or
// have work assigned on. MANAGER sees their team. ADMIN and AUDITOR see all.
async function isInvolved(userId: string, caseId: string) {
  const [period, handoff, action] = await Promise.all([
    db.ownershipPeriod.findFirst({ where: { caseId, userId }, select: { id: true } }),
    db.handoff.findFirst({ where: { caseId, OR: [{ fromUserId: userId }, { toUserId: userId }] }, select: { id: true } }),
    db.actionItem.findFirst({ where: { caseId, assigneeId: userId }, select: { id: true } }),
  ]);
  return Boolean(period || handoff || action);
}

export async function canViewCase(user: Actor, c: Pick<Case, "id" | "team" | "currentOwnerId">) {
  if (user.role === "ADMIN" || user.role === "AUDITOR") return true;
  if (user.role === "MANAGER" && c.team === user.team) return true;
  if (c.currentOwnerId === user.id) return true;
  return isInvolved(user.id, c.id);
}

export function canEditCase(user: Actor, c: Pick<Case, "team" | "currentOwnerId" | "status">) {
  if (c.status === "CLOSED") return false;
  if (user.role === "AUDITOR") return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "MANAGER" && c.team === user.team) return true;
  return c.currentOwnerId === user.id;
}

// Loads a case and enforces the action in one read, so the access decision and
// the data it protects come from the same row.
export async function authorizeCase(user: Actor, caseId: string, action: CaseAction): Promise<Case> {
  const c = await db.case.findUnique({ where: { id: caseId } });
  if (!c) throw notFound("Case");
  if (!(await canViewCase(user, c))) throw notFound("Case"); // no existence leak

  switch (action) {
    case "view":
      return c;
    case "edit":
    case "handoff":
    case "close":
      if (!canEditCase(user, c)) throw forbidden();
      if (action === "edit" && c.status === "IN_HANDOFF")
        throw forbidden("This case is awaiting acceptance by its new owner. Cancel the handoff to edit it.");
      return c;
    case "reassign":
      if (user.role === "ADMIN" || (user.role === "MANAGER" && c.team === user.team)) return c;
      throw forbidden("Only a manager of this team can reassign a case.");
  }
}

export function publicUser(u: Pick<User, "id" | "name" | "role" | "team" | "title">) {
  return { id: u.id, name: u.name, role: u.role, team: u.team, title: u.title };
}
