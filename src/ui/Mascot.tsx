import { useId, type ReactNode } from "react";

export type MascotMood = "idle" | "wave" | "celebrate" | "think" | "sad";

const ink = "var(--mascot-ink)";

function Mouth({ mood }: { mood: MascotMood }) {
  if (mood === "celebrate") {
    return (
      <g>
        <path d="M84 138 Q100 166 116 138 Z" fill={ink} />
        <ellipse cx="100" cy="152" rx="7" ry="4" fill="var(--mascot-tongue)" />
      </g>
    );
  }
  if (mood === "think") return <ellipse cx="106" cy="146" rx="5" ry="6" fill={ink} />;
  if (mood === "sad") return <path d="M89 152 Q100 141 111 152" fill="none" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />;
  return <path d="M88 142 Q100 154 112 142" fill="none" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />;
}

export function Mascot({
  mood = "idle",
  size = 120,
  className = "",
  label = "Obi, o mascote do Obra Ágil",
}: {
  mood?: MascotMood;
  size?: number;
  className?: string;
  label?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const body = `mb${uid}`;
  const hat = `mh${uid}`;
  return (
    <svg
      viewBox="0 0 200 216"
      width={size}
      height={size * 1.08}
      className={`mascot ${className}`}
      data-mood={mood}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--mascot-body-top)" />
          <stop offset="1" stopColor="var(--mascot-body)" />
        </linearGradient>
        <linearGradient id={hat} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--mascot-hat-top)" />
          <stop offset="1" stopColor="var(--mascot-hat)" />
        </linearGradient>
      </defs>
      <ellipse className="m-shadow m-part" cx="100" cy="206" rx="44" ry="6.5" fill={ink} opacity="0.14" />
      <g className="m-rig m-part">
        <rect x="66" y="182" width="30" height="20" rx="10" fill="var(--mascot-boot)" />
        <rect x="104" y="182" width="30" height="20" rx="10" fill="var(--mascot-boot)" />
        <path d="M100 50C142 50 164 86 164 128C164 168 138 194 100 194C62 194 36 168 36 128C36 86 58 50 100 50Z" fill={`url(#${body})`} />
        <ellipse cx="100" cy="160" rx="40" ry="29" fill="var(--mascot-belly)" />
        <g className="m-arm-l m-part">
          <rect x="33" y="118" width="26" height="46" rx="13" fill="var(--mascot-shade)" />
        </g>
        <g className="m-arm-r m-part">
          <rect x="141" y="118" width="26" height="46" rx="13" fill="var(--mascot-shade)" />
        </g>
        {mood === "celebrate" ? (
          <g fill="none" stroke={ink} strokeWidth="5" strokeLinecap="round">
            <path d="M68 118 Q80 104 92 118" />
            <path d="M108 118 Q120 104 132 118" />
          </g>
        ) : (
          <g className="m-eyes m-part">
            <ellipse cx="80" cy="116" rx="16" ry="18" fill="var(--mascot-eye)" />
            <ellipse cx="120" cy="116" rx="16" ry="18" fill="var(--mascot-eye)" />
            <g className="m-pupils m-part">
              <circle cx="83" cy={mood === "sad" ? 121 : 118} r="8.5" fill={ink} />
              <circle cx="117" cy={mood === "sad" ? 121 : 118} r="8.5" fill={ink} />
              <circle cx="86" cy={mood === "sad" ? 117 : 114} r="3" fill="var(--mascot-eye)" />
              <circle cx="120" cy={mood === "sad" ? 117 : 114} r="3" fill="var(--mascot-eye)" />
            </g>
          </g>
        )}
        {mood === "sad" ? (
          <g fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round">
            <path d="M66 98 L90 104" />
            <path d="M134 98 L110 104" />
          </g>
        ) : null}
        {mood === "think" ? (
          <path d="M108 97 Q121 89 134 96" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />
        ) : null}
        <ellipse cx="62" cy="139" rx="9" ry="5.5" fill="var(--mascot-cheek)" opacity="0.65" />
        <ellipse cx="138" cy="139" rx="9" ry="5.5" fill="var(--mascot-cheek)" opacity="0.65" />
        <Mouth mood={mood} />
        <path d="M50 84C50 48 72 28 100 28C128 28 150 48 150 84Z" fill={`url(#${hat})`} />
        <rect x="93" y="28" width="14" height="56" rx="7" fill="var(--mascot-hat-shade)" opacity="0.4" />
        <rect x="38" y="78" width="124" height="14" rx="7" fill="var(--mascot-hat-shade)" />
        <ellipse cx="74" cy="50" rx="7" ry="12" fill="var(--mascot-eye)" opacity="0.5" transform="rotate(-24 74 50)" />
      </g>
    </svg>
  );
}

export function MascotSays({
  mood = "idle",
  size = 84,
  children,
  className = "",
}: {
  mood?: MascotMood;
  size?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end gap-1.5 ${className}`}>
      <Mascot mood={mood} size={size} className="mascot-enter shrink-0" />
      <div
        className="anim-pop relative mb-[22%] min-w-0 rounded-[22px] bg-card px-4 py-3 elev-1"
        style={{ animationDelay: "220ms" }}
      >
        <span aria-hidden="true" className="absolute -left-[5px] bottom-4 size-3.5 rotate-45 rounded-[3px] bg-card" />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}
