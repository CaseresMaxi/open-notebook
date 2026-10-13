import { describe, expect, it } from 'vitest'

describe('notebook view preference', () => {
  it('starts saved "list" choices from tiles after the tile redesign', async () => {
    localStorage.setItem('notebook-view-storage', JSON.stringify({ state: { viewMode: 'list' }, version: 0 }))
    const { useNotebookViewStore } = await import('./notebook-view-store')
    await useNotebookViewStore.persist.rehydrate()
    expect(useNotebookViewStore.getState().viewMode).toBe('tile')
    useNotebookViewStore.getState().setViewMode('list')
    await useNotebookViewStore.persist.rehydrate()
    expect(useNotebookViewStore.getState().viewMode).toBe('list')
  })
})
