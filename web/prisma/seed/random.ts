// Reproducible random numbers for the demo seed: the same seed gives the same
// sequence on every run and every machine, so seeding twice builds the same
// history (Math.random would change it each time).
// Park-Miller generator. seed must be an integer from 1 to 2147483646.
export function seededRandom(seed: number): () => number {
  let state = seed;

  // Returns a number in [0, 1), like Math.random
  return () => {
    state = state * 16807 % 2147483647;
    return (state - 1) / 2147483646;
  };
}
