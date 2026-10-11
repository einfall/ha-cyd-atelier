// Frame dimensions are inside the widget; they never change item coordinates.
export function normalizeFrame(w){
  const half=Math.floor(Math.min(w.w,w.h)/2);
  const integer=(n,max)=>Math.round(Math.min(max,Math.max(0,Number(n)||0)));
  w.borderWidth=integer(w.borderWidth,Math.min(24,half));
  w.cornerRadius=integer(w.cornerRadius,half);
  if(!/^#[0-9a-f]{6}$/i.test(w.borderColor))w.borderColor='#8cadff';
  return w;
}

// Use scanlines: ESPHome's display API has no rounded-rectangle primitive.
// The border only writes its ring, so a transparent interior stays untouched.
export const FRAME_CPP=`auto rounded_inset = [](int row, int height, int radius) -> int {
  if (radius <= 0) return 0;
  float dy = std::max(radius - row - 0.5f, row + 0.5f - (height - radius));
  if (dy <= 0) return 0;
  return std::max(0, (int) ceilf(radius - sqrtf(std::max(0.0f, float(radius * radius) - dy * dy)) - 0.5f));
};
auto draw_widget_shape = [&](int x, int y, int width, int height, int radius, int border, Color color) {
  for (int row = 0; row < height; row++) {
    int outer = rounded_inset(row, height, radius);
    if (border <= 0 || row < border || row >= height - border || width <= 2 * border || height <= 2 * border) {
      it.horizontal_line(x + outer, y + row, width - 2 * outer, color);
    } else {
      int inner = border + rounded_inset(row - border, height - 2 * border, std::max(0, radius - border));
      int length = std::max(0, inner - outer);
      if (length > 0) {
        it.horizontal_line(x + outer, y + row, length, color);
        it.horizontal_line(x + width - inner, y + row, length, color);
      }
    }
  }
};`;
