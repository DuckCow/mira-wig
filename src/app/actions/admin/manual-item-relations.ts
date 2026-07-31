"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import {
  createManualStyleRelation,
  setManualStyleRelationActive,
  updateManualStyleRelation,
} from "@/lib/manual-item-relations/admin";
import {
  ManualStyleRelationException,
  type CreateManualStyleRelationInput,
  type ManualStyleRelationErrorCode,
  type UpdateManualStyleRelationInput,
} from "@/lib/manual-item-relations/types";

type AdminErrorCode =
  | ManualStyleRelationErrorCode
  | "UNAUTHENTICATED"
  | "FORBIDDEN";

export type ManualStyleRelationActionResult<
  T extends Record<string, unknown> = Record<never, never>,
> =
  | ({ success: true } & T)
  | { success: false; errorCode: AdminErrorCode };

function handleError(error: unknown): { success: false; errorCode: AdminErrorCode } {
  if (error instanceof ManualStyleRelationException) {
    return { success: false, errorCode: error.code };
  }
  throw error;
}

function revalidateRelationPaths(sourceStyleId: string): void {
  revalidatePath(`/admin/styles/${sourceStyleId}`);
  revalidatePath(`/styles/${sourceStyleId}`);
}

export async function createManualStyleRelationAction(
  input: CreateManualStyleRelationInput,
): Promise<ManualStyleRelationActionResult<{ relationId: string }>> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    const serviceInput: CreateManualStyleRelationInput = {
      sourceStyleId: input.sourceStyleId,
      targetStyleId: input.targetStyleId,
      marketCode: input.marketCode,
      purpose: input.purpose,
      priority: input.priority,
      internalRationale: input.internalRationale,
    };
    const result = await createManualStyleRelation(guard.session.user.id, serviceInput);
    revalidateRelationPaths(result.sourceStyleId);
    return { success: true, relationId: result.id };
  } catch (error) {
    return handleError(error);
  }
}

export async function updateManualStyleRelationAction(
  relationId: string,
  input: UpdateManualStyleRelationInput,
): Promise<ManualStyleRelationActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    const serviceInput: UpdateManualStyleRelationInput = {
      ...(input.purpose !== undefined && { purpose: input.purpose }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(Object.hasOwn(input, "internalRationale") && {
        internalRationale: input.internalRationale,
      }),
    };
    const result = await updateManualStyleRelation(
      guard.session.user.id,
      relationId,
      serviceInput,
    );
    revalidateRelationPaths(result.sourceStyleId);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function setManualStyleRelationActiveAction(
  relationId: string,
  isActive: unknown,
): Promise<ManualStyleRelationActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    const result = await setManualStyleRelationActive(
      guard.session.user.id,
      relationId,
      isActive,
    );
    revalidateRelationPaths(result.sourceStyleId);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}
