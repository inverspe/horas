"""Generate PWA/iOS icons with no third-party deps (pure zlib PNG writer).

Placeholder art: indigo->violet gradient with a white rounded-square mark.
Swap the COLORS / draw_mark() to rebrand, then re-run:  python tools/make_icons.py
"""
import math
import struct
import zlib
from pathlib import Path

TOP = (99, 102, 241)     # indigo-500
BOTTOM = (139, 92, 246)  # violet-500
SIZES = {"icon-180.png": 180, "icon-192.png": 192, "icon-512.png": 512}
OUT = Path(__file__).resolve().parent.parent / "icons"


def rounded_rect_sdf(x, y, half_w, half_h, radius):
    """Signed distance to a rounded rectangle centred on the origin."""
    dx = abs(x) - (half_w - radius)
    dy = abs(y) - (half_h - radius)
    outside = math.hypot(max(dx, 0.0), max(dy, 0.0))
    inside = min(max(dx, dy), 0.0)
    return outside + inside - radius


def draw_mark(size):
    """Return a coverage function: (x, y) -> 0..1 alpha for the white mark.

    A rounded play triangle — the app is about hours *watched*."""
    cx = cy = size / 2.0
    r = size * 0.235          # circumradius of the triangle
    corner = size * 0.055     # corner rounding
    aa = size * 0.008         # antialias width
    nudge = size * 0.022      # shift right so it reads as optically centred

    # Equilateral triangle pointing right.
    import math as _m
    pts = [(cx + nudge + r * _m.cos(a), cy + r * _m.sin(a))
           for a in (0.0, 2 * _m.pi / 3, 4 * _m.pi / 3)]

    def sdf(px, py):
        """Signed distance to the triangle (negative inside)."""
        d = float("inf")
        sign = -1.0
        for i in range(3):
            ax, ay = pts[i]
            bx, by = pts[(i + 1) % 3]
            ex, ey = bx - ax, by - ay
            wx, wy = px - ax, py - ay
            t = max(0.0, min(1.0, (wx * ex + wy * ey) / (ex * ex + ey * ey)))
            dx, dy = wx - ex * t, wy - ey * t
            d = min(d, _m.hypot(dx, dy))
            # winding test: point left of every edge => inside
            if wx * ey - wy * ex > 0:
                sign = 1.0
        return sign * d

    def coverage(x, y):
        d = sdf(x, y) - corner   # subtracting rounds the corners
        if d <= -aa:
            return 1.0
        if d >= aa:
            return 0.0
        return (aa - d) / (2 * aa)

    return coverage


def build_rgba(size):
    coverage = draw_mark(size)
    rows = []
    for y in range(size):
        t = y / max(size - 1, 1)
        bg = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        row = bytearray()
        row.append(0)  # PNG filter type 0 (None)
        for x in range(size):
            a = coverage(x + 0.5, y + 0.5)
            if a <= 0.0:
                row += bytes(bg) + b"\xff"
            else:
                px = tuple(round(bg[i] + (255 - bg[i]) * a) for i in range(3))
                row += bytes(px) + b"\xff"
        rows.append(bytes(row))
    return b"".join(rows)


def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def write_png(path, size):
    raw = build_rgba(size)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)
    return len(png)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size in SIZES.items():
        n = write_png(OUT / name, size)
        print(f"{name:<14} {size}x{size}  {n:,} bytes")
