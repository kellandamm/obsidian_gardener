export async function cooperativeYield(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export async function yieldEvery(index: number, batchSize: number): Promise<void> {
  if (index > 0 && index % batchSize === 0) await cooperativeYield();
}
