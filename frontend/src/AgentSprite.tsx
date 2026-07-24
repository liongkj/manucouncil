interface Props {
  role: string
  size?: number
  animated?: boolean
}

function colorFor(role: string): string {
  if (role.includes('Scientific')) return '#2563eb'
  if (role.includes('Skeptical')) return '#d97706'
  if (role.includes('Argument')) return '#059669'
  if (role.includes('Language')) return '#7c3aed'
  if (role.includes('Chair')) return '#1d4ed8'
  return '#6b7280'
}

function icon(role: string): string {
  if (role.includes('Scientific')) return 'S'
  if (role.includes('Skeptical')) return 'R'
  if (role.includes('Argument')) return 'A'
  if (role.includes('Language')) return 'L'
  if (role.includes('Chair')) return 'C'
  if (role.includes('Verifier')) return 'V'
  return '?'
}

export default function AgentSprite({ role, size = 40, animated }: Props) {
  const color = colorFor(role)
  const s = icon(role)
  const r = size

  return (
    <svg width={r} height={r} viewBox="0 0 48 48" className={animated ? 'drop-shadow-md' : ''}>
      <defs>
        <linearGradient id={`grad-${role.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.85" />
          <stop offset="100%" stopColor={color} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {role.includes('Chair') ? (
        <>
          <circle cx="24" cy="24" r="22" fill={`url(#grad-${role.replace(/\s/g, '')})`} stroke={color} strokeWidth="1.5" />
          <text x="24" y="25" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="28" fontWeight="700" fontFamily="serif">{s}</text>
        </>
      ) : (
        <>
          <circle cx="24" cy="24" r="20" fill={`url(#grad-${role.replace(/\s/g, '')})`} stroke={color} strokeWidth="1.5" />
          <text x="24" y="25" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="22" fontWeight="600" fontFamily="serif">{s}</text>
        </>
      )}
      {animated && (
        <circle cx="24" cy="24" r="22" fill="none" stroke={color} strokeWidth="2" opacity="0.4">
          <animate attributeName="r" values="22;26;22" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  )
}
