export function parseCSVText(text: string): Record<string, string>[] {
  const lines = text.split('\n')
  if (lines.length < 2) return []

  const firstLine = lines[0]

  // Detectar delimitador: tab > punto y coma > coma
  let delimiter = ','
  if (firstLine.includes('\t')) delimiter = '\t'
  else if (firstLine.split(';').length > firstLine.split(',').length) delimiter = ';'

  const parseRow = (line: string): string[] => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === delimiter[0] && !inQuotes) {
        cells.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    cells.push(current.trim())
    return cells
  }

  const headers = parseRow(firstLine).map(h => h.replace(/^\uFEFF/, '').trim()) // quitar BOM

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cells = parseRow(line)
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
