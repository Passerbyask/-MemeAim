"""UI 组件：字体、渐变文字、按钮、滑块与准星绘制。"""
import pygame

_FONT_CACHE = {}


def font(size):
    if size not in _FONT_CACHE:
        pygame.font.init()
        _FONT_CACHE[size] = pygame.font.SysFont(
            "microsoftyahei,msyh,simhei,dengxian,simsun,arial", size
        )
    return _FONT_CACHE[size]


def _lerp_color(c1, c2, t):
    return (int(c1[0] + (c2[0] - c1[0]) * t),
            int(c1[1] + (c2[1] - c1[1]) * t),
            int(c1[2] + (c2[2] - c1[2]) * t))


def render_gradient_text(text, size, top_color, bottom_color):
    """渲染带垂直渐变的文字。"""
    base = font(size).render(text, True, (255, 255, 255))
    w, h = base.get_size()
    grad = pygame.Surface((w, h), pygame.SRCALPHA)
    for y in range(h):
        t = y / max(1, h - 1)
        pygame.draw.line(grad, _lerp_color(top_color, bottom_color, t), (0, y), (w, y))
    grad.blit(base, (0, 0), special_flags=pygame.BLEND_RGBA_MULT)
    return grad


def _rounded_gradient_rect(surface, rect, top_color, bottom_color, radius=10):
    """绘制带圆角的垂直渐变矩形。"""
    rect = pygame.Rect(rect)
    temp = pygame.Surface(rect.size, pygame.SRCALPHA)
    h = max(1, rect.height)
    for y in range(h):
        t = y / (h - 1)
        pygame.draw.line(temp, _lerp_color(top_color, bottom_color, t),
                         (0, y), (rect.width, y))
    mask = pygame.Surface(rect.size, pygame.SRCALPHA)
    pygame.draw.rect(mask, (255, 255, 255, 255), mask.get_rect(), border_radius=radius)
    temp.blit(mask, (0, 0), special_flags=pygame.BLEND_RGBA_MULT)
    surface.blit(temp, rect.topleft)


class Button:
    def __init__(self, rect, text, callback=None):
        self.rect = pygame.Rect(rect)
        self.text = text
        self.callback = callback
        self.hovered = False

    def handle_event(self, event):
        if event.type == pygame.MOUSEMOTION:
            self.hovered = self.rect.collidepoint(event.pos)
        elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.rect.collidepoint(event.pos):
                self.hovered = True
                if self.callback:
                    self.callback()

    def draw(self, surface, size=30):
        if self.hovered:
            top_c, bot_c = (62, 92, 122), (40, 58, 82)
            border = (0, 210, 255)
        else:
            top_c, bot_c = (48, 54, 70), (34, 39, 52)
            border = (82, 90, 110)
        _rounded_gradient_rect(surface, self.rect, top_c, bot_c, radius=12)
        pygame.draw.rect(surface, border, self.rect, width=2, border_radius=12)
        text_color = (255, 255, 255) if self.hovered else (225, 230, 240)
        text = font(size).render(self.text, True, text_color)
        surface.blit(text, text.get_rect(center=self.rect.center))


class Slider:
    def __init__(self, rect, label, value, min_val, max_val, step=1, is_float=False, on_change=None):
        self.rect = pygame.Rect(rect)
        self.label = label
        self.value = value
        self.min_val = min_val
        self.max_val = max_val
        self.step = step
        self.is_float = is_float
        self.on_change = on_change
        self.dragging = False

    def _ratio(self):
        if self.max_val <= self.min_val:
            return 0.0
        return (self.value - self.min_val) / (self.max_val - self.min_val)

    def _value_from_x(self, x):
        ratio = (x - self.rect.x) / self.rect.width if self.rect.width else 0
        ratio = max(0.0, min(1.0, ratio))
        v = self.min_val + ratio * (self.max_val - self.min_val)
        if self.is_float:
            return round(v / self.step) * self.step if self.step else v
        return int(round(v / self.step) * self.step)

    def _set(self, x):
        new = self._value_from_x(x)
        if new != self.value:
            self.value = new
            if self.on_change:
                self.on_change(new)

    def handle_event(self, event):
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.rect.inflate(0, 24).collidepoint(event.pos):
                self.dragging = True
                self._set(event.pos[0])
        elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
            self.dragging = False
        elif event.type == pygame.MOUSEMOTION and self.dragging:
            self._set(event.pos[0])

    def _display(self):
        if self.is_float:
            return f"{self.value:g}"
        return str(int(self.value))

    def draw(self, surface, size=22):
        track_y = self.rect.centery
        # 轨道（暗色底 + 已填充亮色段）
        pygame.draw.line(surface, (70, 78, 96), (self.rect.x, track_y), (self.rect.right, track_y), 6)
        hx = int(self.rect.x + self._ratio() * self.rect.width)
        if hx > self.rect.x:
            pygame.draw.line(surface, (0, 180, 220), (self.rect.x, track_y), (hx, track_y), 6)
        # 滑块手柄（带外发光）
        pygame.draw.circle(surface, (0, 210, 255), (hx, track_y), 12, 1)
        pygame.draw.circle(surface, (0, 210, 255), (hx, track_y), 9)
        pygame.draw.circle(surface, (255, 255, 255), (hx, track_y), 3)
        label = font(size).render(self.label, True, (200, 206, 218))
        value = font(size).render(self._display(), True, (255, 255, 255))
        surface.blit(label, (self.rect.x, self.rect.y - 28))
        surface.blit(value, (self.rect.right - value.get_width(), self.rect.y - 28))


def draw_crosshair(surface, pos, cfg):
    x, y = pos
    color = tuple(cfg["color"])
    size = max(1, int(cfg["size"]))
    thickness = max(1, int(cfg["thickness"]))
    gap = int(cfg["gap"])
    style = cfg["style"]

    if style == "dot":
        pygame.draw.circle(surface, color, (int(x), int(y)), max(1, size // 2))
    elif style == "circle":
        pygame.draw.circle(surface, color, (int(x), int(y)), size, thickness)
        pygame.draw.circle(surface, color, (int(x), int(y)), 1)
    else:  # cross
        pygame.draw.line(surface, color, (x - size, y), (x - gap, y), thickness)
        pygame.draw.line(surface, color, (x + gap, y), (x + size, y), thickness)
        pygame.draw.line(surface, color, (x, y - size), (x, y - gap), thickness)
        pygame.draw.line(surface, color, (x, y + gap), (x, y + size), thickness)
