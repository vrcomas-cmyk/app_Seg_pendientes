import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { parseExcelFile } from '../../utils/importClients'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

function mergeUnique(a: string[], b: string[]): string[] {
  const seen = new Set(a.map(x => x.toLowerCase()))
  return [...a, ...b.filter(x => x && !seen.has(x.toLowerCase()))]
}

export default function CrmImportPage() {
  const nav = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState<{ created: number; updated: number } | null>(null)
  const [downloading, setDownloading] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const parsed = await parseExcelFile(file)
      setClients(parsed)
      toast.success(`${parsed.length} clientes detectados`)
    } catch {
      toast.error('Error al leer el archivo. Verifica que sea .xlsx o .csv')
    }
    setLoading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleImport = async () => {
    if (clients.length === 0) return
    setImporting(true)
    setProgress('Cargando clientes existentes...')

    const { data: { user } } = await supabase.auth.getUser()
    let created = 0, updated = 0

    // Cargar TODOS los clientes existentes en una sola consulta
    const { data: existingClients } = await supabase
      .from('crm_clients').select('id, solicitante, telefonos, correos')
      .eq('created_by', user!.id)

    const existingMap: Record<string, any> = {}
    existingClients?.forEach(c => { existingMap[c.solicitante] = c })

    // Separar en nuevos y a actualizar
    const toInsert: any[] = []
    const toUpdate: any[] = []

    for (const c of clients) {
      if (!c.solicitante) continue
      const existing = existingMap[c.solicitante]
      if (!existing) {
        toInsert.push({
          solicitante: c.solicitante, razon_social: c.razon_social,
          rfc: c.rfc, poblacion: c.poblacion, estado: c.estado,
          pais: c.pais, ramo: c.ramo, centro: c.centro,
          gpo_vendedores: c.gpo_vendedores,
          ejecutivo: c.ejecutivo,
          grupo_cliente: c.grupo_cliente,
          zona: c.zona,
          telefonos: c.telefonos, correos: c.correos,
          created_by: user!.id,
        })
      } else {
        // Mergear teléfonos y correos sin duplicar
        const mergedTels   = mergeUnique(existing.telefonos ?? [], c.telefonos)
        const mergedEmails = mergeUnique(existing.correos ?? [], c.correos)
        const needsUpdate  = mergedTels.length !== (existing.telefonos ?? []).length ||
                             mergedEmails.length !== (existing.correos ?? []).length
        if (needsUpdate) {
          toUpdate.push({ id: existing.id, telefonos: mergedTels, correos: mergedEmails, ejecutivo: c.ejecutivo, grupo_cliente: c.grupo_cliente, zona: c.zona })
        }
      }
    }

    // Insertar nuevos en lotes de 100
    const BATCH = 100
    for (let i = 0; i < toInsert.length; i += BATCH) {
      setProgress(`Insertando clientes nuevos... ${Math.min(i + BATCH, toInsert.length)} / ${toInsert.length}`)
      const { error } = await supabase.from('crm_clients').insert(toInsert.slice(i, i + BATCH))
      if (error) { toast.error(error.message); setImporting(false); return }
      created += Math.min(BATCH, toInsert.length - i)
    }

    // Actualizar existentes (solo los que cambiaron)
    for (let i = 0; i < toUpdate.length; i++) {
      if (i % 50 === 0) setProgress(`Actualizando clientes... ${i} / ${toUpdate.length}`)
      await supabase.from('crm_clients')
        .update({ telefonos: toUpdate[i].telefonos, correos: toUpdate[i].correos, ejecutivo: toUpdate[i].ejecutivo, grupo_cliente: toUpdate[i].grupo_cliente, zona: toUpdate[i].zona })
        .eq('id', toUpdate[i].id)
      updated++
    }

    // Cargar IDs actualizados para destinatarios
    setProgress('Procesando destinatarios...')
    const { data: allClients } = await supabase
      .from('crm_clients').select('id, solicitante').eq('created_by', user!.id)
    const clientIdMap: Record<string, string> = {}
    allClients?.forEach(c => { clientIdMap[c.solicitante] = c.id })

    // Cargar destinatarios existentes
    const { data: existingRecs } = await supabase
      .from('crm_recipients').select('id, client_id, destinatario')
      .in('client_id', Object.values(clientIdMap))
    const recSet = new Set(existingRecs?.map(r => `${r.client_id}__${r.destinatario}`) ?? [])

    const recsToInsert: any[] = []
    for (const c of clients) {
      const clientId = clientIdMap[c.solicitante]
      if (!clientId) continue
      for (const r of c.recipients) {
        if (!recSet.has(`${clientId}__${r.destinatario}`)) {
          recsToInsert.push({
            client_id: clientId, destinatario: r.destinatario,
            razon_social: r.razon_social, rfc: r.rfc,
            poblacion: r.poblacion, estado: r.estado,
            centro: r.centro, telefonos: r.telefonos, correos: r.correos,
          })
        }
      }
    }

    for (let i = 0; i < recsToInsert.length; i += BATCH) {
      setProgress(`Insertando destinatarios... ${Math.min(i + BATCH, recsToInsert.length)} / ${recsToInsert.length}`)
      await supabase.from('crm_recipients').insert(recsToInsert.slice(i, i + BATCH))
    }

    setResults({ created, updated })
    setProgress('')
    setImporting(false)
    toast.success(`Importación completada: ${created} nuevos, ${updated} actualizados`)
  }

  const handleDownload = async () => {
    setDownloading(true)
    const { data: dbClients } = await supabase
      .from('crm_clients')
      .select('*, crm_recipients(destinatario, razon_social, rfc, poblacion, estado, centro, telefonos, correos)')
      .order('solicitante')

    if (!dbClients?.length) { toast.error('No hay clientes para descargar'); setDownloading(false); return }

    const rows: any[] = []
    for (const c of dbClients) {
      const baseRow = {
        Solicitante: c.solicitante, 'Razón Social': c.razon_social ?? '',
        RFC: c.rfc ?? '', Población: c.poblacion ?? '', Estado: c.estado ?? '',
        País: c.pais ?? '', Ramo: c.ramo ?? '', Centro: c.centro ?? '',
        'Gpo. vendedores': c.gpo_vendedores ?? '',
        Teléfono: (c.telefonos ?? []).join(', '),
        Correos: (c.correos ?? []).join('; '),
      }
      if (c.crm_recipients?.length > 0) {
        for (const r of c.crm_recipients) {
          rows.push({
            ...baseRow,
            Destinatario: r.destinatario,
            'RS Destinatario': r.razon_social ?? '',
            'RFC Dest.': r.rfc ?? '',
            'Población Dest.': r.poblacion ?? '',
            'Estado Dest.': r.estado ?? '',
            'Centro Dest.': r.centro ?? '',
            'Tels. Dest.': (r.telefonos ?? []).join(', '),
            'Correos Dest.': (r.correos ?? []).join('; '),
          })
        }
      } else {
        rows.push({ ...baseRow, Destinatario: '' })
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    XLSX.writeFile(wb, `clientes_${new Date().toISOString().split('T')[0]}.xlsx`)
    setDownloading(false)
    toast.success('Base de clientes descargada')
  }

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => nav('/crm')}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Volver a clientes
      </button>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">Importar / Actualizar clientes</h1>
          <p className="text-sm text-gray-400">
            Al importar se agregan clientes nuevos y se actualizan teléfonos y correos de los existentes.
            No se eliminan ni se sobreescriben contactos ni datos capturados manualmente.
          </p>
        </div>
        <button onClick={handleDownload} disabled={downloading}
          className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex-shrink-0 ml-4">
          {downloading ? 'Descargando...' : '⬇️ Descargar base'}
        </button>
      </div>

      {clients.length === 0 && !results && (
        <div onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-16 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm font-medium text-gray-600">
            {loading ? 'Leyendo archivo...' : 'Haz clic o arrastra tu archivo Excel aquí'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Soporta .xlsx, .xls y .csv</p>
          <input ref={fileRef} type="file" className="hidden"
            accept=".xlsx,.xls,.csv" onChange={handleFile} />
        </div>
      )}

      {clients.length > 0 && !results && (
        <>
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-teal-700">{clients.length} clientes detectados</p>
              <p className="text-xs text-teal-600">
                {clients.reduce((acc, c) => acc + c.recipients.length, 0)} destinatarios en total
              </p>
              {progress && <p className="text-xs text-teal-600 mt-1">{progress}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setClients([])}
                className="text-sm text-gray-500 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleImport} disabled={importing}
                className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                {importing ? 'Importando...' : 'Confirmar importación'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 grid grid-cols-4 gap-4">
              {['Solicitante','RFC','Teléfonos','Correos / Destinatarios'].map(h => (
                <span key={h} className="text-xs font-semibold text-gray-500 uppercase">{h}</span>
              ))}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {clients.map((c, i) => (
                <div key={i} className="px-5 py-3 border-b border-gray-100 last:border-0 grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{c.solicitante}</p>
                    {c.razon_social && <p className="text-xs text-gray-400">{c.razon_social}</p>}
                  </div>
                  <p className="text-gray-500">{c.rfc || '—'}</p>
                  <div>{c.telefonos.map((t: string, j: number) => <p key={j} className="text-gray-600 text-xs">{t}</p>)}</div>
                  <div>
                    {c.correos.map((m: string, j: number) => <p key={j} className="text-gray-600 text-xs truncate">{m}</p>)}
                    {c.recipients.length > 0 && (
                      <p className="text-xs text-teal-600 mt-1">{c.recipients.length} destinatario(s)</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {results && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-4xl mb-4">✅</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Importación completada</h2>
          <div className="flex justify-center gap-8 mb-6">
            <div><p className="text-3xl font-bold text-teal-600">{results.created}</p><p className="text-sm text-gray-400">Clientes nuevos</p></div>
            <div><p className="text-3xl font-bold text-blue-500">{results.updated}</p><p className="text-sm text-gray-400">Actualizados</p></div>
          </div>
          <button onClick={() => nav('/crm')}
            className="bg-teal-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700">
            Ver clientes
          </button>
        </div>
      )}
    </div>
  )
}
