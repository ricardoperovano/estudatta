/** Ícones das conquistas: o servidor manda o nome Phosphor; aqui o mapa para o componente. */
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  BookBookmark,
  BookOpen,
  Books,
  CalendarCheck,
  CheckSquare,
  Clock,
  Crosshair,
  Exam,
  Flame,
  ListChecks,
  MapTrifold,
  Medal,
  MoonStars,
  PersonSimpleRun,
  Play,
  Stack,
  SunHorizon,
  Target,
  Timer,
  TrendUp,
  Trophy,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, Icon> = {
  ArrowCounterClockwise,
  ArrowsClockwise,
  BookBookmark,
  BookOpen,
  Books,
  CalendarCheck,
  CheckSquare,
  Clock,
  Crosshair,
  Exam,
  Flame,
  ListChecks,
  MapTrifold,
  Medal,
  MoonStars,
  PersonSimpleRun,
  Play,
  Stack,
  SunHorizon,
  Target,
  Timer,
  TrendUp,
  Trophy,
};

/** Medalha redonda: colorida quando desbloqueada, em traço quando não. */
export function AchievementBadge({ icon, unlocked, size = 48, className }: { icon: string; unlocked: boolean; size?: number; className?: string }) {
  const I = ICONS[icon] ?? Medal;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        unlocked ? "bg-accent-800 text-accent-100 shadow-accent-ring" : "border border-dashed border-neutral-600 text-neutral-600",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <I size={Math.round(size * 0.5)} weight={unlocked ? "fill" : "regular"} />
    </span>
  );
}
