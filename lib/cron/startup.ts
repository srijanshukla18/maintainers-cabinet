/**
 * Called once on server startup via instrumentation.ts.
 * Starts the autonomous brief scheduler.
 */
import { startScheduler } from "./scheduler";

export function initServer() {
  startScheduler();
}
