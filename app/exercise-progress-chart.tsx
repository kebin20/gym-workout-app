'use client';

const width = 720;
const height = 260;
const margin = { top: 28, right: 18, bottom: 34, left: 56 };

export default function ExerciseProgressChart({
  data,
}: {
  data: { week: number; maxWeight: number; estimatedMax: number }[];
}) {
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maximum = Math.max(
    1,
    ...data.flatMap((item) => [item.maxWeight, item.estimatedMax]),
  );
  const roundedMax = Math.ceil(maximum / 10) * 10 || 10;
  const xFor = (index: number) =>
    margin.left +
    (data.length <= 1
      ? chartWidth / 2
      : (index / (data.length - 1)) * chartWidth);
  const yFor = (value: number) =>
    margin.top + chartHeight - (Math.max(0, value) / roundedMax) * chartHeight;
  const pointsFor = (key: 'maxWeight' | 'estimatedMax') =>
    data.map((item, index) => `${xFor(index)},${yFor(item[key])}`).join(' ');
  const gridValues = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="h-[260px] w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        aria-labelledby="exercise-progress-title exercise-progress-description"
        className="size-full overflow-visible font-sans"
      >
        <title id="exercise-progress-title">Exercise progress</title>
        <desc id="exercise-progress-description">
          {data.length
            ? data
                .map(
                  (item) =>
                    `Week ${item.week}: top weight ${item.maxWeight} kilograms, estimated one rep max ${item.estimatedMax} kilograms`,
                )
                .join('. ')
            : 'No exercise progress has been recorded yet.'}
        </desc>
        <g aria-hidden="true">
          <line
            x1="462"
            x2="490"
            y1="10"
            y2="10"
            stroke="var(--chart-1)"
            strokeWidth="3"
          />
          <text x="498" y="14" fill="var(--muted-foreground)" fontSize="12">
            Top weight
          </text>
          <line
            x1="588"
            x2="616"
            y1="10"
            y2="10"
            stroke="var(--chart-4)"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <text x="624" y="14" fill="var(--muted-foreground)" fontSize="12">
            Est. 1RM
          </text>
        </g>
        {gridValues.map((ratio) => {
          const y = margin.top + chartHeight * (1 - ratio);
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
                {Math.round(roundedMax * ratio)} kg
              </text>
            </g>
          );
        })}
        {data.length > 0 && (
          <>
            <polyline
              points={pointsFor('maxWeight')}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polyline
              points={pointsFor('estimatedMax')}
              fill="none"
              stroke="var(--chart-4)"
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}
        {data.map((item, index) => (
          <g
            key={item.week}
            tabIndex={0}
            aria-label={`Week ${item.week}: top weight ${item.maxWeight} kilograms, estimated one rep max ${item.estimatedMax} kilograms`}
          >
            <title>{`Week ${item.week}: ${item.maxWeight} kg top · ${item.estimatedMax} kg estimated 1RM`}</title>
            <circle
              cx={xFor(index)}
              cy={yFor(item.maxWeight)}
              r="4"
              fill="var(--chart-1)"
            />
            <circle
              cx={xFor(index)}
              cy={yFor(item.estimatedMax)}
              r="3"
              fill="var(--chart-4)"
            />
            <text
              x={xFor(index)}
              y={height - 10}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize="12"
            >
              W{item.week}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
