export interface DiffSegment {
  type: 'same' | 'added' | 'removed'
  text: string
}

function lcs(a: string[], b: string[]): string[][] {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  const result: string[][] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift(['same', a[i - 1]])
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift(['added', b[j - 1]])
      j--
    } else {
      result.unshift(['removed', a[i - 1]])
      i--
    }
  }
  return result
}

export function diffWords(original: string, revised: string): DiffSegment[] {
  const tokenize = (s: string) => s.split(/(\s+)/).filter(Boolean)
  const a = tokenize(original)
  const b = tokenize(revised)
  const raw = lcs(a, b)
  return raw.map(([type, text]) => ({
    type: type as 'same' | 'added' | 'removed',
    text: text as string,
  }))
}

export interface ChangeGroup {
  type: 'removed' | 'added'
  oldText: string
  newText: string
  reason: string
}

export function extractChanges(
  original: string,
  revised: string,
  rationale: string,
): ChangeGroup[] {
  const segments = diffWords(original, revised)
  const changes: ChangeGroup[] = []
  let i = 0
  while (i < segments.length) {
    if (segments[i].type === 'removed') {
      const removed: string[] = []
      const added: string[] = []
      while (i < segments.length && segments[i].type === 'removed') {
        removed.push(segments[i].text)
        i++
      }
      while (i < segments.length && segments[i].type === 'added') {
        added.push(segments[i].text)
        i++
      }
      const oldText = removed.join('')
      const newText = added.join('')
      const trimmedOld = oldText.trim()
      const reason = findReason(trimmedOld, rationale) || findReason(newText.trim(), rationale)
      changes.push({
        type: 'removed',
        oldText,
        newText,
        reason: reason || defaultReason(trimmedOld, newText.trim()),
      })
    } else {
      i++
    }
  }
  return changes
}

function findReason(text: string, rationale: string): string | null {
  if (!text || text.length < 3) return null
  const searchTerms = [
    text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim(),
    ...text.toLowerCase().split(/\s+/).filter(w => w.length > 4),
  ]
  for (const term of searchTerms) {
    if (term.length < 3) continue
    const idx = rationale.toLowerCase().indexOf(term)
    if (idx !== -1) {
      const start = Math.max(0, idx - 60)
      const end = Math.min(rationale.length, idx + term.length + 100)
      return rationale.slice(start, end).replace(/\s+/g, ' ').trim()
    }
  }
  return null
}

function defaultReason(oldText: string, newText: string): string {
  if (oldText.toLowerCase() === newText.toLowerCase()) return `Capitalization/style: "${oldText}" → "${newText}"`
  if (oldText.length > newText.length + 5) return `Removed unnecessary wording: "${oldText.trim()}"`
  if (newText.length > oldText.length + 5) return `Added specificity/clarity`
  return `Revised for clarity and precision`
}
