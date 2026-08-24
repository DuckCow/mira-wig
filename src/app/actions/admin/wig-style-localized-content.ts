"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import {
  assertEditorialApprover,
  assertPublisher,
} from "@/lib/wig-style-localized-content/authority";
import {
  decideLocalizedRevision,
  publishLocalizedRevision,
  submitLocalizedRevision,
  withdrawLocalizedPublication,
} from "@/lib/wig-style-localized-content/commands";
import {
  LocalizedContentException,
  type DecideRevisionInput,
  type LocalizedContentErrorCode,
  type PublishRevisionInput,
  type SubmitRevisionInput,
  type WithdrawPublicationInput,
} from "@/lib/wig-style-localized-content/types";

type AdminLocalizedActionError =
  | LocalizedContentErrorCode
  | "UNAUTHENTICATED"
  | "FORBIDDEN";

export type AdminLocalizedActionResult =
  | { success: true }
  | { success: false; errorCode: AdminLocalizedActionError };

function failure(error: unknown): { success: false; errorCode: AdminLocalizedActionError } {
  if (error instanceof LocalizedContentException) {
    return { success: false, errorCode: error.code };
  }
  throw error;
}

function revalidateLocalizedContent(wigStyleId: string): void {
  revalidatePath(`/admin/styles/${encodeURIComponent(wigStyleId)}`);
  revalidatePath("/[market]/[locale]/styles", "page");
  revalidatePath("/[market]/[locale]/styles/[id]", "page");
}

export async function submitLocalizedRevisionAction(
  input: SubmitRevisionInput,
): Promise<AdminLocalizedActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    const revision = await submitLocalizedRevision(guard.session.user.id, input);
    revalidateLocalizedContent(revision.wigStyleId);
    return { success: true };
  } catch (error) {
    return failure(error);
  }
}

export async function decideLocalizedRevisionAction(
  wigStyleId: string,
  input: DecideRevisionInput,
): Promise<AdminLocalizedActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    assertEditorialApprover(guard.session.user.id);
    await decideLocalizedRevision(guard.session.user.id, input);
    revalidateLocalizedContent(wigStyleId);
    return { success: true };
  } catch (error) {
    return failure(error);
  }
}

export async function publishLocalizedRevisionAction(
  wigStyleId: string,
  input: PublishRevisionInput,
): Promise<AdminLocalizedActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    assertPublisher(guard.session.user.id);
    await publishLocalizedRevision(guard.session.user.id, input);
    revalidateLocalizedContent(wigStyleId);
    return { success: true };
  } catch (error) {
    return failure(error);
  }
}

export async function withdrawLocalizedPublicationAction(
  input: WithdrawPublicationInput,
): Promise<AdminLocalizedActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  try {
    assertPublisher(guard.session.user.id);
    const transition = await withdrawLocalizedPublication(guard.session.user.id, input);
    revalidateLocalizedContent(transition.wigStyleId);
    return { success: true };
  } catch (error) {
    return failure(error);
  }
}
