'use client';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'lg';
}

function getScoreColor(s: number) {
  if (s >= 75) return 'bg-green-500/10 text-green-400 border-green-500/20';
  if (s >= 50) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  return 'bg-red-500/10 text-red-400 border-red-500/20';
}

function getScoreLabel(s: number) {
  if (s >= 90) return 'Exceptional';
  if (s >= 75) return 'Strong';
  if (s >= 60) return 'Solid';
  if (s >= 45) return 'Needs Work';
  return 'Poor';
}

function getScoreColorHex(s: number) {
  if (s >= 75) return '#4ade80';
  if (s >= 50) return '#facc15';
  return '#f87171';
}

export function ScoreBadge({ score, size = 'sm' }: ScoreBadgeProps) {
  if (size === 'lg') {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const strokeColor = getScoreColorHex(score);

    return (
      <div className="inline-flex flex-col items-center">
        <div className="relative w-[120px] h-[120px]">
          <svg className="w-full h-full" viewBox="0 0 120 120">
            <circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="8"
            />
            <circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke={strokeColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-mono font-medium text-white">{score}</span>
            <span
              className="text-[10px] font-medium uppercase tracking-[1.5px]"
              style={{ color: strokeColor }}
            >
              {getScoreLabel(score)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const colorClass = getScoreColor(score);

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
      {score}
    </span>
  );
}
