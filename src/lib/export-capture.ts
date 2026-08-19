type WindowSize = { width: number; height: number }
type WindowShadow = { y: number; blur: number; opacity?: number }

export function exportCaptureSize(windowSize: WindowSize, shadow: WindowShadow) {
  const padding = Math.ceil(shadow.blur + Math.abs(shadow.y))
  return {
    width: windowSize.width + padding * 2,
    height: windowSize.height + padding * 2,
    padding,
  }
}
