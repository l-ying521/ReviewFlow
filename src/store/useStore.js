import { create } from 'zustand'
import { requestCvDetection, requestAiSummary } from '../utils/mockApi'

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const useStore = create((set, get) => ({
  /* ---------------- 媒体（图片 / 视频） ---------------- */
  // { type: 'image'|'video', url, name, width, height }
  media: null,
  setMedia: (media) =>
    set({
      media,
      annotations: [],
      activeAnnotationId: null,
      aiResult: '',
      brightness: 0,
      cvResult: [],
      pendingSeek: null,
    }),
  clearMedia: () =>
    set({
      media: null,
      annotations: [],
      activeAnnotationId: null,
      aiResult: '',
      cvResult: [],
      brightness: 0,
      pendingSeek: null,
    }),

  /* ---------------- 批注（带时间戳） ---------------- */
  annotations: [],
  activeAnnotationId: null,
  // 画布层消费：点击批注后待跳转的视频时间
  pendingSeek: null,
  jumpToAnnotation: (id) => {
    const target = get().annotations.find((a) => a.id === id)
    if (!target) return
    set({
      activeAnnotationId: id,
      pendingSeek: target.timestamp ?? null,
    })
  },
  consumePendingSeek: () => set({ pendingSeek: null }),

  addAnnotation: (annotation) => {
    const item = {
      id: uid(),
      type: 'manual',
      color: '#ef4444',
      timestamp: 0,
      snapshot: null, // 视频批注的当前帧截图（Base64）
      createdAt: Date.now(),
      ...annotation,
    }
    set((state) => ({
      annotations: [...state.annotations, item],
      activeAnnotationId: item.id,
    }))
    return item
  },

  updateAnnotation: (id, patch) =>
    set((state) => ({
      annotations: state.annotations.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })),

  removeAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((item) => item.id !== id),
      activeAnnotationId:
        state.activeAnnotationId === id ? null : state.activeAnnotationId,
      hoveredAnnotationId:
        state.hoveredAnnotationId === id ? null : state.hoveredAnnotationId,
    })),

  clearAnnotations: () => set({ annotations: [], activeAnnotationId: null }),

  setActiveAnnotation: (activeAnnotationId) => set({ activeAnnotationId }),

  // 列表 Hover → 画布对应框高亮
  hoveredAnnotationId: null,
  setHoveredAnnotation: (hoveredAnnotationId) => set({ hoveredAnnotationId }),

  /* ---------------- 工具与图像调节 ---------------- */
  tool: 'select',
  setTool: (tool) => set({ tool }),

  brightness: 0, // -100 ~ 100
  setBrightness: (brightness) => set({ brightness }),
  resetBrightness: () => set({ brightness: 0 }),

  /* ---------------- 模块 C：CV 识别 ---------------- */
  isDetecting: false,
  cvResult: [],
  cvError: '',
  // 触发信号：Toolbar 设为 true → MainCanvas 监听后自己截帧并调 runCVDetectionWithPayload
  cvTriggerPending: false,
  triggerCVDetection: () => set({ cvTriggerPending: true, cvError: '' }),
  consumeCvTrigger: () => set({ cvTriggerPending: false }),

  // MainCanvas 截帧后带着 payload 来调这个
  runCVDetection: async ({ base64, width, height } = {}) => {
    const state = get()
    if (state.isDetecting || !state.media) return

    set({ isDetecting: true, cvError: '' })
    try {
      const detections = await requestCvDetection({ base64, width, height })
      const timestamp =
        state.media?.type === 'video' && typeof window !== 'undefined'
          ? window.__CV_CURRENT_TIMESTAMP__ ?? 0
          : 0
      const items = detections.map((item) => ({
        ...item,
        id: uid(),
        type: 'cv',
        color: '#22c55e',
        timestamp,
        createdAt: Date.now(),
      }))

      set((prev) => ({
        isDetecting: false,
        cvError: '',
        cvResult: items,
        annotations: [
          ...prev.annotations.filter((item) => item.type !== 'cv'),
          ...items,
        ],
      }))
      return true
    } catch (err) {
      set({
        isDetecting: false,
        cvError: err?.message || 'CV 识别失败',
      })
      return false
    }
  },

  /* ---------------- 模块 D：AI 意见归纳 ---------------- */
  aiResult: '',
  isAiLoading: false,
  aiError: '',
  isAiTyping: false,
  setAiTyping: (v) => set({ isAiTyping: !!v }),
  generateAiReport: async () => {
    if (get().isAiLoading) return
    set({ isAiLoading: true, aiResult: '', aiError: '', isAiTyping: false })

    try {
      const markdown = await requestAiSummary(get().annotations)
      set({ isAiLoading: false, aiResult: markdown, aiError: '' })
    } catch (err) {
      set({
        isAiLoading: false,
        aiError: err?.message || '未知错误',
        aiResult: '',
      })
    }
  },

  /* ---------------- 模块 E：导出 PDF ---------------- */
  isExporting: false,
  setExporting: (isExporting) => set({ isExporting }),
}))

/* ---------------- 兼容层：旧字段名平滑过渡 ---------------- */
// 仅保留给尚未改造完的旧代码使用，完成后可删除
export const useImageCompat = () => {
  const media = useStore((s) => s.media)
  return media && media.type === 'image' ? media : null
}
