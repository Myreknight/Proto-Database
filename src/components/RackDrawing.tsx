import type { Drawing } from '../drawing'

interface Props {
  drawing: Drawing
  label: string
  onOpenGear?: (id: string) => void
}

// A rack drawing on screen, themed with the app's colors. Clicking a unit opens it.
export function RackDrawing({ drawing, label, onOpenGear }: Props) {
  return (
    <svg className="rack-drawing" viewBox={`0 0 ${drawing.width} ${drawing.height}`} role="img" aria-label={label}>
      {drawing.lines.map((l, i) => (
        <line key={`l${i}`} className={`rd-${l.kind}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
      ))}
      {drawing.boxes.map((b, i) => (
        <rect
          key={`b${i}`}
          className={['rd-box', `rd-${b.kind}`, b.problem ? 'rd-problem' : '', onOpenGear ? 'rd-click' : ''].filter(Boolean).join(' ')}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          onClick={onOpenGear ? () => onOpenGear(b.gearId) : undefined}
        >
          {b.problem && <title>{b.problem}</title>}
        </rect>
      ))}
      {drawing.texts.map((t, i) => (
        <text
          key={`t${i}`}
          className={['rd-text', t.muted ? 'rd-muted' : '', t.problem ? 'rd-problem-text' : ''].filter(Boolean).join(' ')}
          x={t.x}
          y={t.y}
          fontSize={t.size}
          textAnchor={t.anchor}
          fontWeight={t.bold ? 700 : undefined}
        >
          {t.text}
        </text>
      ))}
    </svg>
  )
}
