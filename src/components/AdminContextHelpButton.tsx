export function AdminContextHelpButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="admin-help-button admin-help-button-compact"
      type="button"
      aria-label={`Help: ${label}`}
      onClick={onClick}
    >
      <span aria-hidden="true">i</span>
      <span className="admin-help-button-label">Help</span>
    </button>
  );
}
