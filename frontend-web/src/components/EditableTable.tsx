import { useState, useRef, useEffect, KeyboardEvent } from 'react'

export interface ColumnDef {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'select'
  options?: { value: string; label: string }[]
  width?: string
  required?: boolean
}

interface Props {
  columns: ColumnDef[]
  initialRows?: Record<string, string>[]
  onSave: (rows: Record<string, string>[]) => Promise<void>
  saveLabel?: string
  addLabel?: string
  emptyLabel?: string
}

function emptyRow(columns: ColumnDef[]): Record<string, string> {
  return Object.fromEntries(columns.map(c => [c.key, '']))
}

export default function EditableTable({
  columns, initialRows = [], onSave,
  saveLabel = 'Guardar todo',
  addLabel = '+ Agregar fila',
  emptyLabel = 'Sin registros. Agrega una fila para comenzar.',
}: Props) {
  const [rows, setRows] = useState<Record<string, string>[]>(
    initialRows.length > 0 ? initialRows : [emptyRow(columns)]
  )
  const [saving, setSaving] = useState(false)
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null)
  const inputRefs = useRef<(HTMLInputElement | HTMLSelectElement | null)[][]>([])

  useEffect(() => {
    inputRefs.current = rows.map(() => columns.map(() => null))
  }, [rows.length, columns.length])

  const updateCell = (rowIdx: number, key: string, value: string) => {
    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r))
  }

  const addRow = () => {
    setRows(prev => [...prev, emptyRow(columns)])
    setTimeout(() => {
      const newRowIdx = rows.length
      inputRefs.current[newRowIdx]?.[0]?.focus()
    }, 50)
  }

  const deleteRow = (idx: number) => {
    if (rows.length === 1) {
      setRows([emptyRow(columns)])
    } else {
      setRows(prev => prev.filter((_, i) => i !== idx))
    }
  }

  const handleKeyDown = (e: KeyboardEvent, rowIdx: number, colIdx: number) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const nextCol = colIdx + 1
      if (nextCol < columns.length) {
        inputRefs.current[rowIdx]?.[nextCol]?.focus()
      } else if (rowIdx + 1 < rows.length) {
        inputRefs.current[rowIdx + 1]?.[0]?.focus()
      } else {
        addRow()
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (rowIdx + 1 < rows.length) {
        inputRefs.current[rowIdx + 1]?.[colIdx]?.focus()
      } else {
        addRow()
      }
    }
    if (e.key === 'ArrowDown' && rowIdx + 1 < rows.length) {
      inputRefs.current[rowIdx + 1]?.[colIdx]?.focus()
    }
    if (e.key === 'ArrowUp' && rowIdx > 0) {
      inputRefs.current[rowIdx - 1]?.[colIdx]?.focus()
    }
  }

  const handleSave = async () => {
    // Filtrar filas vacías
    const filledRows = rows.filter(r =>
      columns.some(c => r[c.key]?.trim())
    )
    if (filledRows.length === 0) return
    setSaving(true)
    await onSave(filledRows)
    setSaving(false)
  }

  const hasData = rows.some(r => columns.some(c => r[c.key]?.trim()))

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map(col => (
                <th key={col.key}
                  className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2.5"
                  style={{ width: col.width }}>
                  {col.label}{col.required && <span className="text-red-400 ml-0.5">*</span>}
                </th>
              ))}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx}
                className={`border-b border-gray-100 last:border-0 ${
                  activeCell?.row === rowIdx ? 'bg-teal-50' : 'hover:bg-gray-50'
                }`}>
                {columns.map((col, colIdx) => (
                  <td key={col.key} className="px-1 py-1">
                    {col.type === 'select' ? (
                      <select
                        ref={el => {
                          if (!inputRefs.current[rowIdx]) inputRefs.current[rowIdx] = []
                          inputRefs.current[rowIdx][colIdx] = el
                        }}
                        className="w-full px-2 py-1.5 text-sm bg-transparent border-0 outline-none focus:bg-white focus:border focus:border-teal-400 focus:rounded-lg"
                        value={row[col.key]}
                        onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                        onFocus={() => setActiveCell({ row: rowIdx, col: colIdx })}>
                        <option value="">—</option>
                        {col.options?.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        ref={el => {
                          if (!inputRefs.current[rowIdx]) inputRefs.current[rowIdx] = []
                          inputRefs.current[rowIdx][colIdx] = el
                        }}
                        type={col.type ?? 'text'}
                        className="w-full px-2 py-1.5 text-sm bg-transparent border-0 outline-none focus:bg-white focus:border focus:border-teal-400 focus:rounded-lg"
                        value={row[col.key]}
                        onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                        onFocus={() => setActiveCell({ row: rowIdx, col: colIdx })}
                        onBlur={() => setActiveCell(null)}
                        onKeyDown={e => handleKeyDown(e, rowIdx, colIdx)} />
                    )}
                  </td>
                ))}
                <td className="px-1 py-1 text-center">
                  <button onClick={() => deleteRow(rowIdx)}
                    className="text-gray-300 hover:text-red-400 text-base leading-none px-1">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Controles */}
      <div className="flex items-center justify-between mt-3">
        <button onClick={addRow}
          className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1">
          {addLabel}
        </button>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">
            Tab / Enter para navegar · ↑↓ para mover entre filas
          </p>
          <button onClick={handleSave} disabled={saving || !hasData}
            className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-40">
            {saving ? 'Guardando...' : saveLabel}
          </button>
        </div>
      </div>

      {!hasData && (
        <p className="text-xs text-gray-400 text-center mt-2">{emptyLabel}</p>
      )}
    </div>
  )
}
