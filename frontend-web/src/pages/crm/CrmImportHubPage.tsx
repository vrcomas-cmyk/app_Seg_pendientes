import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'
import { parseCSVText, readFileAsText } from '../../utils/parseCSV'
import toast from 'react-hot-toast'
import CrmSuggestionsImportPage from './CrmSuggestionsImportPage'

type Tab = 'sugerencias' | 'inventario' | 'deliveries'

function parseDate(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().split('T')[0]
  const s = String(v).trim()
  if (!s) return null
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  const num = parseFloat(s)
  if (!isNaN(num) && num > 1000)
    return new Date((num - 25569) * 86400000).toISOString().split('T')[0]
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

function parseNum(v: any): number | null {
  if (v === undefined || v === null || v === '') return null
  const s = String(v).trim()
  if (s === '-' || s === 'nan' || s === 'NaN') return null
  const n = parseFloat(s.replace(/[$,\s]/g,''))
  return isNaN(n) ? null : n
}

// Get column by name (case-insensitive, trim-safe)
function col(row: any, ...keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.trim().toLowerCase())
    if (found !== undefined && row[found] !== undefined && row[found] !== '')
      return String(row[found]).trim()
  }
  return ''
}

// Get column by position (for SAP file with duplicated headers)
// ── HUB ──────────────────────────────────────────────────────────────────────
export default function CrmImportHubPage() {
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('sugerencias')

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => nav('/crm/pipeline')}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Volver a Pipeline
      </button>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Importar archivos SAP</h1>
      <p className="text-sm text-gray-500 mb-4">
        Sube los archivos descargados de SAP para alimentar el CRM.
      </p>

      <div className="flex bg-white rounded-xl border border-gray-200 overflow-hidden mb-4 w-fit">
        {([
          { k: 'sugerencias', label: '📊 Sugerencias / Consumo' },
          { k: 'inventario',  label: '📦 Inventario' },
          { k: 'deliveries',  label: '🚚 Deliveries SAP' },
        ] as const).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-5 py-2.5 text-sm font-medium transition ${
              tab === t.k ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sugerencias' && (
        <div className="bg-white rounded-xl border border-gray-200 p-1">
          {/* Reutiliza la página existente */}
          <CrmSuggestionsImportPage />
        </div>
      )}
      {tab === 'inventario'  && <InventarioImport />}
      {tab === 'deliveries'  && <DeliveriesImport />}
    </div>
  )
}

// ── INVENTARIO (2 archivos separados) ────────────────────────────────────────
function InventarioImport() {
  return (
    <div className="space-y-4">
      <InventarioGeneralCard />
      <CortaCaducidadCard />
    </div>
  )
}

// ── Card 1: Inventario general ───────────────────────────────────────────────
function InventarioGeneralCard() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [count, setCount] = useState<{ inserted: number; deleted: number } | null>(null)

  const handleFile = async (file: File) => {
    setLoading(true)
    setProgress('Leyendo archivo...')
    setCount(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })

      // Busca hoja "sheets1" o la primera disponible
      const hoja = wb.SheetNames.find(s => s.trim().toLowerCase() === 'sheets1') ?? wb.SheetNames[0]
      if (!hoja) {
        toast.error('No se encontró ninguna hoja en el archivo.')
        setLoading(false); return
      }

      setProgress(`Procesando hoja "${hoja}"...`)
      const ws = wb.Sheets[hoja]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]

      const allRows: any[] = []
      for (const r of rows) {
        const material = col(r, 'Material')
        if (!material) continue

        const libre    = parseNum(col(r, 'Libre Utilización', 'Libre Utilizacion', 'Libre utilizacion', 'Libre utilización')) ?? 0
        const entrega  = parseNum(col(r, 'Entrega a cliente', 'Entrega cliente')) ?? 0
        const calc_disp = libre - entrega

        allRows.push({
          material,
          descripcion:       col(r, 'Descripción', 'Descripcion') || null,
          centro:            col(r, 'Centro') || null,
          almacen:           col(r, 'Almacén', 'Almacen') || null,
          um:                col(r, 'UM', 'Un.medida', 'Unidad medida base') || null,
          libre_utilizacion: libre,
          entrega_cliente:   entrega,
          cant_transito:     parseNum(col(r, 'Cant. en Tránsito', 'Cant. en Transito', 'Cantidad en Transito')),
          ped_pendientes:    parseNum(col(r, 'Ped. Pendientes', 'Pedidos Pendientes')),
          disponibilidad:    parseNum(col(r, 'Disponibilidad')),
          tipo_mat:          col(r, 'Tipo Mat.', 'Tipo material') || null,
          cto_suminis:       col(r, 'Cto. Suminis.', 'Centro Suministro') || null,
          stock_seguridad:   parseNum(col(r, 'Stock de Seguridad', 'Stock Seguridad')),
          pct_disp_vs_stock: parseNum(col(r, '%Disp.VS Stock de Se', '%Disp.VS Stock de Seg', '% Disp VS Stock')),
          disponible:        calc_disp,
          fuente:            'general',
        })
      }

      if (allRows.length === 0) {
        toast.error('No se encontraron filas válidas en el archivo.')
        setLoading(false); return
      }

      // Reemplazar SOLO registros con fuente='general'
      setProgress('Eliminando inventario general anterior...')
      let deleted = 0
      while (true) {
        const { data: chunk } = await supabase.from('crm_inventory')
          .select('id').eq('fuente', 'general').limit(500)
        if (!chunk || chunk.length === 0) break
        await supabase.from('crm_inventory').delete().in('id', chunk.map(r => r.id))
        deleted += chunk.length
        setProgress(`Eliminando anteriores... ${deleted}`)
      }
      await new Promise(r => setTimeout(r, 600))

      const BATCH = 300
      let inserted = 0
      for (let i = 0; i < allRows.length; i += BATCH) {
        setProgress(`Insertando... ${Math.min(i + BATCH, allRows.length)} / ${allRows.length}`)
        const { error } = await supabase.from('crm_inventory').insert(allRows.slice(i, i + BATCH))
        if (error) { toast.error(error.message); setLoading(false); return }
        inserted += Math.min(BATCH, allRows.length - i)
        if (i + BATCH < allRows.length) await new Promise(r => setTimeout(r, 200))
      }

      setCount({ inserted, deleted })
      setProgress('')
      toast.success(`${inserted} filas de inventario general cargadas`)
    } catch (e: any) {
      toast.error('Error: ' + (e?.message ?? ''))
      console.error(e)
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h2 className="font-semibold text-gray-800">📦 Inventario general</h2>
          <p className="text-sm text-gray-500 mt-1">
            Archivo con pestaña <strong>sheets1</strong> (o la primera hoja). Reemplaza el inventario general en cada carga.
          </p>
        </div>
        {count && (
          <span className="bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap">
            ✅ {count.inserted} filas
          </span>
        )}
      </div>
      {progress && (
        <div className="mb-3 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2">
          <p className="text-xs text-teal-700 font-medium">{progress}</p>
        </div>
      )}
      <button onClick={() => inputRef.current?.click()} disabled={loading}
        className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
        {loading ? 'Procesando...' : 'Subir inventario'}
      </button>
      <input ref={inputRef} type="file" className="hidden" accept=".xlsx,.xls"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          if (inputRef.current) inputRef.current.value = ''
        }} />
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p><strong>Columnas esperadas:</strong> Centro · Almacén · Material · Descripción · UM · Libre Utilización · Entrega a cliente · Cant. en Tránsito</p>
        <p><strong>Cálculo:</strong> <code className="bg-gray-100 px-1 rounded">Disponible = Libre Utilización − Entrega a cliente</code></p>
      </div>
    </div>
  )
}

// ── Card 2: Corta caducidad (desglose de lotes) ──────────────────────────────
function CortaCaducidadCard() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [count, setCount] = useState<{ inserted: number; deleted: number } | null>(null)

  const handleFile = async (file: File) => {
    setLoading(true)
    setProgress('Leyendo archivo...')
    setCount(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })

      // Buscar específicamente hoja "Corta caducidad"
      const hojaCC = wb.SheetNames.find(s => {
        const n = s.trim().toLowerCase()
        return n.includes('corta') && n.includes('caducidad')
      })

      if (!hojaCC) {
        toast.error(`No se encontró hoja "Corta caducidad". Hojas disponibles: ${wb.SheetNames.join(', ')}`)
        setLoading(false); return
      }

      setProgress(`Procesando hoja "${hojaCC}"...`)
      const ws = wb.Sheets[hojaCC]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]

      const allRows: any[] = []
      for (const r of rows) {
        const material = col(r, 'Material')
        if (!material) continue
        allRows.push({
          material,
          descripcion:         col(r, 'Texto breve de material', 'Descripción', 'Descripcion') || null,
          centro:              col(r, 'Centro') || null,
          almacen:             col(r, 'Almacén', 'Almacen') || null,
          lote:                col(r, 'Lote') || null,
          fecha_caducidad:     parseDate(col(r, 'FeCaduc/FePreferCons', 'Fecha de Caducidad', 'Fecha Caducidad', 'FeCaduc', 'FePreferCons')),
          disponible:          parseNum(col(r, 'Libre utilización', 'Libre utilizacion', 'Disponible', 'CantidadDisp')),
          libre_utilizacion:   parseNum(col(r, 'Libre utilización', 'Libre utilizacion')),
          um:                  col(r, 'Unidad medida base', 'UM') || null,
          meses_vigencia_lote: parseNum(col(r, 'Meses vigencia lote')),
          tipo_mat:            col(r, 'Tipo material', 'Tipo Mat.') || null,
          raw_data: {
            'Trans./Trasl.':         col(r, 'Trans./Trasl.', 'Trans. Trasl.') || null,
            'Bloqueado':             col(r, 'Bloqueado') || null,
            'Sector':                col(r, 'Sector') || null,
            'Descr. Sector':         col(r, 'Descr. Sector') || null,
            'Grupo de artículos':    col(r, 'Grupo de artículos', 'Grupo de articulos') || null,
            'Descr. Grupo de Art.':  col(r, 'Descr. Grupo de Art.') || null,
          },
          fuente: 'corta_caducidad',
        })
      }

      if (allRows.length === 0) {
        toast.error('No se encontraron filas válidas en la hoja Corta caducidad.')
        setLoading(false); return
      }

      // Reemplazar SOLO registros con fuente='corta_caducidad'
      setProgress('Eliminando corta caducidad anterior...')
      let deleted = 0
      while (true) {
        const { data: chunk } = await supabase.from('crm_inventory')
          .select('id').eq('fuente', 'corta_caducidad').limit(500)
        if (!chunk || chunk.length === 0) break
        await supabase.from('crm_inventory').delete().in('id', chunk.map(r => r.id))
        deleted += chunk.length
        setProgress(`Eliminando anteriores... ${deleted}`)
      }
      await new Promise(r => setTimeout(r, 600))

      const BATCH = 300
      let inserted = 0
      for (let i = 0; i < allRows.length; i += BATCH) {
        setProgress(`Insertando... ${Math.min(i + BATCH, allRows.length)} / ${allRows.length}`)
        const { error } = await supabase.from('crm_inventory').insert(allRows.slice(i, i + BATCH))
        if (error) { toast.error(error.message); setLoading(false); return }
        inserted += Math.min(BATCH, allRows.length - i)
        if (i + BATCH < allRows.length) await new Promise(r => setTimeout(r, 200))
      }

      setCount({ inserted, deleted })
      setProgress('')
      toast.success(`${inserted} lotes de corta caducidad cargados`)
    } catch (e: any) {
      toast.error('Error: ' + (e?.message ?? ''))
      console.error(e)
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h2 className="font-semibold text-gray-800">⏳ Corta caducidad (lotes)</h2>
          <p className="text-sm text-gray-500 mt-1">
            Archivo con varias pestañas: se extrae automáticamente la hoja <strong>Corta caducidad</strong>
            con el desglose por material, lote, caducidad y almacén.
          </p>
        </div>
        {count && (
          <span className="bg-amber-100 text-amber-700 text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap">
            ⏳ {count.inserted} lotes
          </span>
        )}
      </div>
      {progress && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          <p className="text-xs text-amber-700 font-medium">{progress}</p>
        </div>
      )}
      <button onClick={() => inputRef.current?.click()} disabled={loading}
        className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50">
        {loading ? 'Procesando...' : 'Subir corta caducidad'}
      </button>
      <input ref={inputRef} type="file" className="hidden" accept=".xlsx,.xls"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          if (inputRef.current) inputRef.current.value = ''
        }} />
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p><strong>Columnas esperadas:</strong> Material · Lote · Fecha de Caducidad · Centro · Almacén · Disponible · Meses vigencia lote</p>
      </div>
    </div>
  )
}

// ── DELIVERIES SAP ───────────────────────────────────────────────────────────
function DeliveriesImport() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<{
    inserted: number; updated: number; skipped: number
    itemsMatched: number; itemsFacturados: number
  } | null>(null)

  const handleFile = async (file: File) => {
    setLoading(true)
    setProgress('Leyendo archivo...')
    setResult(null)
    try {
      const isCSV = file.name.toLowerCase().endsWith('.csv')
      let rawData: any[][] = []

      if (isCSV) {
        const text = await readFileAsText(file)
        const parsed = parseCSVText(text)
        // Convert parsed to array-of-arrays by reading headers
        if (parsed.length === 0) { toast.error('Archivo vacío'); setLoading(false); return }
        const keys = Object.keys(parsed[0])
        rawData = [keys, ...parsed.map(r => keys.map(k => r[k]))]
      } else {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as any[][]
      }

      if (rawData.length < 2) { toast.error('Archivo sin datos'); setLoading(false); return }

      // First row is headers. The SAP file has duplicated column names — we access by INDEX.
      const headers = rawData[0].map((h: any) => String(h ?? '').trim())
      const dataRows = rawData.slice(1).filter(r => r.some((c: any) => c !== '' && c != null))

      setProgress(`${dataRows.length} filas detectadas, procesando...`)

      // Column indexes based on Doc_Flujo.XLSX exact structure
      // Headers: Organización ventas, Canal distribución, Solicitante, Clase doc.ventas,
      //   Documento de ventas, Posición, Creado el, Hora, Material, Denominación,
      //   Cantidad de pedido, Un.medida venta, Valor neto, Moneda, Centro,
      //   Motivo de rechazo, Bloqueo entrega, Entrega, Posición, Cantidad,
      //   Creado el, Hora, Grupo artículos, Grupo vendedores, Oficina ventas,
      //   Lib.Precio, Hora, No., Lib.Crédito, Hora, Fec. Enlace, Hora,
      //   Doc.facturación, Creado el, Hora, Creado el, Días, Destinatario, Nombre,
      //   Grupo clientes, Nombre, No. Pedido Cliente, Fecha Transporte,
      //   Status Global Picking, Fecha Cita
      const IDX = {
        solicitante:       2,
        numero_pedido:     4,
        posicion_pedido:   5,
        material:          8,
        descripcion:       9,
        cantidad_pedido:  10,
        um:               11,
        centro:           14,
        motivo_rechazo:   15,
        bloqueo_entrega:  16,
        folio_entrega:    17,
        cantidad_entrega: 19,
        fecha_entrega:    20,   // Creado el (de entrega)
        numero_factura:   32,
        fecha_factura:    33,   // Creado el (de factura)
        destinatario:     37,
        razon_social:     38,
        status_picking:   43,
        fecha_cita:       44,
      }

      const toStr = (v: any) => (v === undefined || v === null) ? '' : String(v).trim()

      const inserts: any[] = []
      for (const r of dataRows) {
        const numero_pedido = toStr(r[IDX.numero_pedido])
        const material = toStr(r[IDX.material])
        if (!numero_pedido || !material) continue

        inserts.push({
          numero_pedido,
          posicion_pedido: toStr(r[IDX.posicion_pedido]) || null,
          material,
          descripcion: toStr(r[IDX.descripcion]) || null,
          cantidad_pedido: parseNum(r[IDX.cantidad_pedido]),
          um: toStr(r[IDX.um]) || null,
          centro: toStr(r[IDX.centro]) || null,
          motivo_rechazo: toStr(r[IDX.motivo_rechazo]) || null,
          bloqueo_entrega: toStr(r[IDX.bloqueo_entrega]) || null,
          folio_entrega: toStr(r[IDX.folio_entrega]) || null,
          cantidad_entrega: parseNum(r[IDX.cantidad_entrega]),
          fecha_entrega: parseDate(r[IDX.fecha_entrega]),
          numero_factura: toStr(r[IDX.numero_factura]) || null,
          fecha_factura: parseDate(r[IDX.fecha_factura]),
          solicitante: toStr(r[IDX.solicitante]) || null,
          destinatario: toStr(r[IDX.destinatario]) || null,
          razon_social: toStr(r[IDX.razon_social]) || null,
          status_picking: toStr(r[IDX.status_picking]) || null,
          fecha_cita: parseDate(r[IDX.fecha_cita]),
        })
      }

      if (inserts.length === 0) { toast.error('Sin filas válidas (necesitan pedido y material)'); setLoading(false); return }

      // Upsert por (numero_pedido, posicion_pedido, folio_entrega)
      setProgress(`Subiendo ${inserts.length} registros...`)
      const BATCH = 200
      let upserted = 0
      for (let i = 0; i < inserts.length; i += BATCH) {
        setProgress(`Subiendo... ${Math.min(i + BATCH, inserts.length)} / ${inserts.length}`)
        const { error } = await supabase
          .from('crm_sap_deliveries')
          .upsert(inserts.slice(i, i + BATCH), {
            onConflict: 'numero_pedido,posicion_pedido,folio_entrega',
            ignoreDuplicates: false,
          })
        if (error) { toast.error(error.message); console.error(error); setLoading(false); return }
        upserted += Math.min(BATCH, inserts.length - i)
        if (i + BATCH < inserts.length) await new Promise(r => setTimeout(r, 250))
      }

      // ─ Cross-update: match con crm_offer_items por numero_pedido + material ─
      setProgress('Cruzando con items del Pipeline...')

      // Build a map of deliveries: key `${pedido}|${material}` → latest delivery
      const deliveryMap = new Map<string, any>()
      inserts.forEach(d => {
        const key = `${d.numero_pedido}|${d.material}`
        const existing = deliveryMap.get(key)
        // Keep the one with factura if available, otherwise the one with most info
        if (!existing) { deliveryMap.set(key, d); return }
        if (d.numero_factura && !existing.numero_factura) { deliveryMap.set(key, d); return }
        if (d.folio_entrega && !existing.folio_entrega) deliveryMap.set(key, d)
      })

      // Fetch items with matching (numero_pedido, material)
      const pedidos = [...new Set(inserts.map(d => d.numero_pedido).filter(Boolean))]
      let itemsMatched = 0
      let itemsFacturados = 0

      if (pedidos.length > 0) {
        // Query in chunks to avoid URL length limits
        const CHUNK = 50
        for (let i = 0; i < pedidos.length; i += CHUNK) {
          const slice = pedidos.slice(i, i + CHUNK)
          const { data: items } = await supabase
            .from('crm_offer_items')
            .select('id, offer_id, numero_pedido, material, folio_entrega_salida, numero_factura, estatus')
            .in('numero_pedido', slice)

          if (!items || items.length === 0) continue

          for (const item of items) {
            const key = `${item.numero_pedido}|${item.material}`
            const delivery = deliveryMap.get(key)
            if (!delivery) continue

            const updates: any = {}
            if (delivery.folio_entrega && delivery.folio_entrega !== item.folio_entrega_salida) {
              updates.folio_entrega_salida = delivery.folio_entrega
              updates.fecha_entrega_salida = delivery.fecha_entrega
            }
            if (delivery.numero_factura && delivery.numero_factura !== item.numero_factura) {
              updates.numero_factura = delivery.numero_factura
              updates.fecha_factura = delivery.fecha_factura
              updates.estatus = 'facturado'
              itemsFacturados++
            }
            if (Object.keys(updates).length > 0) {
              await supabase.from('crm_offer_items').update(updates).eq('id', item.id)
              itemsMatched++
            }
          }
        }
      }

      // Auto-mark facturado offers
      if (itemsFacturados > 0) {
        // For each offer where all items are facturado, update etapa
        const { data: offersWithBilled } = await supabase
          .from('crm_offers')
          .select('id, crm_offer_items(estatus, aceptado)')
          .eq('etapa', 'venta') // only currently in venta stage
        
        if (offersWithBilled) {
          for (const offer of offersWithBilled) {
            const items = (offer as any).crm_offer_items ?? []
            const activeItems = items.filter((i: any) => i.aceptado !== false)
            if (activeItems.length === 0) continue
            const allFacturado = activeItems.every((i: any) => i.estatus === 'facturado')
            if (allFacturado) {
              await supabase.from('crm_offers')
                .update({ etapa: 'facturado', estatus: 'cerrada' })
                .eq('id', offer.id)
            }
          }
        }
      }

      setResult({
        inserted: upserted, updated: 0, skipped: 0,
        itemsMatched, itemsFacturados,
      })
      setProgress('')
      toast.success(`${upserted} deliveries · ${itemsMatched} items actualizados · ${itemsFacturados} facturaciones detectadas`)
    } catch (e: any) {
      toast.error('Error: ' + (e?.message ?? ''))
      console.error(e)
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h2 className="font-semibold text-gray-800">Deliveries / Facturación SAP</h2>
          <p className="text-sm text-gray-500 mt-1">
            Sube el reporte de entregas de salida y facturación. Se puede subir varias veces al día —
            las nuevas entregas se agregan y las existentes se actualizan. <br />
            Al subir, <strong>se cruza automáticamente</strong> con los items del Pipeline por
            <code className="bg-gray-100 px-1 mx-1 rounded">pedido + material</code>.
          </p>
        </div>
      </div>

      {result && (
        <div className="mb-4 space-y-1.5">
          <div className="flex gap-2 flex-wrap">
            <span className="bg-blue-100 text-blue-700 text-xs px-3 py-1.5 rounded-full font-medium">
              🚚 {result.inserted} deliveries subidos
            </span>
            <span className="bg-teal-100 text-teal-700 text-xs px-3 py-1.5 rounded-full font-medium">
              🔗 {result.itemsMatched} items actualizados
            </span>
            {result.itemsFacturados > 0 && (
              <span className="bg-green-100 text-green-700 text-xs px-3 py-1.5 rounded-full font-medium">
                ✅ {result.itemsFacturados} facturaciones aplicadas
              </span>
            )}
          </div>
        </div>
      )}

      {progress && (
        <div className="mb-3 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2">
          <p className="text-xs text-teal-700 font-medium">{progress}</p>
        </div>
      )}

      <button onClick={() => inputRef.current?.click()} disabled={loading}
        className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
        {loading ? 'Procesando...' : 'Subir reporte SAP'}
      </button>
      <input ref={inputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          if (inputRef.current) inputRef.current.value = ''
        }} />
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p><strong>Formato esperado:</strong> reporte de "Documentos de ventas con flujo" con columnas:
          Documento de ventas, Material, Entrega, Doc.facturación, etc. (45 columnas).</p>
        <p><strong>Clave de cruce:</strong> Documento de ventas (Pedido) + Material → busca en Pipeline
          los items con <code>numero_pedido</code> y <code>material</code> coincidentes.</p>
      </div>
    </div>
  )
}
