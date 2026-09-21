/**
 * Tatá — mascote do Estudatta: um cronômetro pequeno, derivado da logo (cronômetro + livro),
 * com o marcador roxo do livro como cauda. Todas as animações ficam em mascot.css e são
 * controladas pela classe de estado no elemento raiz (`tata--idle`, `tata--focus`...).
 * Respeita prefers-reduced-motion (animações desligadas, poses mantidas).
 */

import { useId } from "react";
import "./mascot.css";

export type TataMood =
  "idle" | "focus" | "cheer" | "sleep" | "paused" | "wave" | "encourage" | "love" | "think";

interface Props {
  mood?: TataMood;
  size?: number;
  /** deslocamento dos olhos (-1..1) para seguir o ponteiro */
  look?: { x: number; y: number };
  className?: string;
  title?: string;
}

export function TataSvg({ mood = "idle", size = 120, look = { x: 0, y: 0 }, className, title }: Props) {
  const gid = `tata-face-${useId().replace(/:/g, "")}`;
  const lx = Math.max(-1, Math.min(1, look.x)) * 4;
  const ly = Math.max(-1, Math.min(1, look.y)) * 3;
  const closed = mood === "sleep";
  const happyEyes = mood === "cheer" || mood === "love";
  return (
    <svg
      viewBox="0 0 200 220"
      width={size}
      height={size * 1.1}
      className={["tata", `tata--${mood}`, className].filter(Boolean).join(" ")}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <radialGradient id={gid} cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e7e9f7" />
        </radialGradient>
      </defs>
      <ellipse className="tata-shadow" cx="100" cy="206" rx="46" ry="7" fill="#000" opacity="0.18" />
      <g className="tata-body">
        {/* cauda: marcador do livro */}
        <path
          className="tata-tail"
          d="M136 168 L136 200 L146 192 L156 200 L156 164 Z"
          fill="#d9a86a"
          stroke="#b9854a"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* pés */}
        <ellipse cx="78" cy="186" rx="15" ry="9" fill="#5b4fa8" />
        <ellipse cx="122" cy="186" rx="15" ry="9" fill="#5b4fa8" />
        {/* braços */}
        <path
          className="tata-arm tata-arm--left"
          d="M36 116 C22 122 16 134 18 146"
          fill="none"
          stroke="#5b4fa8"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          className="tata-arm tata-arm--right"
          d="M164 116 C178 122 184 134 182 146"
          fill="none"
          stroke="#5b4fa8"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* pino e botão do cronômetro */}
        <rect x="93" y="30" width="14" height="14" rx="3" fill="#6f63b8" />
        <rect
          className="tata-knob"
          x="82"
          y="16"
          width="36"
          height="18"
          rx="9"
          fill="#5b4fa8"
          stroke="#8e7cd6"
          strokeWidth="2"
        />
        <rect x="146" y="44" width="16" height="10" rx="4" transform="rotate(40 154 49)" fill="#6f63b8" />
        {/* corpo */}
        <circle cx="100" cy="112" r="72" fill="#5b4fa8" stroke="#8e7cd6" strokeWidth="2.5" />
        <circle cx="100" cy="112" r="60" fill={`url(#${gid})`} />
        {/* marcas do mostrador */}
        <g stroke="#b2b6ca" strokeWidth="4" strokeLinecap="round">
          <line x1="100" y1="58" x2="100" y2="66" />
          <line x1="154" y1="112" x2="146" y2="112" />
          <line x1="46" y1="112" x2="54" y2="112" />
        </g>
        {/* bochechas */}
        <ellipse className="tata-cheek" cx="66" cy="128" rx="10" ry="6" fill="#f4a9b5" opacity="0.75" />
        <ellipse className="tata-cheek" cx="134" cy="128" rx="10" ry="6" fill="#f4a9b5" opacity="0.75" />
        {/* olhos */}
        <g className="tata-eyes" transform={`translate(${lx} ${ly})`}>
          {closed ? (
            <g stroke="#292b31" strokeWidth="4" strokeLinecap="round" fill="none">
              <path d="M70 108 Q79 114 88 108" />
              <path d="M112 108 Q121 114 130 108" />
            </g>
          ) : happyEyes ? (
            <g stroke="#292b31" strokeWidth="4.5" strokeLinecap="round" fill="none">
              <path d="M70 110 Q79 99 88 110" />
              <path d="M112 110 Q121 99 130 110" />
            </g>
          ) : (
            <g className="tata-eye-open">
              <ellipse cx="79" cy="106" rx="10" ry="12.5" fill="#292b31" />
              <ellipse cx="121" cy="106" rx="10" ry="12.5" fill="#292b31" />
              <circle cx="83" cy="101" r="4" fill="#fff" />
              <circle cx="125" cy="101" r="4" fill="#fff" />
              <circle cx="76" cy="111" r="1.8" fill="#fff" opacity="0.8" />
              <circle cx="118" cy="111" r="1.8" fill="#fff" opacity="0.8" />
            </g>
          )}
        </g>
        {/* boca */}
        {mood === "cheer" || mood === "love" ? (
          <path
            d="M88 128 Q100 146 112 128 Z"
            fill="#292b31"
            stroke="#292b31"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ) : mood === "sleep" ? (
          <ellipse cx="100" cy="134" rx="4" ry="5" fill="#292b31" />
        ) : mood === "think" ? (
          <path
            d="M92 134 Q100 130 108 134"
            fill="none"
            stroke="#292b31"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M90 128 Q100 138 110 128"
            fill="none"
            stroke="#292b31"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        )}
        {/* livrinho (foco) */}
        <g className="tata-book">
          <path
            d="M60 150 L100 158 L140 150 L140 176 L100 184 L60 176 Z"
            fill="#f3f5fe"
            stroke="#2d2f3a"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <line x1="100" y1="158" x2="100" y2="184" stroke="#2d2f3a" strokeWidth="3" />
          <path d="M112 160 L112 176 L117 172 L122 176 L122 158" fill="#8e7cd6" />
        </g>
        {/* xícara (pausa) */}
        <g className="tata-cup">
          <path
            d="M146 160 L170 160 L167 182 L149 182 Z"
            fill="#d9a86a"
            stroke="#2d2f3a"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path d="M170 164 Q180 168 169 176" fill="none" stroke="#2d2f3a" strokeWidth="2.5" />
          <path
            className="tata-steam"
            d="M154 154 q-4 -6 0 -12 M162 154 q-4 -6 0 -12"
            fill="none"
            stroke="#b2b6ca"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      </g>
      {/* efeitos */}
      <g className="tata-zzz" fill="#9184d9" fontFamily="Inter, system-ui, sans-serif" fontWeight="600">
        <text x="150" y="60" fontSize="18">
          z
        </text>
        <text x="164" y="44" fontSize="14">
          z
        </text>
        <text x="176" y="30" fontSize="11">
          z
        </text>
      </g>
      <g className="tata-sparkles" fill="#d9a86a">
        <path d="M30 40 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z" />
        <path d="M170 70 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z" fill="#7cc4a4" />
        <path d="M24 150 l2.5 6 l6 2.5 l-6 2.5 l-2.5 6 l-2.5 -6 l-6 -2.5 l6 -2.5 Z" fill="#84b3d9" />
      </g>
      <g className="tata-heart">
        <path d="M100 24 C 92 12, 74 18, 82 32 L100 46 L118 32 C 126 18, 108 12, 100 24 Z" fill="#e87a8c" />
      </g>
      <g className="tata-dots" fill="#9184d9">
        <circle cx="150" cy="44" r="4" />
        <circle cx="164" cy="34" r="5" />
        <circle cx="180" cy="22" r="6" />
      </g>
    </svg>
  );
}
