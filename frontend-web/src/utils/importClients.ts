import * as XLSX from 'xlsx'

interface RawRow {
  Solicitante?: string; Destinatario?: string; 'Razón Social'?: string;
  RFC?: string; Población?: string; Estado?: string; País?: string;
  Teléfono?: string; Ramo?: string; Centro?: string;
  'Gpo. vendedores'?: string; Correos?: string;
  Ejecutivo?: string; 'Grupo Cliente'?: string; Zona?: string;
}

export interface ClientImport {
  solicitante: string; razon_social?: string; rfc?: string;
  poblacion?: string; estado?: string; pais?: string;
  ramo?: string; centro?: string; gpo_vendedores?: string;
  ejecutivo?: string; grupo_cliente?: string; zona?: string;
  telefonos: string[]; correos: string[];
  recipients: RecipientImport[];
}

export interface RecipientImport {
  destinatario: string; razon_social?: string; rfc?: string;
  poblacion?: string; estado?: string; centro?: string;
  telefonos: string[]; correos: string[];
}

const clean = (v?: string) => v?.toString().trim().replace(/\s+/g, ' ') || ''

const mergeUnique = (a: string[], b: string[]) => {
  const seen = new Set(a.map(x => x.toLowerCase()))
  return [...a, ...b.filter(x => x && !seen.has(x.toLowerCase()))]
}

const splitPhones = (v?: string): string[] => {
  if (!v) return []
  return v.toString().split(',').map(x => x.trim()).filter(Boolean)
}

const splitEmails = (v?: string): string[] => {
  if (!v) return []
  return v.toString().split(/;\s*/).map(x => x.trim()).filter(x => x.includes('@'))
}

export function parseExcelFile(file: File): Promise<ClientImport[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        const data = new Uint8Array(arrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: RawRow[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

        if (rows.length === 0) {
          reject(new Error('El archivo está vacío o no tiene el formato esperado'))
          return
        }

        const clientMap = new Map<string, ClientImport>()

        for (const row of rows) {
          const solicitante = clean(row.Solicitante)
          if (!solicitante) continue

          const tels  = splitPhones(row.Teléfono)
          const mails = splitEmails(row.Correos)

          if (!clientMap.has(solicitante)) {
            clientMap.set(solicitante, {
              solicitante,
              razon_social:   clean(row['Razón Social']) || undefined,
              rfc:            clean(row.RFC) || undefined,
              poblacion:      clean(row.Población) || undefined,
              estado:         clean(row.Estado) || undefined,
              pais:           clean(row.País) || 'México',
              ramo:           clean(row.Ramo) || undefined,
              centro:         clean(row.Centro) || undefined,
              gpo_vendedores: clean(row['Gpo. vendedores']) || undefined,
              ejecutivo:      clean(row.Ejecutivo) || undefined,
              grupo_cliente:  clean(row['Grupo Cliente']) || undefined,
              zona:           clean(row.Zona) || undefined,
              telefonos: tels,
              correos:   mails,
              recipients: [],
            })
          } else {
            const existing = clientMap.get(solicitante)!
            existing.telefonos = mergeUnique(existing.telefonos, tels)
            existing.correos   = mergeUnique(existing.correos, mails)
            // Actualizar campos si vienen en esta fila
            if (!existing.ejecutivo && clean(row.Ejecutivo)) existing.ejecutivo = clean(row.Ejecutivo)
            if (!existing.grupo_cliente && clean(row['Grupo Cliente'])) existing.grupo_cliente = clean(row['Grupo Cliente'])
            if (!existing.zona && clean(row.Zona)) existing.zona = clean(row.Zona)
          }

          const destinatario = clean(row.Destinatario)
          if (destinatario) {
            const client = clientMap.get(solicitante)!
            const exists = client.recipients.some(r => r.destinatario === destinatario)
            if (!exists) {
              client.recipients.push({
                destinatario,
                razon_social: clean(row['Razón Social']) || undefined,
                rfc:          clean(row.RFC) || undefined,
                poblacion:    clean(row.Población) || undefined,
                estado:       clean(row.Estado) || undefined,
                centro:       clean(row.Centro) || undefined,
                telefonos: tels,
                correos:   mails,
              })
            }
          }
        }

        resolve(Array.from(clientMap.values()))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsArrayBuffer(file)
  })
}
