import { describe, expect, it } from 'vitest'
import { recordMutation } from './record-motion'

describe('record mutation feedback', () => {
  it.each(['notes', 'notebooks', 'sources', 'exams', 'models', 'credentials', 'transformations', 'chat/sessions'])('recognizes %s creation and deletion', collection => {
    expect(recordMutation('post', `/${collection}`, { id: 'record:one' })).toEqual({ action: 'create', id: 'record:one' })
    expect(recordMutation('delete', `/${collection}/record%3Aone`, undefined)).toEqual({ action: 'delete', id: 'record:one' })
  })
  it('ignores reading, saving, retries and clearing conversation memory', () => {
    expect(recordMutation('get', '/notes', [{ id: 'note:one' }])).toBeUndefined()
    expect(recordMutation('put', '/notes/note:one', { id: 'note:one' })).toBeUndefined()
    expect(recordMutation('post', '/sources/source:one/retry', { id: 'source:one' })).toBeUndefined()
    expect(recordMutation('delete', '/chat/sessions/chat:one/history', {})).toBeUndefined()
  })
  it('covers linked sources and background record creation', () => {
    expect(recordMutation('post', '/notebooks/notebook:one/sources/source%3Aone', {})).toEqual({ action: 'create', id: 'source:one' })
    expect(recordMutation('post', '/sources/source:one/insights', { command_id: 'command:one' })).toEqual({ action: 'create', id: 'source_insight:*' })
    expect(recordMutation('post', '/models/sync/openai', { new: 2 })).toEqual({ action: 'create', id: 'model:*' })
    expect(recordMutation('post', '/models/sync', { total_new: 0 })).toBeUndefined()
    expect(recordMutation('post', '/credentials/credential:one/register-models', { created: 0 })).toBeUndefined()
    expect(recordMutation('post', '/credentials/credential:one/register-models', { created: 2 })).toEqual({ action: 'create', id: 'model:*' })
  })
})
