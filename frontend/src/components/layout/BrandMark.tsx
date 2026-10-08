/** NextNootbook's folded notebook/orbit mark. Decorative beside the name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path d="M7 25V7l18 18V7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="16" cy="16" rx="15" ry="7" transform="rotate(-35 16 16)" stroke="currentColor" strokeWidth="1" opacity=".55" />
      <circle cx="27" cy="8" r="2" fill="currentColor" />
    </svg>
  )
}
