export interface SkillMetadata {
  readonly name: string
  readonly version: string
  readonly description: string
}

/** A skill's instructions text plus the names of the resource files sitting alongside it — the resources themselves are read by the caller, on demand, only for the files it actually needs. */
export interface Skill extends SkillMetadata {
  readonly instructions: string
  readonly dir: string
  readonly resources: readonly string[]
}

export interface SkillStore {
  list(): Promise<readonly SkillMetadata[]>
  /** Reads one skill's instructions in full — the "on demand" half of "chargé à la demande" (never done for every skill up front). */
  load(name: string): Promise<Skill>
  /** Copies a skill folder from `sourceDir` into the store, under its own declared name. */
  install(sourceDir: string): Promise<SkillMetadata>
}
