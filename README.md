# E-Load Intelligence System (ELIS)

ELIS is an enterprise-grade electricity load intelligence application for board-style operations teams. It provides dataset ingestion, demand forecasting, scenario analysis, feature-importance insights, and minimal load visualization.

## Folder Structure

```text
.
├── backend/
│   ├── app.py
│   └── requirements.txt
├── src/
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── utils/
│       └── cn.ts
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Frontend Setup

Install dependencies:

```bash
npm install
```

Run the React application:

```bash
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## Backend Setup

Create and activate a Python virtual environment:

```bash
cd backend
python -m venv .venv
```

Activate the environment on macOS or Linux:

```bash
source .venv/bin/activate
```

Activate the environment on Windows:

```bash
.venv\Scripts\activate
```

Install backend dependencies:

```bash
pip install -r requirements.txt
```

Run the Flask API:

```bash
python app.py
```

The API runs at `http://127.0.0.1:5000`.

## API Endpoints

`POST /upload`

Accepts multipart file uploads for CSV, XLSX, PDF, JPG, JPEG, and PNG. The service parses the dataset, extracts time-series load consumption, trains a regression model, and returns prediction results.

`POST /predict`

Accepts JSON with an optional `series` array. If no series is provided, it uses the latest uploaded dataset or a generated baseline dataset.

`GET /health`

Returns API health status.

## Expected API Response

The backend returns JSON containing:

```json
{
  "prediction": 154.2,
  "confidence": 11.6,
  "riskLevel": "Medium",
  "scenarios": [],
  "insights": {},
  "preview": [],
  "chart": []
}
```

## Supported Input Data

CSV and Excel files should include at least one date-like column and one numeric electricity consumption column. Common accepted column names include `timestamp`, `date`, `load_kwh`, `consumption`, `demand`, `energy`, `units`, and `reading`.

PDF files are parsed for dated rows with numeric load values. Image uploads are accepted as optional input; OCR is not enabled, so the backend generates a stable baseline profile for analysis.

If an uploaded file is empty, the backend automatically generates a dummy load dataset to keep the prediction pipeline operational.