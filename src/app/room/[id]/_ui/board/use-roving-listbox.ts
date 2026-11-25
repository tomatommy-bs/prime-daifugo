'use client'
/**
 * One keyboard model for every card listbox on the board (hand, submit tray, factor panel):
 * WAI-ARIA listbox with a roving tabindex.
 *
 * - The listbox is never a tab stop itself; its active option is (one stop per list).
 * - ←/→ (and ↑/↓), Home/End move focus between options.
 * - When options are removed while focus is inside (Enter on a tray card sends it back to the
 *   hand), focus moves to the option now at the same slot, or to the listbox itself when the
 *   list is empty, so it never drops to `<body>`.
 *
 * Options are found in DOM order as `[role="option"]` descendants, so any token kind works.
 */
import {
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'
import { rovingIndex } from './card-tray-utils'

export function useRovingListbox<E extends HTMLElement = HTMLDivElement>(
  count: number,
  /** changes whenever the options change (e.g. the joined ids) */
  itemsKey: string,
  /** use this element ref for the listbox (when the caller measures it too) */
  externalRef?: RefObject<E>,
) {
  const ownRef = useRef<E>(null)
  const ref = externalRef ?? ownRef
  const [active, setActive] = useState(0)
  const hasFocus = useRef(false)
  const activeIndex = count === 0 ? 0 : Math.min(active, count - 1)

  const options = () => [...(ref.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
  const focusAt = (index: number) => options()[index]?.focus()

  const onKeyDown = (e: KeyboardEvent<E>) => {
    const next = rovingIndex(e.key, activeIndex, count)
    if (next === null) {
      return
    }
    e.preventDefault()
    setActive(next)
    focusAt(next)
  }
  const onFocus = (e: FocusEvent<E>) => {
    hasFocus.current = true
    const index = options().indexOf(e.target as HTMLElement)
    if (index >= 0 && index !== activeIndex) {
      setActive(index)
    }
  }
  const onBlur = (e: FocusEvent<E>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      hasFocus.current = false
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus only when the options change
  useEffect(() => {
    if (!hasFocus.current) {
      return
    }
    const focused = document.activeElement
    if (focused && focused !== document.body && ref.current?.contains(focused)) {
      return
    }
    if (count === 0) {
      ref.current?.focus()
    } else {
      focusAt(activeIndex)
    }
  }, [itemsKey])

  return {
    ref,
    activeIndex,
    /** tabIndex for option `i` */
    tabIndexFor: (i: number) => (i === activeIndex ? 0 : -1),
    /** spread on the listbox, which also takes `tabIndex={-1}`: focusable by script (the
     * empty-list fallback), never a tab stop */
    listboxProps: {
      ref,
      onKeyDown,
      onFocus,
      onBlur,
    },
  }
}
