# PipelineLens frontend

The input screen for PipelineLens: paste or upload a failed GitHub Actions build
log and the workflow YAML. Analysis is **not connected yet**, so the Analyze
button is disabled and nothing is sent anywhere.

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

## Checks

```bash
npm run typecheck  # tsc -b
npm test           # vitest: counting, blank-input, and file-reading rules
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

Files are read in the browser and kept only in React state: no storage, cookies,
or network requests. Fonts are self-hosted via Fontsource.
