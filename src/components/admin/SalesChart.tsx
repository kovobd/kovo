import { useEffect, useRef, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { CURRENCY_SYMBOL } from "@/lib/currency";

export interface SalesPoint { label: string; revenue: number; orders: number; }

// Resolve HSL tokens to concrete strings once, with fallbacks. Recharts gets confused
// if a color prop momentarily resolves to an invalid value during the first paint.
const resolveColor = (token: string, fallback: string): string => {
  if (typeof window === "undefined") return fallback;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return v ? `hsl(${v})` : fallback;
  } catch {
    return fallback;
  }
};

const SalesChart = ({ data, dense }: { data: SalesPoint[]; dense?: boolean }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [colors] = useState(() => ({
    ink: resolveColor("--a-ink", "#111111"),
    muted: resolveColor("--a-muted", "#6b6b6b"),
    stroke: resolveColor("--a-stroke", "rgba(0,0,0,0.08)"),
  }));

  // Wait until the parent has a real size before mounting ResponsiveContainer.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const check = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setReady(true);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="w-full h-full">
      {ready && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={dense ? 10 : 18} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke={colors.stroke} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10.5, fill: colors.muted, fontFamily: "Inter, system-ui" }}
              tickLine={false}
              axisLine={false}
              interval={dense ? 3 : "preserveStartEnd"}
              dy={4}
            />
            <YAxis
              tick={{ fontSize: 10.5, fill: colors.muted, fontFamily: "Inter, system-ui" }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v) => `${CURRENCY_SYMBOL}${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <Tooltip
              cursor={{ fill: colors.stroke, opacity: 0.5, radius: 6 }}
              contentStyle={{
                borderRadius: "10px",
                border: "none",
                fontSize: "12px",
                padding: "8px 12px",
                background: "rgba(255,255,255,0.98)",
                boxShadow: "0 0 0 1px rgba(15,17,21,0.08), 0 12px 32px -10px rgba(15,17,21,0.18)",
                backdropFilter: "blur(12px)",
              }}
              labelStyle={{ fontSize: 11, color: colors.muted, marginBottom: 4, fontWeight: 500 }}
              itemStyle={{ color: colors.ink, fontWeight: 600, padding: 0 }}
              formatter={(value: number, name: string) => [
                name === "revenue" ? `${CURRENCY_SYMBOL}${value.toLocaleString()}` : value,
                name === "revenue" ? "Revenue" : "Orders",
              ]}
            />
            <Bar
              dataKey="revenue"
              fill={colors.ink}
              radius={[5, 5, 0, 0]}
              isAnimationActive
              animationDuration={520}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};



export default SalesChart;
