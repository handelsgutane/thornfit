/**
 * Små inline-SVG helpers brukt kun av filter-komponentene. Vi inliner fremfor
 * å importere ikon-pakke for å holde RSC-bundle slank — filter-baren er under
 * katalog-sider som leveres på hver side-visning. Begge ikonene bruker
 * `currentColor` så de flipper med tekstfargen i parent.
 */

export function CaretDownIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M2 4L5 7L8 4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M2 2L8 8M8 2L2 8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
