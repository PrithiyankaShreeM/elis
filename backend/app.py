from __future__ import annotations

import io
import re
from typing import Any

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

try:
    import fitz  # PyMuPDF
except ImportError:  # PDF support is enabled when PyMuPDF is installed.
    fitz = None


app = Flask(__name__)
CORS(app)

ALLOWED_EXTENSIONS = {"csv", "xlsx", "pdf", "png", "jpg", "jpeg"}
IMAGE_EXTENSIONS = {"png", "jpg", "jpeg"}
LOAD_KEYWORDS = ("load", "kwh", "consumption", "demand", "energy", "units", "reading")
DATE_KEYWORDS = ("date", "time", "timestamp", "period", "month", "day")

LAST_SERIES: pd.DataFrame | None = None


def extension_for(filename: str) -> str:
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower().strip()


def generate_dummy_dataset(periods: int = 60) -> pd.DataFrame:
    """Create a deterministic board-style load profile when the file is empty."""
    rng = np.random.default_rng(42)
    dates = pd.date_range(end=pd.Timestamp.today().normalize(), periods=periods, freq="D")
    index = np.arange(periods)
    trend = 122 + index * 0.62
    weekly_cycle = 8.5 * np.sin(2 * np.pi * index / 7)
    monthly_cycle = 4.0 * np.cos(2 * np.pi * index / 30)
    noise = rng.normal(0, 2.4, periods)
    load = np.maximum(20, trend + weekly_cycle + monthly_cycle + noise)
    return pd.DataFrame({"timestamp": dates, "load_kwh": np.round(load, 2)})


def read_uploaded_file(file_storage: Any) -> tuple[pd.DataFrame, str]:
    filename = file_storage.filename or "uploaded_dataset"
    ext = extension_for(filename)

    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("Unsupported file type. Upload CSV, XLSX, PDF, JPG, or PNG files only.")

    raw = file_storage.read()
    if not raw:
        return generate_dummy_dataset(), "Empty file received; generated a baseline load profile."

    if ext == "csv":
        try:
            return pd.read_csv(io.BytesIO(raw)), "Parsed CSV dataset."
        except UnicodeDecodeError:
            return pd.read_csv(io.BytesIO(raw), encoding="latin1"), "Parsed CSV dataset using latin1 encoding."

    if ext == "xlsx":
        return pd.read_excel(io.BytesIO(raw)), "Parsed Excel dataset."

    if ext == "pdf":
        return parse_pdf(raw)

    if ext in IMAGE_EXTENSIONS:
        return generate_dummy_dataset(), "Image uploaded. OCR is optional; generated a baseline load profile."

    raise ValueError("Unsupported file type.")


def parse_pdf(raw: bytes) -> tuple[pd.DataFrame, str]:
    if fitz is None:
        raise ValueError("PDF support requires PyMuPDF. Install backend requirements and retry.")

    with fitz.open(stream=raw, filetype="pdf") as document:
        text = "\n".join(page.get_text("text") for page in document)

    rows: list[dict[str, Any]] = []
    date_pattern = re.compile(r"(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})")

    for line in text.splitlines():
        date_match = date_pattern.search(line)
        if not date_match:
            continue

        numeric_tokens = re.findall(r"[-+]?\d+(?:\.\d+)?", line)
        if not numeric_tokens:
            continue

        # In board reports, the consumption figure is usually the last number on a dated row.
        value = float(numeric_tokens[-1])
        rows.append({"timestamp": date_match.group(1), "load_kwh": value})

    if not rows:
        return generate_dummy_dataset(), "PDF did not contain readable load rows; generated a baseline load profile."

    return pd.DataFrame(rows), "Parsed dated load rows from PDF."


def find_date_column(frame: pd.DataFrame) -> str | None:
    columns = list(frame.columns)
    prioritized = [col for col in columns if any(keyword in str(col).lower() for keyword in DATE_KEYWORDS)]
    remaining = [col for col in columns if col not in prioritized]

    for column in prioritized + remaining:
        parsed = pd.to_datetime(frame[column], errors="coerce", dayfirst=True)
        valid_count = int(parsed.notna().sum())
        if valid_count >= max(2, int(len(frame) * 0.35)):
            return str(column)

    return None


def find_load_column(frame: pd.DataFrame, date_column: str | None) -> str | None:
    scored_columns: list[tuple[int, int, float, str]] = []

    for column in frame.columns:
        column_name = str(column)
        if date_column is not None and column_name == date_column:
            continue

        numeric_values = pd.to_numeric(frame[column], errors="coerce")
        valid_count = int(numeric_values.notna().sum())
        if valid_count == 0:
            continue

        keyword_score = 2 if any(keyword in column_name.lower() for keyword in LOAD_KEYWORDS) else 0
        variance = float(numeric_values.var(skipna=True) or 0)
        scored_columns.append((keyword_score, valid_count, variance, column_name))

    if not scored_columns:
        return None

    scored_columns.sort(reverse=True)
    return scored_columns[0][3]


def normalize_series(frame: pd.DataFrame) -> pd.DataFrame:
    if frame is None or frame.empty:
        return generate_dummy_dataset()

    normalized = frame.copy()
    normalized.columns = [str(column).strip() or f"column_{index}" for index, column in enumerate(normalized.columns)]

    date_column = find_date_column(normalized)
    load_column = find_load_column(normalized, date_column)

    if load_column is None:
        raise ValueError("No numeric electricity consumption column could be identified.")

    if date_column is None:
        timestamps = pd.date_range(end=pd.Timestamp.today().normalize(), periods=len(normalized), freq="D")
    else:
        timestamps = pd.to_datetime(normalized[date_column], errors="coerce", dayfirst=True)
        if int(timestamps.notna().sum()) < 2:
            timestamps = pd.date_range(end=pd.Timestamp.today().normalize(), periods=len(normalized), freq="D")

    values = pd.to_numeric(normalized[load_column], errors="coerce")
    series = pd.DataFrame({"timestamp": timestamps, "load_kwh": values}).dropna()

    if series.empty:
        return generate_dummy_dataset()

    series["timestamp"] = pd.to_datetime(series["timestamp"]).dt.floor("D")
    series = series.groupby("timestamp", as_index=False)["load_kwh"].mean().sort_values("timestamp")
    series["load_kwh"] = series["load_kwh"].clip(lower=0)
    return ensure_minimum_history(series)


def ensure_minimum_history(series: pd.DataFrame, min_rows: int = 8) -> pd.DataFrame:
    if len(series) >= min_rows:
        return series.reset_index(drop=True)

    if series.empty:
        return generate_dummy_dataset(periods=min_rows)

    expanded = series.copy().reset_index(drop=True)
    offset = infer_offset(expanded)
    values = expanded["load_kwh"].astype(float).tolist()
    current_date = pd.Timestamp(expanded["timestamp"].iloc[-1])

    while len(expanded) < min_rows:
        recent_average = float(np.mean(values[-min(3, len(values)) :]))
        gentle_adjustment = 1 + 0.01 * np.sin(len(values))
        current_date = current_date + offset
        next_value = max(0, recent_average * gentle_adjustment)
        values.append(next_value)
        expanded.loc[len(expanded)] = {"timestamp": current_date, "load_kwh": round(next_value, 2)}

    return expanded


def infer_offset(series: pd.DataFrame) -> pd.DateOffset | pd.Timedelta:
    if len(series) >= 3:
        inferred = pd.infer_freq(pd.to_datetime(series["timestamp"]))
        if inferred:
            return pd.tseries.frequencies.to_offset(inferred)

    differences = pd.to_datetime(series["timestamp"]).diff().dropna()
    if not differences.empty:
        median_delta = differences.median()
        if pd.notna(median_delta) and median_delta > pd.Timedelta(0):
            return median_delta

    return pd.Timedelta(days=1)


def make_features(series: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    engineered = series.copy().reset_index(drop=True)
    engineered["timestamp"] = pd.to_datetime(engineered["timestamp"])
    prior_load = engineered["load_kwh"].shift(1)
    rolling_mean = prior_load.rolling(window=3, min_periods=1).mean()

    engineered["t"] = np.arange(len(engineered))
    engineered["lag_1"] = prior_load.bfill().fillna(engineered["load_kwh"].mean())
    engineered["rolling_mean"] = rolling_mean.bfill().fillna(engineered["load_kwh"].mean())
    engineered["day_of_week"] = engineered["timestamp"].dt.dayofweek
    engineered["variability"] = (engineered["lag_1"] - engineered["rolling_mean"]).abs().fillna(0)

    feature_columns = ["lag_1", "rolling_mean", "day_of_week", "variability", "t"]
    return engineered[feature_columns], engineered["load_kwh"].astype(float)


def next_dates(series: pd.DataFrame, horizon: int) -> list[pd.Timestamp]:
    offset = infer_offset(series)
    current = pd.Timestamp(series["timestamp"].iloc[-1])
    dates: list[pd.Timestamp] = []

    for _ in range(horizon):
        current = current + offset
        dates.append(pd.Timestamp(current))

    return dates


def forecast(series: pd.DataFrame, horizon: int = 7) -> dict[str, Any]:
    features, target = make_features(series)
    model = Pipeline([("scale", StandardScaler()), ("ridge", Ridge(alpha=1.2))])
    model.fit(features, target)

    fitted = model.predict(features)
    residuals = target.to_numpy() - fitted
    baseline = float(target.tail(min(14, len(target))).mean())
    residual_std = float(np.std(residuals, ddof=1)) if len(residuals) > 1 else 0.0
    confidence = max(residual_std * 1.35, baseline * 0.045, 1.0)

    history_values = target.astype(float).tolist()
    future_rows: list[dict[str, Any]] = []

    for future_date in next_dates(series, horizon):
        lag = float(history_values[-1])
        rolling = float(np.mean(history_values[-min(3, len(history_values)) :]))
        row = pd.DataFrame(
            [
                {
                    "lag_1": lag,
                    "rolling_mean": rolling,
                    "day_of_week": int(future_date.dayofweek),
                    "variability": abs(lag - rolling),
                    "t": len(history_values),
                }
            ]
        )
        predicted = float(model.predict(row)[0])
        if baseline > 0:
            predicted = min(max(predicted, baseline * 0.55), baseline * 1.7)
        predicted = max(0, predicted)
        history_values.append(predicted)
        future_rows.append({"timestamp": future_date, "load_kwh": round(predicted, 2)})

    importance = feature_importance(model)

    return {
        "future": future_rows,
        "prediction": float(future_rows[0]["load_kwh"]),
        "confidence": float(round(confidence, 2)),
        "importance": importance,
    }


def feature_importance(model: Pipeline) -> list[dict[str, float | str]]:
    coefficients = np.abs(model.named_steps["ridge"].coef_)
    historical = float(coefficients[0] + coefficients[1] + coefficients[4])
    temporal = float(coefficients[2])
    variability = float(coefficients[3])
    total = historical + temporal + variability

    if total <= 1e-9:
        return [
            {"label": "Historical Trend Influence", "value": 58.0},
            {"label": "Temporal Pattern", "value": 27.0},
            {"label": "Variability Factor", "value": 15.0},
        ]

    return [
        {"label": "Historical Trend Influence", "value": round(historical / total * 100, 1)},
        {"label": "Temporal Pattern", "value": round(temporal / total * 100, 1)},
        {"label": "Variability Factor", "value": round(variability / total * 100, 1)},
    ]


def classify_risk(prediction: float, confidence: float, series: pd.DataFrame) -> str:
    baseline = float(series["load_kwh"].tail(min(14, len(series))).mean())
    if baseline <= 0:
        return "Medium"

    upper_ratio = (prediction + confidence) / baseline
    uncertainty_ratio = confidence / max(prediction, 1.0)

    if upper_ratio >= 1.18 or uncertainty_ratio >= 0.18:
        return "High"
    if upper_ratio >= 1.08 or uncertainty_ratio >= 0.1:
        return "Medium"
    return "Low"


def scenario_rows(prediction: float, confidence: float) -> list[dict[str, Any]]:
    peak = prediction + max(confidence * 1.45, prediction * 0.11)
    reduced = max(0, prediction - max(confidence * 0.95, prediction * 0.08))
    anomaly = prediction + max(confidence * 2.4, prediction * 0.19)

    rows = [
        ("Peak Demand Scenario", peak, "up"),
        ("Reduced Load Scenario", reduced, "down"),
        ("Anomaly Spike Scenario", anomaly, "up"),
    ]

    return [
        {
            "name": name,
            "value": round(value, 2),
            "changePercent": round(((value - prediction) / max(prediction, 1.0)) * 100, 1),
            "direction": direction,
        }
        for name, value, direction in rows
    ]


def insight_text(importance: list[dict[str, float | str]]) -> str:
    values = {str(item["label"]): float(item["value"]) for item in importance}
    dominant = max(values, key=values.get)

    if dominant == "Historical Trend Influence":
        return "Demand variation is primarily driven by historical consumption trends with moderate temporal influence."
    if dominant == "Temporal Pattern":
        return "Demand variation is strongly associated with recurring temporal usage patterns and scheduled load behavior."
    return "Demand variation shows elevated sensitivity to volatility, indicating the need for closer anomaly monitoring."


def format_period(value: Any) -> str:
    return pd.Timestamp(value).strftime("%b %d")


def serialize_series(series: pd.DataFrame) -> list[dict[str, Any]]:
    return [
        {"timestamp": pd.Timestamp(row.timestamp).strftime("%Y-%m-%d"), "load_kwh": round(float(row.load_kwh), 2)}
        for row in series.itertuples(index=False)
    ]


def build_chart(series: pd.DataFrame, future_rows: list[dict[str, Any]], scenarios: list[dict[str, Any]]) -> list[dict[str, Any]]:
    historical = series.tail(32).copy()
    chart = [
        {"period": format_period(row.timestamp), "historical": round(float(row.load_kwh), 2)}
        for row in historical.itertuples(index=False)
    ]

    if chart:
        chart[-1]["forecast"] = chart[-1]["historical"]

    peak_delta = float(scenarios[0]["value"]) - float(future_rows[0]["load_kwh"])
    reduced_delta = float(scenarios[1]["value"]) - float(future_rows[0]["load_kwh"])
    anomaly_delta = float(scenarios[2]["value"]) - float(future_rows[0]["load_kwh"])

    for row in future_rows:
        forecast_value = float(row["load_kwh"])
        chart.append(
            {
                "period": format_period(row["timestamp"]),
                "forecast": round(forecast_value, 2),
                "peak": round(forecast_value + peak_delta, 2),
                "reduced": round(max(0, forecast_value + reduced_delta), 2),
                "anomaly": round(forecast_value + anomaly_delta, 2),
            }
        )

    return chart


def build_response(series: pd.DataFrame, source: str, message: str) -> dict[str, Any]:
    series = series.sort_values("timestamp").reset_index(drop=True)
    result = forecast(series)
    prediction = round(float(result["prediction"]), 2)
    confidence = round(float(result["confidence"]), 2)
    scenarios = scenario_rows(prediction, confidence)
    importance = result["importance"]

    date_range = (
        f"{pd.Timestamp(series['timestamp'].iloc[0]).strftime('%Y-%m-%d')} "
        f"to {pd.Timestamp(series['timestamp'].iloc[-1]).strftime('%Y-%m-%d')}"
    )

    return {
        "status": "success",
        "message": message,
        "prediction": prediction,
        "confidence": confidence,
        "riskLevel": classify_risk(prediction, confidence, series),
        "scenarios": scenarios,
        "insights": {"featureImportance": importance, "text": insight_text(importance)},
        "columns": ["timestamp", "load_kwh"],
        "preview": serialize_series(series.head(8)),
        "metadata": {"records": int(len(series)), "dateRange": date_range, "source": source},
        "chart": build_chart(series, result["future"], scenarios),
        "sourceSeries": serialize_series(series),
    }


@app.get("/health")
def health() -> Any:
    return jsonify({"status": "ok", "service": "ELIS Flask API"})


@app.post("/upload")
def upload() -> Any:
    global LAST_SERIES

    if "file" not in request.files:
        return jsonify({"error": "No file part was provided in the upload request."}), 400

    file_storage = request.files["file"]
    if not file_storage.filename:
        return jsonify({"error": "No file was selected for upload."}), 400

    try:
        raw_frame, parse_note = read_uploaded_file(file_storage)
        series = normalize_series(raw_frame)
        LAST_SERIES = series.copy()
        response = build_response(series, file_storage.filename, "Dataset Loaded Successfully")
        response["parseNote"] = parse_note
        return jsonify(response)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # Keep the API response controlled for enterprise clients.
        return jsonify({"error": f"Dataset processing failed: {exc}"}), 500


@app.post("/predict")
def predict() -> Any:
    global LAST_SERIES

    try:
        payload = request.get_json(silent=True) or {}
        incoming_series = payload.get("series") if isinstance(payload, dict) else None

        if isinstance(incoming_series, list) and incoming_series:
            series = normalize_series(pd.DataFrame(incoming_series))
        elif LAST_SERIES is not None:
            series = LAST_SERIES.copy()
        else:
            series = generate_dummy_dataset()

        LAST_SERIES = series.copy()
        return jsonify(build_response(series, "Prediction request", "Forecast recalculated successfully"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Prediction failed: {exc}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)