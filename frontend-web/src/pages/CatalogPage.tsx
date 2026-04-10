import { useEffect, useRef, useState } from 'react'
import { supabase, getCachedUser } from '../lib/supabase'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

export default function CatalogPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [materials, setMaterials] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [conversiones, setConversiones] = useState<Record<string, any[]>>({})
  const [showConvModal, setShowConvModal] = useState<any>(null)
  const [convForm, setConvForm] = useState({ um_destino: '', factor: '' })
  const [savingConv, setSavingConv] = useState(false)
  const [preview, setPreview] = useState<any[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [isTeamMember, setIsTeamMember] = useState(false)

  const TEAM_IDS = [
    'd8c13368-736a-480b-ba9a-4145a308934b',
    '9a38602f-7bcd-4c9b-b7bc-7c1c119cca5f',
  ]

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsTeamMember(TEAM_IDS.includes(data.user?.id ?? ''))
    })
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    let q = supabase.from('catalog_materials').select('*').order('material')
    // Cargar conversiones
    const { data: convData } = await supabase.from('catalog_conversiones').select('*')
    const convMap: Record<string, any[]> = {}
    ;(convData ?? []).forEach((c: any) => {
      if (!convMap[c.material]) convMap[c.material] = []
      convMap[c.material].push(c)
    })
    setConversiones(convMap)
    if (search) q = q.or(`material.ilike.%${search}%,descripcion.ilike.%${search}%`)
    const { data } = await q
    setMaterials(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [search])

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

      const user = await getCachedUser()

      // Helper para limpiar valor monetario: " $1.14 " → 1.14
      const parseMoney = (v: any) => {
        if (v === undefined || v === null || v === '') return null
        const n = parseFloat(String(v).replace(/[$,\s]/g, ''))
        return isNaN(n) ? null : n
      }

      // Helper para obtener valor de columna ignorando espacios en el encabezado
      const col = (r: any, ...keys: string[]) => {
        for (const key of keys) {
          // Busca exacto primero
          if (r[key] !== undefined && r[key] !== '') return String(r[key]).trim()
          // Busca ignorando espacios al inicio/fin
          const found = Object.keys(r).find(k => k.trim() === key.trim())
          if (found && r[found] !== undefined && r[found] !== '') return String(r[found]).trim()
        }
        return ''
      }

      const inserts = rows.map(r => ({
        material:        col(r, 'Material', 'material'),
        descripcion:     col(r, 'Texto breve de material', 'Descripcion', 'descripcion', 'Material y Descripcion') || null,
        sector:          col(r, 'Sector') || null,
        descr_sector:    col(r, 'Descr. Sector') || null,
        descr_grupo_art: col(r, 'Descr. Grupo de Art.') || null,
        grupo_articulos: col(r, 'Grupo de artículos', 'Grupo de articulos') || null,
        um:              col(r, 'UM', ' UM') || null,
        tipo_material:   col(r, 'Tipo de material') || null,
        costo:           parseMoney(col(r, 'Costo', ' Costo')),
        cajas_pallet:    parseNum(col(r, 'Cajas por Pallet')),
        piezas_umv_caja: parseNum(col(r, 'Piezas UMV por caja')),
        piezas_pallet:   parseNum(col(r, 'Piezas (UM) Por pallet')),
        cajas_cama:      parseNum(col(r, 'Cajas x cama')),
        camas_tarima:    parseNum(col(r, 'Camas por tarima')),
        altura_m:        parseNum(col(r, 'Altura (M)')),
        lista_02:        parseMoney(col(r, 'LISTA 02', ' LISTA 02')),
        lista_06:        parseMoney(col(r, 'LISTA 06', ' LISTA 06')),
        condicion:       col(r, 'Condicion', 'Condición', ' Condicion') || null,
        created_by:      user?.id,
      })).filter(r => r.material)

      if (inserts.length === 0) { toast.error('No se encontraron materiales válidos'); setUploading(false); return }

      // Upsert por material+created_by
      const { error } = await supabase.from('catalog_materials')
        .upsert(inserts, { onConflict: 'material,created_by', ignoreDuplicates: false })

      if (error) { toast.error(error.message) }
      else {
        toast.success(`${inserts.length} materiales cargados/actualizados`)
        setShowPreview(false)
        load()
      }
    } catch (err) {
      toast.error('Error al leer el archivo')
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

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
    // Recargar conversiones
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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Catálogo de materiales</h1>
          <p className="text-sm text-gray-400 mt-0.5">{materials.length} materiales · visible para todos los usuarios</p>
        </div>
        {isTeamMember && (
          <div>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {uploading ? 'Cargando...' : 'Subir / Actualizar Excel'}
            </button>
            <input ref={fileRef} type="file" className="hidden"
              accept=".xlsx,.xls" onChange={handleFile} />
          </div>
        )}
      </div>

      {showPreview && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-teal-700 mb-2">
            Preview (primeras 5 filas detectadas):
          </p>
          <div className="overflow-x-auto text-xs">
            <table className="w-full">
              <thead>
                <tr className="border-b border-teal-200">
                  <th className="text-left px-2 py-1 text-teal-600">Material</th>
                  <th className="text-left px-2 py-1 text-teal-600">Descripción</th>
                  <th className="text-left px-2 py-1 text-teal-600">UM</th>
                  <th className="text-right px-2 py-1 text-teal-600">Costo</th>
                  <th className="text-right px-2 py-1 text-teal-600">Lista 02</th>
                  <th className="text-right px-2 py-1 text-teal-600">Lista 06</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-b border-teal-100">
                    <td className="px-2 py-1 font-medium">{r['Material'] || r['material']}</td>
                    <td className="px-2 py-1">{r['Texto breve de material'] || r['Descripcion'] || ''}</td>
                    <td className="px-2 py-1">{r['UM'] || ''}</td>
                    <td className="px-2 py-1 text-right">{r['Costo'] || ''}</td>
                    <td className="px-2 py-1 text-right">{r['LISTA 02'] || ''}</td>
                    <td className="px-2 py-1 text-right">{r['LISTA 06'] || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <input className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm mb-4 outline-none focus:border-teal-400"
        placeholder="Buscar por código o descripción..."
        value={search} onChange={e => setSearch(e.target.value)} />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
        {!loading && materials.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm mb-3">No hay materiales en el catálogo.</p>
            {isTeamMember && <p className="text-xs text-gray-300">Sube un archivo Excel para comenzar.</p>}
          </div>
        )}
        {materials.length > 0 && (
          <div className="overflow-x-auto" style={{ maxHeight: '65vh' }}>
            <table className="text-xs border-collapse w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Material','Descripción','UM','Tipo','Sector','Costo','Lista 02','Lista 06','Condición','Conversiones'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {materials.map(m => (
                  <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{m.material}</td>
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
                        <button onClick={() => { setShowConvModal(m); setConvForm({ um_destino: '', factor: '' }) }}
                          className="text-xs text-teal-600 hover:text-teal-800 border border-teal-200 px-2 py-0.5 rounded-full hover:bg-teal-50">
                          + conv
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

    {/* Modal conversión */}
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
                <input type="number" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  placeholder="Cantidad (ej: 20)"
                  value={convForm.factor} onChange={e => setConvForm(x => ({ ...x, factor: e.target.value }))} />
                <input className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 uppercase"
                  placeholder="UM (ej: PI)"
                  value={convForm.um_destino} onChange={e => setConvForm(x => ({ ...x, um_destino: e.target.value }))} />
              </div>
              {convForm.factor && convForm.um_destino && (
                <p className="text-xs text-teal-600 mt-2 font-medium">
                  1 {showConvModal.um} = {convForm.factor} {convForm.um_destino.toUpperCase()}
                </p>
              )}
            </div>
            {/* Conversiones existentes */}
            {(conversiones[showConvModal.material] ?? []).length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Conversiones existentes:</p>
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
  )
}
