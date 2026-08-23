from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).with_name("video-analysis-python")))

import cv2
import numpy as np
from PIL import Image, ImageDraw


source = Path(r"C:\Users\23260\Downloads\QQ20260822-194839.mp4")
output = Path(__file__).resolve().parents[1] / "outputs" / "reference-follow-20260822"
output.mkdir(parents=True, exist_ok=True)

capture = cv2.VideoCapture(str(source))
fps = capture.get(cv2.CAP_PROP_FPS)
frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
duration = frame_count / fps
times = np.linspace(0, max(duration - 1 / fps, 0), 16)
frames = []

for index, seconds in enumerate(times):
    capture.set(cv2.CAP_PROP_POS_MSEC, float(seconds * 1000))
    ok, frame = capture.read()
    if not ok:
        continue
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    image = Image.fromarray(rgb)
    image.thumbnail((480, 270))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 105, 22), fill=(0, 0, 0))
    draw.text((5, 4), f"{seconds:.2f}s", fill=(255, 255, 255))
    image.save(output / f"frame-{index:02d}-{seconds:.2f}s.png")
    frames.append(image)

capture.release()

cell_w = max(image.width for image in frames)
cell_h = max(image.height for image in frames)
sheet = Image.new("RGB", (cell_w * 4, cell_h * 4), (32, 32, 32))
for index, image in enumerate(frames):
    sheet.paste(image, ((index % 4) * cell_w, (index // 4) * cell_h))
sheet.save(output / "contact-sheet.png")

print(f"fps={fps}")
print(f"frames={frame_count}")
print(f"duration={duration:.3f}")
print(output / "contact-sheet.png")
