import prisma from "./db.js";
import type { AuthPayload } from "../middleware/auth.js";

interface LogParams {
  user: AuthPayload;
  tripId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  entityName: string;
  description: string;
  previousState?: unknown;
  newState?: unknown;
}

export async function logChange(params: LogParams) {
  return prisma.changeLog.create({
    data: {
      tripId: params.tripId,
      userCode: params.user.code,
      userDisplayName: params.user.displayName,
      actionType: params.actionType,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName,
      description: params.description,
      previousState: params.previousState as any,
      newState: params.newState as any,
    },
  });
}
