import { describe, expect, it } from "vitest";
import { orderedPair } from "@/lib/social/contact-pair";

const LOW = "11111111-1111-4111-8111-111111111111";
const HIGH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("orderedPair", () => {
  it("puts the lower id in userA whatever the argument order", () => {
    expect(orderedPair(LOW, HIGH)).toEqual({ userA: LOW, userB: HIGH });
    expect(orderedPair(HIGH, LOW)).toEqual({ userA: LOW, userB: HIGH });
  });

  it("lowercases the ids so the order matches Postgres", () => {
    expect(orderedPair(HIGH.toUpperCase(), LOW)).toEqual({ userA: LOW, userB: HIGH });
  });

  it("throws when both ids are the same user", () => {
    expect(() => orderedPair(LOW, LOW.toUpperCase())).toThrow();
  });
});
