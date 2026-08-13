import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App, { exportCaptureSize } from './App'

vi.mock('html-to-image', () => ({ toCanvas: vi.fn() }))

describe('image viewer', () => {
  it('exports a transparent capture with room for the window shadow', async () => {
    const { toCanvas } = await import('html-to-image')
    const canvas = { toBlob: (callback: BlobCallback) => callback(null) } as HTMLCanvasElement
    vi.mocked(toCanvas).mockResolvedValue(canvas)

    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: 'Export' }))
    await user.click(screen.getByRole('button', { name: 'Export image' }))

    await waitFor(() => expect(toCanvas).toHaveBeenCalledOnce())
    const [capture, options] = vi.mocked(toCanvas).mock.calls[0]
    const exportedWindow = screen.getByTestId('export-window-frame').querySelector('.viewer-window') as HTMLElement

    expect(exportCaptureSize({ width: 760, height: 610 }, { y: 18, blur: 50, opacity: 0.55 })).toEqual({
      width: 896,
      height: 746,
      padding: 68,
    })
    expect(capture).toBe(exportedWindow)
    expect(options).toMatchObject({
      width: 828,
      height: 678,
      canvasWidth: 828,
      canvasHeight: 678,
      style: {
        width: '760px',
        height: '610px',
        transform: 'translate(34px, 34px)',
        transformOrigin: 'top left',
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.28)',
      },
    })
  })

  it('starts with the sample image and a fit view', () => {
    render(<App />)

    expect(screen.getByRole('img', { name: 'Sample image' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Zoom percentage')).not.toBeInTheDocument()
    expect(screen.getByText('steve-jobs.png')).toBeInTheDocument()
    expect(screen.getByLabelText('File name')).toHaveValue('steve-jobs.png')
  })

  it('updates the image window title when changing the image file', async () => {
    const user = userEvent.setup()
    render(<App />)
    const file = new File(['image bytes'], 'my-photo.png', { type: 'image/png' })

    await user.upload(screen.getByLabelText('Choose an image'), file)

    expect(screen.getByLabelText('File name')).toHaveValue('my-photo.png')
    expect(screen.getByText('my-photo.png')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'my-photo.png' })).toBeInTheDocument()
  })

  it('lets the user rename the image', async () => {
    const user = userEvent.setup()
    render(<App />)

    const fileName = screen.getByLabelText('File name')
    await user.clear(fileName)
    await user.type(fileName, 'poster.png')

    expect(fileName).toHaveValue('poster.png')
    expect(screen.getByRole('img', { name: 'poster.png' })).toBeInTheDocument()
  })

  it('keeps zoom controls out of the settings view', () => {
    render(<App />)

    expect(screen.queryByLabelText('Zoom percentage')).not.toBeInTheDocument()
    expect(screen.queryByText('Zoom')).not.toBeInTheDocument()
  })

  it('fits the window to the loaded image', () => {
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')
    const image = screen.getByRole('img', { name: 'Sample image' })

    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1200 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 })
    fireEvent.load(image)

    expect(viewer).toHaveStyle({ width: '860px', height: '546px' })
  })

  it('allows manual window sizing below the loaded image size', async () => {
    const user = userEvent.setup()
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')
    const image = screen.getByRole('img', { name: 'Sample image' })

    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1200 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 })
    fireEvent.load(image)

    const height = screen.getByLabelText('Window height')
    await user.clear(height)
    await user.type(height, '300')
    fireEvent.blur(height)

    expect(viewer).toHaveStyle({ height: '300px' })
    expect(height).toHaveValue(300)
  })

  it('resizes the window from its width and height inputs', async () => {
    const user = userEvent.setup()
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')

    const width = screen.getByLabelText('Window width')
    const height = screen.getByLabelText('Window height')
    await user.clear(width)
    await user.type(width, '640')
    await user.clear(height)
    await user.type(height, '480')

    expect(viewer).toHaveStyle({ width: '640px', height: '480px' })
  })

  it('keeps the window menu bar at full size when the window gets narrow', async () => {
    const user = userEvent.setup()
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')

    const width = screen.getByLabelText('Window width')
    await user.clear(width)
    await user.type(width, '380')

    expect(viewer).toHaveStyle({ width: '380px', '--window-ui-scale': '1' })
    expect(viewer.querySelector('.viewer-window')).toHaveStyle({ '--window-ui-scale': '1' })
  })

  it('locks window inputs to one ratio and shrinks the image without squeezing it', async () => {
    const user = userEvent.setup()
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')
    const image = screen.getByRole('img', { name: 'Sample image' })

    await user.click(screen.getByRole('switch', { name: 'Lock window aspect ratio' }))
    const width = screen.getByLabelText('Window width')
    await user.clear(width)
    await user.type(width, '380')

    expect(viewer).toHaveStyle({ width: '380px', height: '305px' })
    expect(screen.getByLabelText('Window height')).toHaveValue(305)
    expect(image).toHaveStyle({ width: '244px', height: '183px' })
  })

  it('keeps an aspect-locked window above its safe minimum size', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('switch', { name: 'Lock window aspect ratio' }))
    const width = screen.getByLabelText('Window width')
    await user.clear(width)
    await user.type(width, '100')

    expect(screen.getByLabelText('Image viewer')).toHaveStyle({ width: '320px', height: '257px' })
  })

  it('changes the image actual width and height without transforms', async () => {
    const user = userEvent.setup()
    render(<App />)
    const image = screen.getByRole('img', { name: 'Sample image' })

    const width = screen.getByLabelText('Image width')
    const height = screen.getByLabelText('Image height')
    await user.clear(width)
    await user.type(width, '320')
    await user.clear(height)
    await user.type(height, '180')

    expect(image).toHaveStyle({ width: '320px', height: '180px' })
    expect(image.style.transform).toBe('')
  })

  it('locks image width and height to the current image ratio', async () => {
    const user = userEvent.setup()
    render(<App />)
    const image = screen.getByRole('img', { name: 'Sample image' })

    await user.click(screen.getByRole('switch', { name: 'Lock image aspect ratio' }))
    const width = screen.getByLabelText('Image width')
    await user.clear(width)
    await user.type(width, '320')

    expect(screen.getByLabelText('Image height')).toHaveValue(240)
    expect(image).toHaveStyle({ width: '320px', height: '240px' })
  })

  it('fits the window to image content and padding only', async () => {
    const user = userEvent.setup()
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')
    const image = screen.getByRole('img', { name: 'Sample image' })

    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 300 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 150 })
    fireEvent.load(image)
    await user.click(screen.getByRole('tab', { name: 'Padding' }))

    expect(screen.queryByLabelText('Window width')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Window height')).not.toBeInTheDocument()
    expect(viewer).toHaveStyle({ width: '348px', height: '290px' })

    const topPadding = screen.getByLabelText('Top padding')
    await user.clear(topPadding)
    await user.type(topPadding, '60')

    expect(viewer).toHaveStyle({ height: '302px' })
    expect(screen.getByLabelText('Image stage')).toHaveStyle({ '--stage-top-padding': '60px' })

    await user.clear(topPadding)
    await user.type(topPadding, '0')
    const sidePadding = screen.getByLabelText('Side padding')
    await user.clear(sidePadding)
    await user.type(sidePadding, '0')
    const bottomPadding = screen.getByLabelText('Bottom padding')
    await user.clear(bottomPadding)
    await user.type(bottomPadding, '0')

    expect(viewer).toHaveStyle({ width: '300px', height: '174px' })
  })

  it('changes padding when the window resize bars are in Padding mode', async () => {
    const user = userEvent.setup()
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')
    const image = screen.getByRole('img', { name: 'Sample image' })

    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 300 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 150 })
    Object.defineProperty(viewer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 348, bottom: 290, width: 348, height: 290 }),
    })
    Object.defineProperty(viewer, 'setPointerCapture', { configurable: true, value: () => undefined })
    Object.defineProperty(viewer, 'releasePointerCapture', { configurable: true, value: () => undefined })
    fireEvent.load(image)
    await user.click(screen.getByRole('tab', { name: 'Padding' }))

    fireEvent.pointerMove(viewer, { clientX: 347, clientY: 145 })
    expect(viewer).toHaveAttribute('data-resize-edge', 'right')

    fireEvent.pointerDown(viewer, { button: 0, pointerId: 1, clientX: 347, clientY: 145 })
    fireEvent.pointerMove(viewer, { pointerId: 1, clientX: 367, clientY: 145 })

    expect(screen.getByLabelText('Side padding')).toHaveValue(44)
    expect(viewer).toHaveStyle({ width: '388px', height: '290px' })
  })

  it('keeps vertical padding linked while resizing in Padding mode', async () => {
    const user = userEvent.setup()
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')
    const image = screen.getByRole('img', { name: 'Sample image' })

    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 300 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 150 })
    Object.defineProperty(viewer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 348, bottom: 270, width: 348, height: 270 }),
    })
    Object.defineProperty(viewer, 'setPointerCapture', { configurable: true, value: () => undefined })
    Object.defineProperty(viewer, 'releasePointerCapture', { configurable: true, value: () => undefined })
    fireEvent.load(image)
    await user.click(screen.getByRole('tab', { name: 'Padding' }))
    await user.click(screen.getByRole('switch', { name: 'Link top and bottom padding' }))

    fireEvent.pointerDown(viewer, { button: 0, pointerId: 1, clientX: 174, clientY: 1 })
    fireEvent.pointerMove(viewer, { pointerId: 1, clientX: 174, clientY: -19 })

    expect(screen.getByLabelText('Top padding')).toHaveValue(68)
    expect(screen.getByLabelText('Bottom padding')).toHaveValue(68)

    fireEvent.pointerUp(viewer, { pointerId: 1, clientX: 174, clientY: -19 })
    fireEvent.pointerDown(viewer, { button: 0, pointerId: 2, clientX: 174, clientY: 269 })
    fireEvent.pointerMove(viewer, { pointerId: 2, clientX: 174, clientY: 289 })

    expect(screen.getByLabelText('Top padding')).toHaveValue(88)
    expect(screen.getByLabelText('Bottom padding')).toHaveValue(88)
  })

  it('reduces stage padding as the window gets shorter', async () => {
    const user = userEvent.setup()
    render(<App />)

    const height = screen.getByLabelText('Window height')
    await user.clear(height)
    await user.type(height, '360')

    expect(screen.getByLabelText('Image stage')).toHaveStyle({
      '--stage-top-padding': '29px',
      '--stage-bottom-padding': '40px',
    })
  })

  it('changes only image width and height from the image resize bars', async () => {
    const user = userEvent.setup()
    render(<App />)
    const image = screen.getByRole('img', { name: 'Sample image' })
    const imageResizeBox = screen.getByLabelText('Resizable image')

    Object.defineProperty(imageResizeBox, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 627, bottom: 470, width: 627, height: 470 }),
    })
    Object.defineProperty(imageResizeBox, 'setPointerCapture', { configurable: true, value: () => undefined })
    Object.defineProperty(imageResizeBox, 'releasePointerCapture', { configurable: true, value: () => undefined })
    await user.click(screen.getByRole('tab', { name: 'Padding' }))

    fireEvent.pointerDown(imageResizeBox, { button: 0, pointerId: 1, clientX: 626, clientY: 235 })
    fireEvent.pointerMove(imageResizeBox, { pointerId: 1, clientX: 666, clientY: 235 })

    expect(image).toHaveStyle({ width: '667px', height: '470px' })
    expect(screen.getByLabelText('Side padding')).toHaveValue(24)
    expect(screen.getByLabelText('Top padding')).toHaveValue(48)
    expect(imageResizeBox).toHaveAttribute('data-resize-edge', 'right')
  })

  it('keeps the image ratio while dragging an image resize bar when locked', async () => {
    const user = userEvent.setup()
    render(<App />)
    const image = screen.getByRole('img', { name: 'Sample image' })
    const imageResizeBox = screen.getByLabelText('Resizable image')

    Object.defineProperty(imageResizeBox, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 627, bottom: 470, width: 627, height: 470 }),
    })
    Object.defineProperty(imageResizeBox, 'setPointerCapture', { configurable: true, value: () => undefined })
    await user.click(screen.getByRole('tab', { name: 'Padding' }))
    await user.click(screen.getByRole('switch', { name: 'Lock image aspect ratio' }))

    fireEvent.pointerDown(imageResizeBox, { button: 0, pointerId: 1, clientX: 626, clientY: 235 })
    fireEvent.pointerMove(imageResizeBox, { pointerId: 1, clientX: 666, clientY: 235 })

    expect(image).toHaveStyle({ width: '667px', height: '500px' })
  })

  it('uses the Figma traffic-light geometry', () => {
    render(<App />)

    const lights = screen.getAllByTestId('traffic-light')
    expect(lights).toHaveLength(3)
    expect(lights.map((light) => light.dataset.tone)).toEqual(['red', 'yellow', 'green'])
  })

  it('keeps controls in a separate sidebar', () => {
    render(<App />)

    const sidebar = screen.getByLabelText('Viewer controls')
    const viewer = screen.getByLabelText('Image viewer')
    expect(within(sidebar).getByRole('button', { name: 'Fit window' })).toBeInTheDocument()
    expect(viewer).not.toContainElement(sidebar)
  })

  it('can float and dock the sidebar without replacing it', async () => {
    const user = userEvent.setup()
    render(<App />)

    const sidebar = screen.getByLabelText('Viewer controls')
    await user.click(within(sidebar).getByRole('button', { name: 'Float sidebar' }))

    expect(sidebar).toHaveClass('is-floating')
    expect(screen.getByLabelText('Viewer layout')).toHaveClass('is-sidebar-floating')
    expect(within(sidebar).getByRole('button', { name: 'Dock sidebar' })).toBeInTheDocument()

    await user.click(within(sidebar).getByRole('button', { name: 'Dock sidebar' }))
    expect(sidebar).not.toHaveClass('is-floating')
  })

  it('keeps the sidebar bar pinned above its content', () => {
    render(<App />)

    const sidebar = screen.getByLabelText('Viewer controls')
    const bar = within(sidebar).getByText('Controls').parentElement

    expect(bar).toHaveClass('sidebar-bar')
    expect(within(sidebar).getByTestId('sidebar-content')).toBeInTheDocument()
  })

  it('lets the user switch to custom padding', async () => {
    const user = userEvent.setup()
    render(<App />)

    const topPadding = screen.getByLabelText('Top padding')
    await user.clear(topPadding)
    await user.type(topPadding, '20')

    expect(screen.getByLabelText('Image stage')).toHaveStyle({ '--stage-top-padding': '20px' })
    expect(within(screen.getByLabelText('Padding presets')).getByRole('tab', { name: 'Custom' })).toHaveAttribute('data-state', 'active')
  })

  it('links top and bottom padding when requested', async () => {
    const user = userEvent.setup()
    render(<App />)

    const link = screen.getByRole('switch', { name: 'Link top and bottom padding' })
    await user.click(link)
    expect(screen.getByLabelText('Top padding')).toHaveValue(48)
    expect(screen.getByLabelText('Bottom padding')).toHaveValue(48)

    const topPadding = screen.getByLabelText('Top padding')
    await user.clear(topPadding)
    await user.type(topPadding, '20')

    expect(screen.getByLabelText('Bottom padding')).toHaveValue(20)
  })

  it('uses Fluid tabs for padding presets', () => {
    render(<App />)
    const paddingControls = screen.getByLabelText('Padding presets')

    expect(within(paddingControls).getByRole('tab', { name: 'small' })).toBeInTheDocument()
    expect(within(paddingControls).getByRole('tab', { name: 'medium' })).toBeInTheDocument()
    expect(within(paddingControls).getByRole('tab', { name: 'large' })).toHaveAttribute('data-state', 'active')
    expect(within(paddingControls).getByRole('tab', { name: 'Custom' })).toBeInTheDocument()
  })

  it('shows export options in their own sidebar tab', async () => {
    const user = userEvent.setup()
    render(<App />)
    const sidebar = screen.getByLabelText('Viewer controls')
    expect(within(sidebar).getByTestId('sidebar-content')).toBeInTheDocument()
    expect(within(sidebar).getByRole('tab', { name: 'Settings' })).toHaveAttribute('data-state', 'active')
    expect(within(sidebar).queryByLabelText('Export format')).not.toBeInTheDocument()
    expect(screen.queryByTestId('export-preview-menu-bar')).not.toBeInTheDocument()

    await user.click(within(sidebar).getByRole('tab', { name: 'Export' }))
    const exportControls = within(sidebar).getByLabelText('Export size presets')

    expect(screen.getByLabelText('Export preview')).toBeInTheDocument()
    expect(screen.queryByLabelText('Image viewer')).not.toBeInTheDocument()
    expect(within(sidebar).getByRole('combobox', { name: 'Export format' })).toHaveClass('export-select-trigger')
    expect(within(exportControls).getByRole('tab', { name: 'Original' })).toHaveAttribute('data-state', 'active')
    expect(within(exportControls).getByRole('tab', { name: 'Large' })).toHaveAttribute('title', 'Large · 2048 px')
    expect(within(exportControls).getByRole('tab', { name: 'Medium' })).toHaveAttribute('title', 'Medium · 1280 px')
    expect(within(exportControls).getByRole('tab', { name: 'Small' })).toHaveAttribute('title', 'Small · 720 px')
    expect(within(exportControls).getByRole('tab', { name: 'Custom' })).toBeInTheDocument()
    expect(within(sidebar).getByRole('button', { name: 'Export image' })).toBeInTheDocument()
  })

  it('uses the same macOS window component in settings and export', async () => {
    const user = userEvent.setup()
    render(<App />)

    const settingsWindow = screen.getByLabelText('Image viewer').querySelector('.viewer-window') as HTMLElement
    const settingsLights = [...settingsWindow.querySelectorAll('.traffic-light')].map((light) => light.className)

    await user.click(screen.getByRole('tab', { name: 'Export' }))
    const exportPreview = screen.getByLabelText('Export preview')
    const exportFrame = within(exportPreview).getByTestId('export-window-frame')
    const exportWindow = exportFrame.querySelector('.viewer-window') as HTMLElement

    expect(exportWindow.className).toBe(settingsWindow.className)
    expect([...exportWindow.querySelectorAll('.traffic-light')].map((light) => light.className)).toEqual(settingsLights)
    expect(exportWindow.className).toContain('viewer-window')
    const previewMenuBar = within(exportPreview).getByTestId('export-preview-menu-bar')
    expect(previewMenuBar).toHaveTextContent('Image previewer')
    expect(previewMenuBar).toHaveClass('sidebar-bar')
    expect(previewMenuBar).toHaveClass('export-preview-menu-bar')
    expect(previewMenuBar.querySelector('.window-title')).not.toBeInTheDocument()
    expect(within(exportFrame).getByText('steve-jobs.png')).toBeInTheDocument()
  })

  it('shows zoom controls only in the export preview', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByLabelText('Zoom percentage')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Export' }))

    const exportFrame = screen.getByTestId('export-window-frame')
    const zoom = screen.getByLabelText('Zoom percentage')
    expect(zoom).toHaveValue(100)
    fireEvent.change(zoom, { target: { value: '150' } })

    expect(exportFrame).toHaveAttribute('data-preview-zoom', '150')
    expect(Number(exportFrame.getAttribute('data-render-scale'))).toBeGreaterThan(1)
    expect(screen.getByLabelText('Export preview background')).toBeInTheDocument()
  })

  it('contains the image inside the window stage', () => {
    render(<App />)

    const image = screen.getByRole('img', { name: 'Sample image' })
    const stage = screen.getByLabelText('Image stage')

    expect(image).toHaveStyle({ objectFit: 'fill' })
    expect(stage).toHaveStyle({ overflow: 'hidden' })
  })

  it('updates export dimensions for presets and custom sizes', async () => {
    const user = userEvent.setup()
    render(<App />)
    const image = screen.getByRole('img', { name: 'Sample image' })

    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 4000 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 2000 })
    fireEvent.load(image)

    await user.click(screen.getByRole('tab', { name: 'Export' }))
    const exportControls = screen.getByLabelText('Export size presets')
    const exportWindow = screen.getByTestId('export-window-frame')
    await user.click(within(exportControls).getByRole('tab', { name: 'Large' }))
    expect(screen.getByLabelText('Export width')).toHaveValue(2048)
    expect(screen.getByLabelText('Export height')).toHaveValue(1300)
    expect(exportWindow).toHaveStyle({ width: '2048px', height: '1300px' })
    expect(exportWindow).toHaveAttribute('data-export-width', '2048')
    expect(exportWindow).toHaveAttribute('data-export-height', '1300')
    expect(Number(exportWindow.getAttribute('data-render-scale'))).toBeLessThan(1)
    expect(screen.getByLabelText('Export preview')).not.toHaveStyle({ width: '2096px', height: '1164px' })

    await user.click(within(exportControls).getByRole('tab', { name: 'Medium' }))
    expect(screen.getByLabelText('Export width')).toHaveValue(1280)
    expect(screen.getByLabelText('Export height')).toHaveValue(813)
    expect(exportWindow).toHaveAttribute('data-export-width', '1280')
    expect(exportWindow).toHaveAttribute('data-export-height', '813')
    expect(exportWindow).toHaveStyle({ width: '1280px', height: '813px' })

    const width = screen.getByLabelText('Export width')
    await user.clear(width)
    await user.type(width, '100')
    const height = screen.getByLabelText('Export height')
    expect(within(exportControls).getByRole('tab', { name: 'Custom' })).toHaveAttribute('data-state', 'active')
    expect(width).toHaveValue(100)
    expect(height).toHaveValue(813)
    expect(exportWindow).toHaveAttribute('data-export-width', '100')
    expect(exportWindow).toHaveAttribute('data-export-height', '813')
  })

  it('drags the export preview only from its menu bar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: 'Export' }))
    const exportPreview = screen.getByLabelText('Export preview')
    const menuBar = screen.getByTestId('export-preview-menu-bar')
    Object.defineProperty(menuBar, 'setPointerCapture', { configurable: true, value: () => undefined })
    Object.defineProperty(menuBar, 'releasePointerCapture', { configurable: true, value: () => undefined })

    fireEvent.pointerDown(exportPreview, { button: 0, pointerId: 1, clientX: 120, clientY: 100 })
    fireEvent.pointerMove(exportPreview, { pointerId: 1, clientX: 165, clientY: 130 })
    expect(exportPreview).toHaveStyle({ transform: 'translate(0px, 0px)' })

    fireEvent.pointerDown(menuBar, { button: 0, pointerId: 2, clientX: 120, clientY: 100 })
    fireEvent.pointerMove(menuBar, { pointerId: 2, clientX: 165, clientY: 130 })

    expect(exportPreview).toHaveClass('is-window-dragging')
    expect(exportPreview).toHaveStyle({ transform: 'translate(45px, 30px)' })
    fireEvent.pointerUp(menuBar, { pointerId: 2, clientX: 165, clientY: 130 })
    expect(exportPreview).not.toHaveClass('is-window-dragging')

    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(screen.getByLabelText('Image viewer')).toBeInTheDocument()
    expect(screen.queryByLabelText('Export preview')).not.toBeInTheDocument()
  })

  it('drags the settings window and controls only from their menu bars', () => {
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')
    const viewerPosition = viewer.parentElement as HTMLElement
    const viewerBar = viewer.querySelector('.window-bar') as HTMLElement
    const stage = screen.getByLabelText('Image stage')
    const sidebar = screen.getByLabelText('Viewer controls')
    const sidebarBar = within(sidebar).getByText('Controls').parentElement as HTMLElement

    Object.defineProperty(viewer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 760, bottom: 610, width: 760, height: 610 }),
    })
    Object.defineProperty(viewerBar, 'setPointerCapture', { configurable: true, value: () => undefined })
    Object.defineProperty(sidebarBar, 'setPointerCapture', { configurable: true, value: () => undefined })

    fireEvent.pointerDown(stage, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 130, clientY: 120 })
    expect(viewerPosition).toHaveStyle({ transform: 'translate(0px, 0px)' })

    fireEvent.pointerDown(viewerBar, { button: 0, pointerId: 2, clientX: 100, clientY: 12 })
    fireEvent.pointerMove(viewerBar, { pointerId: 2, clientX: 130, clientY: 32 })
    expect(viewerPosition).toHaveStyle({ transform: 'translate(30px, 20px)' })

    fireEvent.pointerDown(sidebar, { button: 0, pointerId: 3, clientX: 900, clientY: 100 })
    fireEvent.pointerMove(sidebar, { pointerId: 3, clientX: 940, clientY: 125 })
    expect(sidebar).toHaveStyle({ transform: 'translate(0px, 0px)' })

    fireEvent.pointerDown(sidebarBar, { button: 0, pointerId: 4, clientX: 900, clientY: 20 })
    fireEvent.pointerMove(sidebarBar, { pointerId: 4, clientX: 940, clientY: 45 })
    expect(sidebar).toHaveStyle({ transform: 'translate(40px, 25px)' })
  })

  it('uses compact action buttons that match the tab type scale', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Open image' })).toHaveClass('control-button-compact')
  })

  it('changes the window shadow with presets and opacity', async () => {
    const user = userEvent.setup()
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')
    const shadowControls = screen.getByLabelText('Shadow presets')

    await user.click(within(shadowControls).getByRole('tab', { name: 'Big' }))
    expect(viewer).toHaveStyle({ '--window-shadow': '0 18px 50px rgba(0, 0, 0, 0.55)' })

    const opacity = screen.getByLabelText('Shadow opacity')
    await user.clear(opacity)
    await user.type(opacity, '0.3')
    expect(viewer).toHaveAttribute('data-shadow-preset', 'custom')

    const slider = screen.getByLabelText('Shadow opacity slider')
    await user.click(slider)
    fireEvent.change(slider, { target: { value: '0.2' } })
    expect(slider).toHaveValue('0.2')
    expect(viewer).toHaveStyle({ '--window-shadow': '0 18px 50px rgba(0, 0, 0, 0.2)' })
  })

  it('resizes on a corner and shows the blue resize state', () => {
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')

    Object.defineProperty(viewer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 760, bottom: 610, width: 760, height: 610 }),
    })
    Object.defineProperty(viewer, 'setPointerCapture', { configurable: true, value: () => undefined })
    Object.defineProperty(viewer, 'releasePointerCapture', { configurable: true, value: () => undefined })

    fireEvent.pointerMove(viewer, { clientX: 2, clientY: 2 })
    expect(viewer).toHaveAttribute('data-resize-edge', 'top-left')
    expect(viewer).toHaveClass('is-resize-ready')

    fireEvent.pointerDown(viewer, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    fireEvent.pointerMove(viewer, { pointerId: 1, clientX: -18, clientY: -28 })

    expect(viewer).toHaveClass('is-resizing')
    expect(viewer).toHaveStyle({ width: '780px', height: '640px' })
  })

  it('uses Size mode for window resize bars without changing padding', () => {
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')

    expect(screen.getByRole('tab', { name: 'Size' })).toHaveAttribute('data-state', 'active')
    Object.defineProperty(viewer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 760, bottom: 610, width: 760, height: 610 }),
    })
    Object.defineProperty(viewer, 'setPointerCapture', { configurable: true, value: () => undefined })

    fireEvent.pointerDown(viewer, { button: 0, pointerId: 1, clientX: 759, clientY: 305 })
    fireEvent.pointerMove(viewer, { pointerId: 1, clientX: 799, clientY: 305 })

    expect(viewer).toHaveStyle({ width: '800px', height: '610px' })
    expect(screen.getByLabelText('Side padding')).toHaveValue(24)
  })

  it('keeps the window ratio while dragging a size bar when locked', async () => {
    const user = userEvent.setup()
    render(<App />)
    const viewer = screen.getByLabelText('Image viewer')

    await user.click(screen.getByRole('switch', { name: 'Lock window aspect ratio' }))
    Object.defineProperty(viewer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 760, bottom: 610, width: 760, height: 610 }),
    })
    Object.defineProperty(viewer, 'setPointerCapture', { configurable: true, value: () => undefined })

    fireEvent.pointerDown(viewer, { button: 0, pointerId: 1, clientX: 759, clientY: 305 })
    fireEvent.pointerMove(viewer, { pointerId: 1, clientX: 799, clientY: 305 })

    expect(viewer).toHaveStyle({ width: '800px', height: '642px' })
  })
})
