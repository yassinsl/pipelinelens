import type { SourceId } from './sources'

export interface SourceState {
  value: string
  /** The file the content was last loaded from, if any. */
  fileName: string | null
  editedSinceLoad: boolean
  /** True once the field has held content, so emptying it shows guidance. */
  dirty: boolean
  fileError: string | null
}

export type InputsState = Record<SourceId, SourceState>

export type InputsAction =
  | { type: 'edit'; source: SourceId; value: string }
  | { type: 'loadFile'; source: SourceId; fileName: string; text: string }
  | { type: 'fileError'; source: SourceId; message: string }
  | { type: 'clear' }

const EMPTY_SOURCE: SourceState = {
  value: '',
  fileName: null,
  editedSinceLoad: false,
  dirty: false,
  fileError: null,
}

// Inputs live only in React state: never in storage, cookies, or the URL.
export const INITIAL_INPUTS: InputsState = { logs: EMPTY_SOURCE, workflow: EMPTY_SOURCE }

export function inputsReducer(state: InputsState, action: InputsAction): InputsState {
  switch (action.type) {
    case 'edit': {
      const current = state[action.source]
      return {
        ...state,
        [action.source]: {
          ...current,
          value: action.value,
          editedSinceLoad: current.fileName !== null,
          dirty: current.dirty || action.value !== '',
          fileError: null,
        },
      }
    }
    case 'loadFile':
      return {
        ...state,
        [action.source]: {
          value: action.text,
          fileName: action.fileName,
          editedSinceLoad: false,
          dirty: true,
          fileError: null,
        },
      }
    case 'fileError':
      return { ...state, [action.source]: { ...state[action.source], fileError: action.message } }
    case 'clear':
      return INITIAL_INPUTS
  }
}
