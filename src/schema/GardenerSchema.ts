export interface GardenerIdentity {
  purpose: string;
  method: string;
  tone: string;
}

export interface GardenerProtected {
  neverWrite: string[];
  neverRead: string[];
}

export interface GardenerConventions {
  namingStyle: string;
  dateFormat: string;
  folderSemantics: string;
  tagTaxonomy: string[];
}

export interface TaskConfig {
  enabled: boolean;
  [key: string]: boolean | number | string;
}

export interface GardenerTasks {
  mergeDuplicates: TaskConfig & { minSimilarity: number };
  unlinkedMentions: TaskConfig;
  brokenLinks: TaskConfig;
  orphanTriage: TaskConfig;
  stubFlagging: TaskConfig & { minWords: number };
}

export interface GardenerSchedule {
  runAt: string;
  batchSize: number;
}

export interface GardenerWikiMemory {
  enabled: boolean;
  mode: "in-place";
  canonicalNotes: "prefer-existing";
  newHubNotes: "review-only";
  canonicalFolder: string;
  claimExtraction: boolean;
  contradictionBuffer: boolean;
  relatedSection: boolean;
  /** Wiki writer: automatically draft and update wiki pages via LLM */
  wikiWriter: boolean;
  /** Folder for source summary pages, e.g. "wiki/sources" */
  sourcesFolder: string;
  /** Folder for concept pages, e.g. "wiki/concepts" */
  conceptsFolder: string;
  /** Path to the wiki index file, e.g. "wiki/index.md". Protected from Gardener writes if empty. */
  indexFile: string;
  /** Path to the wiki log file, e.g. "wiki/log.md". Protected from Gardener writes if empty. */
  logFile: string;
  /** Glob patterns for raw source folders Gardener should summarise */
  rawFolders: string[];
  /** Min number of claims a concept needs before Gardener drafts a concept page */
  conceptPageMinClaims: number;
}

export interface FolderRule {
  glob: string;
  tasks?: Record<string, boolean>;
  claimExtraction?: boolean;
  stubFlagging?: boolean;
}

export interface GardenerSchema {
  identity: GardenerIdentity;
  protected: GardenerProtected;
  conventions: GardenerConventions;
  tasks: GardenerTasks;
  rules: string[];
  schedule: GardenerSchedule;
  wikiMemory: GardenerWikiMemory;
  folderRules: FolderRule[];
  /** folder glob → template path, e.g. "Books/**": "Templates/Book Note.md" */
  templateMap: Record<string, string>;
}

export interface SchemaValidationError {
  section: string;
  message: string;
}
