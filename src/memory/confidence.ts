import type { MemoryReviewStore } from "./MemoryReviewStore";
import type { MemoryNode, WikiMemoryGraphData } from "./WikiMemoryGraph";

export interface MemoryConfidence {
  score: number;
  label: "low" | "medium" | "high";
  reasons: string[];
}

export function scoreMemoryNode(
  graph: WikiMemoryGraphData,
  node: MemoryNode,
  reviewStore: MemoryReviewStore
): MemoryConfidence {
  let score = 0.35;
  const reasons: string[] = [];
  const provenancePaths = new Set(node.provenance.map((prov) => prov.path));

  if (provenancePaths.size >= 3) {
    score += 0.22;
    reasons.push(`${provenancePaths.size} source notes`);
  } else if (provenancePaths.size >= 2) {
    score += 0.14;
    reasons.push("multiple source notes");
  } else if (provenancePaths.size === 1) {
    score += 0.06;
    reasons.push("single source note");
  }

  const status = reviewStore.getStatus(node.id);
  if (status === "accepted" || status === "hub-queued") {
    score += 0.26;
    reasons.push(status === "accepted" ? "accepted by user" : "queued by user");
  }
  if (status === "rejected") {
    score -= 0.35;
    reasons.push("rejected by user");
  }

  const hasSourceFolder = node.provenance.some((prov) => /(^|\/)(sources?|literature|highlights?)(\/|$)/i.test(prov.path));
  if (hasSourceFolder) {
    score += 0.1;
    reasons.push("source folder provenance");
  }

  const contradictionCount = graph.edges.filter(
    (edge) => edge.type === "contradicts" && (edge.from === node.id || edge.to === node.id)
  ).length;
  if (contradictionCount > 0) {
    score -= Math.min(0.25, contradictionCount * 0.08);
    reasons.push(`${contradictionCount} unresolved conflict${contradictionCount !== 1 ? "s" : ""}`);
  }

  const supportCount = graph.edges.filter((edge) => edge.type === "supports" && (edge.from === node.id || edge.to === node.id)).length;
  if (supportCount > 0) {
    score += Math.min(0.18, supportCount * 0.04);
    reasons.push(`${supportCount} support edge${supportCount !== 1 ? "s" : ""}`);
  }

  const normalized = Math.max(0, Math.min(1, score));
  return {
    score: normalized,
    label: normalized >= 0.72 ? "high" : normalized >= 0.48 ? "medium" : "low",
    reasons: reasons.length > 0 ? reasons : ["heuristic extraction"],
  };
}

export function formatConfidence(confidence: MemoryConfidence): string {
  return `${Math.round(confidence.score * 100)}% ${confidence.label}`;
}
