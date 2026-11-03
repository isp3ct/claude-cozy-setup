export type Peek = {
  n: number
  /** absolute path of the pasted image file, '' while not on disk yet */
  path: string
  /** file size in bytes, 0 when unknown */
  bytes: number
  /** pixel size, 0 when unknown */
  w: number
  h: number
}

declare module 'claude-code' {
  interface PluginState {
    'voidpeek': { items: Peek[] }
  }
}
