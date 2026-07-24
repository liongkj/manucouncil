export function cleanResponse(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/gm, '')
    .replace(/\n?\s*```$/gm, '')
    .trim()
}

export function excerpt(text: string, max = 200): string {
  const cleaned = cleanResponse(text)
  if (!cleaned) return text.slice(0, max)
  return cleaned.length <= max ? cleaned : cleaned.slice(0, max) + '...'
}

export function parseJsonResponse<T>(text: string): T | null {
  const cleaned = cleanResponse(text)
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const braceStart = cleaned.indexOf('{')
    const braceEnd = cleaned.lastIndexOf('}')
    if (braceStart !== -1 && braceEnd > braceStart) {
      try {
        return JSON.parse(cleaned.slice(braceStart, braceEnd + 1)) as T
      } catch {
        return null
      }
    }
    return null
  }
}
