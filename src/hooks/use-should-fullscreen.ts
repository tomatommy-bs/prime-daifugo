import { useFullscreen, useOs } from '@mantine/hooks'

export const useShouldFullscreen = (): {
  shouldFullscreen: boolean
  canFullscreen: boolean
  toggleFullscreen: () => void
} => {
  const os = useOs()
  const { fullscreen, toggle } = useFullscreen()

  let shouldFullscreen = !fullscreen
  let canFullscreen = true

  switch (os) {
    case 'android': {
      shouldFullscreen = !fullscreen
      canFullscreen = true
      break
    }
    case 'macos':
    case 'windows':
    case 'chromeos':
    case 'linux':
      if (process.env.NODE_ENV === 'development') {
        shouldFullscreen = !fullscreen
        canFullscreen = true
      } else {
        shouldFullscreen = false
        canFullscreen = true
      }
      break
    case 'ios': {
      canFullscreen = false
      shouldFullscreen = false
      break
    }
    case 'undetermined': {
      canFullscreen = false
      shouldFullscreen = false
      break
    }
    default:
      throw new Error(os satisfies never)
  }

  return {
    shouldFullscreen,
    canFullscreen,
    toggleFullscreen: toggle,
  }
}
