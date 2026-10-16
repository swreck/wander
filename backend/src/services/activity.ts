/**
 * When anyone last used Wander (any /api request) — so background work that only matters to people using it can rest
 * while nobody is, and the database can sleep (Neon bills every minute it's awake; cost audit, Oct 16 2026).
 */
let last = Date.now();
export const noteActivity = () => { last = Date.now(); };
/** No one has used Wander for this long */
export const quietFor = (ms: number) => Date.now() - last > ms;
