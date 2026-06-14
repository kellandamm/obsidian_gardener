import type { FolderRule, GardenerSchema, SchemaValidationError } from "./GardenerSchema";
import { DEFAULT_SCHEMA } from "./defaultSchema";
import { makeRe } from "minimatch";

const KNOWN_TASK_KEYS = new Set([
  "merge-duplicates",
  "min-similarity",
  "unlinked-mentions",
  "link-unlinked-mentions",
  "broken-links",
  "repair-broken-links",
  "orphan-triage",
  "triage-orphans",
  "stub-flagging",
  "flag-stubs",
  "min-words",
]);

const KNOWN_FOLDER_RULE_KEYS = new Set([
  "claim-extraction",
  "stub-flagging",
  "merge-duplicates",
  "unlinked-mentions",
  "broken-links",
  "orphan-triage",
  "semantic-search",
  "content-merge",
  "auto-summarise",
  "template-lint",
  "moc-maintenance",
  "stale-notes",
  "note-split",
  "tag-normalization",
  "canonical-concepts",
  "canonical-strengthen",
  "queued-hub-notes",
  "contextualize-note",
  "claim-consistency-buffer",
]);

interface ParseResult {
  schema: GardenerSchema;
  errors: SchemaValidationError[];
}

function extractSection(content: string, name: string): string {
  const re = new RegExp(`##\\s+${name}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  return re.exec(content)?.[1]?.trim() ?? "";
}

function parseKeyValue(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const cleaned = line
      .replace(/<!--.*$/, "")
      .replace(/^\s*[-*]\s+/, "")
      .trim();
    for (const part of cleaned.split(/\s*,\s*/)) {
      const m = /^([a-z0-9-]+)\s*:\s*(.*)$/i.exec(part);
      if (m) result[m[1].trim()] = m[2].trim();
    }
  }
  return result;
}

function parseListValues(block: string, key: string): string[] {
  const items: string[] = [];
  let inKey = false;
  for (const line of block.split("\n")) {
    if (new RegExp(`^\\s*${key}\\s*:`, "i").test(line)) {
      inKey = true;
      continue;
    }
    if (inKey) {
      const m = /^\s+-\s+(.+)$/.exec(line);
      if (m) items.push(m[1].trim());
      else if (/^\s*[a-z0-9-]+\s*:/i.test(line)) break;
    }
  }
  return items;
}

function parseBool(val: string | undefined): boolean {
  return val?.toLowerCase() === "on" || val?.toLowerCase() === "true" || val === "1";
}

function parseOnOff(val: string | undefined): boolean | null {
  if (!val) return null;
  const lower = val.toLowerCase();
  if (lower === "on" || lower === "true" || lower === "1") return true;
  if (lower === "off" || lower === "false" || lower === "0") return false;
  return null;
}

export function parseGardenerSchema(content: string): ParseResult {
  const errors: SchemaValidationError[] = [];
  const schema = structuredClone(DEFAULT_SCHEMA);

  // Identity
  const identity = parseKeyValue(extractSection(content, "Identity"));
  if (identity["purpose"]) schema.identity.purpose = identity["purpose"];
  if (identity["method"]) schema.identity.method = identity["method"];
  if (identity["tone"]) schema.identity.tone = identity["tone"];

  // Protected
  const protBlock = extractSection(content, "Protected");
  const neverWrite = parseListValues(protBlock, "never-write");
  const neverRead = parseListValues(protBlock, "never-read");
  validateGlobList("Protected", "never-write", neverWrite, errors);
  validateGlobList("Protected", "never-read", neverRead, errors);
  if (neverWrite.length) schema.protected.neverWrite = neverWrite;
  if (neverRead.length) schema.protected.neverRead = neverRead;

  // Conventions
  const conv = parseKeyValue(extractSection(content, "Conventions"));
  if (conv["naming-style"]) schema.conventions.namingStyle = conv["naming-style"];
  if (conv["date-format"]) schema.conventions.dateFormat = conv["date-format"];
  if (conv["folder-semantics"]) schema.conventions.folderSemantics = conv["folder-semantics"];
  const tags = parseListValues(extractSection(content, "Conventions"), "tag-taxonomy");
  if (tags.length) schema.conventions.tagTaxonomy = tags;

  // Tasks
  const tasks = parseKeyValue(extractSection(content, "Tasks"));
  for (const key of Object.keys(tasks)) {
    if (!KNOWN_TASK_KEYS.has(key)) {
      errors.push({ section: "Tasks", message: `Unknown task key: ${key}` });
    }
  }
  if ("merge-duplicates" in tasks)
    schema.tasks.mergeDuplicates.enabled = parseBool(tasks["merge-duplicates"]);
  if ("min-similarity" in tasks) {
    const v = parseFloat(tasks["min-similarity"]);
    if (!isNaN(v)) schema.tasks.mergeDuplicates.minSimilarity = v;
  }
  const unlinkedMentions = tasks["unlinked-mentions"] ?? tasks["link-unlinked-mentions"];
  if (unlinkedMentions !== undefined)
    schema.tasks.unlinkedMentions.enabled = parseBool(unlinkedMentions);
  const brokenLinks = tasks["broken-links"] ?? tasks["repair-broken-links"];
  if (brokenLinks !== undefined)
    schema.tasks.brokenLinks.enabled = parseBool(brokenLinks);
  const orphanTriage = tasks["orphan-triage"] ?? tasks["triage-orphans"];
  if (orphanTriage !== undefined)
    schema.tasks.orphanTriage.enabled = parseBool(orphanTriage);
  const stubFlagging = tasks["stub-flagging"] ?? tasks["flag-stubs"];
  if (stubFlagging !== undefined)
    schema.tasks.stubFlagging.enabled = parseBool(stubFlagging);
  if ("min-words" in tasks) {
    const v = parseInt(tasks["min-words"], 10);
    if (!isNaN(v)) schema.tasks.stubFlagging.minWords = v;
  }

  // Rules
  const rulesBlock = extractSection(content, "Rules");
  schema.rules = rulesBlock
    .split("\n")
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter((l) => l.length > 0);

  // Schedule
  const sched = parseKeyValue(extractSection(content, "Schedule"));
  const runAt = sched["run-at"] ?? sched.run;
  if (runAt) {
    const time = /^\d{2}:\d{2}$/.test(runAt)
      ? runAt
      : /\b(\d{2}:\d{2})\b/.exec(runAt)?.[1];
    if (time) {
      schema.schedule.runAt = time;
    } else {
      errors.push({ section: "Schedule", message: `Invalid run-at time: ${runAt}` });
    }
  }
  const batchSize = sched["batch-size"] ?? sched["batch-cap"];
  if (batchSize) {
    const v = parseInt(batchSize, 10);
    if (!isNaN(v) && v > 0) schema.schedule.batchSize = v;
    else errors.push({ section: "Schedule", message: "batch-size must be a positive integer" });
  }

  // Wiki Memory
  const wikiMemory = parseKeyValue(extractSection(content, "Wiki Memory"));
  const wikiEnabled = parseOnOff(wikiMemory.enabled);
  if (wikiEnabled !== null) schema.wikiMemory.enabled = wikiEnabled;
  if (wikiMemory.mode && wikiMemory.mode !== "in-place") {
    errors.push({ section: "Wiki Memory", message: "mode must be in-place" });
  }
  if (wikiMemory["canonical-notes"] && wikiMemory["canonical-notes"] !== "prefer-existing") {
    errors.push({ section: "Wiki Memory", message: "canonical-notes must be prefer-existing" });
  }
  if (wikiMemory["new-hub-notes"] && wikiMemory["new-hub-notes"] !== "review-only") {
    errors.push({ section: "Wiki Memory", message: "new-hub-notes must be review-only" });
  }
  if (wikiMemory["canonical-folder"]) {
    schema.wikiMemory.canonicalFolder = wikiMemory["canonical-folder"].replace(/^\/+|\/+$/g, "") || "Wiki";
  }
  const claimExtraction = parseOnOff(wikiMemory["claim-extraction"]);
  if (claimExtraction !== null) schema.wikiMemory.claimExtraction = claimExtraction;
  const contradictionBuffer = parseOnOff(wikiMemory["contradiction-buffer"]);
  if (contradictionBuffer !== null) schema.wikiMemory.contradictionBuffer = contradictionBuffer;
  const relatedSection = parseOnOff(wikiMemory["related-section"]);
  if (relatedSection !== null) schema.wikiMemory.relatedSection = relatedSection;
  const wikiWriter = parseOnOff(wikiMemory["wiki-writer"]);
  if (wikiWriter !== null) schema.wikiMemory.wikiWriter = wikiWriter;
  if (wikiMemory["sources-folder"]) schema.wikiMemory.sourcesFolder = wikiMemory["sources-folder"].replace(/^\/+|\/+$/g, "");
  if (wikiMemory["concepts-folder"]) schema.wikiMemory.conceptsFolder = wikiMemory["concepts-folder"].replace(/^\/+|\/+$/g, "");
  if (wikiMemory["index-file"]) schema.wikiMemory.indexFile = wikiMemory["index-file"].trim();
  if (wikiMemory["log-file"]) schema.wikiMemory.logFile = wikiMemory["log-file"].trim();
  if (wikiMemory["raw-folders"]) {
    schema.wikiMemory.rawFolders = wikiMemory["raw-folders"]
      .split(",").map((s: string) => s.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
  }
  const minClaims = parseInt(wikiMemory["concept-page-min-claims"] ?? "", 10);
  if (!isNaN(minClaims) && minClaims > 0) schema.wikiMemory.conceptPageMinClaims = minClaims;

  // Folder Rules
  schema.folderRules = parseFolderRules(extractSection(content, "Folder Rules"), errors);

  // Templates
  const templatesBlock = extractSection(content, "Templates");
  const templateMap: Record<string, string> = {};
  for (const line of templatesBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const glob = trimmed.slice(0, colonIdx).trim();
    const tpl = trimmed.slice(colonIdx + 1).trim();
    if (glob && tpl) templateMap[glob] = tpl;
  }
  schema.templateMap = templateMap;

  return { schema, errors };
}

function parseFolderRules(block: string, errors: SchemaValidationError[]): FolderRule[] {
  const rules: FolderRule[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line
      .replace(/<!--.*$/, "")
      .replace(/^\s*[-*]\s+/, "")
      .trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      errors.push({ section: "Folder Rules", message: `Invalid folder rule: ${trimmed}` });
      continue;
    }
    const glob = trimmed.slice(0, colonIdx).trim();
    const settings = trimmed.slice(colonIdx + 1).trim();
    if (!isValidGlob(glob)) {
      errors.push({ section: "Folder Rules", message: `Invalid glob: ${glob}` });
      continue;
    }
    const rule: FolderRule = { glob, tasks: {} };
    for (const part of settings.split(/\s*,\s*/)) {
      const m = /^([a-z0-9-]+)\s+(on|off|true|false|1|0)$/i.exec(part.trim());
      if (!m) {
        errors.push({ section: "Folder Rules", message: `Invalid folder rule setting: ${part}` });
        continue;
      }
      const enabled = parseOnOff(m[2]);
      if (enabled === null) continue;
      const key = m[1];
      if (key === "claim-extraction") rule.claimExtraction = enabled;
      else if (key === "stub-flagging") rule.stubFlagging = enabled;
      else if (KNOWN_FOLDER_RULE_KEYS.has(key)) rule.tasks![key] = enabled;
      else errors.push({ section: "Folder Rules", message: `Unknown folder rule setting: ${key}` });
    }
    if (Object.keys(rule.tasks ?? {}).length === 0) delete rule.tasks;
    if (glob) rules.push(rule);
  }
  return rules;
}

function validateGlobList(section: string, key: string, globs: string[], errors: SchemaValidationError[]): void {
  for (const glob of globs) {
    if (!isValidGlob(glob)) errors.push({ section, message: `Invalid ${key} glob: ${glob}` });
  }
}

function isValidGlob(glob: string): boolean {
  if (!glob.trim()) return false;
  if (!hasBalancedDelimiters(glob)) return false;
  return makeRe(glob, { dot: true }) !== false;
}

function hasBalancedDelimiters(value: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { "]": "[", "}": "{" };
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (char === "[" || char === "{") stack.push(char);
    if (char === "]" || char === "}") {
      if (stack.pop() !== pairs[char]) return false;
    }
  }
  return stack.length === 0;
}
