/**
 * L4 task 14. "L'index porte `{provider, model, dimensions}`. Changer de
 * modèle crée un index parallèle" — this triple is the identity an index is
 * built against, so every embedding call carries it, never just a bare
 * vector.
 */
export interface EmbeddingModelInfo {
  readonly provider: string
  readonly model: string
  readonly dimensions: number
}

export interface EmbeddingProvider extends EmbeddingModelInfo {
  /** One vector per input text, same order, same length as `texts`. */
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>
}
