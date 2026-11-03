import {
  MousePointer2,
  Square,
  Type,
  ScanLine,
  Download,
  Loader2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'

const tools = [
  { key: 'select', icon: MousePointer2, label: '选择' },
  { key: 'rect', icon: Square, label: '框选批注' },
  { key: 'text', icon: Type, label: '文字标注' },
]

export default function Toolbar({ onExport, isExporting }) {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const triggerCVDetection = useStore((s) => s.triggerCVDetection)
  const isDetecting = useStore((s) => s.isDetecting)
  const annotations = useStore((s) => s.annotations)
  const media = useStore((s) => s.media)
  const isAiTyping = useStore((s) => s.isAiTyping)
  const hasMedia = !!media

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-night-800 bg-night-900/80 px-4 backdrop-blur-xl">
      {/* 工具组 */}
      <div className="flex items-center gap-1 rounded-lg bg-night-850 p-1">
        {tools.map(({ key, icon: Icon, label }) => {
          const active = tool === key
          return (
            <button
              key={key}
              type="button"
              title={label}
              onClick={() => setTool(key)}
              disabled={!hasMedia}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                !hasMedia
                  ? 'cursor-not-allowed opacity-50 text-zinc-600'
                  : active
                    ? 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30'
                    : 'text-zinc-500 hover:bg-night-800 hover:text-zinc-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      <div className="h-5 w-px bg-night-700" />

      {/* 自动识别（模块 C） */}
      <button
        type="button"
        onClick={triggerCVDetection}
        disabled={isDetecting || !media}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400/90 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isDetecting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ScanLine className="h-3.5 w-3.5" />
        )}
        {isDetecting ? '识别中…' : '自动识别'}
      </button>

      <div className="ml-auto flex items-center gap-3">
        <span className="rounded-full bg-night-850 px-2.5 py-1 text-[11px] text-zinc-500">
          {annotations.length} 条批注
        </span>
        <motion.button
          type="button"
          onClick={onExport}
          disabled={!media || isExporting || isAiTyping}
          title={isAiTyping ? 'AI 正在输出归纳结果，请稍候' : undefined}
          className="btn-primary !px-3 !py-1.5 !text-xs"
          whileHover={!media || isExporting || isAiTyping ? undefined : { scale: 1.02 }}
          whileTap={!media || isExporting || isAiTyping ? undefined : { scale: 0.98 }}
        >
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {isExporting ? '导出中…' : isAiTyping ? 'AI 输出中…' : '导出 PDF'}
        </motion.button>
      </div>
    </header>
  )
}
