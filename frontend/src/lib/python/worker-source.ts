/**
 * Source of the Web Worker that runs notebook cells with Pyodide (CPython
 * compiled to WebAssembly). It is a classic worker built from a Blob so the
 * bundler never touches it, and it loads Pyodide from the jsDelivr CDN.
 *
 * Code runs on the student's device only. The Python side mimics IPython:
 * the last expression is displayed with its rich repr (pandas tables as
 * HTML), stdout/stderr stream live, matplotlib figures become PNG outputs,
 * `display()` works, `%pip`/`!pip` install with micropip and modules missing
 * from Pyodide are installed from PyPI on first import.
 */
export const PYODIDE_VERSION = '0.28.3'
export const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

const BOOTSTRAP = String.raw`
import ast, base64, builtins, importlib.util, io, json, re, sys, traceback, warnings
import js, micropip, pyodide_http
from pyodide.code import eval_code_async, find_imports

pyodide_http.patch_all()
warnings.filterwarnings("ignore", message=".*non-interactive.*")
import os
os.environ["MPLBACKEND"] = "AGG"
os.makedirs("/home/pyodide/data", exist_ok=True)
os.chdir("/home/pyodide")

_cell = {"id": None}

def _post(message):
    js.postMessage(js.JSON.parse(json.dumps(message)))

def _emit(output):
    _post({"type": "output", "id": _cell["id"], "output": output})

class _Stream(io.TextIOBase):
    def __init__(self, name):
        self.name, self.buffer = name, ""
    def writable(self):
        return True
    def write(self, text):
        self.buffer += text
        if "\n" in self.buffer or len(self.buffer) > 2000:
            self.flush()
        return len(text)
    def flush(self):
        if self.buffer:
            _emit({"type": "stream", "name": self.name, "text": self.buffer})
            self.buffer = ""

sys.stdout, sys.stderr = _Stream("stdout"), _Stream("stderr")

def _input(prompt=""):
    raise RuntimeError("input() is not available here: assign the value in the code instead.")
builtins.input = _input

_REPRS = (
    ("_repr_html_", "text/html"), ("_repr_markdown_", "text/markdown"),
    ("_repr_svg_", "image/svg+xml"), ("_repr_png_", "image/png"),
    ("_repr_jpeg_", "image/jpeg"), ("_repr_latex_", "text/latex"),
)

def _rich(value):
    data = {}
    for method, mime in _REPRS:
        render = getattr(value, method, None)
        if not callable(render) or isinstance(value, type):
            continue
        try:
            result = render()
        except Exception:
            continue
        if isinstance(result, tuple):
            result = result[0]
        if isinstance(result, bytes):
            result = base64.b64encode(result).decode()
        if result:
            data[mime] = result
    data["text/plain"] = repr(value)
    return {"type": "display", "data": data}

def _flush_figures():
    if "matplotlib.pyplot" not in sys.modules:
        return
    import matplotlib.pyplot as plt
    for number in plt.get_fignums():
        figure = plt.figure(number)
        buffer = io.BytesIO()
        figure.savefig(buffer, format="png", bbox_inches="tight", dpi=110)
        _emit({"type": "display", "data": {
            "image/png": base64.b64encode(buffer.getvalue()).decode(),
            "text/plain": repr(figure),
        }})
    plt.close("all")
    # plt.show() shows the figures drawn so far, in order with printed text.
    if getattr(plt.show, "__name__", "") != "_show":
        def _show(*args, **kwargs):
            sys.stdout.flush()
            _flush_figures()
        plt.show = _show

def display(*objects, **kwargs):
    sys.stdout.flush()
    for value in objects:
        _emit(_rich(value))

builtins.display = display

PACKAGES = {"sklearn": "scikit-learn", "cv2": "opencv-python", "PIL": "pillow",
            "bs4": "beautifulsoup4", "yaml": "pyyaml", "skimage": "scikit-image"}

async def _install(names):
    for name in names:
        _post({"type": "status", "message": "installing", "name": name})
        await micropip.install(name)

_MAGIC = re.compile(r"^\s*[%!]\s*(?:pip|pip3)\s+install\s+(.+)$")

async def _prepare(code):
    """Handle IPython magics and install modules Pyodide does not bundle."""
    lines, wanted = [], []
    for line in code.split("\n"):
        magic = _MAGIC.match(line)
        if magic:
            wanted += [part for part in magic.group(1).split() if not part.startswith("-")]
            lines.append("")
        elif re.match(r"^\s*[%!]", line):
            lines.append("")  # %matplotlib inline, !ls... have no effect here
        else:
            lines.append(line)
    code = "\n".join(lines)
    if wanted:
        await _install(wanted)
    try:
        imports = find_imports(code)
    except SyntaxError:
        imports = []
    missing = [PACKAGES.get(name, name) for name in imports
               if importlib.util.find_spec(name) is None]
    if missing:
        await _install(missing)
    return code

async def run_cell(cell_id, code):
    _cell["id"] = cell_id
    ok = True
    try:
        code = await _prepare(code)
        result = await eval_code_async(code, globals=_globals, filename="<cell>",
                                       return_mode="last_expr")
        sys.stdout.flush(); sys.stderr.flush()
        if result is not None:
            _globals["_"] = result
            _emit(_rich(result))
    except BaseException as error:
        ok = False
        sys.stdout.flush(); sys.stderr.flush()
        frames = traceback.extract_tb(error.__traceback__)
        mine = [frame for frame in frames if frame.filename == "<cell>"]
        lines = traceback.format_list(mine) if mine else []
        _emit({"type": "error", "ename": type(error).__name__, "evalue": str(error),
               "traceback": "".join(lines + traceback.format_exception_only(type(error), error))})
    _flush_figures()
    sys.stdout.flush(); sys.stderr.flush()
    return ok

_globals = {"__name__": "__main__", "display": display}
`

export const WORKER_SOURCE = String.raw`
importScripts(${JSON.stringify(PYODIDE_INDEX)} + 'pyodide.js');
const bootstrap = ${JSON.stringify(BOOTSTRAP)};
let pyodide = null;
let queue = Promise.resolve();
const booting = (async () => {
  try {
    self.postMessage({ type: 'status', message: 'loading' });
    pyodide = await loadPyodide({ indexURL: ${JSON.stringify(PYODIDE_INDEX)} });
    await pyodide.loadPackage(['micropip', 'pyodide-http']);
    await pyodide.runPythonAsync(bootstrap);
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({ type: 'boot-error', message: String(error && error.message || error) });
    throw error;
  }
})();

async function run(id, code) {
  await booting;
  self.postMessage({ type: 'busy', id });
  let ok = false;
  try {
    await pyodide.loadPackagesFromImports(code, {
      messageCallback: (message) => {
        const match = /Loading (.+)/.exec(message);
        if (match) self.postMessage({ type: 'status', message: 'installing', name: match[1] });
      },
    });
  } catch (error) { /* a missing package is reported by the cell itself */ }
  try {
    const runCell = pyodide.globals.get('run_cell');
    ok = await runCell(id, code);
    runCell.destroy();
  } catch (error) {
    self.postMessage({ type: 'output', id, output: { type: 'error', ename: 'Error', evalue: String(error && error.message || error), traceback: '' } });
  }
  self.postMessage({ type: 'done', id, ok });
}

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === 'run') {
    queue = queue.then(() => run(message.id, String(message.code || '')));
  } else if (message.type === 'file') {
    queue = queue.then(async () => {
      await booting;
      const safe = String(message.name || 'data').replace(/[\\/]/g, '_');
      pyodide.FS.writeFile('/home/pyodide/' + safe, new Uint8Array(message.bytes));
      self.postMessage({ type: 'file', name: safe });
    });
  }
};
`
