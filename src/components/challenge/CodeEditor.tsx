import { useEffect, useRef } from 'react'
import type { EditorView as EditorViewType } from '@codemirror/view'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  label: string
}

export function CodeEditor({ value, onChange, label }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorViewType | undefined>(undefined)
  const changeRef = useRef(onChange)
  const valueRef = useRef(value)
  changeRef.current = onChange
  valueRef.current = value

  useEffect(() => {
    let disposed = false
    let view: EditorViewType | undefined
    void Promise.all([
      import('codemirror'),
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@codemirror/lang-html'),
    ]).then(([{ basicSetup }, { EditorState }, { EditorView }, { html }]) => {
      if (disposed || !hostRef.current) return
      view = new EditorView({
        parent: hostRef.current,
        state: EditorState.create({
          doc: valueRef.current,
          extensions: [
            basicSetup,
            html(),
            EditorView.lineWrapping,
            EditorView.contentAttributes.of({ 'aria-label': label }),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) changeRef.current(update.state.doc.toString())
            }),
            EditorView.theme({
              '&': { height: '28rem', backgroundColor: 'transparent' },
              '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65' },
              '.cm-content': { padding: '1rem 0' },
              '.cm-gutters': { backgroundColor: 'transparent', border: '0' },
              '&.cm-focused': { outline: 'none' },
            }),
          ],
        }),
      })
      viewRef.current = view
    })
    return () => {
      disposed = true
      view?.destroy()
      viewRef.current = undefined
    }
  }, [label])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])

  return <div ref={hostRef} className="code-editor" />
}
