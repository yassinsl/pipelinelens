# PipelineLens frontend

The PipelineLens screen: paste or upload a failed GitHub Actions build log and
the workflow YAML, choose **Analyze**, and read the report returned by the
backend's `POST /analyze`.

## Run

Start the backend first (see the root README), then:

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The dev server forwards `/api/*` to the backend at `http://127.0.0.1:8000`,
removing the `/api` prefix. Point it elsewhere with
`PIPELINELENS_BACKEND_URL=http://127.0.0.1:9000 npm run dev`. `npm run preview`
uses the same proxy. A production deployment needs a reverse proxy that does the
same. Provider credentials live only in the backend's `.env`; the frontend has no
API key and no `VITE_*` settings.

## Checks

```bash
npm run typecheck  # tsc -b
npm test           # vitest: input rules, file reading, and the /analyze client
npm run lint       # oxlint
npm run build      # typecheck + production build into dist/
```

## Input rules

These mirror the backend's `POST /analyze` contract so the screen never shows
"ready" for input the API would reject:

- **100,000 characters combined** across both fields, counted in Unicode code
  points like Python's `len()` (an emoji counts once, not twice).
- **Blank fields** are those containing only characters Python's `str.isspace()`
  accepts, matching the backend's `strip()` check.
- **Line endings** in uploaded files become LF, as a textarea does, so the
  count matches what the field holds. The backend numbers lines the same way.
- **Uploads**: `.txt`/`.log` for the build log, `.yml`/`.yaml` for the workflow,
  up to 2 MB, UTF-8 or UTF-16 with a byte order mark. Larger-than-limit text can
  still be loaded and trimmed in place.

Files are read in the browser and kept only in React state: no storage or
cookies. Nothing leaves the page until you choose Analyze. Fonts are self-hosted
via Fontsource.

## Analysis flow

- Analyze is enabled when both fields have text, the total is within the limit,
  and no request is running. A double click sends one request.
- While a request runs, the fields are read-only. **Clear** cancels the request,
  and its response is ignored if it still arrives.
- Any change to the input removes the previous report or error.
- Reports are rendered as plain text (no HTML). Suggested changes are labeled as
  suggestions; nothing is applied or marked verified.
- Errors explain what happened and keep the input for a retry: backend
  unreachable, 422/413 input rejected, 503 provider not configured, 504 or no
  answer within 90 seconds, 502 provider failure.
