/**
 * Standalone worker entry — `npm run worker`.
 * Loads env, builds the same DB the web app uses, and runs the loop forever.
 */
export * from "./rotation";
export * from "./scheduler";
export * from "./processor";
export * from "./sync-replies";
export * from "./mailer";
export * from "./worker";
export type { EngineDb, SenderRow, CampaignRow, JobRow } from "./db-port";
export * from "./queue-mode";
export * from "./sequence";
