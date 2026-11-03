import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Sparkles, Loader2, Trash2, Sun } from 'lucide-react'
import { useStore } from '../store/useStore'

function formatTime(sec) {
  if (sec == null || Number.isNaN(sec)) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const markdownComponents = {
  h2: ({ node, ...props }) => (
    <h3 className="mb-2 mt-4 text-[13px] font-semibold text-zinc-100 first:mt-0" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h4 className="mb-1.5 mt-3 text-xs font-semibold text-violet-300" {...props} />
  ),
  p: ({ node, ...props }) => (
    <p className="mb-2 text-xs leading-relaxed text-zinc-400" {...props} />
  ),
  ul: ({ node, ...props }) => <ul className="mb-2 space-y-1 pl-1" {...props} />,
  li: ({ node, ...props }) => (
    <li className="list-disc text-xs leading-relaxed text-zinc-400 marker:text-violet-500" {...props} />
  ),
  strong: ({ node, ...props }) => (
    <strong className="font-medium text-zinc-200" {...props} />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="my-3 border-l-2 border-violet-500/40 pl-3 text-[11px] italic leading-relaxed text-zinc-500"
      {...props}
    />
  ),
}

/**
 * 序号徽标：与画布上的序号标签严格同源（同一个 annotations 数组索引）
 * 使用内联样式，确保任何情况下都可见，不受 Tailwind 类覆盖影响
 */
function SequenceBadge({ seq, isCv }) {
  return (
    <span
      title={`序号 ${seq}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        minWidth: 20,
        height: 20,
        marginTop: 2,
        padding: '0 4px',
        borderRadius: 4,
        background: isCv ? '#10b981' : '#ef4444',
        color: '#ffffff',
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        boxShadow: '0 0 0 1px rgba(255,255,255,0.12)',
      }}
    >
      {seq}
    </span>
  )
}

export default function RightPanel() {
  const annotations = useStore((s) => s.annotations)
  const activeAnnotationId = useStore((s) => s.activeAnnotationId)
  const jumpToAnnotation = useStore((s) => s.jumpToAnnotation)
  const removeAnnotation = useStore((s) => s.removeAnnotation)
  const setHoveredAnnotation = useStore((s) => s.setHoveredAnnotation)
  const aiResult = useStore((s) => s.aiResult)
  const isAiLoading = useStore((s) => s.isAiLoading)
  const aiError = useStore((s) => s.aiError)
  const generateAiReport = useStore((s) => s.generateAiReport)
  const setAiTyping = useStore((s) => s.setAiTyping)
  const media = useStore((s) => s.media)
  const brightness = useStore((s) => s.brightness)
  const setBrightness = useStore((s) => s.setBrightness)
  const resetBrightness = useStore((s) => s.resetBrightness)
  const isVideo = media?.type === 'video'

  /* ================= AI 结果打字机效果 ================= */
  // displayedText：本地逐字追加的展示字符串；aiResult（Store）始终存完整 Markdown
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    // 清理上一个定时器
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (!aiResult) {
      setDisplayedText('')
      setIsTyping(false)
      setAiTyping(false)
      return
    }

    // 拿到完整 Markdown 后从 0 开始逐字追加
    setDisplayedText('')
    setIsTyping(true)
    setAiTyping(true)

    let index = 0
    timerRef.current = setInterval(() => {
      // 每次追加 2 个字符，兼顾速度与流畅感
      index = Math.min(index + 2, aiResult.length)
      setDisplayedText(aiResult.slice(0, index))

      if (index >= aiResult.length) {
        clearInterval(timerRef.current)
        timerRef.current = null
        setIsTyping(false)
        setAiTyping(false)
      }
    }, 24)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setAiTyping(false)
    }
    // 仅在拿到新结果时重启打字机
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiResult])

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-night-800 bg-night-900/80">
      {/* 头部 */}
      <div className="flex shrink-0 items-center justify-between border-b border-night-800 px-5 py-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-violet-400" />
          <h2 className="text-sm font-medium text-zinc-200">评审面板</h2>
        </div>
        <span className="rounded-full bg-night-850 px-2 py-0.5 text-[11px] text-zinc-500">
          {annotations.length}
        </span>
      </div>

      {/* 图像调节（模块 B） */}
      <div className="shrink-0 border-b border-night-800 px-5 py-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sun className="h-3.5 w-3.5 text-amber-400/80" />
            <span className="text-xs text-zinc-400">画面亮度</span>
          </div>
          <button
            type="button"
            onClick={resetBrightness}
            disabled={!media || brightness === 0}
            className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            重置
          </button>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={brightness}
            disabled={!media}
            onChange={(e) => setBrightness(Number(e.target.value))}
            className="w-full cursor-pointer accent-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span className="w-9 shrink-0 text-right font-mono text-[11px] text-zinc-400">
            {brightness > 0 ? `+${brightness}` : brightness}
          </span>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
          {!media
            ? '上传素材后可调节画面亮度'
            : isVideo
              ? '视频通过 CSS filter 实时调节亮度'
              : '基于 getImageData 逐像素计算，拖动实时生效'}
        </p>
      </div>

      {/* 批注列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {annotations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-night-700 bg-night-850">
              <MessageSquare className="h-5 w-5 text-zinc-600" />
            </div>
            <div>
              <p className="text-[13px] text-zinc-400">还没有批注</p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                在画布上框选问题区域
                <br />
                或点击自动识别
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence initial={false}>
              {annotations.map((item) => {
                const isActive = item.id === activeAnnotationId
                const isCv = item.type === 'cv'
                // 与画布序号标签完全同一数据源，保证编号一致
                const seq =
                  annotations.findIndex((a) => a.id === item.id) + 1
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    onClick={() => jumpToAnnotation(item.id)}
                    onMouseEnter={() => setHoveredAnnotation(item.id)}
                    onMouseLeave={() => setHoveredAnnotation(null)}
                    title={item.text}
                    className={`group flex cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2.5 transition-colors ${
                      isActive
                        ? 'border-violet-500/40 bg-violet-500/[0.07]'
                        : 'border-transparent hover:bg-night-850'
                    }`}
                  >
                  <SequenceBadge seq={seq} isCv={isCv} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5">
                      <p className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-zinc-300">
                        {item.text}
                      </p>
                      {isVideo && (
                        <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-300">
                          [{formatTime(item.timestamp)}]
                        </span>
                      )}
                    </div>
                    {item.snapshot && (
                      <img
                        src={item.snapshot}
                        alt="批注快照"
                        className="mt-1.5 h-14 rounded border border-night-700 object-cover"
                      />
                    )}
                    <p className="mt-1 font-mono text-[10px] text-zinc-600">
                      x {Math.round(item.x * 100)}% · y {Math.round(item.y * 100)}% ·{' '}
                      {Math.round(item.width * 100)}×{Math.round(item.height * 100)}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="删除批注"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeAnnotation(item.id)
                    }}
                    className="opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-zinc-600" />
                  </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* AI 意见归纳 */}
      <div className="shrink-0 border-t border-night-800 bg-night-950/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
          <h3 className="text-xs font-medium text-zinc-300">AI 意见归纳</h3>
        </div>

        <motion.button
          type="button"
          onClick={generateAiReport}
          disabled={isAiLoading || annotations.length === 0}
          className="btn-primary w-full !py-2 !text-xs"
          whileHover={isAiLoading || annotations.length === 0 ? undefined : { scale: 1.02 }}
          whileTap={isAiLoading || annotations.length === 0 ? undefined : { scale: 0.98 }}
        >
          {isAiLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在归纳…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              AI 整理意见
            </>
          )}
        </motion.button>

        <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-night-800 bg-night-900/60 p-3">
          {aiError ? (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2.5">
              <span className="mt-0.5 text-xs">⚠️</span>
              <div className="text-[11px] leading-relaxed text-red-300">
                <p className="font-medium text-red-200">AI 调用失败</p>
                <p className="mt-0.5 break-words">{aiError}</p>
                <button
                  type="button"
                  onClick={generateAiReport}
                  className="mt-1.5 text-[11px] text-red-300 underline underline-offset-2 hover:text-red-100"
                >
                  点击重试
                </button>
              </div>
            </div>
          ) : aiResult ? (
            <div className="animate-fade-in">
              {/* 打字机：渲染逐步增长的 displayedText；react-markdown 对截断 Markdown 容错良好，不会崩溃 */}
              <ReactMarkdown components={markdownComponents}>
                {displayedText}
              </ReactMarkdown>
              {/* 打字中显示闪烁光标 */}
              {isTyping && (
                <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-violet-400 align-middle" />
              )}
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-zinc-600">
              {annotations.length === 0
                ? '先添加批注，再让 AI 帮你归并重复问题、生成修改清单。'
                : '点击上方按钮，AI 将读取当前批注并输出结构化的修改建议。'}
            </p>
          )}
        </div>
      </div>
    </aside>
  )
}
