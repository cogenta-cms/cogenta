import { CogentaError } from '@cogenta/core'
import type { ContentAction, ReviewState, ReviewTransition } from '../types.js'

/**
 * The editorial workflow's transition table (`schema@2.1`, ADR-0027).
 *
 * A closed set of three transitions, each with the `from` states it accepts,
 * the `to` state it produces, and the contract A action a caller needs to
 * make it — the same shape the contract E order state machine already
 * proved out. It lives on the server and nowhere else: an admin screen reads
 * it to grey out a button, it never re-derives what is legal.
 *
 * `approve` does **not** produce `status: 'published'`. Approving and
 * publishing stay two different actions, guarded by two different
 * permissions (`publish` either way) — conflating them would publish by
 * surprise the moment an editor clicks "Approve".
 */
export interface ReviewTransitionRule {
  readonly from: readonly ReviewState[]
  readonly to: ReviewState
  /** The contract A action a caller needs, checked by the caller — never by this table. */
  readonly action: ContentAction
}

export const REVIEW_TRANSITION_TABLE: Readonly<Record<ReviewTransition, ReviewTransitionRule>> = {
  // A contributor sends a fresh draft — or one sent back for changes — into
  // the queue. Re-submitting after `changes-requested` is expected, not an
  // error: that is the whole point of asking for changes.
  submit: { from: ['none', 'changes-requested'], to: 'pending', action: 'update' },
  // Only a pending entry can be approved or sent back — an entry nobody
  // submitted has nothing for a reviewer to have looked at yet.
  approve: { from: ['pending'], to: 'approved', action: 'publish' },
  requestChanges: { from: ['pending'], to: 'changes-requested', action: 'publish' },
}

/**
 * Checks a transition against the table, throwing `CONTENT_REVIEW_TRANSITION_INVALID`
 * for an illegal jump. Returns the state the entry should move to.
 *
 * Permission is not this function's business: the caller already asserted
 * `REVIEW_TRANSITION_TABLE[transition].action` before reaching here.
 */
export function nextReviewState(
  transition: ReviewTransition,
  current: ReviewState,
  context: { readonly collection: string; readonly id: string },
): ReviewState {
  const rule = REVIEW_TRANSITION_TABLE[transition]
  if (!rule.from.includes(current)) {
    throw new CogentaError({
      code: 'CONTENT_REVIEW_TRANSITION_INVALID',
      message: `"${context.id}" of "${context.collection}" cannot ${transitionVerb(transition)}: its review state is "${current}", not ${rule.from.map((state) => `"${state}"`).join(' or ')}.`,
      hint: transitionHint(transition, current),
      details: { collection: context.collection, id: context.id, transition, from: current },
    })
  }
  return rule.to
}

function transitionVerb(transition: ReviewTransition): string {
  switch (transition) {
    case 'submit':
      return 'be submitted for review'
    case 'approve':
      return 'be approved'
    case 'requestChanges':
      return 'have changes requested'
  }
}

function transitionHint(transition: ReviewTransition, current: ReviewState): string {
  if (transition === 'submit') {
    return current === 'pending'
      ? 'It is already waiting for a reviewer.'
      : 'Only a fresh entry or one sent back with requested changes can be submitted.'
  }
  return current === 'none'
    ? 'Nobody submitted this entry yet — ask its author to submit it first.'
    : 'Only an entry waiting for review (pending) can be approved or sent back.'
}
