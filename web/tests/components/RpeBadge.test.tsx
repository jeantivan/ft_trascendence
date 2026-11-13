import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RpeBadge } from "@/components/ui/RpeBadge";

describe("RpeBadge", () => {
  it("shows the value and names it for assistive technology", () => {
    render(<RpeBadge value={7} />);
    const badge = screen.getByLabelText("RPE 7");
    expect(badge).toHaveTextContent("7");
  });

  it.each([
    [1, "rpe-low"],
    [3, "rpe-low"],
    [4, "rpe-moderate"],
    [6, "rpe-moderate"],
    [7, "rpe-hard"],
    [8, "rpe-hard"],
    [9, "rpe-max"],
    [10, "rpe-max"],
  ] as const)("colours %i with the %s token", (value, token) => {
    render(<RpeBadge value={value} />);
    expect(screen.getByLabelText(`RPE ${value}`)).toHaveClass(`border-${token}`, `text-${token}`);
  });

  it("rejects values outside 1-10 at type level", () => {
    // These lines fail `npm run typecheck` if the range ever opens up
    // @ts-expect-error 0 is not an RPE value
    void (<RpeBadge value={0} />);
    // @ts-expect-error 11 is not an RPE value
    void (<RpeBadge value={11} />);
  });
});
