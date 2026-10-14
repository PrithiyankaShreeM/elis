import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type RiskLevel = "Low" | "Medium" | "High";
type ScenarioDirection = "up" | "down";

type PreviewRow = Record<string, string | number | null>;

type Scenario = {
  name: string;
  value: number;
  changePercent: number;
  direction: ScenarioDirection;
};

type FeatureImportance = {
  label: string;
  value: number;
};

type ChartPoint = {
  period: string;
  historical?: number | null;
  forecast?: number | null;
  peak?: number | null;
  reduced?: number | null;
  anomaly?: number | null;
};

type SourcePoint = {
  timestamp: string;
  load_kwh: number;
};

type AnalysisResponse = {
  status: string;
  message: string;
  prediction: number;
  confidence: number;
  riskLevel: RiskLevel;
  scenarios: Scenario[];
  insights: {
    featureImportance: FeatureImportance[];
    text: string;
  };
  columns: string[];
  preview: PreviewRow[];
  metadata: {
    records: number;
    dateRange: string;
    source: string;
  };
  chart: ChartPoint[];
  sourceSeries: SourcePoint[];
};

type ErrorPayload = {
  error?: string;
  message?: string;
};

type IconProps = {
  className?: string;
  children: ReactNode;
};

const API_BASE_URL = "http://127.0.0.1:5000";

const numberFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const riskStyles: Record<RiskLevel, string> = {
  Low: "border-[#2E7D32]/20 bg-[#2E7D32]/10 text-[#2E7D32]",
  Medium: "border-[#F9A825]/25 bg-[#F9A825]/12 text-[#8A6A00]",
  High: "border-[#C62828]/20 bg-[#C62828]/10 text-[#C62828]",
};

const navigationItems = ["Dashboard", "Data Upload", "Analysis", "Reports"] as const;
type NavigationItem = (typeof navigationItems)[number];

function createReferenceAnalysis(): AnalysisResponse {
  const sourceSeries: SourcePoint[] = [
    { timestamp: "2026-01-01", load_kwh: 128.4 },
    { timestamp: "2026-01-02", load_kwh: 132.1 },
    { timestamp: "2026-01-03", load_kwh: 130.8 },
    { timestamp: "2026-01-04", load_kwh: 136.2 },
    { timestamp: "2026-01-05", load_kwh: 141.5 },
    { timestamp: "2026-01-06", load_kwh: 144.2 },
    { timestamp: "2026-01-07", load_kwh: 143.1 },
    { timestamp: "2026-01-08", load_kwh: 149.6 },
  ];

  return {
    status: "reference",
    message: "Reference load profile displayed until a verified dataset is uploaded.",
    prediction: 154.2,
    confidence: 11.6,
    riskLevel: "Medium",
    scenarios: [
      {
        name: "Peak Demand Scenario",
        value: 171.3,
        changePercent: 11.1,
        direction: "up",
      },
      {
        name: "Reduced Load Scenario",
        value: 141.8,
        changePercent: -8.0,
        direction: "down",
      },
      {
        name: "Anomaly Spike Scenario",
        value: 183.4,
        changePercent: 18.9,
        direction: "up",
      },
    ],
    insights: {
      featureImportance: [
        { label: "Historical Trend Influence", value: 58 },
        { label: "Temporal Pattern", value: 27 },
        { label: "Variability Factor", value: 15 },
      ],
      text: "Demand variation is primarily driven by historical consumption trends with moderate temporal influence.",
    },
    columns: ["timestamp", "load_kwh"],
    preview: sourceSeries.slice(0, 6),
    metadata: {
      records: sourceSeries.length,
      dateRange: "2026-01-01 to 2026-01-08",
      source: "Reference profile",
    },
    chart: [
      { period: "Jan 01", historical: 128.4 },
      { period: "Jan 02", historical: 132.1 },
      { period: "Jan 03", historical: 130.8 },
      { period: "Jan 04", historical: 136.2 },
      { period: "Jan 05", historical: 141.5 },
      { period: "Jan 06", historical: 144.2 },
      { period: "Jan 07", historical: 143.1 },
      { period: "Jan 08", historical: 149.6, forecast: 149.6 },
      { period: "Jan 09", forecast: 151.2, peak: 168.0, reduced: 139.1, anomaly: 179.8 },
      { period: "Jan 10", forecast: 153.1, peak: 170.1, reduced: 140.9, anomaly: 182.2 },
      { period: "Jan 11", forecast: 154.2, peak: 171.3, reduced: 141.8, anomaly: 183.4 },
    ],
    sourceSeries,
  };
}

function IconFrame({ className = "", children }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function NavigationIcon({ item }: { item: NavigationItem }) {
  if (item === "Dashboard") {
    return (
      <IconFrame className="h-4 w-4">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </IconFrame>
    );
  }

  if (item === "Data Upload") {
    return (
      <IconFrame className="h-4 w-4">
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M4 20h16" />
      </IconFrame>
    );
  }

  if (item === "Analysis") {
    return (
      <IconFrame className="h-4 w-4">
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 15 4-4 3 3 5-7" />
      </IconFrame>
    );
  }

  return (
    <IconFrame className="h-4 w-4">
      <path d="M7 3h8l4 4v14H7z" />
      <path d="M15 3v5h5" />
      <path d="M10 13h6" />
      <path d="M10 17h6" />
    </IconFrame>
  );
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatPercent(value: number) {
  return percentFormatter.format(value);
}

function normalizeRisk(value: string | undefined): RiskLevel {
  if (value === "Low" || value === "Medium" || value === "High") {
    return value;
  }

  return "Medium";
}

function isErrorPayload(payload: unknown): payload is ErrorPayload {
  return typeof payload === "object" && payload !== null && ("error" in payload || "message" in payload);
}

function normalizeAnalysis(payload: AnalysisResponse): AnalysisResponse {
  const fallback = createReferenceAnalysis();

  return {
    ...fallback,
    ...payload,
    riskLevel: normalizeRisk(payload.riskLevel),
    scenarios: payload.scenarios?.length ? payload.scenarios : fallback.scenarios,
    insights: {
      ...fallback.insights,
      ...payload.insights,
      featureImportance: payload.insights?.featureImportance?.length
        ? payload.insights.featureImportance
        : fallback.insights.featureImportance,
    },
    metadata: {
      ...fallback.metadata,
      ...payload.metadata,
    },
    chart: payload.chart?.length ? payload.chart : fallback.chart,
    preview: payload.preview?.length ? payload.preview : fallback.preview,
    columns: payload.columns?.length ? payload.columns : fallback.columns,
    sourceSeries: payload.sourceSeries?.length ? payload.sourceSeries : fallback.sourceSeries,
  };
}

export default function App() {
  const [analysis, setAnalysis] = useState<AnalysisResponse>(() => createReferenceAnalysis());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Awaiting verified dataset");
  const [error, setError] = useState("");

  const previewColumns = useMemo(() => analysis.columns.slice(0, 5), [analysis.columns]);
  const latestScenario = analysis.scenarios[0];

  async function requestAnalysis(url: string, init: RequestInit, successMessage: string) {
    setIsProcessing(true);
    setError("");
    setStatusMessage("Processing dataset...");

    try {
      const response = await fetch(url, init);
      const payload = (await response.json().catch(() => null)) as AnalysisResponse | ErrorPayload | null;

      if (!response.ok) {
        const message = isErrorPayload(payload)
          ? payload.error ?? payload.message ?? "Dataset processing failed."
          : "Dataset processing failed.";
        throw new Error(message);
      }

      setAnalysis(normalizeAnalysis(payload as AnalysisResponse));
      setIsLoaded(true);
      setStatusMessage(successMessage);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to process dataset.";
      setError(
        message.includes("Failed to fetch")
          ? "Unable to reach ELIS API. Start the Flask backend on http://127.0.0.1:5000."
          : message,
      );
      setStatusMessage("Dataset processing interrupted");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError("");
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setError("Select a CSV, Excel, PDF, or image file before upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    await requestAnalysis(`${API_BASE_URL}/upload`, { method: "POST", body: formData }, "Dataset Loaded Successfully");
  }

  async function handlePredict() {
    await requestAnalysis(
      `${API_BASE_URL}/predict`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ series: analysis.sourceSeries }),
      },
      "Forecast recalculated successfully",
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F]">
      <header className="sticky top-0 z-20 border-b border-[#D2D2D7]/70 bg-[#F5F5F7]/95 backdrop-blur-xl">
        <div className="flex min-h-20 items-center justify-between px-6 lg:px-10">
          <div>
            <div className="text-[1.72rem] font-semibold leading-none tracking-[-0.045em] text-[#1D1D1F]">ELIS</div>
            <div className="mt-1 text-sm font-normal tracking-[-0.01em] text-[#6E6E73]">
              E-Load Intelligence System
            </div>
          </div>
          <div className="hidden items-center gap-3 text-sm text-[#6E6E73] sm:flex">
            <span className="h-2 w-2 rounded-full bg-[#2E7D32] shadow-[0_0_0_4px_rgba(46,125,50,0.08)]" />
            Electricity Board Operations Console
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden min-h-[calc(100vh-5rem)] w-64 shrink-0 border-r border-[#D2D2D7]/70 px-5 py-8 lg:block">
          <nav className="space-y-1" aria-label="Primary navigation">
            {navigationItems.map((item) => {
              const isActive = item === "Dashboard";

              return (
                <a
                  key={item}
                  href={`#${item.toLowerCase().replace(" ", "-")}`}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200 ${
                    isActive
                      ? "bg-white text-[#1D1D1F] shadow-[0_8px_30px_rgba(0,0,0,0.045)]"
                      : "text-[#6E6E73] hover:bg-white/70 hover:text-[#1D1D1F]"
                  }`}
                >
                  <NavigationIcon item={item} />
                  <span>{item}</span>
                </a>
              );
            })}
          </nav>

          <div className="mt-12 border-t border-[#D2D2D7]/70 pt-6 text-sm leading-6 text-[#6E6E73]">
            <p className="font-medium text-[#1D1D1F]">Model Status</p>
            <p className="mt-2">Regression engine online. Forecast horizon is calibrated from uploaded load history.</p>
          </div>
        </aside>

        <main className="w-full flex-1 px-5 py-6 sm:px-6 lg:px-10 lg:py-9">
          <section id="dashboard" className="mb-8 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div className="max-w-3xl">
              <p className="text-sm font-medium tracking-[0.08em] text-[#6E6E73]">LOAD FORECASTING AND DEMAND RISK</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#1D1D1F] sm:text-4xl">
                Enterprise electricity demand intelligence for board operations.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#6E6E73]">
                Upload consumption records, validate the dataset, and generate a measured load forecast with scenario and
                model influence reporting.
              </p>
            </div>
            <div className="rounded-full border border-[#D2D2D7]/80 bg-white px-4 py-2 text-sm text-[#6E6E73] shadow-[0_10px_35px_rgba(0,0,0,0.04)]">
              {statusMessage}
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.96fr)_minmax(420px,1.04fr)]">
            <section
              id="data-upload"
              className="rounded-3xl border border-[#D2D2D7]/75 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.045)] sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.025em]">Data Upload Panel</h2>
                  <p className="mt-2 text-sm leading-6 text-[#6E6E73]">
                    Primary intake for CSV, Excel, PDF, and optional image-based meter records.
                  </p>
                </div>
                <IconFrame className="h-5 w-5 text-[#6E6E73]">
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M4 20h16" />
                </IconFrame>
              </div>

              <form onSubmit={handleUpload} className="mt-6 space-y-4">
                <div className="rounded-2xl border border-dashed border-[#D2D2D7] bg-[#F5F5F7]/60 p-5 transition-colors duration-200 hover:bg-[#F5F5F7]">
                  <input
                    id="dataset-file"
                    type="file"
                    accept=".csv,.xlsx,.pdf,.png,.jpg,.jpeg"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                  <label htmlFor="dataset-file" className="flex cursor-pointer flex-col gap-2">
                    <span className="text-sm font-medium text-[#1D1D1F]">Select consumption dataset</span>
                    <span className="text-sm text-[#6E6E73]">
                      {selectedFile ? selectedFile.name : "Supported formats: CSV, XLSX, PDF, JPG, PNG"}
                    </span>
                  </label>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="inline-flex items-center justify-center rounded-full bg-[#1D1D1F] px-5 py-2.5 text-sm font-medium text-white transition duration-200 hover:bg-black disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    Upload and Analyze
                  </button>
                  <button
                    type="button"
                    onClick={handlePredict}
                    disabled={isProcessing}
                    className="inline-flex items-center justify-center rounded-full border border-[#D2D2D7] bg-white px-5 py-2.5 text-sm font-medium text-[#1D1D1F] transition duration-200 hover:border-[#A7A7AD] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    Recalculate Forecast
                  </button>
                </div>
              </form>

              <div className="mt-5 min-h-7">
                {isProcessing ? (
                  <div className="flex items-center gap-3 text-sm text-[#6E6E73]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#0A84FF]" />
                    Processing dataset...
                  </div>
                ) : null}
                {isLoaded && !isProcessing ? (
                  <div className="text-sm font-medium text-[#2E7D32]">Dataset Loaded Successfully</div>
                ) : null}
                {error ? <div className="text-sm font-medium text-[#C62828]">{error}</div> : null}
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3 border-y border-[#D2D2D7]/70 py-4 text-sm">
                <div>
                  <div className="text-[#6E6E73]">Records</div>
                  <div className="mt-1 font-medium">{formatNumber(analysis.metadata.records)}</div>
                </div>
                <div>
                  <div className="text-[#6E6E73]">Range</div>
                  <div className="mt-1 truncate font-medium">{analysis.metadata.dateRange}</div>
                </div>
                <div>
                  <div className="text-[#6E6E73]">Source</div>
                  <div className="mt-1 truncate font-medium">{analysis.metadata.source}</div>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-[#D2D2D7]/70">
                <div className="border-b border-[#D2D2D7]/70 bg-[#F5F5F7]/65 px-4 py-3 text-sm font-medium">
                  Uploaded Data Preview
                </div>
                <div className="max-h-56 overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-white text-[#6E6E73]">
                      <tr>
                        {previewColumns.map((column) => (
                          <th key={column} className="border-b border-[#D2D2D7]/70 px-4 py-3 font-medium">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.preview.slice(0, 8).map((row, rowIndex) => (
                        <tr key={`${rowIndex}-${String(row[previewColumns[0]] ?? "row")}`} className="odd:bg-[#F5F5F7]/35">
                          {previewColumns.map((column) => (
                            <td key={column} className="border-b border-[#D2D2D7]/50 px-4 py-3 text-[#1D1D1F]">
                              {String(row[column] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-[#D2D2D7]/75 bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.045)] sm:p-7">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                <div>
                  <p className="text-sm font-medium tracking-[0.08em] text-[#6E6E73]">PREDICTION SUMMARY</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">Load Prediction Engine</h2>
                </div>
                <span className={`w-fit rounded-full border px-3 py-1 text-sm font-medium ${riskStyles[analysis.riskLevel]}`}>
                  {analysis.riskLevel} Risk
                </span>
              </div>

              <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.75fr]">
                <div>
                  <div className="text-sm text-[#6E6E73]">Predicted Load</div>
                  <div className="mt-2 flex items-end gap-3">
                    <span className="text-5xl font-semibold tracking-[-0.065em] sm:text-6xl">
                      {formatNumber(analysis.prediction)}
                    </span>
                    <span className="pb-2 text-lg text-[#6E6E73]">kWh</span>
                  </div>
                  <div className="mt-4 text-base text-[#6E6E73]">
                    Confidence Range: {formatNumber(analysis.prediction)} ± {formatNumber(analysis.confidence)} kWh
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl bg-[#F5F5F7]/70 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[#6E6E73]">Primary Scenario</span>
                    <span className="text-sm font-medium">{latestScenario?.name ?? "Peak Demand Scenario"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[#6E6E73]">Scenario Value</span>
                    <span className="text-sm font-medium">{formatNumber(latestScenario?.value ?? analysis.prediction)} kWh</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[#6E6E73]">Change</span>
                    <span className="text-sm font-medium">
                      {latestScenario?.direction === "down" ? "↓" : "↑"} {formatPercent(Math.abs(latestScenario?.changePercent ?? 0))}%
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section
            id="analysis"
            className="mt-5 rounded-3xl border border-[#D2D2D7]/75 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.045)] sm:p-6"
          >
            <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.025em]">Load Profile Visualization</h2>
                <p className="mt-2 text-sm leading-6 text-[#6E6E73]">
                  Historical consumption, forecast extension, and scenario overlays are shown with thin, neutral strokes.
                </p>
              </div>
              <div className="text-sm text-[#6E6E73]">kWh by period</div>
            </div>

            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analysis.chart} margin={{ top: 10, right: 18, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="#D2D2D7" strokeOpacity={0.55} vertical={false} />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: "#6E6E73", fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: "#D2D2D7" }}
                  />
                  <YAxis
                    width={58}
                    tick={{ fill: "#6E6E73", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatNumber(Number(value))}
                  />
                  <Tooltip
                    cursor={{ stroke: "#D2D2D7", strokeWidth: 1 }}
                    contentStyle={{
                      border: "1px solid #D2D2D7",
                      borderRadius: 14,
                      boxShadow: "0 16px 40px rgba(0,0,0,0.08)",
                      color: "#1D1D1F",
                    }}
                    formatter={(value) => [`${formatNumber(Number(value))} kWh`, ""]}
                    labelStyle={{ color: "#6E6E73", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ color: "#6E6E73", fontSize: 12, paddingTop: 14 }} />
                  <Line
                    type="monotone"
                    dataKey="historical"
                    name="Historical"
                    stroke="#1D1D1F"
                    strokeWidth={1.8}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    isAnimationActive
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name="Forecast"
                    stroke="#0A84FF"
                    strokeWidth={1.8}
                    dot={false}
                    strokeDasharray="4 4"
                    isAnimationActive
                  />
                  <Line
                    type="monotone"
                    dataKey="peak"
                    name="Peak"
                    stroke="#C62828"
                    strokeWidth={1.2}
                    dot={false}
                    strokeOpacity={0.72}
                    isAnimationActive
                  />
                  <Line
                    type="monotone"
                    dataKey="reduced"
                    name="Reduced"
                    stroke="#2E7D32"
                    strokeWidth={1.2}
                    dot={false}
                    strokeOpacity={0.72}
                    isAnimationActive
                  />
                  <Line
                    type="monotone"
                    dataKey="anomaly"
                    name="Anomaly"
                    stroke="#9A7A00"
                    strokeWidth={1.2}
                    dot={false}
                    strokeOpacity={0.72}
                    strokeDasharray="2 5"
                    isAnimationActive
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-3xl border border-[#D2D2D7]/75 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.045)] sm:p-6">
              <h2 className="text-xl font-semibold tracking-[-0.025em]">Scenario Intelligence</h2>
              <p className="mt-2 text-sm leading-6 text-[#6E6E73]">
                Demand cases generated from observed trend, variance, and forecast residuals.
              </p>

              <div className="mt-6 divide-y divide-[#D2D2D7]/70">
                {analysis.scenarios.map((scenario) => (
                  <div key={scenario.name} className="grid grid-cols-[1fr_auto] gap-4 py-4 first:pt-0 last:pb-0">
                    <div>
                      <div className="font-medium text-[#1D1D1F]">{scenario.name}</div>
                      <div className="mt-1 text-sm text-[#6E6E73]">
                        {scenario.direction === "down" ? "↓" : "↑"} {formatPercent(Math.abs(scenario.changePercent))}% from forecast
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatNumber(scenario.value)}</div>
                      <div className="mt-1 text-sm text-[#6E6E73]">kWh</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section
              id="reports"
              className="rounded-3xl border border-[#D2D2D7]/75 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.045)] sm:p-6"
            >
              <h2 className="text-xl font-semibold tracking-[-0.025em]">Insight Engine</h2>
              <p className="mt-2 text-sm leading-6 text-[#6E6E73]">
                Model explanation and professional operational reading generated from feature influence.
              </p>

              <div className="mt-6 space-y-5">
                {analysis.insights.featureImportance.map((feature) => (
                  <div key={feature.label}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                      <span className="text-[#1D1D1F]">{feature.label}</span>
                      <span className="font-medium text-[#6E6E73]">{formatNumber(feature.value)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#F5F5F7]">
                      <div
                        className="h-full rounded-full bg-[#0A84FF]/75 transition-[width] duration-700 ease-out"
                        style={{ width: `${Math.max(4, Math.min(100, feature.value))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-7 rounded-2xl bg-[#F5F5F7]/70 p-5 text-base leading-7 text-[#1D1D1F]">
                {analysis.insights.text}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}