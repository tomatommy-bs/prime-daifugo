/**
 * Lets a page hide the landscape hint (`DeviceRotateRecommender`) while it does not need it:
 * the room page suppresses it outside a running game, where portrait works fine (waiting room,
 * results). A tiny external store, so the root-layout banner re-renders when it changes.
 */
import { useSyncExternalStore } from 'react'

let suppressed = false
const listeners = new Set<() => void>()

export function setRotateHintSuppressed(value: boolean): void {
  if (suppressed === value) {
    return
  }
  suppressed = value
  for (const listener of listeners) {
    listener()
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useRotateHintSuppressed = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => suppressed,
    () => false,
  )
