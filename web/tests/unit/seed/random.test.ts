import { describe, expect, it } from "vitest";
import { seededRandom } from "../../../prisma/seed/random";

function firstValues(random: () => number, count: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(random());
  }
  return values;
}

describe("seededRandom", () => {
  it("gives the same sequence for the same seed", () => {
    expect(firstValues(seededRandom(42), 5)).toEqual(firstValues(seededRandom(42), 5));
  });

  it("gives a different sequence for a different seed", () => {
    expect(firstValues(seededRandom(42), 5)).not.toEqual(firstValues(seededRandom(7), 5));
  });

  it("changes value from one call to the next", () => {
    const values = firstValues(seededRandom(42), 5);
    // new Set keeps each value once: 5 different values give size 5
    expect(new Set(values).size).toBe(5);
  });

  it("returns numbers in [0, 1), like Math.random", () => {
    for (const value of firstValues(seededRandom(42), 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
