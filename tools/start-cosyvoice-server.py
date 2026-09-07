from __future__ import annotations

import os
import runpy
import sys
from ctypes import create_unicode_buffer, windll
from pathlib import Path


def _consume_option(name: str, default: str) -> str:
    if name not in sys.argv:
        return default
    index = sys.argv.index(name)
    try:
        value = sys.argv[index + 1]
    except IndexError as error:
        raise ValueError(f"{name} requires a value") from error
    del sys.argv[index:index + 2]
    return value


COSYVOICE_HOME = Path(
    _consume_option(
        "--cosyvoice-home",
        os.environ.get("STARCHAT_COSYVOICE_HOME", r"D:\CosyVoice"),
    )
).resolve()
COSYVOICE_ROOT = COSYVOICE_HOME / "source"
CACHE_ROOT = COSYVOICE_HOME / "cache"
voice_mode = "sft"
if "--voice-mode" in sys.argv:
    index = sys.argv.index("--voice-mode")
    voice_mode = sys.argv[index + 1]
    del sys.argv[index:index + 2]
if voice_mode not in {"sft", "zero-shot"}:
    raise ValueError("--voice-mode must be sft or zero-shot")
MODEL_DIR = COSYVOICE_ROOT / "pretrained_models" / ("CosyVoice2-0.5B" if voice_mode == "zero-shot" else "CosyVoice-300M-SFT")

for directory in (
    CACHE_ROOT / "modelscope",
    COSYVOICE_HOME / "credentials" / "modelscope",
    CACHE_ROOT / "huggingface",
):
    directory.mkdir(parents=True, exist_ok=True)

os.environ["MODELSCOPE_CACHE"] = str(CACHE_ROOT / "modelscope")
os.environ["HF_HOME"] = str(CACHE_ROOT / "huggingface")

# ModelScope otherwise writes its anonymous session file to the user's profile.
# Keep all CosyVoice runtime state inside the configured D-drive home.
from modelscope.hub.api import ModelScopeConfig
import modelscope

ModelScopeConfig.path_credential = str(COSYVOICE_HOME / "credentials" / "modelscope")

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
            CACHE_ROOT
            / "modelscope"
            / "hub"
            / "pengzhendong"
            / "wetext"
        )
    return _snapshot_download(model_id, *args, **kwargs)


modelscope.snapshot_download = _project_snapshot_download

os.chdir(COSYVOICE_ROOT)
sys.path.insert(0, str(COSYVOICE_ROOT))
sys.path.insert(0, str(COSYVOICE_ROOT / "third_party" / "Matcha-TTS"))

# The current upstream FastAPI adapter decodes uploads to a 16 kHz tensor,
# while the newer CosyVoice2 frontend calls load_wav again. Bridge that
# version boundary here without editing the vendored upstream checkout.
import torch
import torchaudio
import cosyvoice.cli.frontend as cosyvoice_frontend

_frontend_load_wav = cosyvoice_frontend.load_wav


def _load_wav_or_tensor(wav, target_sr, min_sr=16000):
    if not isinstance(wav, torch.Tensor):
        return _frontend_load_wav(wav, target_sr, min_sr)
    speech = wav.mean(dim=0, keepdim=True)
    if target_sr != 16000:
        speech = torchaudio.transforms.Resample(orig_freq=16000, new_freq=target_sr)(speech)
    return speech


cosyvoice_frontend.load_wav = _load_wav_or_tensor

if "--port" not in sys.argv:
    sys.argv.extend(["--port", "50000"])
if "--model_dir" not in sys.argv:
    sys.argv.extend(["--model_dir", str(MODEL_DIR)])

runpy.run_path(
    str(COSYVOICE_ROOT / "runtime" / "python" / "fastapi" / "server.py"),
    run_name="__main__",
)
