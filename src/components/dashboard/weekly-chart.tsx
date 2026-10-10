"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Point {
  label: string;
  completed: number;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="border-border bg-surface rounded-[8px] border px-3 py-2 text-xs shadow-[var(--shadow-raised)]">
      <p className="text-muted-foreground">Week of {p.label}</p>
      <p className="text-foreground mt-0.5 font-medium">{p.completed} completed</p>
    </div>
  );
}

/** Single-series weekly bar chart: one hue, recessive grid, hover tooltip. */
export function WeeklyChart({ data }: { data: Point[] }) {
  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label={`Assignments completed per week: ${data.map((d) => `${d.label}: ${d.completed}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            width={40}
          />
          <Tooltip cursor={{ fill: "var(--surface-muted)" }} content={<ChartTooltip />} />
          <Bar
            dataKey="completed"
            fill="var(--accent)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
