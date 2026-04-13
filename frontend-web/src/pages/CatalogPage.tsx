import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRole } from '../hooks/useRole'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

// 8 campos = 8 columnas visibles en tabla (deben coincidir exactamente)
const CAMPOS_EDITABLES = [
  { key: 'descripcion',   label: 'Descripción', type: 'text'   },
  { key: 'um',            label: 'UM',          type: 'text'   },
  { key: 'tipo_material', label: 'Tipo',        type: 'text'   },
  { key: 'descr_sector',  label: 'Sector',      type: 'text'   },
  { key: 'costo',         label: 'Costo',       type: 'number' },
  { key: 'lista_02',      label: 'Lista 02',    type: 'number' },
  { key: 'lista_06',      label: 'Lista 06',    type: 'number' },
  { key: 'condicion',     label: 'Condición',   type: 'text'   },
]

// Modal nuevo material incluye campos extra no visibles inline
const CAMPOS_NUEVO = [
  { key: 'material',        label: 'Código Material *',   type: 'text'   },
  { key: 'descripcion',     label: 'Descripción',         type: 'text'   },
  { key: 'um',              label: 'UM',                  type: 'text'   },
  { key: 'tipo_material',   label: 'Tipo',                type: 'text'   },
  { key: 'sector',          label: 'Sector (código)',      type: 'text'   },
  { key: 'descr_sector',    label: 'Sector (descripción)', type: 'text'   },
  { key: 'grupo_articulos', label: 'Grupo de artículos',  type: 'text'   },
  { key: 'costo',           label: 'Costo',               type: 'number' },
  { key: 'lista_02',        label: 'Lista 02',            type: 'number' },
  { key: 'lista_06',        label: 'Lista 06',            type: 'number' },
  { key: 'condicion',       label: 'Condición',           type: 'text'   },
]

export default function CatalogPage() {
  const fileRef                         = useRef<HTMLInputElement>(null)
  const { userRole, isAdmin }           = useRole()
  const canEdit                         = isAdmin || userRole?.role === 'analista'

  const [materials, setMaterials]       = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [uploading, setUploading]       = useState(false)
  const [search, setSearch]             = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [conversiones, setConversiones] = useState<Record<string, any[]>>({})
  const [showConvModal, setShowConvModal] = useState<any>(null)
  const [convForm, setConvForm]         = useState({ um_destino: '', factor: '' })
  const [savingConv, setSavingConv]     = useState(false)

  // Edición inline
  const [editId, setEditId]             = useState<string | null>(null)
  const [editForm, setEditForm]         = useState<Record<string, any>>({})
  const [savingEdit, setSavingEdit]     = useState(false)

  // Nuevo material
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm]           = useState<Record<string, any>>({})
  const [savingNew, setSavingNew]       = useState(false)

  // Historial
  const [showHistory, setShowHistory]   = useState<string | null>(null)
  const [historyData, setHistoryData]   = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Preview excel
  const [preview, setPreview]           = useState<any[]>([])
  const [showPreview, setShowPreview]   = useState(false)

  // ────────────────────────────────────────────────────────────────────

  useEffect(() => { load() }, [search, showInactive])

  const load = async () => {
    setLoading(true)
    const { data: convData } = await supabase.from('catalog_conversiones').select('*')
    const convMap: Record<string, any[]> = {}
    ;(convData ?? []).forEach((c: any) => {
      if (!convMap[c.material]) convMap[c.material] = []
      convMap[c.material].push(c)
    })
    setConversiones(convMap)

    let q = supabase.from('catalog_materials').select('*').order('material')
    if (!showInactive) q = q.or('activo.is.null,activo.eq.true')
    if (search) q = q.or(`material.ilike.%${search}%,descripcion.ilike.%${search}%`)
    const { data } = await q
    setMaterials(data ?? [])
    setLoading(false)
  }

  // ── Edición inline ───────────────────────────────────────────────────

  const startEdit = (m: any) => {
    setEditId(m.id)
    const form: Record<string, any> = {}
    CAMPOS_EDITABLES.forEach(c => { form[c.key] = m[c.key] ?? '' })
    setEditForm(form)
  }

  const saveEdit = async (m: any) => {
    setSavingEdit(true)
    const { data: { session } } = await supabase.auth.getSession()
    const updates: Record<string, any> = {}
    const logs: any[] = []

    CAMPOS_EDITABLES.forEach(c => {
      const valOrig = m[c.key] != null ? String(m[c.key]) : ''
      const valNew  = editForm[c.key] != null ? String(editForm[c.key]) : ''
      if (valOrig !== valNew) {
        updates[c.key] = c.type === 'number' ? (parseFloat(valNew) || null) : valNew || null
        logs.push({ material: m.material, campo: c.key, valor_anterior: valOrig || null, valor_nuevo: valNew || null, changed_by: session?.user.id })
      }
    })

    if (Object.keys(updates).length === 0) { setEditId(null); setSavingEdit(false); return }

    const { error } = await supabase.from('catalog_materials').update(updates).eq('id', m.id)
    if (error) { toast.error(error.message); setSavingEdit(false); return }

    if (logs.length) await supabase.from('catalog_audit_log').insert(logs)
    toast.success('Material actualizado')
    setEditId(null)
    setSavingEdit(false)
    load()
  }

  // ── Nuevo material ───────────────────────────────────────────────────

  const saveNew = async () => {
    if (!newForm.material?.trim()) return toast.error('El código de material es obligatorio')
    setSavingNew(true)
    const { data: { session } } = await supabase.auth.getSession()
    const insert: Record<string, any> = { created_by: session?.user.id, activo: true }
    CAMPOS_NUEVO.forEach(c => {
      const v = newForm[c.key]
      insert[c.key] = c.type === 'number' ? (parseFloat(v) || null) : v?.trim() || null
    })
    const { error } = await supabase.from('catalog_materials')
      .upsert(insert, { onConflict: 'material,created_by', ignoreDuplicates: false })
    if (error) { toast.error(error.message); setSavingNew(false); return }
    toast.success('Material guardado')
    setShowNewModal(false)
    setNewForm({})
    setSavingNew(false)
    load()
  }

  // ── Desactivar / Reactivar ───────────────────────────────────────────

  const toggleActive = async (m: any) => {
    const next = !(m.activo ?? true)
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('catalog_materials').update({ activo: next }).eq('id', m.id)
    await supabase.from('catalog_audit_log').insert({
      material: m.material, campo: 'activo',
      valor_anterior: String(m.activo ?? true), valor_nuevo: String(next),
      changed_by: session?.user.id,
    })
    toast.success(next ? 'Material reactivado' : 'Material desactivado')
    load()
  }

  // ── Historial ────────────────────────────────────────────────────────

  const openHistory = async (material: string) => {
    setShowHistory(material)
    setLoadingHistory(true)
    const { data } = await supabase
      .from('catalog_audit_log')
      .select('*, auth_user:changed_by(email)')
      .eq('material', material)
      .order('changed_at', { ascending: false })
      .limit(50)
    setHistoryData(data ?? [])
    setLoadingHistory(false)
  }

  // ── Conversión ───────────────────────────────────────────────────────

  const guardarConversion = async () => {
    if (!convForm.um_destino || !convForm.factor) return
    setSavingConv(true)
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('catalog_conversiones').upsert({
      material: showConvModal.material,
      um_origen: showConvModal.um,
      um_destino: convForm.um_destino.toUpperCase(),
      factor: parseFloat(convForm.factor),
      created_by: session?.user.id,
    }, { onConflict: 'material,um_origen,um_destino' })
    const { data: convData } = await supabase.from('catalog_conversiones').select('*')
    const convMap: Record<string, any[]> = {}
    ;(convData ?? []).forEach((c: any) => {
      if (!convMap[c.material]) convMap[c.material] = []
      convMap[c.material].push(c)
    })
    setConversiones(convMap)
    setShowConvModal(null)
    setConvForm({ um_destino: '', factor: '' })
    setSavingConv(false)
    toast.success('Conversión guardada')
  }

  // ── Excel upload ─────────────────────────────────────────────────────

  const parseNum = (v: any) => {
    if (v === undefined || v === null || v === '') return null
    const n = parseFloat(String(v).replace(/,/g, '.'))
    return isNaN(n) ? null : n
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (rows.length === 0) { toast.error('El archivo está vacío'); setUploading(false); return }
      setPreview(rows.slice(0, 5))
      setShowPreview(true)
      const { data: { session } } = await supabase.auth.getSession()
      const parseMoney = (v: any) => {
        if (!v) return null
        const n = parseFloat(String(v).replace(/[$,\s]/g, ''))
        return isNaN(n) ? null : n
      }
      const col = (r: any, ...keys: string[]) => {
        for (const key of keys) {
          if (r[key] !== undefined && r[key] !== '') return String(r[key]).trim()
          const found = Object.keys(r).find(k => k.trim() === key.trim())
          if (found && r[found] !== undefined && r[found] !== '') return String(r[found]).trim()
        }
        return ''
      }
      const inserts = rows.map(r => ({
        material:        col(r, 'Material', 'material'),
        descripcion:     col(r, 'Texto breve de material', 'Descripcion', 'descripcion') || null,
        sector:          col(r, 'Sector') || null,
        descr_sector:    col(r, 'Descr. Sector') || null,
        descr_grupo_art: col(r, 'Descr. Grupo de Art.') || null,
        grupo_articulos: col(r, 'Grupo de artículos', 'Grupo de articulos') || null,
        um:              col(r, 'UM', ' UM') || null,
        tipo_material:   col(r, 'Tipo de material') || null,
        costo:           parseMoney(col(r, 'Costo', ' Costo')),
        cajas_pallet:    parseNum(col(r, 'Cajas por Pallet')),
        piezas_umv_caja: parseNum(col(r, 'Piezas UMV por caja')),
        lista_02:        parseMoney(col(r, 'LISTA 02', ' LISTA 02')),
        lista_06:        parseMoney(col(r, 'LISTA 06', ' LISTA 06')),
        condicion:       col(r, 'Condicion', 'Condición') || null,
        activo:          true,
        created_by:      session?.user.id,
      })).filter(r => r.material)

      if (inserts.length === 0) { toast.error('No se encontraron materiales válidos'); setUploading(false); return }
      const { error } = await supabase.from('catalog_materials')
        .upsert(inserts, { onConflict: 'material,created_by', ignoreDuplicates: false })
      if (error) toast.error(error.message)
      else { toast.success(`${inserts.length} materiales cargados`); setShowPreview(false); load() }
    } catch { toast.error('Error al leer el archivo') }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ────────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Catálogo de materiales</h1>
          <p className="text-sm text-gray-400 mt-0.5">{materials.length} materiales</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <button onClick={() => { setNewForm({}); setShowNewModal(true) }}
                className="border border-teal-600 text-teal-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-50">
                + Nuevo material
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                {uploading ? 'Cargando...' : 'Subir Excel'}
              </button>
              <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFile} />
            </>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4 items-center">
        <input className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-teal-400"
          placeholder="Buscar por código o descripción..."
          value={search} onChange={e => setSearch(e.target.value)} />
        {canEdit && (
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Ver inactivos
          </label>
        )}
      </div>

      {/* Preview excel */}
      {showPreview && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-teal-700 mb-2">Preview (primeras 5 filas):</p>
          <div className="overflow-x-auto text-xs">
            <table className="w-full">
              <thead><tr className="border-b border-teal-200">
                {['Material','Descripción','UM','Costo','Lista 02','Lista 06'].map(h => (
                  <th key={h} className="text-left px-2 py-1 text-teal-600">{h}</th>
                ))}
              </tr></thead>
              <tbody>{preview.map((r, i) => (
                <tr key={i} className="border-b border-teal-100">
                  <td className="px-2 py-1 font-medium">{r['Material'] || r['material']}</td>
                  <td className="px-2 py-1">{r['Texto breve de material'] || r['Descripcion'] || ''}</td>
                  <td className="px-2 py-1">{r['UM'] || ''}</td>
                  <td className="px-2 py-1 text-right">{r['Costo'] || ''}</td>
                  <td className="px-2 py-1 text-right">{r['LISTA 02'] || ''}</td>
                  <td className="px-2 py-1 text-right">{r['LISTA 06'] || ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
        {!loading && materials.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">No hay materiales.</p>
          </div>
        )}
        {materials.length > 0 && (
          <div className="overflow-x-auto" style={{ maxHeight: '65vh' }}>
            <table className="text-xs border-collapse w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {['Material','Descripción','UM','Tipo','Sector','Costo','Lista 02','Lista 06','Condición','Conversiones'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                  ))}
                  {canEdit && <th className="px-3 py-2.5 border-b border-gray-200 text-gray-400 font-semibold text-center whitespace-nowrap">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {materials.map(m => {
                  const inactive = m.activo === false
                  const isEditing = editId === m.id
                  return (
                    <tr key={m.id} className={`border-b border-gray-100 ${inactive ? 'opacity-40' : 'hover:bg-gray-50'}`}>
                      {/* Material (nunca editable) */}
                      <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap font-mono">{m.material}</td>

                      {isEditing ? (
                        // ── fila en modo edición ──
                        <>
                          {CAMPOS_EDITABLES.map(c => (
                            <td key={c.key} className="px-1 py-1">
                              <input
                                type={c.type}
                                className="w-full border border-teal-300 rounded px-2 py-1 outline-none focus:border-teal-500 text-xs"
                                value={editForm[c.key] ?? ''}
                                onChange={e => setEditForm(f => ({ ...f, [c.key]: e.target.value }))}
                              />
                            </td>
                          ))}
                          <td className="px-2 py-1 whitespace-nowrap">
                            <div className="flex gap-1 flex-wrap items-center">
                              {(conversiones[m.material] ?? []).map((c: any) => (
                                <span key={c.id} className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-200">
                                  1 {c.um_origen} = {c.factor} {c.um_destino}
                                </span>
                              ))}
                            </div>
                          </td>
                        </>
                      ) : (
                        // ── fila normal ──
                        <>
                          <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{m.descripcion}</td>
                          <td className="px-3 py-2 text-gray-500">{m.um}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{m.tipo_material}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{m.descr_sector}</td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            {m.costo != null ? `$${Number(m.costo).toLocaleString('es-MX')}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            {m.lista_02 != null ? `$${Number(m.lista_02).toLocaleString('es-MX')}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            {m.lista_06 != null ? `$${Number(m.lista_06).toLocaleString('es-MX')}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{m.condicion}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex gap-1 flex-wrap items-center">
                              {(conversiones[m.material] ?? []).map((c: any) => (
                                <span key={c.id} className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-200">
                                  1 {c.um_origen} = {c.factor} {c.um_destino}
                                </span>
                              ))}
                              {canEdit && (
                                <button onClick={() => { setShowConvModal(m); setConvForm({ um_destino: '', factor: '' }) }}
                                  className="text-xs text-teal-600 hover:text-teal-800 border border-teal-200 px-2 py-0.5 rounded-full hover:bg-teal-50">
                                  + conv
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}

                      {/* Acciones */}
                      {canEdit && (
                        <td className="px-2 py-1 text-center whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => saveEdit(m)} disabled={savingEdit}
                                className="text-xs bg-teal-600 text-white px-2 py-1 rounded hover:bg-teal-700 disabled:opacity-50">
                                {savingEdit ? '...' : '✓ Guardar'}
                              </button>
                              <button onClick={() => setEditId(null)}
                                className="text-xs border border-gray-200 text-gray-500 px-2 py-1 rounded hover:bg-gray-50">
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => startEdit(m)}
                                title="Editar" className="text-gray-400 hover:text-teal-600 px-1 py-1">✏️</button>
                              <button onClick={() => openHistory(m.material)}
                                title="Historial" className="text-gray-400 hover:text-indigo-600 px-1 py-1">📋</button>
                              <button onClick={() => toggleActive(m)}
                                title={inactive ? 'Reactivar' : 'Desactivar'}
                                className={`px-1 py-1 ${inactive ? 'text-green-500 hover:text-green-700' : 'text-red-400 hover:text-red-600'}`}>
                                {inactive ? '✅' : '🚫'}
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

    {/* ── Modal: Nuevo material ─────────────────────────────────────────── */}
    {showNewModal && (
      <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
          <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-800">Nuevo material</h2>
            <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
          <div className="p-6 space-y-3 overflow-y-auto">
            {CAMPOS_NUEVO.map(c => (
              <div key={c.key}>
                <label className="text-xs text-gray-500 block mb-1">{c.label}</label>
                <input
                  type={c.type}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  value={newForm[c.key] ?? ''}
                  onChange={e => setNewForm(f => ({ ...f, [c.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between px-6 py-4 border-t border-gray-200">
            <button onClick={() => setShowNewModal(false)}
              className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">Cancelar</button>
            <button onClick={saveNew} disabled={savingNew}
              className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
              {savingNew ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Modal: Historial ──────────────────────────────────────────────── */}
    {showHistory && (
      <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-base font-bold text-gray-800">Historial de cambios</h2>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{showHistory}</p>
            </div>
            <button onClick={() => setShowHistory(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
          <div className="overflow-y-auto flex-1">
            {loadingHistory && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
            {!loadingHistory && historyData.length === 0 && (
              <p className="text-sm text-gray-400 p-6 text-center">Sin cambios registrados.</p>
            )}
            {historyData.map((h, i) => (
              <div key={i} className="px-6 py-3 border-b border-gray-100 last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{h.campo}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(h.changed_at).toLocaleString('es-MX')} · {h.auth_user?.email ?? 'Desconocido'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-red-500 line-through">{h.valor_anterior ?? '(vacío)'}</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-green-600 font-medium">{h.valor_nuevo ?? '(vacío)'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* ── Modal: Conversión ─────────────────────────────────────────────── */}
    {showConvModal && (
      <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-sm">
          <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-800">Agregar conversión</h2>
            <button onClick={() => setShowConvModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="font-mono font-semibold text-gray-800">{showConvModal.material}</p>
              <p className="text-gray-500 text-xs mt-0.5">{showConvModal.descripcion}</p>
              <p className="text-gray-500 text-xs mt-1">UM base: <strong>{showConvModal.um}</strong></p>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-2">
                1 <strong>{showConvModal.um}</strong> equivale a:
              </label>
              <div className="flex gap-2 items-center">
                <input type="number"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  placeholder="Cantidad (ej: 20)"
                  value={convForm.factor} onChange={e => setConvForm(x => ({ ...x, factor: e.target.value }))} />
                <input
                  className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 uppercase"
                  placeholder="UM (ej: PI)"
                  value={convForm.um_destino} onChange={e => setConvForm(x => ({ ...x, um_destino: e.target.value }))} />
              </div>
              {convForm.factor && convForm.um_destino && (
                <p className="text-xs text-teal-600 mt-2 font-medium">
                  1 {showConvModal.um} = {convForm.factor} {convForm.um_destino.toUpperCase()}
                </p>
              )}
            </div>
            {(conversiones[showConvModal.material] ?? []).length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Existentes:</p>
                <div className="flex gap-1 flex-wrap">
                  {(conversiones[showConvModal.material] ?? []).map((c: any) => (
                    <span key={c.id} className="text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded-full border border-teal-200">
                      1 {c.um_origen} = {c.factor} {c.um_destino}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <button onClick={() => setShowConvModal(null)}
                className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">Cancelar</button>
              <button onClick={guardarConversion} disabled={savingConv || !convForm.factor || !convForm.um_destino}
                className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                {savingConv ? 'Guardando...' : 'Guardar conversión'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
