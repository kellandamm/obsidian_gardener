import { minimatch } from "minimatch";
import type { GardenerSchema } from "./GardenerSchema";

export function isClaimExtractionEnabled(schema: GardenerSchema, path: string): boolean {
  let enabled = schema.wikiMemory.claimExtraction;
  for (const rule of schema.folderRules) {
    if (minimatch(path, rule.glob, { dot: true }) && rule.claimExtraction !== undefined) {
      enabled = rule.claimExtraction;
    }
  }
  return enabled;
}

export function isTaskEnabledForPath(schema: GardenerSchema, path: string, taskId: string): boolean {
  let enabled = true;
  for (const rule of schema.folderRules) {
    if (!minimatch(path, rule.glob, { dot: true })) continue;
    if (taskId === "stub-flagging" && rule.stubFlagging !== undefined) enabled = rule.stubFlagging;
    if (rule.tasks?.[taskId] !== undefined) enabled = rule.tasks[taskId];
  }
  return enabled;
}
