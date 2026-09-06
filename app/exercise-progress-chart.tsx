'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const chartConfig = {
  maxWeight: { label: 'Top weight (kg)', color: 'var(--color-chart-1)' },
  estimatedMax: { label: 'Estimated 1RM (kg)', color: 'var(--color-chart-4)' },
} satisfies ChartConfig;

export default function ExerciseProgressChart({
  data,
}: {
  data: { week: number; maxWeight: number; estimatedMax: number }[];
}) {
  return (
    <ChartContainer
      config={chartConfig}
      className="h-[260px] w-full aspect-auto"
    >
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="week"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `W${value}`}
        />
        <YAxis width={42} tickLine={false} axisLine={false} unit=" kg" />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Line
          dataKey="maxWeight"
          type="monotone"
          stroke="var(--color-maxWeight)"
          strokeWidth={3}
          dot={{ r: 4 }}
        />
        <Line
          dataKey="estimatedMax"
          type="monotone"
          stroke="var(--color-estimatedMax)"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 3 }}
        />
      </LineChart>
    </ChartContainer>
  );
}
