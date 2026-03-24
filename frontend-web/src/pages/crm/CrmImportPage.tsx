import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { parseExcelFile, ClientImport } from '../../utils/importClients'
import toast from 'react-hot-toast'

export default function CrmImportPage() {
  const nav = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [clients, setClients] = useState<ClientImport[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<{ created: number; skipped: number } | null>(null)

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
    const { data: { user } } = await supabase.auth.getUser()
    let created = 0, skipped = 0

    for (const c of clients) {
      // Verificar si ya existe el cliente
      const { data: existing } = await supabase
        .from('crm_clients')
        .select('id')
        .eq('solicitante', c.solicitante)
        .eq('created_by', user!.id)
        .single()

      let clientId = existing?.id

      if (!clientId) {
        // Crear cliente nuevo
        const { data: newClient } = await supabase
          .from('crm_clients')
          .insert({
            solicitante:    c.solicitante,
            razon_social:   c.razon_social,
            rfc:            c.rfc,
            poblacion:      c.poblacion,
            estado:         c.estado,
            pais:           c.pais,
            ramo:           c.ramo,
            centro:         c.centro,
            gpo_vendedores: c.gpo_vendedores,
            telefonos:      c.telefonos,
            correos:        c.correos,
            created_by:     user!.id,
          })
          .select('id')
          .single()
        clientId = newClient?.id
        created++
      } else {
        skipped++
      }

      // Insertar destinatarios que no existan
      if (clientId && c.recipients.length > 0) {
        for (const r of c.recipients) {
          const { data: existRec } = await supabase
            .from('crm_recipients')
            .select('id')
            .eq('client_id', clientId)
            .eq('destinatario', r.destinatario)
            .single()

          if (!existRec) {
            await supabase.from('crm_recipients').insert({
              client_id:    clientId,
              destinatario: r.destinatario,
              razon_social: r.razon_social,
              rfc:          r.rfc,
              poblacion:    r.poblacion,
              estado:       r.estado,
              centro:       r.centro,
              telefonos:    r.telefonos,
              correos:      r.correos,
            })
          }
        }
      }
    }

    setResults({ created, skipped })
    setImporting(false)
    toast.success(`Importación completada: ${created} nuevos, ${skipped} ya existían`)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => nav('/crm')}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Volver a clientes
      </button>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Importar clientes desde Excel</h1>
      <p className="text-sm text-gray-400 mb-6">
        El archivo debe tener las columnas: Solicitante, Destinatario, Razón Social, RFC,
        Población, Estado, País, Teléfono, Ramo, Centro, Gpo. vendedores, Correos.
      </p>

      {/* Zona de carga */}
      {clients.length === 0 && (
        <div
          onClick={() => fileRef.current?.click()}
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

      {/* Preview de clientes */}
      {clients.length > 0 && !results && (
        <>
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-teal-700">
                {clients.length} clientes detectados
              </p>
              <p className="text-xs text-teal-600">
                {clients.reduce((acc, c) => acc + c.recipients.length, 0)} destinatarios en total
              </p>
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
              <span className="text-xs font-semibold text-gray-500 uppercase">Solicitante</span>
              <span className="text-xs font-semibold text-gray-500 uppercase">RFC</span>
              <span className="text-xs font-semibold text-gray-500 uppercase">Teléfonos</span>
              <span className="text-xs font-semibold text-gray-500 uppercase">Correos / Destinatarios</span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {clients.map((c, i) => (
                <div key={i} className="px-5 py-3 border-b border-gray-100 last:border-0 grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{c.solicitante}</p>
                    {c.razon_social && <p className="text-xs text-gray-400">{c.razon_social}</p>}
                  </div>
                  <p className="text-gray-500">{c.rfc || '—'}</p>
                  <div>
                    {c.telefonos.length === 0 && <span className="text-gray-300">—</span>}
                    {c.telefonos.map((t, j) => (
                      <p key={j} className="text-gray-600 text-xs">{t}</p>
                    ))}
                  </div>
                  <div>
                    {c.correos.map((m, j) => (
                      <p key={j} className="text-gray-600 text-xs truncate">{m}</p>
                    ))}
                    {c.recipients.length > 0 && (
                      <p className="text-xs text-teal-600 mt-1">
                        {c.recipients.length} destinatario{c.recipients.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Resultado */}
      {results && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-4xl mb-4">✅</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Importación completada</h2>
          <div className="flex justify-center gap-8 mb-6">
            <div>
              <p className="text-3xl font-bold text-teal-600">{results.created}</p>
              <p className="text-sm text-gray-400">Clientes nuevos</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-400">{results.skipped}</p>
              <p className="text-sm text-gray-400">Ya existían</p>
            </div>
          </div>
          <button onClick={() => nav('/crm')}
            className="bg-teal-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700">
            Ver clientes importados
          </button>
        </div>
      )}
    </div>
  )
}
