'use client';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'lg';
}

export function ScoreBadge({ score, size = 'sm' }: ScoreBadgeProps) {
  const getScoreColor = (s: number) => {
    if (s >= 75) return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s >= 50) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  };

  const getScoreLabel = (s: number) => {
    if (s >= 90) return 'Exceptional';
    if (s >= 75) return 'Strong';
    if (s >= 60) return 'Solid';
    if (s >= 45) return 'Needs Work';
    return 'Poor';
  };

  const colorClass = getScoreColor(score);

  if (size === 'lg') {
    return (
      <div className={`inline-flex flex-col items-center gap-1 rounded-xl border px-6 py-4 ${colorClass}`}>
        <span className="text-4xl font-bold">{score}</span>
        <span className="text-xs font-medium uppercase tracking-wider opacity-80">
          {getScoreLabel(score)}
        </span>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
      {score}
    </span>
  );
}
