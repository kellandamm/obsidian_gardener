const STOPWORDS = new Set([
  "the","and","for","are","but","not","you","all","can","has","her","was",
  "one","our","had","what","that","with","have","this","will","your","from",
  "they","know","want","been","good","much","some","time","very","when","come",
  "here","just","like","long","make","many","over","such","take","than","them",
  "then","these","into","more","also","its","use","about","how","which","each",
  "there","their","other","would","could","should","were","does","did","had",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>
): number {
  let dot = 0;
  let normA = 0;
  for (const [term, va] of a) {
    normA += va * va;
    const vb = b.get(term);
    if (vb !== undefined) dot += va * vb;
  }
  if (normA === 0) return 0;
  let normB = 0;
  for (const vb of b.values()) normB += vb * vb;
  if (normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface DocInput {
  path: string;
  text: string;
}

export class TFIDFEngine {
  private vectors = new Map<string, Map<string, number>>();

  build(docs: DocInput[]): void {
    const tf = new Map<string, Map<string, number>>();
    const df = new Map<string, number>();
    const n = docs.length;

    for (const { path, text } of docs) {
      const terms = tokenize(text);
      const counts = new Map<string, number>();
      for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
      tf.set(path, counts);
      for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    }

    this.vectors.clear();
    for (const { path } of docs) {
      const counts = tf.get(path)!;
      const docLen = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
      const vector = new Map<string, number>();
      for (const [term, count] of counts) {
        const termFreq = count / docLen;
        const idf = Math.log((n + 1) / ((df.get(term) ?? 0) + 1)) + 1;
        vector.set(term, termFreq * idf);
      }
      this.vectors.set(path, vector);
    }
  }

  findSimilar(
    path: string,
    threshold: number
  ): Array<{ path: string; score: number }> {
    const source = this.vectors.get(path);
    if (!source) return [];
    const results: Array<{ path: string; score: number }> = [];
    for (const [other, vec] of this.vectors) {
      if (other === path) continue;
      const score = cosineSimilarity(source, vec);
      if (score >= threshold) results.push({ path: other, score });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  getVector(path: string): Map<string, number> | undefined {
    return this.vectors.get(path);
  }

  has(path: string): boolean {
    return this.vectors.has(path);
  }

  size(): number {
    return this.vectors.size;
  }
}
