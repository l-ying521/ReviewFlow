import {
  Layers,
  Upload,
  LayoutDashboard,
  History,
  FolderOpen,
  Users,
  Settings,
  ChevronRight,
  Circle,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'

const navItems = [
  { icon: LayoutDashboard, label: '评审工作台', active: true },
  { icon: History, label: '历史记录' },
  { icon: FolderOpen, label: '素材库' },
  { icon: Users, label: '团队协作' },
]

export default function Sidebar() {
  const image = useStore((s) => s.image)
  const annotations = useStore((s) => s.annotations)

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-night-800 bg-night-900/80">
      {/* 品牌区 */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-glow">
          <Layers className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight text-zinc-100">
            ReviewFlow
          </p>
          <p className="text-[11px] text-zinc-500">AI 评审交付舱</p>
        </div>
      </div>

      {/* 主操作 */}
      <div className="px-4">
        <motion.button
          type="button"
          className="btn-primary w-full"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Upload className="h-4 w-4" />
          上传作品
        </motion.button>
      </div>

      {/* 一级导航 */}
      <nav className="mt-6 space-y-1 px-3">
        {navItems.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            type="button"
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              active
                ? 'bg-night-800 font-medium text-zinc-100'
                : 'text-zinc-500 hover:bg-night-800/60 hover:text-zinc-300'
            }`}
          >
            <Icon className={`h-4 w-4 ${active ? 'text-violet-400' : ''}`} />
            {label}
            {active && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-400" />
            )}
          </button>
        ))}
      </nav>

      {/* 最近项目 */}
      <div className="mt-7 flex-1 overflow-y-auto px-3">
        <div className="mb-2 flex items-center justify-between px-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
            最近评审
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-3 rounded-lg bg-night-850 px-3 py-2.5">
            <Circle className="h-2 w-2 shrink-0 fill-emerald-400 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-zinc-200">
                {image?.name || '未命名作品'}
              </p>
              <p className="text-[11px] text-zinc-600">
                {annotations.length} 条批注
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 底部用户 */}
      <div className="border-t border-night-800 p-3">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-night-800/60"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-night-700 text-[13px] font-medium text-zinc-300">
            创
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-zinc-300">创作者账户</p>
            <p className="text-[11px] text-violet-400/80">Pro 创作者版</p>
          </div>
          <Settings className="h-4 w-4 text-zinc-600" />
        </button>
      </div>
    </aside>
  )
}
