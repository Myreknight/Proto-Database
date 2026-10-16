import type { Show } from './types'

// Undo history for the show. Every change goes through here; view settings
// (sorting, skin, label printer offsets) live outside the show and aren't undone.

const LIMIT = 200
// Keystrokes in the same field within this window count as one undo step.
const TYPING_MS = 1000

export interface HistoryState {
  show: Show
  past: Show[]
  future: Show[]
  lastEdit: { at: number; field: EventTarget | null }
}

export type HistoryAction =
  | { type: 'update'; fn: (show: Show) => Show; at: number; field: EventTarget | null }
  | { type: 'replace'; show: Show; at: number }
  | { type: 'undo' }
  | { type: 'redo' }

export function initHistory(show: Show): HistoryState {
  return { show, past: [], future: [], lastEdit: { at: 0, field: null } }
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'update': {
      const next = action.fn(state.show)
      if (next === state.show) return state
      const typing =
        action.field != null && action.field === state.lastEdit.field && action.at - state.lastEdit.at < TYPING_MS
      return {
        show: next,
        past: typing && state.past.length ? state.past : [...state.past, state.show].slice(-LIMIT),
        future: [],
        lastEdit: { at: action.at, field: action.field },
      }
    }
    case 'replace':
      return {
        show: action.show,
        past: [...state.past, state.show].slice(-LIMIT),
        future: [],
        lastEdit: { at: action.at, field: null },
      }
    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        show: previous,
        past: state.past.slice(0, -1),
        future: [state.show, ...state.future],
        lastEdit: { at: 0, field: null },
      }
    }
    case 'redo': {
      const next = state.future[0]
      if (!next) return state
      return {
        show: next,
        past: [...state.past, state.show],
        future: state.future.slice(1),
        lastEdit: { at: 0, field: null },
      }
    }
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
