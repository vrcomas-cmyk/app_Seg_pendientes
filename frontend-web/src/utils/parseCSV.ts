// Parser CSV ligero para archivos grandes
// Soporta comas y tabuladores como delimitadores
export function parseCSVText(text: string): Record<string, string>[] {
  const lines = text.split('\n')
  if (lines.length < 2) return []

  // Detectar delimitador (tab o coma)
  const firstLine = lines[0]
  const delimiter = firstLine.includes('\t') ? '\t' : ','

  const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''))

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cells = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, j) => { row[h] = cells[j] ?? '' })
    rows.push(row)
  }
  return rows
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as string)
    reader.onerror = reject
    reader.readAsText(file, 'UTF-8')
  })
}
