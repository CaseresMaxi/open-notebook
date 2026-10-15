# ADR-030: Jupyter notebooks run in the student's browser (Pyodide)

- Status: Accepted
- Date: 2026-10-15

## Context

Students upload course notebooks (`.ipynb`) and want to read them, run them and understand each step. The installation is a home server shared by several Firebase accounts, so executing arbitrary Python on the server would give every account a shell on that computer and its data.

## Decision

- **Upload:** `.ipynb` is accepted as a source. `content_process` bypasses content-core for notebooks and stores Markdown, code and textual outputs as the source's full text (`open_notebook/utils/jupyter.py`), so chat, search and summaries see the whole notebook. The original file stays the source asset.
- **Viewer:** `GET /api/sources/{id}/notebook` returns normalised cells and saved outputs (text, HTML, PNG/JPEG/SVG, errors). The frontend renders it in the source's Content tab (`components/jupyter/`).
- **Execution:** code runs only in the browser, in a Web Worker with **Pyodide 0.28.3** loaded from jsDelivr. The worker is built from a Blob, so the bundler never touches it. It mimics IPython:
  - the last expression is shown with its rich repr;
  - stdout streams live;
  - matplotlib figures become PNG outputs;
  - `display()` works;
  - `%pip`/`!pip install` use micropip;
  - imports that Pyodide does not bundle (for example seaborn) are installed from PyPI on first use;
  - `pyodide-http` makes `pd.read_csv(url)` work.

  Restart terminates the worker; this is also the only way to stop a cell. A cell cannot be interrupted, because that needs `SharedArrayBuffer` and cross-origin isolation headers, which would break other embeds.
- **HTML outputs:** these are untrusted. Only inert table and text markup is kept (`lib/utils/output-html.ts`). Widget reprs that rely on scripts or styles, such as scikit-learn estimators, fall back to `text/plain`.
- **Tutor:**
  - `POST …/notebook/explanations` writes one explanation per code cell with the transformation model, in parallel parts of about 14k characters. It is cached per account under `data_root()/notebook-explanations` and keyed by source, file hash and UI language.
  - `POST …/notebook/explain-output` explains the real result of a run. It receives the code, the outputs as text and the preceding Markdown.
  - Both calls are metered like any other model call.

## Consequences

- No server-side execution risk and no extra server load. Each viewer has an isolated session.
- The first run downloads about 30 MB, which is cached by the browser. WebAssembly is slower than native Python: a 19-model KNN sweep on 39k rows took about 90 s.
- Local data files are not available unless the student adds them ("Add data" writes them to the worker's file system).
- "Run all" stops at the first error, like Jupyter. Notebooks with prose pasted in code cells stop there.
