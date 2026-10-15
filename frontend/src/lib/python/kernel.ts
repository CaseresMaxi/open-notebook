import type { NotebookOutput } from '@/lib/types/jupyter'
import { WORKER_SOURCE } from './worker-source'

export type KernelStatus = 'idle' | 'loading' | 'ready' | 'busy' | 'error'

export interface KernelEvents {
  status: (status: KernelStatus, detail?: string) => void
}

interface PendingRun {
  onOutput: (output: NotebookOutput) => void
  resolve: (ok: boolean) => void
}

type WorkerMessage =
  | { type: 'status'; message: 'loading' | 'installing'; name?: string }
  | { type: 'ready' }
  | { type: 'boot-error'; message: string }
  | { type: 'busy'; id: string }
  | { type: 'output'; id: string; output: NotebookOutput }
  | { type: 'done'; id: string; ok: boolean }
  | { type: 'file'; name: string }

/**
 * A Python session in a Web Worker (Pyodide). Cells run one after another and
 * share variables, like a Jupyter kernel. `restart()` throws the session away,
 * which is also the only way to stop a cell that never ends.
 */
export class PythonKernel {
  private worker: Worker | null = null
  private url: string | null = null
  private pending = new Map<string, PendingRun>()
  private files = new Map<string, () => void>()
  private counter = 0
  status: KernelStatus = 'idle'

  constructor(private onStatus: KernelEvents['status']) {}

  private setStatus(status: KernelStatus, detail?: string) {
    this.status = status
    this.onStatus(status, detail)
  }

  start() {
    if (this.worker) return
    this.url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))
    this.worker = new Worker(this.url)
    this.setStatus('loading')
    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.handle(event.data)
    this.worker.onerror = () => this.setStatus('error')
  }

  private handle(message: WorkerMessage) {
    switch (message.type) {
      case 'status':
        if (message.message === 'installing') this.onStatus(this.status, message.name)
        break
      case 'ready':
        this.setStatus(this.pending.size ? 'busy' : 'ready')
        break
      case 'boot-error':
        this.setStatus('error', message.message)
        for (const run of this.pending.values()) run.resolve(false)
        this.pending.clear()
        break
      case 'busy':
        this.setStatus('busy')
        break
      case 'output':
        this.pending.get(message.id)?.onOutput(message.output)
        break
      case 'done': {
        const run = this.pending.get(message.id)
        this.pending.delete(message.id)
        run?.resolve(message.ok)
        if (!this.pending.size) this.setStatus('ready')
        break
      }
      case 'file':
        this.files.get(message.name)?.()
        this.files.delete(message.name)
        break
    }
  }

  run(code: string, onOutput: PendingRun['onOutput']): Promise<boolean> {
    this.start()
    const id = `run-${++this.counter}`
    return new Promise(resolve => {
      this.pending.set(id, { onOutput, resolve })
      this.worker?.postMessage({ type: 'run', id, code })
    })
  }

  /** Make a file readable from Python as `./<name>` (the working directory). */
  async addFile(file: File): Promise<string> {
    this.start()
    const name = file.name.replace(/[\\/]/g, '_')
    const bytes = await file.arrayBuffer()
    return new Promise(resolve => {
      this.files.set(name, () => resolve(name))
      this.worker?.postMessage({ type: 'file', name, bytes }, [bytes])
    })
  }

  restart() {
    this.dispose()
    this.start()
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
    for (const run of this.pending.values()) run.resolve(false)
    this.pending.clear()
    this.files.clear()
    this.setStatus('idle')
  }
}
