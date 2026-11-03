import { useRef } from 'react'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import MainCanvas from './components/MainCanvas'
import RightPanel from './components/RightPanel'
import { useStore } from './store/useStore'
import { exportReviewPdf } from './utils/exportPdf'

export default function App() {
  const canvasRef = useRef(null)
  const isExporting = useStore((s) => s.isExporting)
  const setExporting = useStore((s) => s.setExporting)

  const handleExport = async () => {
    const { media, annotations, aiResult } = useStore.getState()
    if (!media || isExporting) return

    setExporting(true)
    try {
      await exportReviewPdf({
        snapshot: canvasRef.current?.getSnapshot() ?? null,
        imageName: media.name,
        mediaType: media.type,
        annotations,
        aiResult,
      })
    } catch (error) {
      console.error('[ReviewFlow] 导出 PDF 失败：', error)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-night-950 text-zinc-300">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Toolbar onExport={handleExport} isExporting={isExporting} />
        <MainCanvas ref={canvasRef} />
      </main>
      <RightPanel />
    </div>
  )
}
