import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react'
import { Canvas, Rect, Text, Shadow } from 'fabric'
import { motion } from 'framer-motion'
import { ImagePlus, Loader2, RefreshCw, Film } from 'lucide-react'
import { useStore } from '../store/useStore'
import {
  loadImageFile,
  loadVideoFile,
  loadTestVideo,
  getDisplaySize,
  renderOriginal,
  applyBrightness,
} from '../utils/image'

const TIME_TOLERANCE = 0.5

function formatTime(sec) {
  if (sec == null || Number.isNaN(sec)) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const MainCanvas = forwardRef(function MainCanvas(_props, ref) {
  const media = useStore((s) => s.media)
  const setMedia = useStore((s) => s.setMedia)
  const setTool = useStore((s) => s.setTool)
  const annotations = useStore((s) => s.annotations)
  const activeAnnotationId = useStore((s) => s.activeAnnotationId)
  const addAnnotation = useStore((s) => s.addAnnotation)
  const brightness = useStore((s) => s.brightness)
  const isDetecting = useStore((s) => s.isDetecting)
  const cvError = useStore((s) => s.cvError)
  const runCVDetection = useStore((s) => s.runCVDetection)
  const cvTriggerPending = useStore((s) => s.cvTriggerPending)
  const consumeCvTrigger = useStore((s) => s.consumeCvTrigger)
  const pendingSeek = useStore((s) => s.pendingSeek)
  const consumePendingSeek = useStore((s) => s.consumePendingSeek)
  const hoveredAnnotationId = useStore((s) => s.hoveredAnnotationId)

  const pixelCanvasRef = useRef(null)
  const videoRef = useRef(null)
  const fabricCanvasRef = useRef(null)
  const fabricRef = useRef(null)
  const containerRef = useRef(null)
  const fileInputRef = useRef(null)
  const originalDataRef = useRef(null)
  const prevAnnotationCountRef = useRef(0)

  const [canvasReady, setCanvasReady] = useState(false)
  const [pending, setPending] = useState(null)
  const [draftText, setDraftText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const [videoTime, setVideoTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  // 视频实际渲染矩形 { w, h, left, top } — 以浏览器 getBoundingClientRect 为准
  const [renderRect, setRenderRect] = useState(null)

  const isVideo = media?.type === 'video'

  // 统一：图片和视频都用原始分辨率做 Fabric 初始化兜底
  const size = useMemo(
    () =>
      media
        ? { width: media.width, height: media.height }
        : null,
    [media],
  )

  /* ================= PDF 快照 ================= */
  useImperativeHandle(ref, () => ({
    getSnapshot() {
      const video = videoRef.current

      // 视频模式：先暂停抓稳定帧（pause 事件随后会把批注层恢复可见）
      if (isVideo && video && !video.paused) video.pause()

      const fabricCanvas = fabricRef.current
      if (fabricCanvas) {
        // 播放中批注被隐藏，导出前强制可见并同步重绘
        fabricCanvas.getObjects().forEach((o) => {
          o.visible = true
        })
        fabricCanvas.renderAll()
      }

      const rr = renderRect
      const source = isVideo ? video : pixelCanvasRef.current
      if (!source || !rr) return null

      // 按 renderRect 尺寸截图（即 object-contain 实际显示的画面，天然是缩略图）
      const output = document.createElement('canvas')
      output.width = rr.w
      output.height = rr.h
      const ctx = output.getContext('2d')
      ctx.drawImage(source, 0, 0, output.width, output.height)

      // 叠上 Fabric 批注层
      const lowerLayer =
        fabricCanvas?.lowerCanvasEl || fabricCanvas?.elements?.lower?.el
      if (lowerLayer) {
        ctx.drawImage(lowerLayer, 0, 0, output.width, output.height)
      }

      return output.toDataURL('image/jpeg', 0.95)
    },
  }))

  /* ================= 上传 ================= */
  const handleFile = async (file) => {
    try {
      let data
      if (file.type.startsWith('video/')) {
        data = await loadVideoFile(file)
      } else {
        data = await loadImageFile(file)
        data.type = 'image'
      }
      if (media?.url?.startsWith('blob:')) URL.revokeObjectURL(media.url)
      setMedia(data)
      setTool('rect')
      setError('')
      setVideoTime(0)
      setRenderRect(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleTestVideo = async () => {
    try {
      setError('')
      const data = await loadTestVideo()
      setMedia(data)
      setTool('rect')
      setVideoTime(0)
      setRenderRect(null)
    } catch (err) {
      setError(err.message)
    }
  }

  /* ================= 图片：像素层渲染 + 亮度 ================= */
  // renderRect 变化（resize）时需要重新 drawImage 到新尺寸的 canvas
  useEffect(() => {
    if (isVideo || !media || !pixelCanvasRef.current) return

    const canvas = pixelCanvasRef.current
    const targetW = renderRect?.w ?? media.width
    const targetH = renderRect?.h ?? media.height

    if (targetW < 4 || targetH < 4) return

    const img = new Image()
    img.onload = () => {
      originalDataRef.current = renderOriginal(img, canvas, targetW, targetH)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      applyBrightness(ctx, originalDataRef.current, useStore.getState().brightness)
    }
    img.src = media.url
    return () => {
      img.onload = null
    }
  }, [media, isVideo, renderRect])

  useEffect(() => {
    if (isVideo) return
    const canvas = pixelCanvasRef.current
    if (!canvas || !originalDataRef.current) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    applyBrightness(ctx, originalDataRef.current, brightness)
  }, [brightness, media, isVideo])

  /* ================= 图片 / 视频：通用 object-contain 显示矩形 ================= */
  // 图片和视频都用同一套逻辑：根据容器尺寸 + 媒体原始宽高比
  // 算出 object-contain 后的实际显示矩形 { w, h, left, top }
  const syncDisplayRect = useCallback(() => {
    const container = containerRef.current
    if (!container || !media) return

    const cw = container.clientWidth
    const ch = container.clientHeight
    const mw = media.width
    const mh = media.height

    if (cw < 4 || ch < 4 || mw === 0 || mh === 0) return

    const mediaAspect = mw / mh
    const containerAspect = cw / ch

    let w, h
    if (mediaAspect > containerAspect) {
      w = cw
      h = cw / mediaAspect
    } else {
      h = ch
      w = ch * mediaAspect
    }

    const left = Math.round((cw - w) / 2)
    const top = Math.round((ch - h) / 2)
    w = Math.round(w)
    h = Math.round(h)

    if (w < 4 || h < 4) return

    setRenderRect((prev) =>
      prev && prev.w === w && prev.h === h && prev.left === left && prev.top === top
        ? prev
        : { w, h, left, top },
    )
  }, [media])

  // ResizeObserver + 视频事件（图片只需 ResizeObserver）
  useEffect(() => {
    const container = containerRef.current
    if (!container || !media) return

    syncDisplayRect()

    const ro = new ResizeObserver(syncDisplayRect)
    ro.observe(container)

    const video = videoRef.current
    if (isVideo && video) {
      const onMeta = () => syncDisplayRect()
      video.addEventListener('loadedmetadata', onMeta)
      video.addEventListener('loadeddata', onMeta)
      video.addEventListener('resize', onMeta)
      return () => {
        ro.disconnect()
        video.removeEventListener('loadedmetadata', onMeta)
        video.removeEventListener('loadeddata', onMeta)
        video.removeEventListener('resize', onMeta)
      }
    }

    return () => ro.disconnect()
  }, [media, isVideo, syncDisplayRect])

  /* ================= CV 识别：截帧 + 监听触发 ================= */

  /**
   * 截取当前画面 → 返回 { base64, width, height }
   * - 图片模式：直接拿 pixelCanvas.toDataURL（已经是 renderRect 尺寸）
   * - 视频模式：drawImage 到临时 canvas 再 toDataURL
   */
  const captureFrame = useCallback(() => {
    if (!media) return null
    const rr = renderRect
    if (!rr) return null

    // 统一用 renderRect 尺寸的临时 canvas（和百度识别的坐标基准对齐）
    const w = rr.w
    const h = rr.h
    if (w < 4 || h < 4) return null

    const tmp = document.createElement('canvas')
    tmp.width = w
    tmp.height = h
    const ctx = tmp.getContext('2d')
    if (!ctx) return null

    if (isVideo) {
      const video = videoRef.current
      if (!video) return null
      // 视频暂停才能抓稳定帧（播放中也能抓，但可能半帧）
      ctx.drawImage(video, 0, 0, w, h)
    } else {
      const pc = pixelCanvasRef.current
      if (!pc) return null
      ctx.drawImage(pc, 0, 0, w, h)
    }

    const dataUrl = tmp.toDataURL('image/jpeg', 0.85)
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')

    return { base64, width: w, height: h }
  }, [media, renderRect, isVideo])

  // Toolbar 点「自动识别」→ 这个 effect 触发
  useEffect(() => {
    if (!cvTriggerPending) return
    consumeCvTrigger()

    if (!media) return

    // 视频模式强制暂停再抓帧
    if (isVideo) {
      const video = videoRef.current
      if (video && !video.paused) video.pause()
      window.__CV_CURRENT_TIMESTAMP__ = videoRef.current?.currentTime ?? 0
    } else {
      window.__CV_CURRENT_TIMESTAMP__ = 0
    }

    const frame = captureFrame()
    if (!frame) return

    runCVDetection(frame)
  }, [cvTriggerPending, consumeCvTrigger, media, isVideo, captureFrame, runCVDetection])

  /* ================= Fabric 画布初始化 ================= */
  const fabricSize = useMemo(() => {
    if (!size) return null
    // 图片和视频都优先用 renderRect（object-contain 后的实际显示尺寸）
    return renderRect
      ? { width: renderRect.w, height: renderRect.h }
      : { width: size.width, height: size.height }
  }, [size, renderRect])

  useEffect(() => {
    if (!fabricSize || !fabricCanvasRef.current) return

    const canvas = new Canvas(fabricCanvasRef.current, {
      width: fabricSize.width,
      height: fabricSize.height,
      selection: false,
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
    })

    fabricRef.current = canvas
    setCanvasReady(true)

    return () => {
      fabricRef.current = null
      setCanvasReady(false)
      canvas.dispose()
    }
  }, [fabricSize])

  /* ================= 视频事件：play/pause/timeupdate + pendingSeek ================= */
  useEffect(() => {
    const video = videoRef.current
    if (!isVideo || !video) return

    const onPlay = () => {
      setIsPlaying(true)
      // 播放时 Fabric canvas 让事件穿透到视频控制条
      const el = fabricCanvasRef.current
      if (el) el.style.pointerEvents = 'none'
      const canvas = fabricRef.current
      if (canvas) {
        canvas.defaultCursor = 'default'
        canvas.hoverCursor = 'default'
        canvas.getObjects().forEach((o) => {
          o.evented = false
          o.visible = false
        })
        canvas.discardActiveObject()
        canvas.requestRenderAll()
      }
    }
    const onPause = () => {
      setIsPlaying(false)
      const el = fabricCanvasRef.current
      if (el) el.style.pointerEvents = 'auto'
      const canvas = fabricRef.current
      if (canvas) {
        canvas.defaultCursor = 'crosshair'
        canvas.getObjects().forEach((o) => {
          o.evented = true
          o.visible = true
        })
        canvas.requestRenderAll()
      }
    }
    const onTime = () => setVideoTime(video.currentTime)

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTime)

    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTime)
    }
  }, [isVideo, media])

  // 点击批注 → 视频跳转并暂停（让 Fabric 恢复交互）
  useEffect(() => {
    if (!isVideo || pendingSeek == null) return
    const video = videoRef.current
    if (!video) return
    video.currentTime = pendingSeek
    video.pause()
    setVideoTime(pendingSeek)
    consumePendingSeek()
  }, [isVideo, pendingSeek, consumePendingSeek])

  /* ================= 画框交互 ================= */
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvasReady || !canvas || !fabricSize) return

    let isDrawing = false
    let startPoint = null
    let tempRect = null

    const onMouseDown = (opt) => {
      if (isVideo && videoRef.current && !videoRef.current.paused) return

      const currentTool = useStore.getState().tool
      if (currentTool !== 'rect') {
        if (opt.target?.annotationId) {
          useStore.getState().jumpToAnnotation(opt.target.annotationId)
        }
        return
      }

      isDrawing = true
      startPoint = canvas.getScenePoint(opt.e)
      tempRect = new Rect({
        left: startPoint.x,
        top: startPoint.y,
        width: 0,
        height: 0,
        fill: 'rgba(239, 68, 68, 0.08)',
        stroke: '#ef4444',
        strokeWidth: 2,
        strokeUniform: true,
        selectable: false,
        evented: false,
        objectCaching: false,
      })
      canvas.add(tempRect)
    }

    const onMouseMove = (opt) => {
      if (!isDrawing || !tempRect || !startPoint) return
      const point = canvas.getScenePoint(opt.e)
      tempRect.set({
        left: Math.min(startPoint.x, point.x),
        top: Math.min(startPoint.y, point.y),
        width: Math.abs(point.x - startPoint.x),
        height: Math.abs(point.y - startPoint.y),
      })
      canvas.requestRenderAll()
    }

    const onMouseUp = () => {
      if (!isDrawing) return
      isDrawing = false

      const rect = tempRect
      tempRect = null
      startPoint = null
      if (!rect) return

      const box = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      }
      canvas.remove(rect)
      canvas.requestRenderAll()

      if (box.width < 10 || box.height < 10) return

      setPending(box)
      setDraftText('')
    }

    canvas.on('mouse:down', onMouseDown)
    canvas.on('mouse:move', onMouseMove)
    canvas.on('mouse:up', onMouseUp)

    return () => {
      canvas.off('mouse:down', onMouseDown)
      canvas.off('mouse:move', onMouseMove)
      canvas.off('mouse:up', onMouseUp)
    }
  }, [canvasReady, fabricSize, isVideo])

  /* ================= 批注同步到画布 ================= */
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvasReady || !canvas || !fabricSize) return

    // 检测是否有新增批注（用于弹出缩放动画）
    const justAdded = annotations.length > prevAnnotationCountRef.current
    prevAnnotationCountRef.current = annotations.length
    // 新增批次的目标 id：只给这一条做动画，避免误伤其他可见批注
    const newestId = annotations[annotations.length - 1]?.id

    // 清除旧批注
    canvas
      .getObjects()
      .filter((obj) => obj.annotationId)
      .forEach((obj) => canvas.remove(obj))

    const currentTime = isVideo ? videoTime : 0
    const visible = isVideo
      ? annotations.filter(
          (a) => Math.abs((a.timestamp ?? 0) - currentTime) < TIME_TOLERANCE,
        )
      : annotations

    // 密集文字降噪：严重重叠的 OCR 框只画绿框、不画序号
    // 判定条件：相交面积占较小框面积 > 65%，或中心点归一化距离 < 2.5%
    const hiddenLabelIds = new Set()
    const cvItems = visible.filter((a) => a.type === 'cv')
    for (let i = 0; i < cvItems.length; i++) {
      for (let j = i + 1; j < cvItems.length; j++) {
        const a = cvItems[i]
        const b = cvItems[j]
        const dist = Math.hypot(
          a.x + a.width / 2 - (b.x + b.width / 2),
          a.y + a.height / 2 - (b.y + b.height / 2),
        )
        const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
        const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
        const minArea = Math.min(a.width * a.height, b.width * b.height)
        const overlapRatio = minArea > 0 ? (ix * iy) / minArea : 0
        if (overlapRatio > 0.65 || dist < 0.025) {
          // 保留靠前（先出现）那条的序号，隐藏后者
          hiddenLabelIds.add(b.id)
        }
      }
    }

    visible.forEach((item) => {
      const isCv = item.type === 'cv'
      const isActive = item.id === activeAnnotationId
      // 列表序号（1 起），与右侧批注列表徽标保持一致
      const listIndex = annotations.findIndex((a) => a.id === item.id) + 1

      const boxLeft = item.x * fabricSize.width
      const boxTop = item.y * fabricSize.height
      const boxWidth = item.width * fabricSize.width
      const boxHeight = item.height * fabricSize.height
      const showOnVideo = !isVideo || !isPlaying

      const rect = new Rect({
        left: boxLeft,
        top: boxTop,
        width: boxWidth,
        height: boxHeight,
        fill: isCv ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
        stroke: isCv ? '#22c55e' : '#ef4444',
        strokeWidth: isActive ? 3 : 2,
        strokeDashArray: isCv ? [6, 4] : null,
        strokeUniform: true,
        selectable: false,
        evented: showOnVideo,
        visible: showOnVideo,
        hasControls: false,
        hasBorders: false,
        hoverCursor: 'pointer',
        objectCaching: false,
      })
      rect.annotationId = item.id

      // 左上角序号标签（与右侧列表徽标一一对应）
      // 严重重叠的框跳过标签绘制，避免序号叠在一起
      const showLabel = !hiddenLabelIds.has(item.id)
      const label = showLabel
        ? new Text(String(listIndex), {
            fontSize: 12,
            fontWeight: 'bold',
            fontFamily: 'Inter, Arial, sans-serif',
            fill: '#ffffff',
            backgroundColor: isCv ? '#16a34a' : '#dc2626',
            padding: 3,
            left: boxLeft,
            // 框贴近顶部时改为框内显示，避免标签被裁掉
            top: boxTop < 20 ? boxTop + 2 : boxTop - 20,
            selectable: false,
            evented: false,
            visible: showOnVideo,
            objectCaching: false,
          })
        : null
      if (label) {
        label.annotationId = item.id
        label.isLabel = true
      }

      // 弹出缩放动画：仅给刚新增的那条批注
      if (justAdded && item.id === newestId) {
        rect.set({ scaleX: 0.2, scaleY: 0.2 })
        canvas.add(rect)
        if (label) canvas.add(label)
        canvas.requestRenderAll()

        // rAF 缓动到 scale 1
        const animate = () => {
          rect.scaleX += (1 - rect.scaleX) * 0.3
          rect.scaleY += (1 - rect.scaleY) * 0.3
          rect.setCoords()
          canvas.requestRenderAll()
          if (Math.abs(rect.scaleX - 1) > 0.008) {
            requestAnimationFrame(animate)
          } else {
            rect.set({ scaleX: 1, scaleY: 1 })
            canvas.requestRenderAll()
          }
        }
        requestAnimationFrame(animate)
      } else {
        canvas.add(rect)
        if (label) canvas.add(label)
      }
    })

    canvas.requestRenderAll()
  }, [annotations, activeAnnotationId, canvasReady, fabricSize, isVideo, videoTime, isPlaying])

  /* ================= Hover 联动：列表悬停 → 画布框高亮 ================= */
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvasReady || !canvas) return

    canvas.getObjects().forEach((obj) => {
      if (!obj.annotationId || obj.isLabel) return

      const isHovered = obj.annotationId === hoveredAnnotationId
      const isCv = obj.fill === 'rgba(34, 197, 94, 0.08)'

      obj.set({
        stroke: isHovered
          ? isCv
            ? '#4ade80'
            : '#ff6b6b'
          : isCv
            ? '#22c55e'
            : '#ef4444',
        strokeWidth: isHovered ? 4 : obj.annotationId === activeAnnotationId ? 3 : 2,
        shadow: isHovered
          ? new Shadow({
              color: isCv ? 'rgba(74, 222, 128, 0.9)' : 'rgba(255, 107, 107, 0.9)',
              blur: 18,
              offsetX: 0,
              offsetY: 0,
            })
          : null,
      })
      obj.setCoords()
    })

    canvas.requestRenderAll()
  }, [hoveredAnnotationId, activeAnnotationId, annotations, canvasReady])

  /* ================= 提交批注 ================= */

  /**
   * 视频批注快照：离屏 Canvas 分层合成「带红框的完整画面」
   * ① 视频当前帧 → ② Fabric 批注层整体覆盖（已有批注框）→ ③ 本次新画的红框
   * 原始分辨率按最大宽 800px 等比缩放，防止 Base64 过大拖慢 PDF
   * 图片模式不需要——原图本身就是快照
   */
  const captureVideoSnapshot = (box) => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return null

    const MAX_WIDTH = 800
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth)

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)

    const ctx = canvas.getContext('2d')

    // ① 视频当前帧
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // ② Fabric 批注层（toCanvasElement 同步导出，避免异步 Image 加载）
    const fabricCanvas = fabricRef.current
    if (fabricCanvas) {
      fabricCanvas.getObjects().forEach((o) => {
        o.visible = true
      })
      fabricCanvas.renderAll()
      const fabricEl = fabricCanvas.toCanvasElement(1)
      ctx.drawImage(fabricEl, 0, 0, canvas.width, canvas.height)
    }

    // ③ 本次正在确认的新红框（pending 是 renderRect 像素坐标，需换算到截图坐标系）
    if (box && renderRect && renderRect.w > 0 && renderRect.h > 0) {
      const sx = canvas.width / renderRect.w
      const sy = canvas.height / renderRect.h
      ctx.fillStyle = 'rgba(239, 68, 68, 0.08)'
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = Math.max(2, 2 * sx)
      ctx.fillRect(box.x * sx, box.y * sy, box.width * sx, box.height * sy)
      ctx.strokeRect(box.x * sx, box.y * sy, box.width * sx, box.height * sy)
    }

    return canvas.toDataURL('image/jpeg', 0.8)
  }

  const confirmPending = () => {
    if (!pending || !fabricSize) return

    const timestamp = isVideo && videoRef.current ? videoRef.current.currentTime : 0

    addAnnotation({
      x: pending.x / fabricSize.width,
      y: pending.y / fabricSize.height,
      width: pending.width / fabricSize.width,
      height: pending.height / fabricSize.height,
      text: draftText.trim() || '未填写评审意见',
      timestamp,
      snapshot: isVideo ? captureVideoSnapshot(pending) : null,
    })

    setPending(null)
    setDraftText('')
  }

  const cancelPending = () => {
    setPending(null)
    setDraftText('')
  }

  /* ================= 渲染 ================= */
  const videoFilterStyle =
    isVideo && brightness !== 0
      ? { filter: `brightness(${1 + brightness / 200})` }
      : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />

      <div
        className="relative flex-1 overflow-auto bg-night-950"
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(true)
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) handleFile(file)
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: '#0d0d10',
          }}
        />

        <div className="relative flex h-full items-center justify-center p-6">
          {media && fabricSize ? (
            /* ---------- 画布容器 ---------- */
            <div
              ref={containerRef}
              className={`relative w-full h-full overflow-hidden rounded-xl border shadow-panel transition-colors ${
                isDragging ? 'border-violet-500/60' : 'border-night-700'
              }`}
            >
              {isVideo ? (
                /* ---------- 视频：HTML5 video object-contain ---------- */
                <>
                  <video
                    ref={videoRef}
                    src={media.url}
                    className="absolute inset-0 h-full w-full object-contain"
                    style={videoFilterStyle}
                    controls
                    playsInline
                    preload="metadata"
                  />
                  <div
                    className="absolute z-10"
                    style={{
                      left: renderRect?.left ?? 0,
                      top: renderRect?.top ?? 0,
                      width: renderRect?.w ?? 0,
                      height: renderRect?.h ?? 0,
                    }}
                  >
                    <canvas ref={fabricCanvasRef} />
                  </div>
                </>
              ) : (
                /* ---------- 图片：pixelCanvas + Fabric，都用 renderRect 定位 ---------- */
                <>
                  <canvas
                    ref={pixelCanvasRef}
                    className="absolute"
                    style={{
                      left: renderRect?.left ?? 0,
                      top: renderRect?.top ?? 0,
                      width: renderRect?.w ?? 0,
                      height: renderRect?.h ?? 0,
                    }}
                  />
                  <div
                    className="absolute z-10"
                    style={{
                      left: renderRect?.left ?? 0,
                      top: renderRect?.top ?? 0,
                      width: renderRect?.w ?? 0,
                      height: renderRect?.h ?? 0,
                    }}
                  >
                    <canvas ref={fabricCanvasRef} />
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-lg border border-night-600/60 bg-night-900/80 px-2.5 py-1.5 text-[11px] text-zinc-300 backdrop-blur transition-colors hover:border-violet-500/40 hover:text-zinc-100"
              >
                <RefreshCw className="h-3 w-3" />
                换一个
              </button>

              {isVideo && (
                <div className="absolute left-3 top-3 z-20 rounded-lg border border-night-600/60 bg-night-900/80 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 backdrop-blur">
                  {formatTime(videoTime)}
                </div>
              )}

              {isDetecting && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-night-950/60 backdrop-blur-[2px]">
                  <div className="flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-night-900/90 px-4 py-2 text-xs text-emerald-300 shadow-panel">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    正在识别画面结构与文字…
                  </div>
                </div>
              )}

              {/* CV 识别错误 Toast */}
              {cvError && (
                <div className="pointer-events-auto absolute bottom-3 left-1/2 z-30 -translate-x-1/2 animate-fade-in rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-2 text-xs text-red-200 shadow-panel backdrop-blur">
                  ⚠️ CV 识别失败：{cvError}
                </div>
              )}

              {isVideo && isPlaying && (
                <div className="pointer-events-none absolute bottom-14 left-1/2 z-20 -translate-x-1/2 rounded-full border border-night-600/60 bg-night-900/85 px-3 py-1 text-[11px] text-zinc-400 backdrop-blur">
                  播放中，暂停后可框选批注
                </div>
              )}

              {/* 文字输入弹窗 */}
              {pending && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-night-950/70 p-4 backdrop-blur-sm">
                  <div className="w-80 max-w-full animate-fade-in rounded-xl border border-night-700 bg-night-900 p-4 shadow-panel">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      <h3 className="text-[13px] font-medium text-zinc-200">
                        添加评审意见
                      </h3>
                      {isVideo && (
                        <span className="ml-auto rounded bg-night-850 px-1.5 py-0.5 font-mono text-[10px] text-violet-300">
                          {formatTime(videoRef.current?.currentTime ?? 0)}
                        </span>
                      )}
                    </div>

                    <textarea
                      autoFocus
                      rows={3}
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          confirmPending()
                        }
                        if (e.key === 'Escape') cancelPending()
                      }}
                      placeholder="描述这里的问题，例如：这一帧主体偏暗…"
                      className="w-full resize-none rounded-lg border border-night-700 bg-night-850 px-3 py-2 text-xs leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none"
                    />

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelPending}
                        className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-night-800 hover:text-zinc-200"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={confirmPending}
                        className="btn-primary !px-3.5 !py-1.5 !text-xs"
                      >
                        添加批注
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ---------- 空态 ---------- */
            <div
              className={`relative aspect-[16/10] w-full max-w-3xl overflow-hidden rounded-xl border bg-night-850 shadow-panel transition-colors ${
                isDragging ? 'border-violet-500/60' : 'border-night-700'
              }`}
            >
              <div className="checkerboard flex h-full w-full flex-col items-center justify-center gap-5 text-center">
                <div className="relative">
                  <div className="absolute -inset-3 rounded-3xl bg-violet-500/15 blur-2xl" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-night-600 bg-night-800/90">
                    <Film className="h-7 w-7 text-zinc-500" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-300">
                    拖入视频或图片，开始逐帧评审
                  </p>
                  <p className="mt-1.5 text-xs text-zinc-600">
                    视频支持 MP4 / WebM；图片支持 PNG / JPG / WebP
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <motion.button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-night-600 bg-night-800 px-3.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-violet-500/40 hover:text-zinc-100"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    选择本地文件
                  </motion.button>
                </div>
                {error && <p className="text-[11px] text-red-400">{error}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export default MainCanvas
