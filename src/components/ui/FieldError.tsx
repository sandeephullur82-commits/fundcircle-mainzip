/**
 * FieldError — inline validation error display.
 * Renders nothing when error is empty/undefined.
 * Usage: <FieldError error={formErrors.email} />
 */
interface FieldErrorProps {
  error?: string;
  className?: string;
}

export default function FieldError({ error, className = "" }: FieldErrorProps) {
  if (!error) return null;
  return (
    <p role="alert" className={`text-xs font-medium text-red-500 mt-1 flex items-center gap-1 ${className}`}>
      <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 1a5 5 0 100 10A5 5 0 006 1zm-.75 2.5h1.5v3.25h-1.5V3.5zm0 4.25h1.5v1.5h-1.5v-1.5z" />
      </svg>
      {error}
    </p>
  );
}
