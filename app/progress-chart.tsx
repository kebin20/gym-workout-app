'use client';

const width = 720;
const height = 300;
const margin = { top: 18, right: 14, bottom: 36, left: 54 };

function compactNumber(value: number) {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
}

function roundedMaximum(value: number) {
  if (value <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export default function ProgressChart({
  data,
}: {
  data: { week: number; volume: number }[];
}) {
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maximum = roundedMaximum(
    Math.max(0, ...data.map((item) => item.volume)),
  );
  const slotWidth = chartWidth / Math.max(1, data.length);
  const barWidth = Math.min(42, Math.max(12, slotWidth * 0.58));
  const gridValues = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="h-[300px] w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        aria-labelledby="weekly-volume-title weekly-volume-description"
        className="size-full overflow-visible font-sans"
      >
        <title id="weekly-volume-title">Weekly training volume</title>
        <desc id="weekly-volume-description">
          {data.length
            ? data
                .map((item) => `Week ${item.week}: ${item.volume} kilograms`)
                .join('. ')
            : 'No weekly volume has been recorded yet.'}
        </desc>
        {gridValues.map((ratio) => {
          const y = margin.top + chartHeight * (1 - ratio);
          const value = Math.round(maximum * ratio);
          return (
            <g key={ratio} aria-hidden="true">
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="3 4"
                opacity="0.72"
              />
              <text
                x={margin.left - 9}
                y={y + 4}
                textAnchor="end"
                fill="var(--muted-foreground)"
                fontSize="12"
              >
                {compactNumber(value)}
              </text>
            </g>
          );
        })}
        {data.map((item, index) => {
          const barHeight = (Math.max(0, item.volume) / maximum) * chartHeight;
          const x =
            margin.left + index * slotWidth + (slotWidth - barWidth) / 2;
          const y = margin.top + chartHeight - barHeight;
          return (
            <g
              key={item.week}
              tabIndex={0}
              aria-label={`Week ${item.week}: ${item.volume} kilograms`}
            >
              <title>{`Week ${item.week}: ${item.volume.toLocaleString()} kg`}</title>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(0, barHeight)}
                rx="6"
                fill="var(--chart-1)"
              />
              <text
                x={x + barWidth / 2}
                y={height - 12}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize="12"
              >
                W{item.week}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
