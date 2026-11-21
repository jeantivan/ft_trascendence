import { notify } from "@/lib/notifications/notify";

// The repository takes notify() as a parameter so tests can swap it for a fake
export type Notify = typeof notify;

export const MEMBERSHIP_REQUEST_CREATED = "membership_request_created";
export const MEMBERSHIP_INVITATION_CREATED = "membership_invitation_created";
export const MEMBERSHIP_ACCEPTED = "membership_accepted";
