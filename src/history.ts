import { applyPatch, composePatch, diffShows, invertPatch, isEmptyPatch, type Patch } from './sync/patch'
import type { Show } from './types'

// Undo history for the show. Every change goes through here; view settings
// (sorting, skin, label printer offsets) live outside the show and aren't undone.
//
// Each step is a change, field by field (see sync/patch.ts), not a copy of the whole
// show, so undoing it only puts back the fields it changed. In a shared show, other
// people's edits arrive in between (`remote`) and undo leaves them alone.

const LIMIT = 200
// Keystrokes in the same field within this window count as one undo step.
const TYPING_MS = 1000

export interface Step {
  redo: Patch
  undo: Patch
}

export interface HistoryState {
  show: Show
  past: Step[]
  future: Step[]
  lastEdit: { at: number; field: EventTarget | null }
}

export type HistoryAction =
  | { type: 'update'; fn: (show: Show) => Show; at: number; field: EventTarget | null }
  | { type: 'replace'; show: Show; at: number }
  | { type: 'undo' }
  | { type: 'redo' }
  // Someone else's changes to a shared show: the show moves on, your history stays.
  | { type: 'remote'; show: Show }
  // A different show opened: no history to undo into.
  | { type: 'reset'; show: Show }

export function initHistory(show: Show): HistoryState {
  return { show, past: [], future: [], lastEdit: { at: 0, field: null } }
}

// A new step from one show to the next, merged into the last one while typing in the same
// field, so a word is one undo.
function record(state: HistoryState, next: Show, at: number, field: EventTarget | null): HistoryState {
  const redo = diffShows(state.show, next)
  if (isEmptyPatch(redo)) return { ...state, show: next }
  const step = { redo, undo: invertPatch(state.show, redo) }
  const last = state.past[state.past.length - 1]
  const typing = field != null && field === state.lastEdit.field && at - state.lastEdit.at < TYPING_MS && last
  const past = typing
    ? [...state.past.slice(0, -1), { redo: composePatch(last.redo, step.redo), undo: composePatch(step.undo, last.undo) }]
    : [...state.past, step].slice(-LIMIT)
  return { show: next, past, future: [], lastEdit: { at, field } }
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'update': {
      const next = action.fn(state.show)
      return next === state.show ? state : record(state, next, action.at, action.field)
    }
    case 'replace':
      return record(state, action.show, action.at, null)
    case 'undo': {
      const step = state.past[state.past.length - 1]
      if (!step) return state
      return {
        show: applyPatch(state.show, step.undo),
        past: state.past.slice(0, -1),
        future: [step, ...state.future],
        lastEdit: { at: 0, field: null },
      }
    }
    case 'redo': {
      const step = state.future[0]
      if (!step) return state
      return {
        show: applyPatch(state.show, step.redo),
        past: [...state.past, step],
        future: state.future.slice(1),
        lastEdit: { at: 0, field: null },
      }
    }
    case 'remote':
      return { ...state, show: action.show }
    case 'reset':
      return initHistory(action.show)
  }
}

// The text field being typed in, if any, so its keystrokes merge into one step.
export function typingField(): EventTarget | null {
  const el = document.activeElement
  if (el instanceof HTMLTextAreaElement) return el
  if (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'color', 'file'].includes(el.type)) return el
  return null
}

export const now = () => Date.now()
