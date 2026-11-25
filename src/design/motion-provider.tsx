'use client'

import { LazyMotion, MotionConfig, domMax } from 'framer-motion'
import type { ReactNode } from 'react'
import { SPRING } from './motion'

/**
 * App-wide motion setup: lazy feature bundle (components use `m.*`, not `motion.*`),
 * reduced motion follows the OS, and the default transition is `SPRING.snap`.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict={true}>
      <MotionConfig reducedMotion="user" transition={SPRING.snap}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}

export default MotionProvider
