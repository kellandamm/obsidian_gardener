import test from "node:test";
import assert from "node:assert/strict";
import { AuditLog } from "../src/safety/AuditLog";

test("audit log records internal writes", async () => {
  const files = new Map<string, string>();
  const app = {
    vault: {
      adapter: {
        read: async (path: string) => {
          const value = files.get(path);
          if (value === undefined) throw new Error("missing");
          return value;
        },
        write: async (path: string, content: string) => {
          files.set(path, content);
        },
      },
    },
  };

  const audit = new AuditLog(app as never, ".gardener");
  await audit.writeInternal("GARDENER.md", "applied template", "schema-library");

  const raw = files.get(".gardener/audit.log");
  assert.ok(raw);
  const entry = JSON.parse(raw.trim()) as { action: string; path: string; taskId: string; detail: string };
  assert.equal(entry.action, "internal-write");
  assert.equal(entry.path, "GARDENER.md");
  assert.equal(entry.taskId, "schema-library");
  assert.equal(entry.detail, "applied template");
});
