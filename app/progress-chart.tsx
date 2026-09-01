'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const chartConfig = {
  volume: { label: 'Volume (kg)', color: 'var(--color-chart-1)' },
} satisfies ChartConfig;

export default function ProgressChart({ data }: { data: { week: number; volume: number }[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full aspect-auto">
      <BarChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickFormatter={(value) => `W${value}`} />
        <YAxis width={42} tickLine={false} axisLine={false} tickFormatter={(value) => value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="volume" fill="var(--color-volume)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
