/** Flat LEVEX mark: a hexagon frame, three nodes, and a cube. Violet runs into cyan. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="levex-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A855F7" />
          <stop offset="0.55" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <linearGradient id="levex-node" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E9D5FF" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <path
        d="M32 6 L52 17 V39 L32 50 L12 39 V17 Z"
        fill="none"
        stroke="url(#levex-stroke)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M20 28 L32 22 L44 28 L44 36 L32 42 L20 36 Z"
        fill="none"
        stroke="url(#levex-stroke)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <rect x="28" y="28" width="8" height="8" rx="1.5" fill="#22D3EE" transform="rotate(45 32 32)" />
      <circle cx="32" cy="10" r="4.2" fill="url(#levex-node)" />
      <circle cx="14" cy="44" r="4.2" fill="#C084FC" />
      <circle cx="50" cy="44" r="4.2" fill="#22D3EE" />
    </svg>
  );
}
