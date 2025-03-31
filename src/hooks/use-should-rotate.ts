import { useOs, useViewportSize } from '@mantine/hooks'

interface Props {
  threshold?: number
}

export const useShouldRotate = ({
  threshold = 762,
}: Props): {
  shouldRotate: boolean
  canRotate: boolean
} => {
  const { width, height } = useViewportSize()
  const os = useOs()

  let shouldRotate = width < height && width < threshold
  let canRotate = true

  switch (os) {
    // Skip rotation recommendation on desktop
    case 'windows':
    case 'macos':
    case 'linux':
      // But, still show it in development
      if (process.env.NODE_ENV === 'development') {
        canRotate = true
      } else {
        canRotate = false
        shouldRotate = false
      }
      break
    case 'android':
    case 'ios':
      canRotate = true
      break
    case 'undetermined': {
      canRotate = false
      shouldRotate = false
      break
    }
    default:
      throw new Error(os satisfies never)
  }

  return {
    shouldRotate,
    canRotate,
  }
}
