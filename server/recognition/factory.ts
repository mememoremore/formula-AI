import { mockRecognitionAdapter } from '../services/recognition-adapter'
import { createPythonRecognitionAdapter } from './python-adapter'
import { readRecognitionSettings } from './settings'

export function createRecognitionAdapter(env: NodeJS.ProcessEnv = process.env) {
  const settings = readRecognitionSettings(env)
  return settings.provider === 'mock'
    ? mockRecognitionAdapter
    : createPythonRecognitionAdapter(settings)
}
