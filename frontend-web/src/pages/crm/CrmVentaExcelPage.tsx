import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getCachedUser } from '../../lib/supabase'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

export default function CrmVentaExcelPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
    const mapped = data.map(r => ({
      no_cliente: r['No. Cliente']?.toString().trim() ?? '',
      material:   r['Material']?.toString().trim() ?? '',
      descripcion: r['Descripcion']?.toString().trim() ?? '',
      cantidad:   parseFloat(r['Cantidad']) || 0,
      precio:     parseFloat(r['Precio']) || 0,
      um:         r['UM']?.toString().trim() ?? '',
    })).filter(r => r.material && r.cantidad > 0)
    setRows(mapped)
  }

  const guardar = async () => {
    if (rows.length === 0) return toast.error('No hay materiales para importar')
    setSaving(true)
    const user = await getCachedUser()

    // Agrupar por no_cliente
    const grupos: Record<string, any[]> = {}
    for (const r of rows) {
      const key = r.no_cliente || 'SIN_CLIENTE'
      if (!grupos[key]) grupos[key] = []
      grupos[key].push(r)
    }

    for (const [noCliente, items] of Object.entries(grupos)) {
      let clienteId: string | null = null
      if (noCliente !== 'SIN_CLIENTE') {
        const { data: cli } = await supabase.from('crm_clients')
          .select('id').eq('solicitante', noCliente).maybeSingle()
        if (!cli) {
          const { data: cliRs } = await supabase.from('crm_clients')
            .select('id').ilike('no_cliente', noCliente).maybeSingle()
          clienteId = cliRs?.id ?? null
        } else {
          clienteId = cli.id
        }
      }

      const { data: offer } = await supabase.from('crm_offers').insert({
        client_id: clienteId,
        tipo: 'venta_excel',
        etapa: 'venta',
        estatus: 'borrador',
        fecha_venta: new Date().toISOString().split('T')[0],
        notas: `Importado desde Excel — No. Cliente: ${noCliente}`,
        created_by: user?.id,
      }).select().single()

      if (!offer) continue

      await supabase.from('crm_offer_items').insert(
        items.map((r: any) => ({
          offer_id: offer.id,
          material: r.material,
          descripcion: r.descripcion || null,
          cantidad_aceptada: r.cantidad,
          precio_aceptado: r.precio,
          um: r.um || null,
          aceptado: true,
          estatus: 'borrador',
        }))
      )
    }

    toast.success(`${Object.keys(grupos).length} venta(s) creadas`)
    nav('/crm/pipeline')
    setSaving(false)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => nav('/crm/pipeline')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Volver al pipeline
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-1">Nueva venta — importar Excel</h1>
      <p className="text-sm text-gray-400 mb-6">Columnas requeridas: No. Cliente, Material, Cantidad, Precio · Opcional: Descripcion, UM</p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400 mb-3">Arrastra tu archivo Excel o haz clic para seleccionar</p>
          <button onClick={() => fileRef.current?.click()}
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Seleccionar archivo
          </button>
          <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>

        {rows.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">{rows.length} materiales leídos</p>
            <div className="overflow-x-auto max-h-64 border border-gray-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    {['No. Cliente','Material','Descripción','Cantidad','Precio','UM'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-3 py-1.5 font-mono text-gray-600">{r.no_cliente}</td>
                      <td className="px-3 py-1.5 font-mono font-semibold">{r.material}</td>
                      <td className="px-3 py-1.5 text-gray-500 max-w-xs truncate">{r.descripcion}</td>
                      <td className="px-3 py-1.5 text-right">{r.cantidad}</td>
                      <td className="px-3 py-1.5 text-right">${r.precio.toLocaleString('es-MX')}</td>
                      <td className="px-3 py-1.5">{r.um}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <button onClick={() => nav('/crm/pipeline')}
            className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving || rows.length === 0}
            className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Importando...' : `Crear ${rows.length} material(es)`}
          </button>
        </div>
      </div>
    </div>
  )
}
