// src/components/RichTextEditor.tsx
// Lightweight contentEditable rich text editor — no external dependency.
// Stores/returns raw HTML, matching what the Consigna Memo columns expect.
// Uses the (deprecated but still universally supported) execCommand API for
// basic formatting; good enough for short instructional text with bold,
// italics and lists.

import { useEffect, useRef, type ReactNode } from 'react'

interface RichTextEditorProps {
  label: string
  value: string
  onChange: (html: string) => void
  minHeight?: number
}

const exec = (command: string) => document.execCommand(command, false)

export default function RichTextEditor({ label, value, onChange, minHeight = 120 }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isFirstRender = useRef(true)

  // Only push `value` into the DOM on mount / external change — not on every
  // keystroke, which would fight the browser's own selection/caret handling.
  useEffect(() => {
    if (ref.current && (isFirstRender.current || document.activeElement !== ref.current)) {
      ref.current.innerHTML = value || ''
      isFirstRender.current = false
    }
  }, [value])

  const fieldId = `rte-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 'var(--space-1)' }}>
        <label htmlFor={fieldId} style={{ marginBottom: 0 }}>{label}</label>
        <div className="row" role="toolbar" aria-label={`Formato de ${label}`} style={{ gap: 2 }}>
          <ToolbarButton label="Negrita" onClick={() => exec('bold')}><strong>B</strong></ToolbarButton>
          <ToolbarButton label="Cursiva" onClick={() => exec('italic')}><em>I</em></ToolbarButton>
          <ToolbarButton label="Lista con viñetas" onClick={() => exec('insertUnorderedList')}>•</ToolbarButton>
          <ToolbarButton label="Lista numerada" onClick={() => exec('insertOrderedList')}>1.</ToolbarButton>
        </div>
      </div>
      <div
        id={fieldId}
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        style={{
          minHeight,
          padding: 'var(--space-3)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-surface)',
          fontSize: '0.92rem',
          lineHeight: 1.6,
        }}
      />
    </div>
  )
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      style={{ padding: '2px 8px', minWidth: 28 }}
      aria-label={label}
      title={label}
      // Prevent the contentEditable div from losing focus/selection before
      // execCommand runs.
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
