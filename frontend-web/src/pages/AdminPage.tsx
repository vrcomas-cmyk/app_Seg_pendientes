import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { parseExcelFile } from '../utils/importClients'
import { parseCSVText, readFileAsText } from '../utils/parseCSV'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseDate(v: any): string | null {
  if (!v) return null
  const s = String(v).trim()
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

function col(row: any, ...keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find(rk => rk.trim() === k.trim())
    if (found !== undefined && row[found] !== undefined && row[found] !== '')
      return String(row[found]).trim()
  }
  return ''
}

function parseNumStr(v: any): number | null {
  if (v === undefined || v === null || v === '') return null
  const s = String(v).trim()
  if (s === '-' || s === 'nan' || s === 'NaN') return null
  const n = parseFloat(s.replace(/[$,\s]/g,''))
  return isNaN(n) ? null : n
}

function mergeUnique(a: string[], b: string[]): string[] {
  const seen = new Set(a.map(x => x.toLowerCase()))
  return [...a, ...b.filter(x => x && !seen.has(x.toLowerCase()))]
}

const normVal = (v: any): string => {
  if (v === null || v === undefined || v === '' || v === '-') return ''
  const n = parseFloat(String(v))
  if (!isNaN(n)) return n === 0 ? '' : String(Math.round(n * 10000) / 10000)
  return String(v).trim()
}

const readRows = async (file: File): Promise<any[]> => {
  const isCSV = file.name.toLowerCase().endsWith('.csv')
  if (isCSV) {
    const text = await readFileAsText(file)
    return parseCSVText(text)
  }
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, dense: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: '' })
}

// ─── Componente principal ──────────────────────────────────────────────────────
type Section = 'clientes' | 'sugerencias' | 'consumo' | 'precios' | 'catalogo'

export default function AdminPage() {
  const nav = useNavigate()
  const [activeSection, setActiveSection] = useState<Section>('clientes')
  const [progress, setProgress] = useState('')
  const [loading, setLoading] = useState(false)

  // Refs para inputs de archivo
  const refClientes    = useRef<HTMLInputElement>(null)
  const refSugerencias = useRef<HTMLInputElement>(null)
  const refConsumo     = useRef<HTMLInputElement>(null)
  const refCatalogo    = useRef<HTMLInputElement>(null)
  const refPrecios = useRef<HTMLInputElement>(null)
  // Resultados
  const [results, setResults] = useState<Record<Section, string | null>>({
    clientes: null, sugerencias: null, consumo: null, precios: null, catalogo: null, usuarios: null
  })
  const setResult = (s: Section, msg: string) =>
    setResults(r => ({ ...r, [s]: msg }))

  // ── CLIENTES ────────────────────────────────────────────────────────────────
  const handleClientes = async (file: File) => {
    setLoading(true); setProgress('Leyendo archivo...')
    try {
      const parsed = await parseExcelFile(file)
      setProgress(`${parsed.length} clientes detectados. Cargando existentes...`)
      const { data: { user } } = await supabase.auth.getUser()

      const { data: existing } = await supabase.from('crm_clients')
        .select('id, solicitante, telefonos, correos').eq('created_by', user!.id)
      const existingMap: Record<string, any> = {}
      existing?.forEach(c => { existingMap[c.solicitante] = c })

      const toInsert: any[] = []
      const toUpdate: any[] = []
      for (const c of parsed) {
        if (!c.solicitante) continue
        const ex = existingMap[c.solicitante]
        if (!ex) {
          toInsert.push({ solicitante: c.solicitante, razon_social: c.razon_social,
            rfc: c.rfc, poblacion: c.poblacion, estado: c.estado, pais: c.pais,
            ramo: c.ramo, centro: c.centro, gpo_vendedores: c.gpo_vendedores,
            telefonos: c.telefonos, correos: c.correos, created_by: user!.id })
        } else {
          const tels = mergeUnique(ex.telefonos ?? [], c.telefonos)
          const mails = mergeUnique(ex.correos ?? [], c.correos)
          if (tels.length !== (ex.telefonos ?? []).length || mails.length !== (ex.correos ?? []).length)
            toUpdate.push({ id: ex.id, telefonos: tels, correos: mails })
        }
      }

      const BATCH = 100
      let created = 0
      for (let i = 0; i < toInsert.length; i += BATCH) {
        setProgress(`Insertando clientes... ${Math.min(i+BATCH, toInsert.length)} / ${toInsert.length}`)
        await supabase.from('crm_clients').insert(toInsert.slice(i, i + BATCH))
        created += Math.min(BATCH, toInsert.length - i)
      }
      for (let i = 0; i < toUpdate.length; i++) {
        await supabase.from('crm_clients')
          .update({ telefonos: toUpdate[i].telefonos, correos: toUpdate[i].correos })
          .eq('id', toUpdate[i].id)
      }

      // Destinatarios
      setProgress('Procesando destinatarios...')
      const { data: allClients } = await supabase.from('crm_clients')
        .select('id, solicitante').eq('created_by', user!.id)
      const clientIdMap: Record<string, string> = {}
      allClients?.forEach(c => { clientIdMap[c.solicitante] = c.id })
      const { data: existingRecs } = await supabase.from('crm_recipients')
        .select('id, client_id, destinatario').in('client_id', Object.values(clientIdMap))
      const recSet = new Set(existingRecs?.map(r => `${r.client_id}__${r.destinatario}`) ?? [])
      const recsToInsert: any[] = []
      for (const c of parsed) {
        const clientId = clientIdMap[c.solicitante]
        if (!clientId) continue
        for (const r of c.recipients) {
          if (!recSet.has(`${clientId}__${r.destinatario}`))
            recsToInsert.push({ client_id: clientId, destinatario: r.destinatario,
              razon_social: r.razon_social, rfc: r.rfc, poblacion: r.poblacion,
              estado: r.estado, centro: r.centro, telefonos: r.telefonos, correos: r.correos })
        }
      }
      for (let i = 0; i < recsToInsert.length; i += BATCH) {
        setProgress(`Insertando destinatarios... ${Math.min(i+BATCH, recsToInsert.length)} / ${recsToInsert.length}`)
        await supabase.from('crm_recipients').insert(recsToInsert.slice(i, i + BATCH))
      }

      setResult('clientes', `✅ ${created} clientes nuevos · ${toUpdate.length} actualizados`)
      toast.success('Clientes importados')
    } catch (e: any) { toast.error('Error: ' + e?.message) }
    setLoading(false); setProgress('')
  }

  const handleDownloadClientes = async () => {
    setProgress('Preparando descarga...')
    const { data } = await supabase.from('crm_clients')
      .select('*, crm_recipients(destinatario, razon_social, rfc, poblacion, estado, centro, telefonos, correos)')
      .order('solicitante')
    if (!data?.length) { toast.error('No hay clientes'); setProgress(''); return }
    const rows: any[] = []
    for (const c of data) {
      const base = { Solicitante: c.solicitante, 'Razón Social': c.razon_social ?? '',
        RFC: c.rfc ?? '', Población: c.poblacion ?? '', Estado: c.estado ?? '',
        País: c.pais ?? '', Ramo: c.ramo ?? '', Centro: c.centro ?? '',
        'Gpo. vendedores': c.gpo_vendedores ?? '',
        Teléfono: (c.telefonos ?? []).join(', '), Correos: (c.correos ?? []).join('; ') }
      if (c.crm_recipients?.length > 0) {
        for (const r of c.crm_recipients)
          rows.push({ ...base, Destinatario: r.destinatario, 'RS Dest.': r.razon_social ?? '',
            'RFC Dest.': r.rfc ?? '', 'Pob. Dest.': r.poblacion ?? '',
            'Est. Dest.': r.estado ?? '', 'Centro Dest.': r.centro ?? '',
            'Tels. Dest.': (r.telefonos ?? []).join(', '), 'Correos Dest.': (r.correos ?? []).join('; ') })
      } else rows.push({ ...base, Destinatario: '' })
    }
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    XLSX.writeFile(wb, `clientes_${new Date().toISOString().split('T')[0]}.xlsx`)
    setProgress('')
    toast.success('Descarga lista')
  }

  // ── SUGERENCIAS ─────────────────────────────────────────────────────────────
  const handleSugerencias = async (file: File) => {
    setLoading(true); setProgress('Leyendo archivo...')
    try {
      const rows = await readRows(file)
      if (!rows.length) { toast.error('Archivo vacío'); setLoading(false); return }
      setProgress(`${rows.length} filas. Preparando...`)
      const { data: { user } } = await supabase.auth.getUser()
      const { data: clients } = await supabase.from('crm_clients').select('id, solicitante').eq('created_by', user?.id)
      const clientMap: Record<string, string> = {}
      clients?.forEach(c => { clientMap[c.solicitante] = c.id })

      let inserts: any[] = rows.map(r => {
        const sol = col(r,'Solicitante') || null
        return {
          gpo_cliente:            col(r,'Gpo. Cte.','Gpo.Cte') || null,
          fecha:                  parseDate(col(r,'Fecha')),
          pedido:                 col(r,'Pedido') || null,
          gpo_vendedor:           col(r,'Gpo.Vdor.','Gpo. Vdor.') || null,
          solicitante:            sol,
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
          inv_1030: parseNum(col(r,'Inv 1030')), inv_1031: parseNum(col(r,'Inv 1031')),
          inv_1032: parseNum(col(r,'Inv 1032')), inv_1060: parseNum(col(r,'Inv 1060')),
          meses_inventario:     parseNumStr(col(r,'Meses_Inventario','Meses Inventario')),
          promedio_consumo_12m: parseNumStr(col(r,'Promedio_Consumo_12M')),
          cant_transito:        parseNum(col(r,'Cant. en Tránsito','Cant. en Transito')),
          cant_transito_1030:   parseNum(col(r,'Cant. en Tránsito 1030')),
          cant_transito_1031:   parseNum(col(r,'Cant. en Tránsito 1031')),
          cant_transito_1032:   parseNum(col(r,'Cant. en Tránsito 1032')),
          disp_1031_1030:       parseNum(col(r,'Disponible 1031-1030')),
          disp_1031_1032:       parseNum(col(r,'Disponible 1031-1032')),
          inv_1001: parseNum(col(r,'Inv 1001')), inv_1003: parseNum(col(r,'Inv 1003')),
          inv_1004: parseNum(col(r,'Inv 1004')), inv_1017: parseNum(col(r,'Inv 1017')),
          inv_1018: parseNum(col(r,'Inv 1018')), inv_1022: parseNum(col(r,'Inv 1022')),
          inv_1036: parseNum(col(r,'Inv 1036')),
          bloqueado:  col(r,'Bloqueado') || null,
          client_id:  sol ? (clientMap[sol] ?? null) : null,
          created_by: user?.id,
        }
      }).filter(r => r.solicitante || r.pedido)

      // Deduplicar
      const dedupMap = new Map<string, any>()
      for (const row of inserts) {
        const key = [row.pedido ?? '', row.material_solicitado ?? '', row.destinatario ?? '',
          row.fuente ?? '', row.material_sugerido ?? '', row.centro_sugerido ?? '',
          row.almacen_sugerido ?? '', row.lote ?? '', row.fecha_caducidad ?? '',
          normVal(row.disponible), normVal(row.cantidad_ofertar)].join('__')
        if (!dedupMap.has(key)) { dedupMap.set(key, row) } else {
          const ex = dedupMap.get(key)
          const score = (r: any) => Object.values(r).filter(v => v !== null && v !== '').length
          if (score(row) > score(ex)) dedupMap.set(key, row)
        }
      }
      inserts = Array.from(dedupMap.values())

      // Eliminar anteriores conservando rechazados
      setProgress('Eliminando registros anteriores...')
      const { data: rejected } = await supabase.from('crm_offer_items').select('source_id').eq('estatus','rechazado')
      const rejectedIds = new Set(rejected?.map(r => r.source_id).filter(Boolean) ?? [])
      let deleted = 0, page = 0
      while (true) {
        const { data: chunk } = await supabase.from('crm_suggestions')
          .select('id').eq('created_by', user?.id).range(page*500, (page+1)*500-1)
        if (!chunk || chunk.length === 0) break
        const toDelete = chunk.filter(r => !rejectedIds.has(r.id)).map(r => r.id)
        if (toDelete.length > 0) { await supabase.from('crm_suggestions').delete().in('id', toDelete); deleted += toDelete.length }
        if (chunk.length < 500) break
        page++
        setProgress(`Eliminando anteriores... ${deleted}`)
      }

      // Insertar
      const BATCH = 200; let inserted = 0
      for (let i = 0; i < inserts.length; i += BATCH) {
        setProgress(`Insertando... ${Math.min(i+BATCH, inserts.length)} / ${inserts.length}`)
        const { error } = await supabase.from('crm_suggestions').insert(inserts.slice(i, i + BATCH))
        if (error) { toast.error(error.message); setLoading(false); return }
        inserted += Math.min(BATCH, inserts.length - i)
      }
      setResult('sugerencias', `✅ ${inserted} registros`)
      toast.success(`${inserted} sugerencias cargadas`)
    } catch (e: any) { toast.error('Error: ' + e?.message) }
    setLoading(false); setProgress('')
  }

  // ── CONSUMO ─────────────────────────────────────────────────────────────────
  const handleConsumo = async (file: File) => {
    setLoading(true); setProgress('Leyendo archivo...')
    try {
      const rows = await readRows(file)
      if (!rows.length) { toast.error('Archivo vacío'); setLoading(false); return }
      setProgress(`${rows.length} filas detectadas.`)
      const { data: { user } } = await supabase.auth.getUser()
      const { data: clients } = await supabase.from('crm_clients').select('id, solicitante').eq('created_by', user?.id)
      const clientMap: Record<string, string> = {}
      clients?.forEach(c => { clientMap[c.solicitante] = c.id })

      const inserts = rows.map(r => {
        const sol = col(r,'Solicitante') || null
        return {
          centro: col(r,'Centro') || null, gpo_cliente: col(r,'Grp. Cliente','Gpo. Cliente') || null,
          gpo_vendedor: col(r,'Gpo. Vdor.','Gpo.Vdor.') || null, solicitante: sol,
          destinatario: col(r,'Destinatario') || null, razon_social: col(r,'Razón Social','Razon Social') || null,
          material: col(r,'Material') || null, texto_material: col(r,'Texto Material') || null,
          ultima_compra_cliente:   parseDate(col(r,'Ultima_compra_cliente','Ultima compra cliente')),
          ultima_facturacion_dest: parseDate(col(r,'Ultima_facturacion_destinatario')),
          consumo_promedio_mensual: parseNum(col(r,'Consumo_promedio_mensual','Consumo promedio mensual')),
          consumo_actual:           parseNum(col(r,'Consumo_actual','Consumo actual')),
          um: col(r,'UM') || null, tendencia: col(r,'Tendencia') || null,
          tendencia_cantidad: col(r,'Tendencia de cantidad') || null,
          ultimo_mes_facturacion: col(r,'Ultimo mes facturacion') || null,
          cantidad_ultima: parseNum(col(r,'Cantidad ultima')), importe_ultima: parseNum(col(r,'Importe ultima')),
          precio_unitario_ultima: parseNum(col(r,'Precio_unitario_ultima','Precio unitario ultima')),
          penultima_fecha: parseDate(col(r,'Penultima_fecha','Penultima fecha')),
          cantidad_penultima: parseNum(col(r,'Cantidad_penultima')),
          importe_penultima: parseNum(col(r,'Importe_penultima')),
          precio_unitario_penultima: parseNum(col(r,'Precio_unitario_penultima')),
          precio_min: parseNum(col(r,'precio_min')), precio_max: parseNum(col(r,'precio_max')),
          precio_prom: parseNum(col(r,'precio_prom')), fuente: col(r,'Fuente') || null,
          material_sugerido: col(r,'Material sugerido') || null,
          descripcion_sugerida: col(r,'Descripción sugerida','Descripcion sugerida') || null,
          centro_sugerido: col(r,'Centro sugerido') || null,
          almacen_sugerido: col(r,'Almacén sugerido','Almacen sugerido') || null,
          disponible: parseNum(col(r,'Disponible')), lote: col(r,'Lote') || null,
          fecha_caducidad: parseDate(col(r,'Fecha de Caducidad','Fecha Caducidad')),
          centro_inv: col(r,'Centro (Inv)') || null,
          inv_1030: parseNum(col(r,'Inv 1030')), inv_1031: parseNum(col(r,'Inv 1031')),
          inv_1032: parseNum(col(r,'Inv 1032')), inv_1060: parseNum(col(r,'Inv 1060')),
          meses_inventario: parseNum(col(r,'Meses_Inventario')),
          promedio_consumo_12m: parseNum(col(r,'Promedio_Consumo_12M')),
          cant_transito: parseNum(col(r,'Cant. en Tránsito','Cant. en Transito')),
          cant_transito_1030: parseNum(col(r,'Cant. en Tránsito 1030')),
          cant_transito_1031: parseNum(col(r,'Cant. en Tránsito 1031')),
          cant_transito_1032: parseNum(col(r,'Cant. en Tránsito 1032')),
          disp_1031_1030: parseNum(col(r,'Disponible 1031-1030')),
          disp_1031_1032: parseNum(col(r,'Disponible 1031-1032')),
          inv_1001: parseNum(col(r,'Inv 1001')), inv_1003: parseNum(col(r,'Inv 1003')),
          inv_1004: parseNum(col(r,'Inv 1004')), inv_1017: parseNum(col(r,'Inv 1017')),
          inv_1018: parseNum(col(r,'Inv 1018')), inv_1022: parseNum(col(r,'Inv 1022')),
          inv_1036: parseNum(col(r,'Inv 1036')),
          client_id: sol ? (clientMap[sol] ?? null) : null, created_by: user?.id,
        }
      }).filter(r => r.solicitante || r.material)

      // Borrar anteriores
      setProgress('Eliminando anteriores...')
      let deleted = 0
      while (true) {
        const { data: chunk } = await supabase.from('crm_consumption').select('id').eq('created_by', user?.id).limit(500)
        if (!chunk || chunk.length === 0) break
        await supabase.from('crm_consumption').delete().in('id', chunk.map(r => r.id))
        deleted += chunk.length
        setProgress(`Eliminando anteriores... ${deleted}`)
      }

      // Insertar
      const BATCH = 200; let inserted = 0
      for (let i = 0; i < inserts.length; i += BATCH) {
        setProgress(`Insertando... ${Math.min(i+BATCH, inserts.length)} / ${inserts.length}`)
        const { error } = await supabase.from('crm_consumption').insert(inserts.slice(i, i + BATCH))
        if (error) { toast.error(error.message); setLoading(false); return }
        inserted += Math.min(BATCH, inserts.length - i)
      }
      setResult('consumo', `✅ ${inserted} registros`)
      toast.success(`${inserted} registros de consumo cargados`)
    } catch (e: any) { toast.error('Error: ' + e?.message) }
    setLoading(false); setProgress('')
  }

  // ── PRECIOS ──────────────────────────────────────────────────────────────────
  const handlePrecios = async (file: File) => {
    setLoading(true); setProgress('Leyendo archivo...')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!rows.length) { toast.error('Archivo vacío'); setLoading(false); return }

      const { data: { user } } = await supabase.auth.getUser()
      const colP = (r: any, ...keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(r).find(rk => rk.trim() === k.trim())
          if (found !== undefined && r[found] !== '') return String(r[found]).trim()
        }
        return ''
      }

      const inserts = rows.map(r => ({
        material:        colP(r,'Material','material'),
        descripcion:     colP(r,'Descripcion','Descripción','descripcion') || null,
        precio_oferta:   parseFloat(colP(r,'Precio oferta','precio_oferta').replace(/[$,]/g,'')) || null,
        condicion:       colP(r,'Condicion','Condición','condicion') || null,
        oferta_adicional: colP(r,'Oferta adicional','oferta_adicional') || null,
        created_by:      user?.id,
      })).filter(r => r.material)

      const { error } = await supabase.from('crm_prices')
        .upsert(inserts, { onConflict: 'material,created_by', ignoreDuplicates: false })
      if (error) { toast.error(error.message); setLoading(false); return }

      setResult('precios', `✅ ${inserts.length} precios cargados`)
      toast.success(`${inserts.length} precios actualizados`)
    } catch (e: any) { toast.error('Error: ' + e?.message) }
    setLoading(false); setProgress('')
  }

  // ── CATÁLOGO ─────────────────────────────────────────────────────────────────
  const handleCatalogo = async (file: File) => {
    setLoading(true); setProgress('Leyendo archivo...')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!rows.length) { toast.error('Archivo vacío'); setLoading(false); return }

      const { data: { user } } = await supabase.auth.getUser()
      const parseMoney = (v: any) => {
        if (!v) return null
        const n = parseFloat(String(v).replace(/[$,\s]/g,''))
        return isNaN(n) ? null : n
      }
      const colC = (r: any, ...keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(r).find(rk => rk.trim() === k.trim())
          if (found !== undefined && r[found] !== '') return String(r[found]).trim()
        }
        return ''
      }

      const inserts = rows.map(r => ({
        material:        colC(r,'Material','material'),
        descripcion:     colC(r,'Texto breve de material','Descripcion','descripcion') || null,
        sector:          colC(r,'Sector') || null,
        descr_sector:    colC(r,'Descr. Sector') || null,
        descr_grupo_art: colC(r,'Descr. Grupo de Art.') || null,
        grupo_articulos: colC(r,'Grupo de artículos','Grupo de articulos') || null,
        um:              colC(r,'UM',' UM') || null,
        tipo_material:   colC(r,'Tipo de material') || null,
        costo:           parseMoney(colC(r,'Costo',' Costo')),
        cajas_pallet:    parseNum(colC(r,'Cajas por Pallet')),
        piezas_umv_caja: parseNum(colC(r,'Piezas UMV por caja')),
        piezas_pallet:   parseNum(colC(r,'Piezas (UM) Por pallet')),
        cajas_cama:      parseNum(colC(r,'Cajas x cama')),
        camas_tarima:    parseNum(colC(r,'Camas por tarima')),
        altura_m:        parseNum(colC(r,'Altura (M)')),
        lista_02:        parseMoney(colC(r,'LISTA 02',' LISTA 02')),
        lista_06:        parseMoney(colC(r,'LISTA 06',' LISTA 06')),
        condicion:       colC(r,'Condicion','Condición',' Condicion') || null,
        created_by:      user?.id,
      })).filter(r => r.material)

      const { error } = await supabase.from('catalog_materials')
        .upsert(inserts, { onConflict: 'material,created_by', ignoreDuplicates: false })
      if (error) { toast.error(error.message); setLoading(false); return }

      setResult('catalogo', `✅ ${inserts.length} materiales`)
      toast.success(`${inserts.length} materiales cargados`)
    } catch (e: any) { toast.error('Error: ' + e?.message) }
    setLoading(false); setProgress('')
  }

  const SECTIONS = [
    { key: 'usuarios' as Section, icon: '👥', label: 'Usuarios', desc: 'Roles y permisos de usuarios' },
    { key: 'clientes' as Section,    icon: '👥', label: 'Clientes',         desc: 'Importar y actualizar base de clientes' },
    { key: 'sugerencias' as Section, icon: '📋', label: 'Sugerencias SAP',  desc: 'Archivo "Todas las sugerencias"' },
    { key: 'consumo' as Section,     icon: '📊', label: 'Reporte Consumo',  desc: 'Archivo "Sug Reporte Consumo"' },
    { key: 'precios' as Section,     icon: '💲', label: 'Precios',          desc: 'Precios de oferta por material' },
    { key: 'catalogo' as Section,    icon: '🗂️', label: 'Catálogo',         desc: 'Materiales con precios y presentaciones' },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Administración de archivos</h1>
      <p className="text-sm text-gray-400 mb-6">Carga y actualización de bases de datos</p>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key)}
            className={`p-4 rounded-xl border text-left transition ${
              activeSection === s.key
                ? 'bg-teal-600 border-teal-600 text-white'
                : 'bg-white border-gray-200 hover:border-teal-300 text-gray-700'
            }`}>
            <p className="text-2xl mb-2">{s.icon}</p>
            <p className="text-sm font-semibold">{s.label}</p>
            <p className={`text-xs mt-0.5 ${activeSection === s.key ? 'text-teal-100' : 'text-gray-400'}`}>
              {s.desc}
            </p>
            {results[s.key] && (
              <p className={`text-xs mt-2 font-medium ${activeSection === s.key ? 'text-teal-100' : 'text-green-600'}`}>
                {results[s.key]}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Panel activo */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">

        {/* Clientes */}
        {activeSection === 'clientes' && (
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="font-semibold text-gray-800 mb-1">Importar / Actualizar clientes</h2>
                <p className="text-sm text-gray-400">
                  Agrega clientes nuevos y actualiza teléfonos/correos. No elimina contactos ni datos capturados manualmente.
                </p>
              </div>
              <button onClick={handleDownloadClientes} disabled={loading}
                className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex-shrink-0 ml-4">
                ⬇️ Descargar base
              </button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-xs text-blue-700">
              <strong>Columnas requeridas:</strong> Solicitante, Destinatario, Razón Social, RFC, Población, Estado, País, Teléfono, Ramo, Centro, Gpo. vendedores, Correos
            </div>
            <button onClick={() => refClientes.current?.click()} disabled={loading}
              className="bg-teal-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {loading ? 'Procesando...' : 'Subir archivo .xlsx / .csv'}
            </button>
            <input ref={refClientes} type="file" className="hidden" accept=".xlsx,.xls,.csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleClientes(f); if (refClientes.current) refClientes.current.value = '' }} />
          </div>
        )}

        {/* Sugerencias */}
        {activeSection === 'sugerencias' && (
          <div>
            <h2 className="font-semibold text-gray-800 mb-1">Todas las sugerencias</h2>
            <p className="text-sm text-gray-400 mb-4">
              Pedidos abiertos en SAP con material sugerido. Se reemplaza completo al subir. Conserva los materiales rechazados en ofertas.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
              ⚠️ Para archivos grandes guarda como <strong>CSV UTF-8</strong> desde Excel antes de subir.
            </div>
            <button onClick={() => refSugerencias.current?.click()} disabled={loading}
              className="bg-teal-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {loading ? 'Procesando...' : 'Subir archivo .xlsx / .csv'}
            </button>
            <input ref={refSugerencias} type="file" className="hidden" accept=".xlsx,.xls,.csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleSugerencias(f); if (refSugerencias.current) refSugerencias.current.value = '' }} />
          </div>
        )}

        {/* Consumo */}
        {activeSection === 'consumo' && (
          <div>
            <h2 className="font-semibold text-gray-800 mb-1">Sug Reporte Consumo</h2>
            <p className="text-sm text-gray-400 mb-4">
              Oportunidades de venta por consumo histórico sin pedido abierto. Se reemplaza completo al subir.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
              ⚠️ Este archivo es grande (160k+ filas). Usa <strong>CSV UTF-8</strong> exportado desde Excel.
            </div>
            <button onClick={() => refConsumo.current?.click()} disabled={loading}
              className="bg-teal-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {loading ? 'Procesando...' : 'Subir archivo .csv'}
            </button>
            <input ref={refConsumo} type="file" className="hidden" accept=".xlsx,.xls,.csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleConsumo(f); if (refConsumo.current) refConsumo.current.value = '' }} />
          </div>
        )}

        {activeSection === 'usuarios' && (
          <UsersPanel />
        )}

        {/* Precios */}
        {activeSection === 'precios' && (
          <div>
            <h2 className="font-semibold text-gray-800 mb-1">Precios de oferta</h2>
            <p className="text-sm text-gray-400 mb-4">
              Precios que se pre-llenan automáticamente al generar una oferta desde la página de venta.
              Se puede subir archivo o capturar manualmente.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-700">
              <strong>Columnas del archivo:</strong> Material | Descripcion | Precio oferta | Condicion | Oferta adicional
            </div>
            <button onClick={() => refPrecios.current?.click()} disabled={loading}
              className="bg-teal-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {loading ? 'Procesando...' : 'Subir archivo .xlsx'}
            </button>
            <input ref={refPrecios} type="file" className="hidden" accept=".xlsx,.xls"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePrecios(f); if (refPrecios.current) refPrecios.current.value = '' }} />
          </div>
        )}


        {/* Catálogo */}
        {activeSection === 'catalogo' && (
          <div>
            <h2 className="font-semibold text-gray-800 mb-1">Catálogo de materiales</h2>
            <p className="text-sm text-gray-400 mb-4">
              Materiales con precios, presentaciones y condiciones. Visible para todos los usuarios, editable solo por el equipo.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-700">
              <strong>Columnas:</strong> Material, Texto breve de material, Sector, Descr. Sector, UM, Tipo de material, Costo, LISTA 02, LISTA 06, Condicion...
            </div>
            <button onClick={() => refCatalogo.current?.click()} disabled={loading}
              className="bg-teal-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {loading ? 'Procesando...' : 'Subir archivo .xlsx'}
            </button>
            <input ref={refCatalogo} type="file" className="hidden" accept=".xlsx,.xls"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCatalogo(f); if (refCatalogo.current) refCatalogo.current.value = '' }} />
          </div>
        )}

        {/* Barra de progreso */}
        {progress && (
          <div className="mt-4 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2.5">
            <p className="text-xs text-teal-700 font-medium">{progress}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function UsersPanel() {
  const [users, setUsers] = useState<any[]>([])
  const [roles, setRoles] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const ALL_MODULES = [
    { key: 'pendientes', label: 'Pendientes' },
    { key: 'crm',        label: 'CRM' },
    { key: 'msc',        label: 'MSC' },
    { key: 'catalogo',   label: 'Catalogo' },
    { key: 'admin',      label: 'Admin' },
  ]

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }
    })
    const usersData = res.ok ? await res.json() : []
    setUsers(usersData)
    const { data: rolesData } = await supabase.from('user_roles').select('*')
    const rolesMap: Record<string, any> = {}
    rolesData?.forEach(r => { rolesMap[r.user_id] = r })
    setRoles(rolesMap)
  }

  useEffect(() => { load() }, [])

  const saveRole = async (userId: string, role: string, modules: string[]) => {
    setSaving(userId)
    await supabase.from('user_roles').upsert({
      user_id: userId, role, modules,
    }, { onConflict: 'user_id' })
    toast.success('Rol actualizado')
    setRoles(prev => ({ ...prev, [userId]: { ...prev[userId], role, modules } }))
    setSaving(null)
  }

  const toggleModule = (userId: string, module: string) => {
    const current = roles[userId]?.modules ?? ['pendientes']
    const updated = current.includes(module)
      ? current.filter((m: string) => m !== module)
      : [...current, module]
    setRoles(prev => ({ ...prev, [userId]: { ...prev[userId], modules: updated } }))
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) toast.error(error.message)
    else toast.success(`Correo de reset enviado a ${email}`)
  }

  return (
    <div>
      <h2 className="font-semibold text-gray-800 mb-1">Usuarios y permisos</h2>
      <p className="text-sm text-gray-400 mb-4">Gestiona roles y modulos visibles por usuario.</p>
      {users.length === 0 && (
        <p className="text-sm text-gray-400">Cargando usuarios...</p>
      )}
      <div className="space-y-4">
        {users.map((u: any) => {
          const userRole = roles[u.id] ?? { role: 'user', modules: ['pendientes'] }
          return (
            <div key={u.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{u.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Ultimo acceso: {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('es-MX') : 'Nunca'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none bg-white"
                    value={userRole.role}
                    onChange={e => setRoles(prev => ({ ...prev, [u.id]: { ...prev[u.id], role: e.target.value } }))}>
                    <option value="user">Usuario</option>
                    <option value="team">Equipo</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={() => saveRole(u.id, userRole.role, userRole.modules ?? ['pendientes'])}
                    disabled={saving === u.id}
                    className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50">
                    {saving === u.id ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    onClick={() => resetPassword(u.email)}
                    className="border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50">
                    Reset pass
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Modulos visibles:</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_MODULES.map(m => {
                    const active = (userRole.modules ?? ['pendientes']).includes(m.key)
                    return (
                      <button key={m.key}
                        onClick={() => toggleModule(u.id, m.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                          active
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}>
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
