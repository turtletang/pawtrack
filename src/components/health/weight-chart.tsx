"use client";
import { useState } from "react";
import { displayWeight, todayUTC, type WeightView, type WeightUnit } from "@/lib/health-records";
import { Card } from "@/components/ui/card";

export function WeightChart({ records, title = "Weight over time" }: { records: WeightView[]; title?: string }) {
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [range, setRange] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const cutoff = Date.parse(todayUTC()) - Number(range) * 86400000;
  const points = [...records].filter(r => range === "all" || Date.parse(r.recordedAt) >= cutoff).reverse();
  const values = points.map(r => displayWeight(r.weightKg, unit));
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 0;
  const padding = Math.max((maximum-minimum)*0.2, maximum*0.03, 0.1);
  const low = Math.max(0, minimum-padding); const high = maximum+padding;
  const start = points[0] ? Date.parse(points[0].recordedAt) : 0;
  const end = points.at(-1) ? Date.parse(points.at(-1)!.recordedAt) : start;
  const x = (r: WeightView) => end === start ? 320 : 56 + (Date.parse(r.recordedAt)-start)/(end-start)*530;
  const y = (value: number) => 174-(value-low)/(high-low)*140;
  const current = points.find(r => r.id === selected) || points.at(-1);
  return <Card className="p-5 sm:p-6"><div className="flex flex-wrap justify-between gap-3 items-center"><div><h2 className="text-base font-semibold">{title}</h2><p className="text-xs text-muted-foreground mt-1">{records.length} dated {records.length === 1 ? "measurement" : "measurements"}</p></div><div className="flex items-center gap-2"><select className="rounded-lg border border-border bg-white px-2 py-2 text-xs" aria-label="Chart date range" value={range} onChange={e => { setRange(e.target.value); setSelected(null); }}><option value="all">All time</option><option value="90">Last 90 days</option><option value="30">Last 30 days</option></select><div className="flex gap-1 rounded-lg bg-muted p-1" aria-label="Weight display unit">{(["kg","lb"] as const).map(value => <button type="button" key={value} aria-pressed={unit === value} onClick={() => setUnit(value)} className={`rounded-md px-3 py-1 text-xs ${unit === value ? "bg-white text-primary shadow-sm" : "text-muted-foreground"}`}>{value}</button>)}</div></div></div>
    {!points.length ? <p className="py-14 text-center text-sm text-muted-foreground">{records.length ? "No measurements in this date range." : "Add a dated weight record to start their health story."}</p> : <>
      <div className="mt-4 min-h-10 text-xs text-muted-foreground" aria-live="polite">{current && <><strong className="text-2xl text-primary font-medium">{displayWeight(current.weightKg, unit)} <span className="text-sm">{unit}</span></strong><span className="ml-3">{current.recordedAt}</span></>}</div>
      <svg viewBox="0 0 640 215" className="w-full overflow-visible" aria-label={`${title}, ${unit}. Focus or tap a measurement to inspect it.`}>
        {[0,0.5,1].map(fraction => <g key={fraction}><line x1="56" x2="602" y1={174-fraction*140} y2={174-fraction*140} stroke="#e6e9e2" strokeDasharray="4 5" /><text x="45" y={178-fraction*140} textAnchor="end" fontSize="10" fill="#899382">{(low+fraction*(high-low)).toFixed(1)}</text></g>)}
        <polyline points={points.map((r,i) => `${x(r)},${y(values[i])}`).join(" ")} fill="none" stroke="#668b6a" strokeWidth="2.5" />
        {points.map((r,i) => <circle key={r.id} cx={x(r)} cy={y(values[i])} r={selected === r.id ? 6 : 4} fill="#fff" stroke="#668b6a" strokeWidth="2.5" tabIndex={0} role="button" aria-label={`${r.recordedAt}: ${values[i]} ${unit}`} onFocus={() => setSelected(r.id)} onMouseEnter={() => setSelected(r.id)} onClick={() => setSelected(r.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(r.id); } }}><title>{r.recordedAt}: {values[i]} {unit}</title></circle>)}
        <text x="56" y="204" fontSize="10" fill="#899382">{points[0].recordedAt}</text><text x="602" y="204" textAnchor="end" fontSize="10" fill="#899382">{points.length > 1 ? points.at(-1)!.recordedAt : ""}</text>
      </svg><p className="mt-2 text-[10px] text-muted-foreground">Tap, hover, or focus a point to inspect it. Weight is stored in kg.</p>
    </>}
  </Card>;
}
