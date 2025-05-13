import { useShouldFullscreen } from './use-should-fullscreen'
import { useShouldRotate } from './use-should-rotate'

interface Props {
  thresholdWidth?: number
}

export const useShouldDevice = ({ thresholdWidth = 762 }: Props) => {
  const { canRotate, shouldRotate } = useShouldRotate({
    threshold: thresholdWidth,
  })
  const { canFullscreen, shouldFullscreen, toggleFullscreen } = useShouldFullscreen()

  const perfect = !shouldRotate && !shouldFullscreen

  return {
    canRotate,
    canFullscreen,
    shouldRotate,
    shouldFullscreen,
    toggleFullscreen,
    perfect,
  }
}
