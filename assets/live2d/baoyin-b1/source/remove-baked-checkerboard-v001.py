from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


PROJECT = Path(r"C:\Users\23260\Desktop\Workspace\projects\Project-008-白音AI助手")
INPUT = Path(r"C:\Users\23260\.codex\generated_images\01a01fe5-7655-7c43-92c4-b85564d65ccc\exec-65a09e5d-442e-479b-bc11-d40e7d0e5ec2.png")
OUTPUT = PROJECT / "assets" / "character" / "白音-B1-月之术师幻想装-透明背景-v001.png"


def flood_border(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    q = deque()
    for x in range(w):
        if mask[0, x]:
            seen[0, x] = True
            q.append((0, x))
        if mask[h - 1, x] and not seen[h - 1, x]:
            seen[h - 1, x] = True
            q.append((h - 1, x))
    for y in range(1, h - 1):
        if mask[y, 0] and not seen[y, 0]:
            seen[y, 0] = True
            q.append((y, 0))
        if mask[y, w - 1] and not seen[y, w - 1]:
            seen[y, w - 1] = True
            q.append((y, w - 1))
    while q:
        y, x = q.popleft()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if not dx and not dy:
                    continue
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
    return seen


def main() -> None:
    image = Image.open(INPUT).convert("RGB")
    rgb = np.asarray(image, dtype=np.uint8)
    minimum = rgb.min(axis=2).astype(np.int16)
    maximum = rgb.max(axis=2).astype(np.int16)
    # The generated checkerboard is near-neutral and brighter than 228.
    # Flood-fill only border-connected pixels so pale hair remains protected
    # behind its drawn contour instead of being removed by a global threshold.
    checker_like = (minimum >= 228) & ((maximum - minimum) <= 18)
    background = flood_border(checker_like)

    alpha = np.where(background, 0, 255).astype(np.uint8)
    rgba = np.dstack((rgb, alpha))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, mode="RGBA").save(OUTPUT, format="PNG", optimize=True)

    transparent = int((alpha == 0).sum())
    opaque = int((alpha == 255).sum())
    print(f"saved={OUTPUT}")
    print(f"size={image.width}x{image.height} mode=RGBA")
    print(f"transparent_pixels={transparent} opaque_pixels={opaque}")


if __name__ == "__main__":
    main()
