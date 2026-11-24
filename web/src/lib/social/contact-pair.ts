// A Contact is stored once per pair of users: userA always holds the lower id (#154)
export type ContactPair = { userA: string; userB: string };

export function orderedPair(u1: string, u2: string): ContactPair {
  const a = u1.toLowerCase();
  const b = u2.toLowerCase();
  if (a === b) {
    throw new Error("A user cannot be their own Contact");
  }
  if (a < b) {
    return { userA: a, userB: b };
  }
  return { userA: b, userB: a };
}
