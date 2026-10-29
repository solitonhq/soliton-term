// Node has no localStorage; the store's `persist` middleware expects one.
const data = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => void data.set(k, v),
  removeItem: (k: string) => void data.delete(k),
  clear: () => data.clear(),
  key: (i: number) => Array.from(data.keys())[i] ?? null,
  get length() {
    return data.size;
  },
} as Storage;
