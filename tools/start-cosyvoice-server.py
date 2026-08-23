from __future__ import annotations

import os
import runpy
import sys
from ctypes import create_unicode_buffer, windll
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
TOOLS_ROOT = PROJECT_ROOT / "tools"
COSYVOICE_ROOT = TOOLS_ROOT / "CosyVoice"
MODEL_DIR = COSYVOICE_ROOT / "pretrained_models" / "CosyVoice-300M-SFT"

for directory in (
    TOOLS_ROOT / "modelscope-cache",
    TOOLS_ROOT / "modelscope-credentials",
    TOOLS_ROOT / "huggingface-cache",
):
    directory.mkdir(parents=True, exist_ok=True)

os.environ["MODELSCOPE_CACHE"] = str(TOOLS_ROOT / "modelscope-cache")
os.environ["HF_HOME"] = str(TOOLS_ROOT / "huggingface-cache")

# ModelScope otherwise writes its anonymous session file to the user's profile.
# Keep all CosyVoice runtime state inside this project instead.
from modelscope.hub.api import ModelScopeConfig
import modelscope

ModelScopeConfig.path_credential = str(TOOLS_ROOT / "modelscope-credentials")

_snapshot_download = modelscope.snapshot_download


def _windows_short_path(path: Path) -> str:
    buffer = create_unicode_buffer(32768)
    length = windll.kernel32.GetShortPathNameW(str(path), buffer, len(buffer))
    if length == 0 or length >= len(buffer):
        raise OSError(f"Unable to resolve an ASCII short path for {path}")
    return buffer.value


def _project_snapshot_download(model_id: str, *args, **kwargs):
    if model_id == "pengzhendong/wetext":
        return _windows_short_path(
            TOOLS_ROOT
            / "modelscope-cache"
            / "hub"
            / "pengzhendong"
            / "wetext"
        )
    return _snapshot_download(model_id, *args, **kwargs)


modelscope.snapshot_download = _project_snapshot_download

os.chdir(COSYVOICE_ROOT)
sys.path.insert(0, str(COSYVOICE_ROOT))
sys.path.insert(0, str(COSYVOICE_ROOT / "third_party" / "Matcha-TTS"))

if "--port" not in sys.argv:
    sys.argv.extend(["--port", "50000"])
if "--model_dir" not in sys.argv:
    sys.argv.extend(["--model_dir", str(MODEL_DIR)])

runpy.run_path(
    str(COSYVOICE_ROOT / "runtime" / "python" / "fastapi" / "server.py"),
    run_name="__main__",
)
