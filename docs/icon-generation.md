# 暖灯小阁图标

使用内置 image_gen 重新生成，最终原图为 `preview/icon-source.png`。前一版在 16px 下天窗太弱，已放弃；最终采用完整三角斜屋顶、短墙沿、单个暖黄亮窗和深青底。缩放及固定八色量化由 `scripts/export_icon.py` 完成，不使用代码逐像素绘制。

输出：`static/assets/attic-icon-{16,32,48,180,512}.png`、含 16/32 两帧的 `static/assets/favicon.ico`。16/32 放大八倍的检查图为 `preview/icon-16x.png`、`preview/icon-32x.png`。

## 最终生成提示词

A tiny bold pixel-art app icon, flat symbolic design that stays readable at 16x16. One complete STEEP TRIANGULAR ATTIC ROOF, near-frontal view, a tall isosceles triangle, NOT a wide low roof. Roof peak at 18% image height, eaves at 70% image height, a very short horizontal wall strip at 76% height. Complete subject centered inside a 12% to 88% bounding box, at least 12% empty padding on all sides; NO cropping. Deep solid teal background. Deep walnut brown triangular roof, one slightly lighter brown stepped edge. ONE VERY LARGE BRIGHT WARM YELLOW SQUARE SKYLIGHT centered on the roof face: a simple unbroken square occupying one third of the triangle width, about 4 logical pixels across on a 16px icon. It must read as a bright square, not a tiny slit. It is THE brightest object. Tiny muted wood wall strip below roof eaves. Only 6 flat solid colors, giant clean solid shapes, uniform crisp staircase pixel edges on a coarse 16x16 logical grid, no texture, no gradients, no anti-aliasing, no roof tiles, no details, no crossbar in the skylight, no other windows, no text, no door, no chimney, no perspective mockup, no rounded icon mask. An instantly clear triangle roof + big luminous yellow square. Square canvas.
