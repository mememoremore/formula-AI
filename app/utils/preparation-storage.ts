export interface RegionDraft {
  index: number
  bbox: number[]
  file: File
  selected: boolean
  manual: boolean
}

/** Structured clone keeps real File bytes; never put image data in localStorage. */
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('moxi-preparation', 1)

    request.onupgradeneeded = () => request.result.createObjectStore('drafts')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function preparationStorage<T>(
  key: string,
  operation: 'read' | 'write' | 'delete',
  value?: T,
): Promise<T | undefined> {
  const db = await database()

  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction('drafts', operation === 'read' ? 'readonly' : 'readwrite'),
        store = tx.objectStore('drafts')
      const request =
        operation === 'read'
          ? store.get(key)
          : operation === 'delete'
            ? store.delete(key)
            : store.put(value, key)
      let result: T | undefined

      request.onsuccess = () => {
        if (operation === 'read') result = request.result as T | undefined
      }
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('草稿保存被中断'))
    })
  } finally {
    db.close()
  }
}
