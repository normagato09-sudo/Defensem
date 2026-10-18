import { site } from "@/lib/site";

export default function Instagram({ className = "", label = "Instagram" }: { className?: string; label?: string }) {
  if (!site.instagram) return null;
  return (
    <a className={className} href={site.instagram} target="_blank" rel="noopener noreferrer" aria-label={label ? undefined : "Instagram"}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
      </svg>
      {label && <span> {label}</span>}
    </a>
  );
}
