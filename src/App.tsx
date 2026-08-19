import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent, type HTMLAttributes, type PointerEvent, type Ref, type SyntheticEvent } from 'react'
import { Download, FolderOpen, Minus, PictureInPicture, Plus, RotateCcw, Scan } from 'lucide-react'
import { Switch } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TabItem, TabPanel, Tabs, TabsList } from '@/components/ui/tabs'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { exportCaptureSize } from '@/lib/export-capture'

const SAMPLE_IMAGE = '/sample-image.jpg'
const WINDOW_BAR_HEIGHT = 24
const EXPORT_VIEWPORT = { width: 860, height: 620 }

type WindowSize = { width: number; height: number }
type WindowBounds = WindowSize & { maxWidth: number; maxHeight: number }
type Padding = { top: number; side: number; bottom: number }
type PaddingPreset = 'small' | 'medium' | 'large' | 'custom'
type ExportFormat = 'image/png' | 'image/jpeg' | 'image/webp'
type ExportPreset = 'original' | 'large' | 'medium' | 'small' | 'custom'
type SidebarMode = 'settings' | 'export'
type WindowResizeMode = 'size' | 'padding'
type ShadowPreset = 'small' | 'medium' | 'big' | 'custom'
type ExportStatus = 'idle' | 'exporting' | 'error'
type WindowShadow = { y: number; blur: number; opacity: number }
type ResizeEdge = 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type ResizeSession = { edge: ResizeEdge; startX: number; startY: number; startSize: WindowSize; startPadding: Padding }
type DragSession = { startX: number; startY: number; startPosition: { x: number; y: number } }

const WINDOW_LIMITS = {
  minWidth: 100,
  maxWidth: 4096,
  minHeight: 80,
  maxHeight: 4096,
}

const LOCKED_WINDOW_MINIMUM = { width: 320, height: 180 }

const WINDOW_BOUNDS: WindowBounds = {
  width: WINDOW_LIMITS.minWidth,
  height: WINDOW_LIMITS.minHeight,
  maxWidth: WINDOW_LIMITS.maxWidth,
  maxHeight: WINDOW_LIMITS.maxHeight,
}

const PADDING_PRESETS: Record<Exclude<PaddingPreset, 'custom'>, Padding> = {
  small: { top: 16, side: 12, bottom: 24 },
  medium: { top: 32, side: 18, bottom: 44 },
  large: { top: 48, side: 24, bottom: 68 },
}

const EXPORT_PRESETS: Array<{ id: Exclude<ExportPreset, 'custom'>; label: string; longEdge?: number }> = [
  { id: 'original', label: 'Original' },
  { id: 'large', label: 'Large · 2048 px', longEdge: 2048 },
  { id: 'medium', label: 'Medium · 1280 px', longEdge: 1280 },
  { id: 'small', label: 'Small · 720 px', longEdge: 720 },
]

function exportSizeForPreset(naturalWidth: number, naturalHeight: number, preset: Exclude<ExportPreset, 'custom'>): WindowSize | null {
  if (!naturalWidth || !naturalHeight) return null

  const longEdge = EXPORT_PRESETS.find(({ id }) => id === preset)?.longEdge
  const scale = longEdge ? longEdge / Math.max(naturalWidth, naturalHeight) : 1
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  }
}

const SHADOW_PRESETS: Record<Exclude<ShadowPreset, 'custom'>, WindowShadow> = {
  small: { y: 6, blur: 16, opacity: 0.18 },
  medium: { y: 10, blur: 24, opacity: 0.28 },
  big: { y: 18, blur: 50, opacity: 0.55 },
}

const RESIZE_HIT_AREA = 8

function clampWindowSize({ width, height }: WindowSize, bounds: WindowBounds): WindowSize {
  return {
    width: Math.min(bounds.maxWidth, Math.max(bounds.width, Math.round(width))),
    height: Math.min(bounds.maxHeight, Math.max(bounds.height, Math.round(height))),
  }
}

function windowSizeAtAspect(value: number, dimension: keyof WindowSize, aspectRatio: number): WindowSize {
  const safeRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1
  if (dimension === 'width') {
    const minWidth = Math.max(LOCKED_WINDOW_MINIMUM.width, LOCKED_WINDOW_MINIMUM.height * safeRatio)
    const maxWidth = Math.min(WINDOW_LIMITS.maxWidth, WINDOW_LIMITS.maxHeight * safeRatio)
    const width = Math.min(maxWidth, Math.max(minWidth, value))
    return { width: Math.round(width), height: Math.round(width / safeRatio) }
  }

  const minHeight = Math.max(LOCKED_WINDOW_MINIMUM.height, LOCKED_WINDOW_MINIMUM.width / safeRatio)
  const maxHeight = Math.min(WINDOW_LIMITS.maxHeight, WINDOW_LIMITS.maxWidth / safeRatio)
  const height = Math.min(maxHeight, Math.max(minHeight, value))
  return { width: Math.round(height * safeRatio), height: Math.round(height) }
}

function imageSizeAtAspect(value: number, dimension: keyof WindowSize, aspectRatio: number, maxWidth: number, maxHeight: number): WindowSize {
  const safeRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1
  if (dimension === 'width') {
    const width = Math.min(maxWidth, maxHeight * safeRatio, Math.max(1, value))
    return { width: Math.round(width), height: Math.round(width / safeRatio) }
  }

  const height = Math.min(maxHeight, maxWidth / safeRatio, Math.max(1, value))
  return { width: Math.round(height * safeRatio), height: Math.round(height) }
}

function imageSizeWithin(naturalWidth: number, naturalHeight: number, maxWidth: number, maxHeight: number): WindowSize | null {
  if (!naturalWidth || !naturalHeight) return null
  const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight)
  return { width: Math.max(1, Math.round(naturalWidth * scale)), height: Math.max(1, Math.round(naturalHeight * scale)) }
}

function contentWindowSizeForImage(imageWidth: number, imageHeight: number, padding: Padding): WindowSize {
  return {
    width: Math.ceil(imageWidth + padding.side * 2),
    height: Math.ceil(imageHeight + padding.top + padding.bottom + WINDOW_BAR_HEIGHT),
  }
}

function imageSizeForWindow(imageSize: WindowSize, windowSize: WindowSize, padding: Padding, keepAspectRatio: boolean): WindowSize {
  const stagePadding = stagePaddingForWindow(padding, windowSize)
  const uiScale = Math.max(1, windowSize.width / 760)
  const maxWidth = Math.max(1, windowSize.width - stagePadding.side * 2)
  const maxHeight = Math.max(1, windowSize.height - WINDOW_BAR_HEIGHT * uiScale - stagePadding.top - stagePadding.bottom)
  return keepAspectRatio
    ? imageSizeWithin(imageSize.width, imageSize.height, maxWidth, maxHeight) ?? imageSize
    : { width: Math.min(imageSize.width, maxWidth), height: Math.min(imageSize.height, maxHeight) }
}

function stagePaddingForWindow(padding: Padding, { width, height }: WindowSize): Padding {
  return {
    top: Math.min(padding.top, Math.round(height * 0.08)),
    side: Math.min(padding.side, Math.round(width * 0.032)),
    bottom: Math.min(padding.bottom, Math.round(height * 0.112)),
  }
}

function resizeEdgeAtPoint(element: HTMLElement, clientX: number, clientY: number): ResizeEdge | null {
  const bounds = element.getBoundingClientRect()
  if (
    clientX < bounds.left - RESIZE_HIT_AREA
    || clientX > bounds.right + RESIZE_HIT_AREA
    || clientY < bounds.top - RESIZE_HIT_AREA
    || clientY > bounds.bottom + RESIZE_HIT_AREA
  ) return null

  const top = Math.abs(clientY - bounds.top) <= RESIZE_HIT_AREA
  const right = Math.abs(bounds.right - clientX) <= RESIZE_HIT_AREA
  const bottom = Math.abs(bounds.bottom - clientY) <= RESIZE_HIT_AREA
  const left = Math.abs(clientX - bounds.left) <= RESIZE_HIT_AREA

  const vertical = top ? 'top' : bottom ? 'bottom' : ''
  const horizontal = left ? 'left' : right ? 'right' : ''
  if (!vertical && !horizontal) return null
  return (vertical && horizontal ? `${vertical}-${horizontal}` : vertical || horizontal) as ResizeEdge
}

function resizeCursor(edge: ResizeEdge | null) {
  if (!edge) return undefined
  if (edge === 'top' || edge === 'bottom') return 'ns-resize'
  if (edge === 'left' || edge === 'right') return 'ew-resize'
  return edge === 'top-left' || edge === 'bottom-right' ? 'nwse-resize' : 'nesw-resize'
}

function exportFileName(fileName: string, format: ExportFormat) {
  const stem = fileName.replace(/\.[^/.]+$/, '') || 'image'
  const extension = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png'
  return `${stem}.${extension}`
}

type MacWindowProps = {
  fileName: string
  imageSrc: string | null
  imageDisplaySize: WindowSize
  uiScale: number
  stageStyle: CSSProperties
  windowRef?: Ref<HTMLDivElement>
  isDragging?: boolean
  barProps?: HTMLAttributes<HTMLElement>
  stageProps?: HTMLAttributes<HTMLDivElement>
  imageResizeProps?: HTMLAttributes<HTMLDivElement> & { 'data-resize-edge'?: ResizeEdge }
  imageRef?: Ref<HTMLImageElement>
  onImageLoad?: (event: SyntheticEvent<HTMLImageElement>) => void
}

function MacWindow({ fileName, imageSrc, imageDisplaySize, uiScale, stageStyle, windowRef, isDragging = false, barProps, stageProps, imageResizeProps, imageRef, onImageLoad }: MacWindowProps) {
  return (
    <div ref={windowRef} className="viewer-window" style={{ '--window-ui-scale': uiScale } as CSSProperties}>
      <header {...barProps} className={`window-bar${barProps ? ' is-draggable' : ''}${barProps?.className ? ` ${barProps.className}` : ''}`}>
        <div className="traffic-lights" aria-hidden="true">
          <span className="traffic-light red" data-testid="traffic-light" data-tone="red" />
          <span className="traffic-light yellow" data-testid="traffic-light" data-tone="yellow" />
          <span className="traffic-light green" data-testid="traffic-light" data-tone="green" />
        </div>
        <div className="window-title">{fileName}</div>
      </header>
      <div
        {...stageProps}
        className={`viewer-stage${isDragging ? ' is-dragging' : ''}`}
        style={{ ...stageStyle, overflow: 'hidden' }}
      >
        <div className="image-frame">
          {imageSrc && (
            <div
              {...imageResizeProps}
              className={`image-resize-box${imageResizeProps ? ' is-resizable' : ''}${imageResizeProps?.className ? ` ${imageResizeProps.className}` : ''}`}
              style={{ width: `${imageDisplaySize.width}px`, height: `${imageDisplaySize.height}px`, ...imageResizeProps?.style }}
            >
              <img
                ref={imageRef}
                className="viewer-image"
                src={imageSrc}
                alt={fileName === 'steve-jobs.png' ? 'Sample image' : fileName}
                style={{ width: `${imageDisplaySize.width}px`, height: `${imageDisplaySize.height}px`, objectFit: 'fill' }}
                onLoad={onImageLoad}
                draggable={false}
              />
            </div>
          )}
          {stageProps && <span className="drop-message">Drop an image to open it</span>}
        </div>
      </div>
    </div>
  )
}

function useImageViewer() {
  const [imageSrc, setImageSrc] = useState<string | null>(SAMPLE_IMAGE)
  const [fileName, setFileName] = useState('steve-jobs.png')
  const [imageDisplaySize, setImageDisplaySize] = useState<WindowSize>({ width: 627, height: 470 })
  const [imageSizeFields, setImageSizeFields] = useState({ width: '627', height: '470' })
  const [isImageAspectLocked, setIsImageAspectLocked] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [windowSize, setWindowSize] = useState<WindowSize>({ width: 760, height: 610 })
  const [sizeFields, setSizeFields] = useState({ width: '760', height: '610' })
  const [windowResizeMode, setWindowResizeMode] = useState<WindowResizeMode>('size')
  const [isWindowAspectLocked, setIsWindowAspectLocked] = useState(false)
  const [paddingPreset, setPaddingPreset] = useState<PaddingPreset>('large')
  const [padding, setPadding] = useState<Padding>(PADDING_PRESETS.large)
  const [paddingFields, setPaddingFields] = useState({ top: '48', side: '24', bottom: '68' })
  const [isVerticalPaddingLinked, setIsVerticalPaddingLinked] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('image/png')
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')
  const [exportPreset, setExportPreset] = useState<ExportPreset>('original')
  const [exportSize, setExportSize] = useState<WindowSize>({ width: 760, height: 610 })
  const [exportSizeFields, setExportSizeFields] = useState({ width: '', height: '' })
  const [exportZoomPercent, setExportZoomPercent] = useState(100)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('settings')
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 })
  const [isDraggingPreview, setIsDraggingPreview] = useState(false)
  const [sidebarFloating, setSidebarFloating] = useState(false)
  const [sidebarPosition, setSidebarPosition] = useState({ x: 0, y: 0 })
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false)
  const [shadowPreset, setShadowPreset] = useState<ShadowPreset>('medium')
  const [windowShadow, setWindowShadow] = useState<WindowShadow>(SHADOW_PRESETS.medium)
  const [shadowOpacityInput, setShadowOpacityInput] = useState(String(SHADOW_PRESETS.medium.opacity))
  const [hoveredResizeEdge, setHoveredResizeEdge] = useState<ResizeEdge | null>(null)
  const [activeResizeEdge, setActiveResizeEdge] = useState<ResizeEdge | null>(null)
  const [hoveredImageResizeEdge, setHoveredImageResizeEdge] = useState<ResizeEdge | null>(null)
  const [activeImageResizeEdge, setActiveImageResizeEdge] = useState<ResizeEdge | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const viewerRef = useRef<HTMLElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const exportWindowRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const resizeSessionRef = useRef<ResizeSession | null>(null)
  const imageResizeSessionRef = useRef<ResizeSession | null>(null)
  const previewDragSessionRef = useRef<DragSession | null>(null)
  const sidebarDragSessionRef = useRef<DragSession | null>(null)
  const imageAspectRatioRef = useRef(imageDisplaySize.width / imageDisplaySize.height)
  const windowAspectRatioRef = useRef(windowSize.width / windowSize.height)
  const exportAspectRatioRef = useRef(exportSize.width / exportSize.height)
  const settingsPreviewFitScale = Math.min(1, EXPORT_VIEWPORT.width / windowSize.width, 780 / windowSize.height)
  const settingsPreviewScale = settingsPreviewFitScale
  const exportPreviewFitScale = Math.min(1, (EXPORT_VIEWPORT.width - 24) / exportSize.width, (EXPORT_VIEWPORT.height - 24) / exportSize.height)
  const exportPreviewScale = exportPreviewFitScale * (exportZoomPercent / 100)
  const windowUiScale = Math.max(1, windowSize.width / 760)
  const stagePadding = windowResizeMode === 'padding' ? padding : stagePaddingForWindow(padding, windowSize)
  const stageStyle = {
    '--stage-top-padding': `${stagePadding.top}px`,
    '--stage-side-padding': `${stagePadding.side}px`,
    '--stage-bottom-padding': `${stagePadding.bottom}px`,
  } as CSSProperties
  const exportScale = exportSize.width / windowSize.width
  const exportImageDisplaySize = {
    width: Math.max(1, Math.round(imageDisplaySize.width * exportScale)),
    height: Math.max(1, Math.round(imageDisplaySize.height * exportScale)),
  }
  const exportStageStyle = {
    '--stage-top-padding': `${Math.round(stagePadding.top * exportScale)}px`,
    '--stage-side-padding': `${Math.round(stagePadding.side * exportScale)}px`,
    '--stage-bottom-padding': `${Math.round(stagePadding.bottom * exportScale)}px`,
  } as CSSProperties
  const exportWindowUiScale = windowUiScale * exportScale
  const viewerStyle = {
    width: `${windowSize.width}px`,
    height: `${windowSize.height}px`,
    minWidth: `${WINDOW_LIMITS.minWidth}px`,
    minHeight: `${WINDOW_LIMITS.minHeight}px`,
    maxWidth: `${WINDOW_LIMITS.maxWidth}px`,
    maxHeight: `${WINDOW_LIMITS.maxHeight}px`,
    cursor: resizeCursor(activeResizeEdge ?? hoveredResizeEdge),
    '--window-shadow': `0 ${windowShadow.y}px ${windowShadow.blur}px rgba(0, 0, 0, ${windowShadow.opacity})`,
    '--window-ui-scale': windowUiScale,
  } as CSSProperties
  const settingsPreviewStyle = {
    width: `${windowSize.width * settingsPreviewScale}px`,
    height: `${windowSize.height * settingsPreviewScale}px`,
    transform: `translate(${previewPosition.x}px, ${previewPosition.y}px)`,
  } as CSSProperties

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  const setWindowDimensions = (nextSize: WindowSize, preserveFields = false) => {
    const constrainedSize = clampWindowSize(nextSize, WINDOW_BOUNDS)
    setWindowSize(constrainedSize)
    if (!preserveFields) {
      setSizeFields({ width: String(constrainedSize.width), height: String(constrainedSize.height) })
    }
    return constrainedSize
  }

  const setImageDimensions = (nextSize: WindowSize) => {
    setImageDisplaySize(nextSize)
    setImageSizeFields({ width: String(Math.round(nextSize.width)), height: String(Math.round(nextSize.height)) })
  }

  const applyWindowSize = (nextSize: WindowSize, preserveFields = false) => {
    const constrainedSize = setWindowDimensions(nextSize, preserveFields)
    if (windowResizeMode === 'padding') return
    const fittedImageSize = imageSizeForWindow(imageDisplaySize, constrainedSize, padding, isWindowAspectLocked)
    if (fittedImageSize.width !== imageDisplaySize.width || fittedImageSize.height !== imageDisplaySize.height) {
      setImageDimensions(fittedImageSize)
    }
  }

  const applyImageSize = (nextSize: WindowSize, lockedDimension?: keyof WindowSize) => {
    const maxWidth = windowResizeMode === 'padding' ? 4096 : Math.max(1, windowSize.width - stagePadding.side * 2)
    const maxHeight = windowResizeMode === 'padding'
      ? 4096
      : Math.max(1, windowSize.height - WINDOW_BAR_HEIGHT * windowUiScale - stagePadding.top - stagePadding.bottom)
    const constrainedSize = isImageAspectLocked && lockedDimension
      ? imageSizeAtAspect(nextSize[lockedDimension], lockedDimension, imageAspectRatioRef.current, maxWidth, maxHeight)
      : {
          width: Math.min(maxWidth, Math.max(1, Math.round(nextSize.width))),
          height: Math.min(maxHeight, Math.max(1, Math.round(nextSize.height))),
        }
    setImageDimensions(constrainedSize)
    if (windowResizeMode === 'padding') {
      setWindowDimensions(contentWindowSizeForImage(constrainedSize.width, constrainedSize.height, padding))
    }
  }

  const applyPadding = (nextPadding: Padding, nextPreset: PaddingPreset) => {
    setPaddingPreset(nextPreset)
    setPadding(nextPadding)
    setPaddingFields({
      top: String(nextPadding.top),
      side: String(nextPadding.side),
      bottom: String(nextPadding.bottom),
    })
    if (windowResizeMode === 'padding') {
      setWindowDimensions(contentWindowSizeForImage(imageDisplaySize.width, imageDisplaySize.height, nextPadding))
      return
    }
    const fittedImageSize = imageSizeForWindow(imageDisplaySize, windowSize, nextPadding, isWindowAspectLocked)
    if (fittedImageSize.width !== imageDisplaySize.width || fittedImageSize.height !== imageDisplaySize.height) {
      setImageDimensions(fittedImageSize)
    }
  }

  const loadFile = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const nextUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : SAMPLE_IMAGE
    objectUrlRef.current = nextUrl === SAMPLE_IMAGE ? null : nextUrl
    setImageSrc(nextUrl)
    setFileName(file.name)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0])
    event.target.value = ''
  }

  const clearImage = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
    setImageSrc(null)
    setFileName('window')
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    loadFile(event.dataTransfer.files[0])
  }

  const toggleSidebarFloating = () => {
    if (!sidebarFloating && sidebarRef.current) {
      const bounds = sidebarRef.current.getBoundingClientRect()
      setSidebarPosition({
        x: bounds.left - (window.innerWidth - 32 - bounds.width),
        y: bounds.top - 32,
      })
    } else {
      setSidebarPosition({ x: 0, y: 0 })
    }
    setSidebarFloating((isFloating) => !isFloating)
  }

  const fitWindowToImage = (image = imageRef.current) => {
    if (!image) return
    const fittedImageSize = imageSizeWithin(
      image.naturalWidth,
      image.naturalHeight,
      EXPORT_VIEWPORT.width - padding.side * 2,
      EXPORT_VIEWPORT.height - padding.top - padding.bottom - WINDOW_BAR_HEIGHT,
    )
    if (!fittedImageSize) return
    setImageDimensions(fittedImageSize)
    if (isImageAspectLocked) imageAspectRatioRef.current = fittedImageSize.width / fittedImageSize.height
    setWindowDimensions(contentWindowSizeForImage(fittedImageSize.width, fittedImageSize.height, padding))
  }

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    fitWindowToImage(event.currentTarget)
  }

  const handleWindowDimensionChange = (dimension: keyof WindowSize, value: string) => {
    setSizeFields((currentFields) => ({ ...currentFields, [dimension]: value }))
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue) || numericValue <= 0) return

    if (isWindowAspectLocked) {
      const nextSize = windowSizeAtAspect(numericValue, dimension, windowAspectRatioRef.current)
      applyWindowSize(nextSize, true)
      setSizeFields((currentFields) => ({
        ...currentFields,
        [dimension === 'width' ? 'height' : 'width']: String(nextSize[dimension === 'width' ? 'height' : 'width']),
      }))
      return
    }

    applyWindowSize({ ...windowSize, [dimension]: numericValue }, true)
  }

  const handleWindowAspectLockChange = (checked: boolean) => {
    if (checked) windowAspectRatioRef.current = windowSize.width / windowSize.height
    setIsWindowAspectLocked(checked)
  }

  const handleWindowResizeModeChange = (value: string) => {
    const nextMode = value as WindowResizeMode
    setWindowResizeMode(nextMode)
    if (nextMode === 'padding') {
      setWindowDimensions(contentWindowSizeForImage(imageDisplaySize.width, imageDisplaySize.height, padding))
    }
  }

  const handleImageDimensionChange = (dimension: keyof WindowSize, value: string) => {
    setImageSizeFields((currentFields) => ({ ...currentFields, [dimension]: value }))
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue) || numericValue < 1) return

    const maxWidth = windowResizeMode === 'padding' ? 4096 : Math.max(1, windowSize.width - stagePadding.side * 2)
    const maxHeight = windowResizeMode === 'padding'
      ? 4096
      : Math.max(1, windowSize.height - WINDOW_BAR_HEIGHT * windowUiScale - stagePadding.top - stagePadding.bottom)
    if (isImageAspectLocked) {
      const nextSize = imageSizeAtAspect(numericValue, dimension, imageAspectRatioRef.current, maxWidth, maxHeight)
      applyImageSize(nextSize, dimension)
      return
    }

    const maxValue = dimension === 'width' ? maxWidth : maxHeight
    applyImageSize({ ...imageDisplaySize, [dimension]: Math.min(maxValue, Math.round(numericValue)) })
  }

  const handleImageAspectLockChange = (checked: boolean) => {
    if (checked) imageAspectRatioRef.current = imageDisplaySize.width / imageDisplaySize.height
    setIsImageAspectLocked(checked)
  }

  const applyPaddingPreset = (preset: Exclude<PaddingPreset, 'custom'>) => {
    const selectedPadding = PADDING_PRESETS[preset]
    const nextPadding = isVerticalPaddingLinked ? { ...selectedPadding, bottom: selectedPadding.top } : selectedPadding
    applyPadding(nextPadding, preset)
  }

  const handlePaddingPresetChange = (value: string) => {
    if (value === 'custom') {
      setPaddingPreset('custom')
      return
    }
    applyPaddingPreset(value as Exclude<PaddingPreset, 'custom'>)
  }

  const handlePaddingChange = (dimension: keyof Padding, value: string) => {
    const updateVerticalPadding = isVerticalPaddingLinked && (dimension === 'top' || dimension === 'bottom')
    setPaddingFields((currentFields) => updateVerticalPadding
      ? { ...currentFields, top: value, bottom: value }
      : { ...currentFields, [dimension]: value })
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue) || numericValue < 0) return
    const constrainedValue = Math.min(4096, Math.round(numericValue))
    applyPadding(
      updateVerticalPadding
        ? { ...padding, top: constrainedValue, bottom: constrainedValue }
        : { ...padding, [dimension]: constrainedValue },
      'custom',
    )
  }

  const handleVerticalPaddingLinkChange = (checked: boolean) => {
    setIsVerticalPaddingLinked(checked)
    if (!checked) return
    applyPadding({ ...padding, bottom: padding.top }, 'custom')
  }

  const applyResizePadding = (nextPadding: Padding) => {
    const constrainedPadding = {
      top: Math.min(4096, Math.max(0, Math.round(nextPadding.top))),
      side: Math.min(4096, Math.max(0, Math.round(nextPadding.side))),
      bottom: Math.min(4096, Math.max(0, Math.round(nextPadding.bottom))),
    }
    const appliedPadding = isVerticalPaddingLinked
      ? { ...constrainedPadding, bottom: constrainedPadding.top }
      : constrainedPadding
    applyPadding(appliedPadding, 'custom')
  }

  const applyShadowPreset = (preset: Exclude<ShadowPreset, 'custom'>) => {
    const nextShadow = SHADOW_PRESETS[preset]
    setShadowPreset(preset)
    setWindowShadow(nextShadow)
    setShadowOpacityInput(String(nextShadow.opacity))
  }

  const handleShadowPresetChange = (value: string) => {
    if (value === 'custom') {
      setShadowPreset('custom')
      return
    }
    applyShadowPreset(value as Exclude<ShadowPreset, 'custom'>)
  }

  const handleShadowOpacityChange = (value: string) => {
    setShadowOpacityInput(value)
    const opacity = Number(value)
    if (!value || !Number.isFinite(opacity)) return
    setShadowPreset('custom')
    setWindowShadow((currentShadow) => ({ ...currentShadow, opacity: Math.min(0.8, Math.max(0.05, opacity)) }))
  }

  const handleResizePointerMove = (event: PointerEvent<HTMLElement>) => {
    const resizeSession = resizeSessionRef.current
    if (!resizeSession) {
      setHoveredResizeEdge(resizeEdgeAtPoint(event.currentTarget, event.clientX, event.clientY))
      return
    }

    const deltaX = (event.clientX - resizeSession.startX) / settingsPreviewScale
    const deltaY = (event.clientY - resizeSession.startY) / settingsPreviewScale

    if (windowResizeMode === 'padding') {
      const verticalDelta = resizeSession.edge.includes('top') ? -deltaY : resizeSession.edge.includes('bottom') ? deltaY : 0
      applyResizePadding({
        top: resizeSession.startPadding.top + (isVerticalPaddingLinked ? verticalDelta : resizeSession.edge.includes('top') ? -deltaY : 0),
        side: resizeSession.startPadding.side + (resizeSession.edge.includes('right') ? deltaX : resizeSession.edge.includes('left') ? -deltaX : 0),
        bottom: resizeSession.startPadding.bottom + (isVerticalPaddingLinked ? verticalDelta : resizeSession.edge.includes('bottom') ? deltaY : 0),
      })
      return
    }

    const widthDelta = resizeSession.edge.includes('right') ? deltaX : resizeSession.edge.includes('left') ? -deltaX : 0
    const heightDelta = resizeSession.edge.includes('bottom') ? deltaY : resizeSession.edge.includes('top') ? -deltaY : 0
    if (isWindowAspectLocked) {
      const widthChange = Math.abs(widthDelta / resizeSession.startSize.width)
      const heightChange = Math.abs(heightDelta / resizeSession.startSize.height)
      const dimension = widthDelta && widthChange >= heightChange ? 'width' : 'height'
      const value = dimension === 'width'
        ? resizeSession.startSize.width + widthDelta
        : resizeSession.startSize.height + heightDelta
      applyWindowSize(windowSizeAtAspect(value, dimension, windowAspectRatioRef.current))
      return
    }

    applyWindowSize({
      width: resizeSession.startSize.width + widthDelta,
      height: resizeSession.startSize.height + heightDelta,
    })
  }

  const handleResizePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const edge = resizeEdgeAtPoint(event.currentTarget, event.clientX, event.clientY)
    if (!edge) return

    event.preventDefault()
    resizeSessionRef.current = { edge, startX: event.clientX, startY: event.clientY, startSize: windowSize, startPadding: padding }
    setHoveredResizeEdge(edge)
    setActiveResizeEdge(edge)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const endResize = (event: PointerEvent<HTMLElement>) => {
    if (!resizeSessionRef.current) return
    resizeSessionRef.current = null
    setActiveResizeEdge(null)
    setHoveredResizeEdge(resizeEdgeAtPoint(event.currentTarget, event.clientX, event.clientY))
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleImageResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const resizeSession = imageResizeSessionRef.current
    if (!resizeSession) {
      setHoveredImageResizeEdge(resizeEdgeAtPoint(event.currentTarget, event.clientX, event.clientY))
      return
    }

    const deltaX = (event.clientX - resizeSession.startX) / settingsPreviewScale
    const deltaY = (event.clientY - resizeSession.startY) / settingsPreviewScale
    const widthDelta = resizeSession.edge.includes('right') ? deltaX : resizeSession.edge.includes('left') ? -deltaX : 0
    const heightDelta = resizeSession.edge.includes('bottom') ? deltaY : resizeSession.edge.includes('top') ? -deltaY : 0
    const widthChange = Math.abs(widthDelta / resizeSession.startSize.width)
    const heightChange = Math.abs(heightDelta / resizeSession.startSize.height)
    const lockedDimension = widthDelta && widthChange >= heightChange ? 'width' : 'height'
    applyImageSize({
      width: resizeSession.startSize.width + widthDelta,
      height: resizeSession.startSize.height + heightDelta,
    }, lockedDimension)
  }

  const handleImageResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const edge = resizeEdgeAtPoint(event.currentTarget, event.clientX, event.clientY)
    if (!edge) return

    event.preventDefault()
    event.stopPropagation()
    imageResizeSessionRef.current = { edge, startX: event.clientX, startY: event.clientY, startSize: imageDisplaySize, startPadding: padding }
    setHoveredImageResizeEdge(edge)
    setActiveImageResizeEdge(edge)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const endImageResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageResizeSessionRef.current) return
    event.stopPropagation()
    imageResizeSessionRef.current = null
    setActiveImageResizeEdge(null)
    setHoveredImageResizeEdge(resizeEdgeAtPoint(event.currentTarget, event.clientX, event.clientY))
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handlePreviewDragStart = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    if (sidebarMode === 'settings' && viewerRef.current && resizeEdgeAtPoint(viewerRef.current, event.clientX, event.clientY)) return

    event.preventDefault()
    event.stopPropagation()
    previewDragSessionRef.current = { startX: event.clientX, startY: event.clientY, startPosition: previewPosition }
    setIsDraggingPreview(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePreviewDragMove = (event: PointerEvent<HTMLElement>) => {
    const dragSession = previewDragSessionRef.current
    if (!dragSession) return
    event.stopPropagation()
    setPreviewPosition({
      x: dragSession.startPosition.x + event.clientX - dragSession.startX,
      y: dragSession.startPosition.y + event.clientY - dragSession.startY,
    })
  }

  const endPreviewDrag = (event: PointerEvent<HTMLElement>) => {
    if (!previewDragSessionRef.current) return
    event.stopPropagation()
    previewDragSessionRef.current = null
    setIsDraggingPreview(false)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleSidebarDragStart = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    sidebarDragSessionRef.current = { startX: event.clientX, startY: event.clientY, startPosition: sidebarPosition }
    setIsDraggingSidebar(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleSidebarDragMove = (event: PointerEvent<HTMLElement>) => {
    const dragSession = sidebarDragSessionRef.current
    if (!dragSession) return
    setSidebarPosition({
      x: dragSession.startPosition.x + event.clientX - dragSession.startX,
      y: dragSession.startPosition.y + event.clientY - dragSession.startY,
    })
  }

  const endSidebarDrag = (event: PointerEvent<HTMLElement>) => {
    if (!sidebarDragSessionRef.current) return
    sidebarDragSessionRef.current = null
    setIsDraggingSidebar(false)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const updateExportZoom = (value: number) => {
    setExportZoomPercent(Math.min(200, Math.max(25, Math.round(value))))
  }

  const exportImage = async () => {
    const exportWindow = exportWindowRef.current
    if (!exportWindow) return

    const width = exportSize.width
    const height = exportSize.height
    if (!width || !height || width < 1 || height < 1) return

    setExportStatus('exporting')
    try {
      await document.fonts?.ready
      const { toCanvas } = await import('html-to-image')
      const captureSize = exportCaptureSize(exportSize, windowShadow)
      const output = await toCanvas(exportWindow, {
        width: captureSize.width,
        height: captureSize.height,
        canvasWidth: captureSize.width,
        canvasHeight: captureSize.height,
        pixelRatio: 1,
        cacheBust: !imageSrc?.startsWith('blob:'),
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${captureSize.padding}px, ${captureSize.padding}px)`,
          transformOrigin: 'top left',
          boxShadow: `0 ${windowShadow.y}px ${windowShadow.blur}px rgba(0, 0, 0, ${windowShadow.opacity})`,
        },
      })
      output.toBlob((blob) => {
        if (!blob) {
          setExportStatus('error')
          return
        }
        const downloadUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = exportFileName(fileName, exportFormat)
        link.click()
        URL.revokeObjectURL(downloadUrl)
        setExportStatus('idle')
      }, exportFormat, exportFormat === 'image/jpeg' || exportFormat === 'image/webp' ? 0.92 : undefined)
    } catch {
      setExportStatus('error')
    }
  }

  const handleExportPresetChange = (value: string) => {
    const nextPreset = value as ExportPreset
    setExportPreset(nextPreset)
    if (nextPreset === 'custom') return
    const size = exportSizeForPreset(windowSize.width, windowSize.height, nextPreset)
    if (!size) return

    exportAspectRatioRef.current = size.width / size.height
    setExportSize(size)
    setExportSizeFields({ width: String(size.width), height: String(size.height) })
  }

  const handleExportSizeChange = (dimension: keyof WindowSize, value: string) => {
    setExportPreset('custom')
    setExportSizeFields((currentFields) => ({ ...currentFields, [dimension]: value }))
    const numericValue = Math.round(Number(value))
    if (!Number.isFinite(numericValue) || numericValue < 1) {
      return
    }
    const nextSize = imageSizeAtAspect(numericValue, dimension, exportAspectRatioRef.current, WINDOW_LIMITS.maxWidth, WINDOW_LIMITS.maxHeight)
    setExportSize(nextSize)
    setExportSizeFields({ width: String(nextSize.width), height: String(nextSize.height) })
  }

  const handleSidebarModeChange = (value: string) => {
    const nextMode = value as SidebarMode
    if (nextMode === 'export' && sidebarMode !== 'export') {
      setExportPreset('original')
      exportAspectRatioRef.current = windowSize.width / windowSize.height
      setExportSize(windowSize)
      setExportSizeFields({ width: String(windowSize.width), height: String(windowSize.height) })
    }
    setSidebarMode(nextMode)
  }

  return (
    <main className="app-shell">
      <TooltipProvider delayDuration={180}>
        <div className={`viewer-layout${sidebarFloating ? ' is-sidebar-floating' : ''}`} aria-label="Viewer layout">
          {sidebarMode === 'settings' ? (
            <div className={`settings-image-viewer${isDraggingPreview ? ' is-window-dragging' : ''}`} style={settingsPreviewStyle}>
            <section
            ref={viewerRef}
            className={`viewer-wrap${windowResizeMode === 'padding' ? ' is-content-fit' : ''}${hoveredResizeEdge ? ' is-resize-ready' : ''}${activeResizeEdge ? ' is-resizing' : ''}`}
            aria-label="Image viewer"
            title={windowResizeMode === 'padding' ? 'Drag a window edge to change padding' : 'Drag a window edge to change size'}
            data-resize-edge={activeResizeEdge ?? hoveredResizeEdge ?? undefined}
            data-shadow-preset={shadowPreset}
            onPointerMove={handleResizePointerMove}
            onPointerDown={handleResizePointerDown}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onPointerLeave={() => {
              if (!resizeSessionRef.current) setHoveredResizeEdge(null)
            }}
            style={{ ...viewerStyle, transform: `scale(${settingsPreviewScale})`, transformOrigin: 'top left' }}
          >
            <MacWindow
              fileName={fileName}
              imageSrc={imageSrc}
              imageDisplaySize={imageDisplaySize}
              uiScale={windowUiScale}
              stageStyle={stageStyle}
              isDragging={isDragging}
              barProps={{
                onPointerDown: handlePreviewDragStart,
                onPointerMove: handlePreviewDragMove,
                onPointerUp: endPreviewDrag,
                onPointerCancel: endPreviewDrag,
              }}
              imageResizeProps={{
                'aria-label': 'Resizable image',
                className: `${hoveredImageResizeEdge ? 'is-resize-ready' : ''}${activeImageResizeEdge ? ' is-resizing' : ''}`,
                'data-resize-edge': activeImageResizeEdge ?? hoveredImageResizeEdge ?? undefined,
                onPointerMove: handleImageResizePointerMove,
                onPointerDown: handleImageResizePointerDown,
                onPointerUp: endImageResize,
                onPointerCancel: endImageResize,
                onPointerLeave: () => {
                  if (!imageResizeSessionRef.current) setHoveredImageResizeEdge(null)
                },
                style: { cursor: resizeCursor(activeImageResizeEdge ?? hoveredImageResizeEdge) },
              }}
              imageRef={imageRef}
              onImageLoad={handleImageLoad}
              stageProps={{
                'aria-label': 'Image stage',
                onDragEnter: (event) => {
                  event.preventDefault()
                  setIsDragging(true)
                },
                onDragOver: (event) => event.preventDefault(),
                onDragLeave: (event) => {
                  if (event.currentTarget === event.target) setIsDragging(false)
                },
                onDrop: handleDrop,
              }}
            />
            </section>
            </div>
          ) : (
            <section
              className={`export-image-viewer${isDraggingPreview ? ' is-window-dragging' : ''}`}
              aria-label="Export preview"
              style={{ transform: `translate(${previewPosition.x}px, ${previewPosition.y}px)` }}
            >
              <header
                className="sidebar-bar export-preview-menu-bar is-draggable"
                data-testid="export-preview-menu-bar"
                onPointerDown={handlePreviewDragStart}
                onPointerMove={handlePreviewDragMove}
                onPointerUp={endPreviewDrag}
                onPointerCancel={endPreviewDrag}
              >
                <span>Image previewer</span>
              </header>
              <div className="export-preview-stage" aria-label="Export preview background">
                <div
                  className="export-window-frame"
                  data-testid="export-window-frame"
                  data-export-width={exportSize.width}
                  data-export-height={exportSize.height}
                  data-preview-zoom={exportZoomPercent}
                  data-render-scale={exportPreviewScale}
                  style={{
                    width: `${exportSize.width}px`,
                    height: `${exportSize.height}px`,
                    transform: `translate(-50%, -50%) scale(${exportPreviewScale})`,
                    '--window-shadow': `0 ${windowShadow.y}px ${windowShadow.blur}px rgba(0, 0, 0, ${windowShadow.opacity})`,
                    '--window-ui-scale': exportWindowUiScale,
                  } as CSSProperties}
                >
                  <MacWindow
                    fileName={fileName}
                    imageSrc={imageSrc}
                    imageDisplaySize={exportImageDisplaySize}
                    uiScale={exportWindowUiScale}
                    stageStyle={exportStageStyle}
                    windowRef={exportWindowRef}
                  />
                </div>
                <div className="export-zoom-control" aria-label="Export preview zoom controls">
                  <Button variant="ghost" size="icon-xs" className="control-icon" aria-label="Zoom out" onClick={() => updateExportZoom(exportZoomPercent - 10)}>
                    <Minus />
                  </Button>
                  <label className="dimension-field export-zoom-field">
                    <span className="sr-only">Zoom</span>
                    <input
                      type="number"
                      min="25"
                      max="200"
                      step="5"
                      aria-label="Zoom percentage"
                      value={exportZoomPercent}
                      onChange={(event) => updateExportZoom(Number(event.target.value))}
                    />
                    <span>%</span>
                  </label>
                  <Button variant="ghost" size="icon-xs" className="control-icon" aria-label="Zoom in" onClick={() => updateExportZoom(exportZoomPercent + 10)}>
                    <Plus />
                  </Button>
                  <span className="export-zoom-divider" aria-hidden="true" />
                  <Button variant="ghost" size="icon-xs" className="control-icon" aria-label="Reset zoom" onClick={() => setExportZoomPercent(100)}>
                    <RotateCcw />
                  </Button>
                </div>
              </div>
            </section>
          )}

          <aside
            ref={sidebarRef}
            className={`settings-sidebar${sidebarFloating ? ' is-floating' : ''}${isDraggingSidebar ? ' is-window-dragging' : ''}`}
            aria-label="Viewer controls"
            style={{ transform: `translate(${sidebarPosition.x}px, ${sidebarPosition.y}px)` }}
          >
            <header
              className="sidebar-bar is-draggable"
              onPointerDown={handleSidebarDragStart}
              onPointerMove={handleSidebarDragMove}
              onPointerUp={endSidebarDrag}
              onPointerCancel={endSidebarDrag}
            >
              <span>Controls</span>
              <Tooltip content={sidebarFloating ? 'Dock sidebar' : 'Float sidebar'}>
                <Button variant="ghost" size="icon-xs" className="sidebar-float-button" aria-label={sidebarFloating ? 'Dock sidebar' : 'Float sidebar'} onPointerDown={(event) => event.stopPropagation()} onClick={toggleSidebarFloating}>
                  <PictureInPicture />
                </Button>
              </Tooltip>
            </header>
            <div className="sidebar-content" data-testid="sidebar-content">
            <Tabs value={sidebarMode} size="compact" onValueChange={handleSidebarModeChange}>
              <TabsList className="sidebar-tabs" aria-label="Sidebar mode">
                <TabItem value="settings" label="Settings" className="flex-1 justify-center" />
                <TabItem value="export" label="Export" className="flex-1 justify-center" />
              </TabsList>
              <TabPanel value="settings" className="sidebar-tab-panel">
            <section className="settings-section">
              <p className="settings-label">Image</p>
              <input
                ref={fileInputRef}
                className="file-input"
                type="file"
                accept="image/*"
                aria-label="Choose an image"
                onChange={handleFileChange}
              />
              <Tooltip content="Open an image">
                <Button variant="outline" size="sm" className="control-button control-button-compact" onClick={() => fileInputRef.current?.click()}>
                  <FolderOpen />
                  Open image
                </Button>
              </Tooltip>
              {imageSrc && (
                <>
                  <Tooltip content="Fit the window to the image">
                    <Button variant="outline" size="sm" className="control-button control-button-compact" onClick={() => fitWindowToImage()}>
                      <Scan />
                      Fit window
                    </Button>
                  </Tooltip>
                  <Button variant="outline" size="sm" className="control-button control-button-compact" onClick={clearImage}>
                    No image
                  </Button>
                </>
              )}
              <label className="dimension-field file-name-field">
                <span>{imageSrc ? 'File name' : 'Window title'}</span>
                <input
                  type="text"
                  aria-label={imageSrc ? 'File name' : 'Window title'}
                  value={fileName}
                  onChange={(event) => setFileName(event.target.value)}
                />
              </label>
              {imageSrc && (
                <>
                  <div className="field-row">
                    <label className="dimension-field">
                      <span>Image W</span>
                      <input type="number" inputMode="numeric" min="1" aria-label="Image width" value={imageSizeFields.width} onChange={(event) => handleImageDimensionChange('width', event.target.value)} onBlur={() => setImageSizeFields({ width: String(Math.round(imageDisplaySize.width)), height: String(Math.round(imageDisplaySize.height)) })} />
                    </label>
                    <label className="dimension-field">
                      <span>Image H</span>
                      <input type="number" inputMode="numeric" min="1" aria-label="Image height" value={imageSizeFields.height} onChange={(event) => handleImageDimensionChange('height', event.target.value)} onBlur={() => setImageSizeFields({ width: String(Math.round(imageDisplaySize.width)), height: String(Math.round(imageDisplaySize.height)) })} />
                    </label>
                  </div>
                  <div className="image-aspect-row">
                    <span>Lock aspect ratio</span>
                    <Switch.Root className="padding-link-switch" aria-label="Lock image aspect ratio" checked={isImageAspectLocked} onCheckedChange={handleImageAspectLockChange}>
                      <Switch.Thumb className="padding-link-thumb" />
                    </Switch.Root>
                  </div>
                </>
              )}
            </section>

            <section className="settings-section">
              <p className="settings-label">Window</p>
              <Tabs value={windowResizeMode} size="compact" onValueChange={handleWindowResizeModeChange}>
                <TabsList className="mode-tabs" aria-label="Window resize behavior">
                  <TabItem value="size" label="Size" className="flex-1 justify-center" />
                  <TabItem value="padding" label="Padding" className="flex-1 justify-center" />
                </TabsList>
                <TabPanel value="size" className="mode-panel">
                  <div className="field-row">
                    <label className="dimension-field">
                      <span>W</span>
                      <input type="number" inputMode="numeric" min={WINDOW_LIMITS.minWidth} max={WINDOW_LIMITS.maxWidth} aria-label="Window width" value={sizeFields.width} onChange={(event) => handleWindowDimensionChange('width', event.target.value)} onBlur={() => setSizeFields({ width: String(windowSize.width), height: String(windowSize.height) })} />
                    </label>
                    <label className="dimension-field">
                      <span>H</span>
                      <input type="number" inputMode="numeric" min={WINDOW_LIMITS.minHeight} max={WINDOW_LIMITS.maxHeight} aria-label="Window height" value={sizeFields.height} onChange={(event) => handleWindowDimensionChange('height', event.target.value)} onBlur={() => setSizeFields({ width: String(windowSize.width), height: String(windowSize.height) })} />
                    </label>
                  </div>
                  <div className="window-aspect-row">
                    <span>Lock aspect ratio</span>
                    <Switch.Root className="padding-link-switch" aria-label="Lock window aspect ratio" checked={isWindowAspectLocked} onCheckedChange={handleWindowAspectLockChange}>
                      <Switch.Thumb className="padding-link-thumb" />
                    </Switch.Root>
                  </div>
                </TabPanel>
                <TabPanel value="padding" className="mode-panel mode-note">
                  Window bars change padding. Image bars still change image width and height.
                </TabPanel>
              </Tabs>
            </section>

            <section className="settings-section">
              <p className="settings-label">Padding</p>
              <Tabs value={paddingPreset} size="compact" onValueChange={handlePaddingPresetChange}>
                <TabsList className="padding-tabs" aria-label="Padding presets">
                  {(Object.keys(PADDING_PRESETS) as Array<Exclude<PaddingPreset, 'custom'>>).map((preset) => (
                    <TabItem key={preset} value={preset} label={preset} className="flex-1 justify-center capitalize" />
                  ))}
                  <TabItem value="custom" label="Custom" className="flex-1 justify-center" />
                </TabsList>
              </Tabs>
              <div className="padding-link-row">
                <span>Link top &amp; bottom</span>
                <Switch.Root className="padding-link-switch" aria-label="Link top and bottom padding" checked={isVerticalPaddingLinked} onCheckedChange={handleVerticalPaddingLinkChange}>
                  <Switch.Thumb className="padding-link-thumb" />
                </Switch.Root>
              </div>
              <div className="padding-fields">
                <label className="dimension-field">
                  <span>Top</span>
                  <input type="number" inputMode="numeric" min="0" max="4096" aria-label="Top padding" value={paddingFields.top} onChange={(event) => handlePaddingChange('top', event.target.value)} />
                </label>
                <label className="dimension-field">
                  <span>Side</span>
                  <input type="number" inputMode="numeric" min="0" max="4096" aria-label="Side padding" value={paddingFields.side} onChange={(event) => handlePaddingChange('side', event.target.value)} />
                </label>
                <label className="dimension-field">
                  <span>Bottom</span>
                  <input type="number" inputMode="numeric" min="0" max="4096" aria-label="Bottom padding" value={paddingFields.bottom} onChange={(event) => handlePaddingChange('bottom', event.target.value)} />
                </label>
              </div>
            </section>

            <section className="settings-section">
              <p className="settings-label">Shadow</p>
              <Tabs value={shadowPreset} size="compact" onValueChange={handleShadowPresetChange}>
                <TabsList className="shadow-tabs" aria-label="Shadow presets">
                  <TabItem value="small" label="Small" className="flex-1 justify-center" />
                  <TabItem value="medium" label="Medium" className="flex-1 justify-center" />
                  <TabItem value="big" label="Big" className="flex-1 justify-center" />
                  <TabItem value="custom" label="Custom" className="flex-1 justify-center" />
                </TabsList>
              </Tabs>
              <label className="dimension-field shadow-opacity-field">
                <span>Opacity</span>
                <input type="number" inputMode="decimal" min="0.05" max="0.8" step="0.05" aria-label="Shadow opacity" value={shadowOpacityInput} onChange={(event) => handleShadowOpacityChange(event.target.value)} onBlur={() => setShadowOpacityInput(String(windowShadow.opacity))} />
              </label>
              <label className="shadow-slider-field">
                <span>Strength</span>
                <input
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.05"
                  aria-label="Shadow opacity slider"
                  value={windowShadow.opacity}
                  onChange={(event) => handleShadowOpacityChange(event.target.value)}
                />
              </label>
            </section>
              </TabPanel>

              <TabPanel value="export" className="sidebar-tab-panel">
            <section className="settings-section">
              <p className="settings-label">Export image</p>
              <label className="select-field">
                <span>Format</span>
                <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as ExportFormat)}>
                  <SelectTrigger className="control-select export-select-trigger" aria-label="Export format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className="export-select-content">
                    <SelectItem value="image/png">PNG</SelectItem>
                    <SelectItem value="image/jpeg">JPEG</SelectItem>
                    <SelectItem value="image/webp">WebP</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <Tabs value={exportPreset} size="compact" onValueChange={handleExportPresetChange}>
                <TabsList className="export-tabs" aria-label="Export size presets">
                  {EXPORT_PRESETS.map((preset) => (
                    <TabItem key={preset.id} value={preset.id} label={preset.label.split(' · ')[0]} title={preset.label} className="flex-1 justify-center" />
                  ))}
                  <TabItem value="custom" label="Custom" className="flex-1 justify-center" />
                </TabsList>
              </Tabs>
              <div className="field-row export-size-fields">
                <label className="dimension-field">
                  <span>W</span>
                  <input type="number" inputMode="numeric" min="1" aria-label="Export width" value={exportSizeFields.width} onChange={(event) => handleExportSizeChange('width', event.target.value)} />
                </label>
                <label className="dimension-field">
                  <span>H</span>
                  <input type="number" inputMode="numeric" min="1" aria-label="Export height" value={exportSizeFields.height} onChange={(event) => handleExportSizeChange('height', event.target.value)} />
                </label>
              </div>
              <Button variant="outline" size="sm" className="control-button control-button-compact" onClick={exportImage} disabled={exportStatus === 'exporting'}>
                <Download />
                {exportStatus === 'exporting' ? 'Exporting…' : 'Export image'}
              </Button>
              {exportStatus === 'error' && <p className="export-error" role="alert">Could not export this image.</p>}
            </section>
              </TabPanel>
            </Tabs>
            </div>
          </aside>
        </div>
      </TooltipProvider>
    </main>
  )
}

function App() {
  return useImageViewer()
}

export default App
