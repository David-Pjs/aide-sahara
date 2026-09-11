// The original address for speech uploads, kept so anything still posting here
// keeps working. The real handler, with provider fallback and request guards,
// lives in ../route.ts.
export { POST } from "../route";

export const runtime = "nodejs";
export const maxDuration = 30;
