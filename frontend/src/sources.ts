import { type FileProblem, hasExtension, MAX_FILE_BYTES } from './lib/readTextFile'

export type SourceId = 'logs' | 'workflow'

export interface SourceConfig {
  id: SourceId
  label: string
  /** Lowercase name used inside sentences. */
  noun: string
  hint: string
  extensions: readonly string[]
  placeholder: string
  tooLargeTip: string
}

export const SOURCES: Record<SourceId, SourceConfig> = {
  logs: {
    id: 'logs',
    label: 'Failed build log',
    noun: 'build log',
    hint: 'Paste the output of the failed job, or upload the log downloaded from the run.',
    extensions: ['.txt', '.log'],
    placeholder: [
      'Run pytest',
      'FAILED tests/test_api.py::test_health - AssertionError',
      '##[error]Process completed with exit code 1.',
    ].join('\n'),
    tooLargeTip: 'Paste only the failed step’s output instead.',
  },
  workflow: {
    id: 'workflow',
    label: 'Workflow YAML',
    noun: 'workflow YAML',
    hint: 'The workflow file from .github/workflows that ran the failed job.',
    extensions: ['.yml', '.yaml'],
    placeholder: [
      'name: CI',
      'on: [push]',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
    ].join('\n'),
    tooLargeTip: 'Check that you chose the workflow file.',
  },
}

export const SOURCE_ORDER: readonly SourceId[] = ['logs', 'workflow']

const numberFormat = new Intl.NumberFormat('en-US')

export function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${numberFormat.format(value)} ${value === 1 ? singular : plural}`
}

export function formatNumber(value: number): string {
  return numberFormat.format(value)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function listExtensions(extensions: readonly string[]): string {
  return extensions.length < 2
    ? extensions.join('')
    : `${extensions.slice(0, -1).join(', ')} or ${extensions[extensions.length - 1]}`
}

export function fileProblemMessage(problem: FileProblem, file: File, source: SourceConfig): string {
  const name = `“${file.name}”`
  switch (problem) {
    case 'type': {
      const other = Object.values(SOURCES).find(
        (candidate) => candidate.id !== source.id && hasExtension(file.name, candidate.extensions),
      )
      const redirect = other ? ` Upload it to ${other.label} instead.` : ''
      return `${name} must be a ${listExtensions(source.extensions)} file.${redirect}`
    }
    case 'size':
      return `${name} is ${formatBytes(file.size)}, over the ${formatBytes(MAX_FILE_BYTES)} upload limit. ${source.tooLargeTip}`
    case 'empty':
      return `${name} is empty. Choose a file that contains the ${source.noun}.`
    case 'blank':
      return `${name} contains only whitespace. Choose a file that contains the ${source.noun}.`
    case 'unreadable':
      return `${name} isn’t readable as text. Upload a plain-text file saved as UTF-8.`
    case 'read-failed':
      return `${name} couldn’t be read. Check that the file still exists, then try again.`
  }
}
