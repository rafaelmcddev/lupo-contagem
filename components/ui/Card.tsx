export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-gray-200 bg-paper p-6 shadow-sm ${className}`}>{children}</div>;
}
