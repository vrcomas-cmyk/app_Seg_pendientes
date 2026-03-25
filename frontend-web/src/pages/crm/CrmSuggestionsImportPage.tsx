import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

type FileType = 'suggestions' | 'consumption'

function parseDate(v: any): string | null {
  if (!v) return null
  const s = String(v).trim()
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  const num = parseFloat(s)
  if (!isNaN(num) && num > 1000) {
    return new Date((num - 25569) * 86400000).toISOString().split('T')[0]
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

function parseNum(v: any): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = parseFloat(String(v).replace(/[$,\s]/g, '').replace(/,/g, '.'))
  return isNaN(n) ? null : n
}

function col(row: any, ...keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find(rk => rk.trim() === k.trim())
    if (found !== undefined && row[found] !== undefined && row[found] !== '')
      return String(row[found]).trim()
  }
  return ''
}

export default function CrmSuggestionsImportPage() {
  const nav = useNavigate()
  const ref1 = useRef<HTMLInputElement>(null)
  const ref2 = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState<FileType | null>(null)
  const [counts, setCounts] = useState<Record<FileType, number | null>>({ suggestions: null, consumption: null })

  const handleFile = async (file: File, type: FileType) => {
    setLoading(type)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!rows.length) { toast.error('El archivo está vacío'); setLoading(null); return }

      const { data: { user } } = await supabase.auth.getUser()

      // Borrar registros anteriores del mismo usuario para hacer reemplazo completo
      await supabase.from(type === 'suggestions' ? 'crm_suggestions' : 'crm_consumption')
        .delete().eq('created_by', user?.id)

      // Buscar clientes para vincular por solicitante
      const { data: clients } = await supabase.from('crm_clients')
        .select('id, solicitante').eq('created_by', user?.id)
      const clientMap: Record<string, string> = {}
      clients?.forEach(c => { clientMap[c.solicitante] = c.id })

      let inserts: any[] = []

      if (type === 'suggestions') {
        inserts = rows.map(r => ({
          gpo_cliente:            col(r,'Gpo. Cte.','Gpo.Cte') || null,
          fecha:                  parseDate(col(r,'Fecha')),
          pedido:                 col(r,'Pedido') || null,
          gpo_vendedor:           col(r,'Gpo.Vdor.','Gpo. Vdor.') || null,
          solicitante:            col(r,'Solicitante') || null,
          destinatario:           col(r,'Destinatario') || null,
          razon_social:           col(r,'Razón Social','Razon Social') || null,
          centro_pedido:          col(r,'Centro pedido') || null,
          almacen:                col(r,'Almacén','Almacen') || null,
          material_solicitado:    col(r,'Material solicitado') || null,
          material_base:          col(r,'Material base') || null,
          descripcion_solicitada: col(r,'Descripción solicitada','Descripcion solicitada') || null,
          cantidad_pedido:        parseNum(col(r,'Cantidad pedido')),
          cantidad_pendiente:     parseNum(col(r,'Cantidad pendiente')),
          cantidad_ofertar:       parseNum(col(r,'Cantidad a Ofertar')),
          precio:                 parseNum(col(r,'Precio')),
          consumo_promedio:       parseNum(col(r,'Consumo promedio (Destinatario/Material)','Consumo promedio')),
          fuente:                 col(r,'Fuente') || null,
          material_sugerido:      col(r,'Material sugerido') || null,
          descripcion_sugerida:   col(r,'Descripción sugerida','Descripcion sugerida') || null,
          centro_sugerido:        col(r,'Centro sugerido') || null,
          almacen_sugerido:       col(r,'Almacén sugerido','Almacen sugerido') || null,
          disponible:             parseNum(col(r,'Disponible')),
          lote:                   col(r,'Lote') || null,
          fecha_caducidad:        parseDate(col(r,'Fecha de Caducidad','Fecha Caducidad')),
          centro_inv:             col(r,'Centro (Inv)') || null,
          inv_1030:               parseNum(col(r,'Inv 1030')),
          inv_1031:               parseNum(col(r,'Inv 1031')),
          inv_1032:               parseNum(col(r,'Inv 1032')),
          inv_1060:               parseNum(col(r,'Inv 1060')),
          meses_inventario:       parseNum(col(r,'Meses_Inventario','Meses Inventario')),
          promedio_consumo_12m:   parseNum(col(r,'Promedio_Consumo_12M','Promedio Consumo 12M')),
          cant_transito:          parseNum(col(r,'Cant. en Tránsito','Cant. en Transito')),
          cant_transito_1030:     parseNum(col(r,'Cant. en Tránsito 1030','Cant. en Transito 1030')),
          cant_transito_1031:     parseNum(col(r,'Cant. en Tránsito 1031','Cant. en Transito 1031')),
          cant_transito_1032:     parseNum(col(r,'Cant. en Tránsito 1032','Cant. en Transito 1032')),
          disp_1031_1030:         parseNum(col(r,'Disponible 1031-1030')),
          disp_1031_1032:         parseNum(col(r,'Disponible 1031-1032')),
          inv_1001:               parseNum(col(r,'Inv 1001')),
          inv_1003:               parseNum(col(r,'Inv 1003')),
          inv_1004:               parseNum(col(r,'Inv 1004')),
          inv_1017:               parseNum(col(r,'Inv 1017')),
          inv_1018:               parseNum(col(r,'Inv 1018')),
          inv_1022:               parseNum(col(r,'Inv 1022')),
          inv_1036:               parseNum(col(r,'Inv 1036')),
          bloqueado:              parseNum(col(r,'Bloqueado')),
          client_id:              col(r,'Solicitante') ? (clientMap[col(r,'Solicitante')] ?? null) : null,
          created_by:             user?.id,
        })).filter(r => r.solicitante || r.pedido)

      } else {
        inserts = rows.map(r => ({
          centro:                    col(r,'Centro') || null,
          gpo_cliente:               col(r,'Grp. Cliente','Gpo. Cliente') || null,
          gpo_vendedor:              col(r,'Gpo. Vdor.','Gpo.Vdor.') || null,
          solicitante:               col(r,'Solicitante') || null,
          destinatario:              col(r,'Destinatario') || null,
          razon_social:              col(r,'Razón Social','Razon Social') || null,
          material:                  col(r,'Material') || null,
          texto_material:            col(r,'Texto Material') || null,
          ultima_compra_cliente:     parseDate(col(r,'Ultima_compra_cliente','Ultima compra cliente')),
          ultima_facturacion_dest:   parseDate(col(r,'Ultima_facturacion_destinatario','Ultima facturacion destinatario')),
          consumo_promedio_mensual:  parseNum(col(r,'Consumo_promedio_mensual','Consumo promedio mensual')),
          consumo_actual:            parseNum(col(r,'Consumo_actual','Consumo actual')),
          um:                        col(r,'UM') || null,
          tendencia:                 col(r,'Tendencia') || null,
          tendencia_cantidad:        col(r,'Tendencia de cantidad') || null,
          ultimo_mes_facturacion:    col(r,'Ultimo mes facturacion') || null,
          cantidad_ultima:           parseNum(col(r,'Cantidad ultima')),
          importe_ultima:            parseNum(col(r,'Importe ultima')),
          precio_unitario_ultima:    parseNum(col(r,'Precio_unitario_ultima','Precio unitario ultima')),
          penultima_fecha:           parseDate(col(r,'Penultima_fecha','Penultima fecha')),
          cantidad_penultima:        parseNum(col(r,'Cantidad_penultima','Cantidad penultima')),
          importe_penultima:         parseNum(col(r,'Importe_penultima','Importe penultima')),
          precio_unitario_penultima: parseNum(col(r,'Precio_unitario_penultima','Precio unitario penultima')),
          precio_min:                parseNum(col(r,'precio_min','Precio min')),
          precio_max:                parseNum(col(r,'precio_max','Precio max')),
          precio_prom:               parseNum(col(r,'precio_prom','Precio prom')),
          fuente:                    col(r,'Fuente') || null,
          material_sugerido:         col(r,'Material sugerido') || null,
          descripcion_sugerida:      col(r,'Descripción sugerida','Descripcion sugerida') || null,
          centro_sugerido:           col(r,'Centro sugerido') || null,
          almacen_sugerido:          col(r,'Almacén sugerido','Almacen sugerido') || null,
          disponible:                parseNum(col(r,'Disponible')),
          lote:                      col(r,'Lote') || null,
          fecha_caducidad:           parseDate(col(r,'Fecha de Caducidad','Fecha Caducidad')),
          centro_inv:                col(r,'Centro (Inv)') || null,
          inv_1030:                  parseNum(col(r,'Inv 1030')),
          inv_1031:                  parseNum(col(r,'Inv 1031')),
          inv_1032:                  parseNum(col(r,'Inv 1032')),
          inv_1060:                  parseNum(col(r,'Inv 1060')),
          meses_inventario:          parseNum(col(r,'Meses_Inventario','Meses Inventario')),
          promedio_consumo_12m:      parseNum(col(r,'Promedio_Consumo_12M')),
          cant_transito:             parseNum(col(r,'Cant. en Tránsito','Cant. en Transito')),
          cant_transito_1030:        parseNum(col(r,'Cant. en Tránsito 1030')),
          cant_transito_1031:        parseNum(col(r,'Cant. en Tránsito 1031')),
          cant_transito_1032:        parseNum(col(r,'Cant. en Tránsito 1032')),
          disp_1031_1030:            parseNum(col(r,'Disponible 1031-1030')),
          disp_1031_1032:            parseNum(col(r,'Disponible 1031-1032')),
          inv_1001:                  parseNum(col(r,'Inv 1001')),
          inv_1003:                  parseNum(col(r,'Inv 1003')),
          inv_1004:                  parseNum(col(r,'Inv 1004')),
          inv_1017:                  parseNum(col(r,'Inv 1017')),
          inv_1018:                  parseNum(col(r,'Inv 1018')),
          inv_1022:                  parseNum(col(r,'Inv 1022')),
          inv_1036:                  parseNum(col(r,'Inv 1036')),
          client_id:                 col(r,'Solicitante') ? (clientMap[col(r,'Solicitante')] ?? null) : null,
          created_by:                user?.id,
        })).filter(r => r.solicitante || r.material)
      }

      // Insertar en lotes de 500
      const BATCH = 500
      for (let i = 0; i < inserts.length; i += BATCH) {
        const { error } = await supabase
          .from(type === 'suggestions' ? 'crm_suggestions' : 'crm_consumption')
          .insert(inserts.slice(i, i + BATCH))
        if (error) { toast.error(error.message); setLoading(null); return }
      }

      setCounts(c => ({ ...c, [type]: inserts.length }))
      toast.success(`${inserts.length} registros cargados`)
    } catch (e) {
      toast.error('Error al leer el archivo')
    }
    setLoading(null)
  }

  const FileCard = ({ type, title, description, inputRef }: {
    type: FileType; title: string; description: string
    inputRef: React.RefObject<HTMLInputElement>
  }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h2 className="font-semibold text-gray-800">{title}</h2>
          <p className="text-sm text-gray-400 mt-1">{description}</p>
        </div>
        {counts[type] !== null && (
          <span className="bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full font-medium">
            ✅ {counts[type]} registros
          </span>
        )}
      </div>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading === type}
        className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
        {loading === type ? 'Cargando...' : counts[type] !== null ? 'Reemplazar archivo' : 'Subir archivo .xlsx'}
      </button>
      <input ref={inputRef} type="file" className="hidden"
        accept=".xlsx,.xls" onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f, type)
          if (inputRef.current) inputRef.current.value = ''
        }} />
      <p className="text-xs text-gray-400 mt-2">
        Al subir un archivo nuevo reemplaza los registros anteriores completos.
        Se puede subir diariamente.
      </p>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => nav('/crm')}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Volver al CRM
      </button>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Cargar archivos de sugerencias</h1>
      <p className="text-sm text-gray-400 mb-6">
        Estos archivos se usan para mostrar sugerencias y oportunidades de consumo
        en la ficha de cada cliente. Se pueden reemplazar diariamente.
      </p>
      <div className="space-y-4">
        <FileCard
          type="suggestions"
          title='Archivo 1 — "Todas las sugerencias"'
          description="Pedidos abiertos en SAP con material sugerido. Se muestra en la pestaña Sugerencias SAP de cada cliente."
          inputRef={ref1} />
        <FileCard
          type="consumption"
          title='Archivo 2 — "Sug Reporte Consumo"'
          description="Oportunidades de venta basadas en consumo histórico, sin pedido abierto."
          inputRef={ref2} />
      </div>
    </div>
  )
}
