import type { Prisma } from "@/generated/prisma/client";

// Port to the notifications of #153: same signature as its notify(), which is not in main yet.
// Called inside the transaction that writes the data, so a failure rolls everything back (ADR 0001).
// The payload carries ids only: keys ending in "Id", values uuid (never RPE or Feedback).
export interface NotifyInput {
  userId: string;
  type: string;
  payload: Record<string, string>;
}

// Returns the notification id, or null if the user has them turned off
export type Notify = (tx: Prisma.TransactionClient, input: NotifyInput) => Promise<bigint | null>;

export const MEMBERSHIP_REQUEST_CREATED = "membership_request_created";
export const MEMBERSHIP_INVITATION_CREATED = "membership_invitation_created";
export const MEMBERSHIP_ACCEPTED = "membership_accepted";

// Known limit: until #153 lands this writes nothing, so no notification reaches anybody;
// replace it with the real notify() then
export const notifyNothing: Notify = async () => null;
