// @vitest-environment node

import { describe, expect, it } from "vitest";
import { isRecipient } from "@/lib/realtime/recipients";

const ANA = "a0000000-0000-4000-8000-000000000301";
const LUIS = "a0000000-0000-4000-8000-000000000302";

describe("isRecipient", () => {
  it("delivers a notification to its own user", () => {
    const event = { channel: "notification", payload: { notificationId: "42", userId: ANA } };
    expect(isRecipient(event, ANA)).toBe(true);
  });

  it("Does not deliver a notification not meant for user", () => {
    const event = { channel: "notification", payload: { notificationId: "42", userId: ANA } };
    expect(isRecipient(event, LUIS)).toBe(false);
  });

  it("delivers events of other channels to everyone", () => {
    const event = { channel: "resync", payload: {} };
    expect(isRecipient(event, LUIS)).toBe(true);
  });
  

  
});
