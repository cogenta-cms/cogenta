import type { TFunction } from 'i18next'
import { shippedText } from '../i18n/shipped-text.js'

/** A built-in skill's key under `shippedText.skills`, from the name it ships with. */
function skillKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
}

interface SkillWords {
  readonly name: string
  readonly description: string
  readonly builtin?: boolean
}

/** The skill's name in the reader's language: Cogenta's own while untouched, as written otherwise. */
export function skillDisplayName(skill: SkillWords, t: TFunction): string {
  return skill.builtin === true
    ? shippedText(`skills.${skillKey(skill.name)}.name`, skill.name, t)
    : skill.name
}

export function skillDisplayDescription(skill: SkillWords, t: TFunction): string {
  return skill.builtin === true
    ? shippedText(`skills.${skillKey(skill.name)}.description`, skill.description, t)
    : skill.description
}

export interface SkillFrontmatter {
  readonly name: string
  readonly description: string
}

/**
 * The `name` and `description` of a `SKILL.md`'s header, trimmed — empty when
 * the header is missing or the line is blank. Enough to tell "nothing was
 * filled in" from a real skill before it is sent: the server accepted the
 * empty template and stored a skill with neither.
 */
export function readSkillFrontmatter(content: string): SkillFrontmatter {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---/u.exec(content)
  const header = match?.[1] ?? ''
  const field = (key: string): string => {
    const line = new RegExp(`^${key}:[ \\t]*(.*)$`, 'mu').exec(header)
    return (line?.[1] ?? '').trim().replace(/^(["'])(.*)\\1$/u, '$2')
  }
  return { name: field('name'), description: field('description') }
}
