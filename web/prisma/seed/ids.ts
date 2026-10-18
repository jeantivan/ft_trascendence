// Fixed ids of the demo data, so the upserts always find the same rows and
// other seed files (e.g. session-logs.ts) can point to them.
// Only constants here: importing this file never runs the seed.

export const CLUB_ID = "00000000-0000-4000-8000-000000000001";

export const GROUP_BEGINNERS_ID = "00000000-0000-4000-8000-000000000011";
export const GROUP_ADVANCED_ID = "00000000-0000-4000-8000-000000000012";

export const ADMIN_ID = "00000000-0000-4000-8000-000000000021";
export const MANAGER_ID = "00000000-0000-4000-8000-000000000022";
export const ATHLETE_1_ID = "00000000-0000-4000-8000-000000000023";
export const ATHLETE_2_ID = "00000000-0000-4000-8000-000000000024";
