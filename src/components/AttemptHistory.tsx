import { useMemo, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  GitBranch,
  Sparkles,
  XCircle,
  SkipForward,
  AlertTriangle,
  User,
  ChevronDown,
  Network,
} from 'lucide-react'
import type { AttemptRow, AttemptTreeNode } from '../attempts'
import {
  attemptHowLine,
  buildAttemptForest,
  shortAttemptId,
} from '../attempts'

type StatusKind =
  | 'matched'
  | 'near_miss'
  | 'no_progress'
  | 'compile_error'
  | 'failed'
  | 'skipped'
  | 'other'

function statusKind(status?: string): StatusKind {
  switch (status) {
    case 'matched':
    case 'near_miss':
    case 'no_progress':
    case 'compile_error':
    case 'failed':
    case 'skipped':
      return status
    default:
      return 'other'
  }
}

function StatusIcon({ kind }: { kind: StatusKind }) {
  const cls = 'w-3.5 h-3.5 shrink-0'
  switch (kind) {
    case 'matched':
      return <CheckCircle2 className={`${cls} text-emerald-700`} />
    case 'near_miss':
      return <Sparkles className={`${cls} text-amber-700`} />
    case 'no_progress':
      return <CircleDashed className={`${cls} text-aero-muted`} />
    case 'compile_error':
    case 'failed':
      return <XCircle className={`${cls} text-rose-700`} />
    case 'skipped':
      return <SkipForward className={`${cls} text-aero-muted`} />
    default:
      return <AlertTriangle className={`${cls} text-aero-muted`} />
  }
}

function statusPillClass(kind: StatusKind): string {
  switch (kind) {
    case 'matched':
      return 'bg-emerald-400/30 text-emerald-800 border-emerald-600/40'
    case 'near_miss':
      return 'bg-amber-300/40 text-amber-900 border-amber-600/40'
    case 'no_progress':
      return 'bg-slate-300/35 text-slate-700 border-slate-500/35'
    case 'compile_error':
    case 'failed':
      return 'bg-rose-300/35 text-rose-800 border-rose-500/40'
    case 'skipped':
      return 'bg-sky-300/30 text-sky-900 border-sky-500/35'
    default:
      return 'bg-sky-900/10 text-aero-text border-white/50'
  }
}

function statusTitle(row: AttemptRow): string {
  const k = statusKind(row.status)
  if (k === 'near_miss' && row.divergences != null) return `NEAR-MISS · ${row.divergences} off`
  if (k === 'matched') return 'MATCHED'
  if (k === 'no_progress') return 'NO PROGRESS'
  if (k === 'compile_error') return 'COMPILE ERROR'
  if (k === 'failed') return 'FAILED'
  if (k === 'skipped') return 'SKIPPED'
  return (row.status || 'TRY').toUpperCase().replace(/_/g, ' ')
}

function Chip({
  children,
  title,
  tone = 'muted',
}: {
  children: ReactNode
  title?: string
  tone?: 'muted' | 'primary' | 'accent' | 'indigo' | 'violet'
}) {
  const tones: Record<string, string> = {
    muted: 'bg-sky-900/8 text-aero-muted border-white/55',
    primary: 'bg-[rgb(var(--aero-primary-rgb)/0.14)] text-aero-primary border-[rgb(var(--aero-primary-rgb)/0.35)]',
    accent: 'bg-emerald-400/20 text-emerald-900 border-emerald-600/30',
    indigo: 'bg-indigo-300/30 text-indigo-900 border-indigo-600/35',
    violet: 'bg-violet-300/30 text-violet-900 border-violet-600/35',
  }
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

function AttemptCard({
  node,
  depth,
  index,
}: {
  node: AttemptTreeNode
  depth: number
  index: number
}) {
  const { row } = node
  const kind = statusKind(row.status)
  const how = attemptHowLine(row)
  const hasKids = node.children.length > 0

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.28 }}
      className="list-none relative"
    >
      <div className={`attempt-node flex gap-0 ${depth > 0 ? 'mt-2' : ''}`}>
        {/* timeline rail */}
        <div className="attempt-rail flex flex-col items-center shrink-0 w-7 pt-3">
          <span className={`attempt-dot attempt-dot--${kind}`} aria-hidden>
            <StatusIcon kind={kind} />
          </span>
          {(hasKids || depth > 0) && <span className="attempt-stem flex-1 min-h-[12px]" aria-hidden />}
        </div>

        {/* card body */}
        <div className="attempt-card flex-1 min-w-0 mb-1">
          <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusPillClass(kind)}`}
            >
              {statusTitle(row)}
            </span>
            {row.improvedNearMiss && (
              <Chip tone="accent" title="Improved near-miss vs previous best">
                improved
              </Chip>
            )}
            {row.base?.kind && row.base.kind !== 'scratch' && (
              <Chip title="What this try started from">base · {row.base.kind}</Chip>
            )}
            {row.sessionScope && (
              <Chip title="Session scope">
                {row.sessionScope}
                {row.batchSize != null ? ` · ${row.batchSize}` : ''}
              </Chip>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {row.kind === 'human' ? (
              <Chip tone="violet">
                <User className="w-3 h-3" /> human
              </Chip>
            ) : how ? (
              <Chip tone="indigo" title="How this try was run">
                {how}
              </Chip>
            ) : null}
            {row.author && (
              <Chip title="Author credit field on this try">
                <User className="w-3 h-3" /> {row.author}
              </Chip>
            )}
            {row.usedNearMissDraft && <Chip tone="primary">used near-miss</Chip>}
            {row.usedGhidraDraft && <Chip tone="primary">used ghidra</Chip>}
          </div>

          {row.note && (
            <p className="mt-2 text-[11.5px] text-aero-text/90 leading-snug allow-select m-0 italic">
              “{row.note}”
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-aero-muted mono">
            <span title={row.attemptId || undefined}>
              {shortAttemptId(row.attemptId)}
              {row.parentAttemptId
                ? ` ← ${shortAttemptId(row.parentAttemptId)}`
                : depth === 0
                  ? ' · root'
                  : ''}
            </span>
            {row.srcPath && (
              <span className="truncate max-w-[14rem]" title={row.srcPath}>
                {row.srcPath}
              </span>
            )}
          </div>
        </div>
      </div>

      {hasKids && (
        <ul className="m-0 p-0 ml-3 pl-1 border-l border-[rgb(var(--aero-primary-rgb)/0.18)]">
          {node.children.map((ch, i) => (
            <AttemptCard
              key={ch.row.attemptId || `${depth}-${i}`}
              node={ch}
              depth={depth + 1}
              index={index + i + 1}
            />
          ))}
        </ul>
      )}
    </motion.li>
  )
}

export function AttemptHistory({
  rows,
  source,
  loading,
  error,
}: {
  rows: AttemptRow[]
  source: string | null
  loading?: boolean
  error?: string | null
}) {
  const [open, setOpen] = useState(true)
  const forest = useMemo(() => buildAttemptForest(rows), [rows])

  if (loading) {
    return (
      <div className="attempt-panel glass p-4 rounded-xl">
        <div className="flex items-center gap-2 text-sm text-aero-muted">
          <Network className="w-4 h-4 animate-pulse text-aero-primary" />
          Loading attempt history…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="attempt-panel glass p-4 rounded-xl border border-rose-400/35">
        <div className="flex items-start gap-2 text-sm text-rose-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Couldn’t load attempt history</div>
            <div className="text-[11px] mt-0.5 opacity-90">{error}</div>
          </div>
        </div>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="attempt-panel glass p-4 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="attempt-empty-icon shrink-0">
            <GitBranch className="w-4 h-4 text-aero-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-aero-text">Attempt history</div>
            <p className="text-[12px] text-aero-muted m-0 mt-1 leading-relaxed">
              No logged tries for this function yet. When operators or agents append to{' '}
              <code className="mono text-[11px] px-1 py-0.5 rounded bg-sky-900/8">
                config/match_attempts.jsonl
              </code>
              , every try (including dead ends) shows here as a tree.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const nTries = rows.length
  const nRoots = forest.length

  return (
    <div className="attempt-panel glass rounded-xl overflow-hidden">
      {/* header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[rgb(var(--aero-primary-rgb)/0.06)] transition-colors"
      >
        <div className="attempt-header-icon shrink-0">
          <GitBranch className="w-4 h-4 text-aero-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-aero-text">Attempt history</span>
            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-[rgb(var(--aero-primary-rgb)/0.14)] text-aero-primary border border-[rgb(var(--aero-primary-rgb)/0.3)]">
              {nTries} tr{nTries === 1 ? 'y' : 'ies'}
            </span>
            {nRoots > 1 && (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-sky-900/8 text-aero-muted border border-white/50">
                {nRoots} roots
              </span>
            )}
          </div>
          {/* No matched/best-div tallies — function header already has MATCHED / NEAR-MISS · N. */}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-aero-muted shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-2 flex items-center justify-between gap-2 border-t border-white/40 pt-2">
              <p className="text-[11px] text-aero-muted m-0 leading-snug">
                Full try tree — parents link branches; dead ends stay as siblings.
              </p>
              {source && (
                <a
                  href={source.split('?')[0]}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10.5px] text-aero-primary hover:underline shrink-0"
                  title={source}
                >
                  <ExternalLink className="w-3 h-3" />
                  log
                </a>
              )}
            </div>

            <ul className="attempt-tree custom-scroll m-0 px-3 pb-3 max-h-[340px] overflow-auto">
              {forest.map((root, i) => (
                <AttemptCard
                  key={root.row.attemptId || `root-${i}`}
                  node={root}
                  depth={0}
                  index={i}
                />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
