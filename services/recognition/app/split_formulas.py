"""Content-bounded formula grouping, including stacked fractions.

Normalize uneven paper lighting, find ink components and group them using
estimated character size instead of splitting whole rows at a fixed pixel gap.
This is geometric grouping, not semantic detection; inspect region previews.
No recognition weights are changed.
"""
from pathlib import Path
import sys
import cv2
import numpy as np


def _formula_layout(img):
    original_h, original_w = img.shape[:2]
    ratio = min(1.0, 1600.0 / max(original_h, original_w))
    if ratio < 1:
        img = cv2.resize(img, None, fx=ratio, fy=ratio, interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    # Relative darkness suppresses the broad shadow at a photographed page edge.
    background = cv2.GaussianBlur(gray, (0, 0), max(6.0, min(h, w) / 32.0))
    normalized = cv2.divide(gray, np.maximum(background, 1), scale=255)
    ink = (normalized < 175).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    minimum_area = max(3, int((max(h, w) / 1000.0) ** 2 * 3))
    components = []
    component_labels = []
    for label_id, (x, y, cw, ch, area) in enumerate(stats[1:], 1):
        if area < minimum_area:
            continue
        if area > h * w * .2 and (cw > w * .85 or ch > h * .85):
            continue
        components.append((int(x), int(y), int(x + cw), int(y + ch), int(area)))
        component_labels.append(label_id)
    if not components:
        return [], labels
    # Bound work on dense/noisy pages; never silently choose random components.
    if len(components) > 3000:
        raise ValueError("图片背景过于复杂，请裁剪公式区域后重新检测")
    heights = [y2 - y1 for x1, y1, x2, y2, area in components
               if y2 - y1 >= max(5, max(h, w) * .005)
               and .12 <= (x2 - x1) / (y2 - y1) <= 3
               and y2 - y1 < h * .5]
    scale = max(6.0, float(np.median(heights or [b[3] - b[1] for b in components])))
    parents = list(range(len(components)))

    def root(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    def fraction_bar(box):
        return box[2] - box[0] >= scale * 1.8 and box[3] - box[1] <= scale * .45

    # A bar may span a large numerator gap, but may attach only the nearest ink
    # layer on either side. A fixed short reach breaks spacious fractions; the
    # former unrestricted long reach absorbs whole neighbouring equations.
    bar_neighbours = {}
    for i, bar in enumerate(components):
        if not fraction_bar(bar):
            continue
        above, below = [], []
        for j, other in enumerate(components):
            if i == j:
                continue
            overlap = min(bar[2], other[2]) - max(bar[0], other[0])
            if overlap < min(scale * .18, min(bar[2] - bar[0], other[2] - other[0]) * .3):
                continue
            if other[3] <= bar[1]:
                above.append(bar[1] - other[3])
            elif other[1] >= bar[3]:
                below.append(other[1] - bar[3])
        bar_neighbours[i] = (min(above, default=float('inf')), min(below, default=float('inf')))

    def near_bar(i, j, gap_y):
        if i not in bar_neighbours or gap_y > scale * 2.1:
            return False
        bar, other = components[i], components[j]
        side = 0 if other[3] <= bar[1] else 1 if other[1] >= bar[3] else None
        return side is None or gap_y <= bar_neighbours[i][side] + scale * .45

    # Original component pairs, not expanding group boxes: this avoids a tall
    # group absorbing every nearby row merely because its bounding box grew.
    order = sorted(range(len(components)), key=lambda i: components[i][1])
    for offset, i in enumerate(order):
        ax1, ay1, ax2, ay2, _ = components[i]
        for j in order[offset + 1:]:
            bx1, by1, bx2, by2, _ = components[j]
            if by1 - ay2 > scale * 2.1:
                break
            overlap_x = min(ax2, bx2) - max(ax1, bx1)
            overlap_y = min(ay2, by2) - max(ay1, by1)
            gap_x, gap_y = max(0, -overlap_x), max(0, -overlap_y)
            same_line = gap_x <= scale * 1.5 and overlap_y >= min(scale * .12, min(ay2 - ay1, by2 - by1) * .2)
            stacked = gap_y <= scale * .55 and overlap_x >= min(scale * .18, min(ax2 - ax1, bx2 - bx1) * .3)
            # A long, thin bar anchors its numerator/denominator even when the
            # white gap is larger than an ordinary inter-character gap.
            fraction = (near_bar(i, j, gap_y) or near_bar(j, i, gap_y)) and overlap_x >= min(scale * .18, min(ax2 - ax1, bx2 - bx1) * .3)
            # Handwritten '=' and fraction bars are often slightly slanted or
            # vertically offset; require proximity, not exact y intersection.
            superscript = gap_x <= scale * 1.25 and gap_y <= scale * .22
            if same_line or stacked or fraction or superscript:
                parents[root(j)] = root(i)
    groups = {}
    for i, box in enumerate(components):
        groups.setdefault(root(i), []).append((box, component_labels[i]))
    padding_x, padding_y = max(4, scale * .22), max(4, scale * .18)
    regions = []
    for members in groups.values():
        group = [member[0] for member in members]
        x1, y1 = min(b[0] for b in group), min(b[1] for b in group)
        x2, y2 = max(b[2] for b in group), max(b[3] for b in group)
        if sum(b[4] for b in group) < max(minimum_area * 3, scale * scale * .02):
            continue
        box = [max(0, int(np.floor((x1 - padding_x) / ratio))),
                        max(0, int(np.floor((y1 - padding_y) / ratio))),
                        min(original_w, int(np.ceil((x2 + padding_x) / ratio))),
                        min(original_h, int(np.ceil((y2 + padding_y) / ratio)))]
        regions.append((box, [member[1] for member in members]))
    return sorted(regions, key=lambda region: (region[0][1], region[0][0])), labels


def formula_regions(img):
    return [box for box, _ in _formula_layout(img)[0]]


def formula_crops(img):
    """Return boxes and crops containing only the ink assigned to each formula.

    Staggered fractions can have overlapping bounding rectangles. Remove foreign
    components inside a crop, rather than chopping off the target's tall root
    or importing the preceding formula's denominator. No semantic rewriting.
    """
    regions, labels = _formula_layout(img)
    if labels.shape != img.shape[:2]:
        labels = cv2.resize(labels, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
    result = []
    for box, own_labels in regions:
        x1, y1, x2, y2 = box
        crop = img[y1:y2, x1:x2].copy()
        local = labels[y1:y2, x1:x2]
        own = np.isin(local, own_labels).astype(np.uint8)
        foreign = ((local > 0) & (own == 0)).astype(np.uint8)
        if np.any(foreign):
            radius = max(1, int(np.ceil(max(img.shape[:2]) / 1600)))
            kernel = np.ones((radius * 2 + 1, radius * 2 + 1), np.uint8)
            remove = cv2.dilate(foreign, kernel) & (1 - cv2.dilate(own, np.ones((3, 3), np.uint8)))
            crop = cv2.inpaint(crop, remove * 255, 3, cv2.INPAINT_TELEA)
        result.append((box, crop))
    return result


def split_formulas(image_path, output_dir):
    # imdecode/fromfile supports Chinese Windows paths, unlike some cv2.imread builds.
    image = cv2.imdecode(np.fromfile(str(image_path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"无法读取图片: {image_path}")
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    preview = image.copy()
    paths = []
    for (x1, y1, x2, y2), crop in formula_crops(image):
        filename = out / f"formula_{len(paths) + 1:03d}.png"
        ok, encoded = cv2.imencode('.png', crop)
        if not ok:
            raise OSError(f"无法写入: {filename}")
        encoded.tofile(str(filename))
        cv2.rectangle(preview, (x1, y1), (x2, y2), (0, 0, 255), 3)
        paths.append(filename)
    cv2.imencode('.jpg', preview)[1].tofile(str(out / 'preview_boxes.jpg'))
    return paths


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('用法: python split_formulas_v2.py 图片路径 输出文件夹')
    images = split_formulas(sys.argv[1], sys.argv[2])
    print('检测到公式区域:', len(images))
    for filename in images:
        print(filename)
