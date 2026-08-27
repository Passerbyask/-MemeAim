"""练枪软件入口：状态机、菜单、游戏循环与结算界面。"""
import math
import random

import pygame

import audio
import i18n
import ui
from effects import FloatingText, Particle
from settings import AppData
from targets import MODE_FLICK, MODE_ORDER, TARGET_COLOR, Session

# 逻辑分辨率：所有布局、游戏元素都在这个坐标系里设计，再等比缩放到实际窗口。
LOGICAL_W, LOGICAL_H = 1280, 720
RESOLUTIONS = ["1280x720", "1600x900", "1920x1080", "2560x1440"]
FPS = 240
BG = (18, 20, 28)
PANEL = (30, 33, 44)

CROSSHAIR_COLORS = [
    (0, 255, 120), (255, 80, 80), (80, 160, 255),
    (255, 255, 255), (255, 200, 0), (200, 80, 255),
]
COLOR_KEYS = {
    (0, 255, 120): "color_green", (255, 80, 80): "color_red", (80, 160, 255): "color_blue",
    (255, 255, 255): "color_white", (255, 200, 0): "color_yellow", (200, 80, 255): "color_purple",
}
STYLE_KEYS = {"cross": "style_cross", "dot": "style_dot", "circle": "style_circle"}


class App:
    def __init__(self):
        pygame.init()
        self.data = AppData()
        self.lang = self.data.settings.get("lang", "zh")
        audio.init()
        for entry in audio.get_hit_sounds():
            audio.set_hit_enabled(entry["name"], self.data.is_hit_enabled(entry["name"]))
        for entry in audio.get_miss_sounds():
            audio.set_miss_enabled(entry["name"], self.data.is_miss_enabled(entry["name"]))
        pygame.display.set_caption(self.t("app_title"))
        self._apply_display()
        self.clock = pygame.time.Clock()
        self.running = True
        self.state = "menu"
        self.session = None
        self.last_result = None
        self.mouse_pos = (0, 0)
        self.crosshair_pos = (LOGICAL_W // 2, LOGICAL_H // 2)
        self.anim_time = 0.0
        self.buttons = []
        self.sliders = []
        self.sound_rows = []
        self.effects = []
        self.menu_particles = self._make_menu_particles()
        self.crosshair_flash = 0.0
        self.crosshair_flash_type = None
        pygame.mouse.set_visible(True)
        self.set_state("menu")
        audio.start_bgm()

    # ---------- 显示与缩放 ----------

    def t(self, key, **fmt):
        return i18n.get_text(self.lang, key, **fmt)

    def _apply_display(self):
        res = self.data.settings.get("resolution", "1280x720")
        try:
            w, h = [int(x) for x in res.split("x")]
        except ValueError:
            w, h = LOGICAL_W, LOGICAL_H
        if self.data.settings.get("fullscreen", False):
            self.screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        else:
            self.screen = pygame.display.set_mode((w, h), pygame.RESIZABLE)
        self._update_scale()
        self.canvas = pygame.Surface((LOGICAL_W, LOGICAL_H))
        self._build_background()

    def _update_scale(self):
        sw, sh = self.screen.get_size()
        self.scale_x = sw / LOGICAL_W
        self.scale_y = sh / LOGICAL_H
        self.scale = self.scale_y

    def _to_logical(self, pos):
        return (pos[0] / self.scale_x, pos[1] / self.scale_y)

    def _build_background(self):
        self.bg = pygame.Surface((LOGICAL_W, LOGICAL_H))
        top = (24, 27, 38)
        bottom = (12, 14, 20)
        for y in range(LOGICAL_H):
            t = y / LOGICAL_H
            c = (int(top[0] + (bottom[0] - top[0]) * t),
                 int(top[1] + (bottom[1] - top[1]) * t),
                 int(top[2] + (bottom[2] - top[2]) * t))
            pygame.draw.line(self.bg, c, (0, y), (LOGICAL_W, y))
        gcolor = (32, 38, 52)
        for x in range(0, LOGICAL_W + 1, 40):
            pygame.draw.line(self.bg, gcolor, (x, 0), (x, LOGICAL_H))
        for y in range(0, LOGICAL_H + 1, 40):
            pygame.draw.line(self.bg, gcolor, (0, y), (LOGICAL_W, y))

    # ---------- 状态与 UI ----------

    def set_state(self, state):
        self.state = state
        self.buttons = []
        self.sliders = []
        self.sound_rows = []
        if state == "menu":
            self._menu_ui()
        elif state == "mode_select":
            self._mode_select_ui()
        elif state == "settings":
            self._settings_ui()
        elif state == "crosshair":
            self._crosshair_ui()
        elif state == "hit_sounds":
            self._sound_list_ui(False)
        elif state == "miss_sounds":
            self._sound_list_ui(True)
        elif state == "results":
            self._results_ui()

    def _menu_ui(self):
        cx = LOGICAL_W // 2
        w, h, gap = 320, 56, 18
        y = 220
        self.buttons = [
            ui.Button((cx - w // 2, y, w, h), self.t("menu_start"), lambda: self.set_state("mode_select")),
            ui.Button((cx - w // 2, y + h + gap, w, h), self.t("menu_settings"), lambda: self.set_state("settings")),
            ui.Button((cx - w // 2, y + 2 * (h + gap), w, h), self.t("menu_crosshair"), lambda: self.set_state("crosshair")),
            ui.Button((cx - w // 2, y + 3 * (h + gap), w, h), self.t("menu_hit_sounds"), lambda: self.set_state("hit_sounds")),
            ui.Button((cx - w // 2, y + 4 * (h + gap), w, h), self.t("menu_miss_sounds"), lambda: self.set_state("miss_sounds")),
            ui.Button((cx - w // 2, y + 5 * (h + gap), w, h), self.t("menu_exit"), self.quit),
        ]

    def _mode_select_ui(self):
        cx = LOGICAL_W // 2
        w, h, gap = 400, 70, 22
        y = 180
        self.buttons = []
        for i, mode_id in enumerate(MODE_ORDER):
            self.buttons.append(
                ui.Button((cx - w // 2, y + i * (h + gap), w, h),
                          self.t("mode_" + mode_id),
                          lambda m=mode_id: self.start_session(m))
            )
        self.buttons.append(
            ui.Button((cx - w // 2, y + 4 * (h + gap) + 10, w, h), self.t("back"), lambda: self.set_state("menu"))
        )

    def _settings_ui(self):
        s = self.data.settings
        cx = LOGICAL_W // 2
        w, h, gap = 520, 16, 62
        y0 = 130
        self.sliders = [
            ui.Slider((cx - w // 2, y0, w, h), self.t("set_duration"), s["session_duration"], 10, 180, 5,
                      on_change=lambda v: self._set_setting("session_duration", int(v))),
            ui.Slider((cx - w // 2, y0 + gap, w, h), self.t("set_radius"), s["ball_radius"], 6, 40, 1,
                      on_change=lambda v: self._set_setting("ball_radius", int(v))),
            ui.Slider((cx - w // 2, y0 + 2 * gap, w, h), self.t("set_max_targets"), s["max_targets"], 1, 10, 1,
                      on_change=lambda v: self._set_setting("max_targets", int(v))),
            ui.Slider((cx - w // 2, y0 + 3 * gap, w, h), self.t("set_speed"), s["target_speed"], 50, 600, 10,
                      on_change=lambda v: self._set_setting("target_speed", int(v))),
            ui.Slider((cx - w // 2, y0 + 4 * gap, w, h), self.t("set_lifetime"), s["target_lifetime"], 0.2, 3.0, 0.05,
                      is_float=True, on_change=lambda v: self._set_setting("target_lifetime", v)),
            ui.Slider((cx - w // 2, y0 + 5 * gap, w, h), self.t("set_sensitivity"), s.get("sensitivity", 1.0), 0.2, 3.0, 0.1,
                      is_float=True, on_change=lambda v: self._set_setting("sensitivity", v)),
        ]
        self.buttons = [
            ui.Button((cx - 310, y0 + 6 * gap + 4, 300, 50),
                      self.t("set_resolution") + s.get("resolution", "1280x720"), self._cycle_resolution),
            ui.Button((cx + 10, y0 + 6 * gap + 4, 300, 50),
                      self.t("set_fullscreen") + (self.t("on") if s.get("fullscreen") else self.t("off")), self._toggle_fullscreen_setting),
            ui.Button((cx - 310, y0 + 6 * gap + 58, 300, 50),
                      self.t("set_lang") + (self.t("lang_zh") if self.lang == "zh" else self.t("lang_en")), self._cycle_lang),
            ui.Button((cx + 10, y0 + 6 * gap + 58, 300, 50), self.t("save_back"), self._save_and_back),
        ]

    def _crosshair_ui(self):
        c = self.data.crosshair
        cx = LOGICAL_W // 2
        w, h, gap = 520, 16, 74
        y0 = 150
        self.sliders = [
            ui.Slider((cx - w // 2, y0, w, h), self.t("ch_size"), c["size"], 6, 40, 1,
                      on_change=lambda v: self._set_crosshair("size", int(v))),
            ui.Slider((cx - w // 2, y0 + gap, w, h), self.t("ch_thickness"), c["thickness"], 1, 8, 1,
                      on_change=lambda v: self._set_crosshair("thickness", int(v))),
            ui.Slider((cx - w // 2, y0 + 2 * gap, w, h), self.t("ch_gap"), c["gap"], 0, 20, 1,
                      on_change=lambda v: self._set_crosshair("gap", int(v))),
        ]
        self.buttons = [
            ui.Button((cx - 370, y0 + 3 * gap + 6, 230, 56),
                      self.t("ch_style") + self.t(STYLE_KEYS.get(c["style"], "style_cross")), self._cycle_style),
            ui.Button((cx + 140, y0 + 3 * gap + 6, 230, 56),
                      self.t("ch_color") + self.t(COLOR_KEYS.get(tuple(c["color"]), "color_green")), self._cycle_color),
            ui.Button((cx - 100, y0 + 4 * gap + 30, 200, 56), self.t("save_back"), self._save_and_back),
        ]

    def _sound_list_ui(self, is_miss):
        self._sound_is_miss = is_miss
        self._scroll_y = 0
        self._refresh_sound_list()

    def _refresh_sound_list(self):
        is_miss = self._sound_is_miss
        sounds = audio.get_miss_sounds() if is_miss else audio.get_hit_sounds()
        cx = LOGICAL_W // 2
        w, row_h, gap = 700, 52, 12
        top = 132
        bottom = LOGICAL_H - 100
        viewport_h = bottom - top
        content_h = len(sounds) * (row_h + gap)
        self._scroll_y = max(0, min(self._scroll_y, max(0, content_h - viewport_h)))

        self.buttons = []
        self.sound_rows = []
        for i, entry in enumerate(sounds):
            y = top + i * (row_h + gap) - self._scroll_y
            if y + row_h < top or y > bottom:
                continue
            row = pygame.Rect(cx - w // 2, y, w, row_h)
            label = entry["label"]
            if len(label) > 26:
                label = label[:25] + "…"
            self.sound_rows.append((label, row))
            by = y + (row_h - 40) // 2
            name = entry["name"]
            if is_miss:
                self.buttons.append(ui.Button((row.right - 330, by, 130, 40), self.t("preview"),
                                              lambda n=name: audio.preview_miss(n)))
                self.buttons.append(ui.Button((row.right - 180, by, 160, 40),
                                              self.t("enabled") if entry["enabled"] else self.t("disabled"),
                                              lambda n=name: self._toggle_miss(n)))
            else:
                self.buttons.append(ui.Button((row.right - 330, by, 130, 40), self.t("preview"),
                                              lambda n=name: audio.preview_hit(n)))
                self.buttons.append(ui.Button((row.right - 180, by, 160, 40),
                                              self.t("enabled") if entry["enabled"] else self.t("disabled"),
                                              lambda n=name: self._toggle_hit(n)))
        self.buttons.append(ui.Button((cx - 100, LOGICAL_H - 88, 200, 56),
                                      self.t("back"), lambda: self.set_state("menu")))

    def _toggle_hit(self, name):
        new = not audio.is_hit_enabled(name)
        audio.set_hit_enabled(name, new)
        self.data.set_hit_enabled(name, new)
        self._refresh_sound_list()

    def _toggle_miss(self, name):
        new = not audio.is_miss_enabled(name)
        audio.set_miss_enabled(name, new)
        self.data.set_miss_enabled(name, new)
        self._refresh_sound_list()

    def _results_ui(self):
        cx = LOGICAL_W // 2
        w, h = 300, 60
        y = LOGICAL_H - 150
        self.buttons = [
            ui.Button((cx - 320, y, w, h), self.t("play_again"), lambda: self.start_session(self.last_result["mode"])),
            ui.Button((cx + 20, y, w, h), self.t("main_menu"), lambda: self.set_state("menu")),
        ]

    # ---------- 设置回调 ----------

    def _set_setting(self, key, value):
        self.data.settings[key] = value
        self.data.save()

    def _set_crosshair(self, key, value):
        self.data.crosshair[key] = value
        self.data.save()

    def _save_and_back(self):
        self.data.save()
        self.set_state("menu")

    def _cycle_style(self):
        order = ["cross", "dot", "circle"]
        cur = self.data.crosshair["style"]
        self.data.crosshair["style"] = order[(order.index(cur) + 1) % len(order)]
        self.data.save()
        self.set_state("crosshair")

    def _cycle_color(self):
        cur = tuple(self.data.crosshair["color"])
        idx = CROSSHAIR_COLORS.index(cur) if cur in CROSSHAIR_COLORS else -1
        self.data.crosshair["color"] = list(CROSSHAIR_COLORS[(idx + 1) % len(CROSSHAIR_COLORS)])
        self.data.save()
        self.set_state("crosshair")

    def _cycle_resolution(self):
        res = self.data.settings.get("resolution", "1280x720")
        idx = RESOLUTIONS.index(res) if res in RESOLUTIONS else 0
        self.data.settings["resolution"] = RESOLUTIONS[(idx + 1) % len(RESOLUTIONS)]
        self.data.save()
        self._apply_display()
        self.set_state("settings")

    def _toggle_fullscreen_setting(self):
        self.data.settings["fullscreen"] = not bool(self.data.settings.get("fullscreen", False))
        self.data.save()
        self._apply_display()
        self.set_state("settings")

    def _cycle_lang(self):
        self.lang = "en" if self.lang == "zh" else "zh"
        self.data.settings["lang"] = self.lang
        self.data.save()
        pygame.display.set_caption(self.t("app_title"))
        self.set_state("settings")

    # ---------- 游戏流程 ----------

    def start_session(self, mode_id):
        self.buttons = []
        self.sliders = []
        self.effects = []
        self.session = Session(mode_id, self.data.settings, self.scale)
        self.session.start(self._play_bounds())
        self.crosshair_pos = (LOGICAL_W // 2, LOGICAL_H // 2)
        pygame.mouse.set_visible(False)
        pygame.event.set_grab(True)
        self.state = "playing"

    def end_session(self, aborted=False):
        s = self.session
        if s is None:
            return
        new_best = False
        if not aborted and s.score > 0:
            new_best = self.data.update_best(s.mode_id, s.score)
        self.last_result = {
            "mode": s.mode_id,
            "score": s.score,
            "hits": s.hits,
            "shots": s.shots,
            "accuracy": s.accuracy(),
            "max_combo": s.max_combo,
            "despawned": s.despawned,
            "aborted": aborted,
            "new_best": new_best,
        }
        self.effects = []
        if not aborted:
            audio.play_result(s.score)
        pygame.mouse.set_visible(True)
        pygame.event.set_grab(False)
        self.set_state("results")

    def _play_bounds(self):
        return pygame.Rect(0, 60, LOGICAL_W, LOGICAL_H - 60)

    def quit(self):
        pygame.event.set_grab(False)
        self.running = False

    def toggle_fullscreen(self):
        self.data.settings["fullscreen"] = not bool(self.data.settings.get("fullscreen", False))
        self.data.save()
        pygame.event.set_grab(False)
        self._apply_display()
        if self.state == "playing" and self.session:
            self.session.start(self._play_bounds())
            pygame.mouse.set_visible(False)
            pygame.event.set_grab(True)
        else:
            pygame.mouse.set_visible(True)
            self.set_state(self.state)

    # ---------- 特效 ----------

    def _spawn_hit_effects(self, pos):
        for _ in range(8):
            self.effects.append(Particle(pos[0], pos[1], TARGET_COLOR))
        self.effects.append(FloatingText(pos[0], pos[1] - 18, "+1", (0, 255, 120), size=28))
        s = self.session
        if s.combo >= 5 and s.combo % 5 == 0:
            self.effects.append(FloatingText(LOGICAL_W // 2, 90, self.t("combo", n=s.combo), (255, 210, 60), size=44, rise=20))

    def _spawn_miss_effects(self, pos):
        self.effects.append(FloatingText(pos[0], pos[1] - 18, "-1", (255, 90, 90), size=28))

    def _update_crosshair_from_mouse(self):
        dx, dy = pygame.mouse.get_rel()
        sens = self.data.settings.get("sensitivity", 1.0)
        b = self._play_bounds()
        x = self.crosshair_pos[0] + dx * sens
        y = self.crosshair_pos[1] + dy * sens
        x = max(b.left, min(b.right - 1, x))
        y = max(b.top, min(b.bottom - 1, y))
        self.crosshair_pos = (x, y)

    def _make_menu_particles(self):
        colors = [(0, 210, 255), (120, 160, 255), (0, 160, 200), (150, 120, 255)]
        particles = []
        for _ in range(40):
            particles.append({
                "x": random.uniform(0, LOGICAL_W),
                "y": random.uniform(0, LOGICAL_H),
                "vx": random.uniform(-16, 16),
                "vy": random.uniform(-11, 11),
                "r": random.uniform(1.5, 4.0),
                "c": random.choice(colors),
            })
        return particles

    def _update_menu_particles(self, dt):
        for p in self.menu_particles:
            p["x"] += p["vx"] * dt
            p["y"] += p["vy"] * dt
            if p["x"] < 0 or p["x"] > LOGICAL_W:
                p["vx"] *= -1
            if p["y"] < 0 or p["y"] > LOGICAL_H:
                p["vy"] *= -1

    def _draw_menu_particles(self):
        for p in self.menu_particles:
            d = int(p["r"] * 2) + 4
            s = pygame.Surface((d, d), pygame.SRCALPHA)
            pygame.draw.circle(s, (*p["c"], 70), (d // 2, d // 2), int(p["r"]))
            self.canvas.blit(s, (int(p["x"] - d / 2), int(p["y"] - d / 2)))

    # ---------- 事件与主循环 ----------

    def handle_event(self, event):
        if event.type == pygame.QUIT:
            self.running = False
        elif event.type == pygame.VIDEORESIZE:
            self._update_scale()
        elif event.type == pygame.KEYDOWN:
            self._handle_key(event.key)
        elif self.state == "playing":
            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                self._shoot()
        else:
            if event.type in (pygame.MOUSEMOTION, pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP):
                event.pos = self._to_logical(event.pos)
            self._dispatch_mouse(event)

    def _shoot(self):
        pos = self.crosshair_pos
        hit = self.session.shoot(pos, self._play_bounds())
        if hit:
            audio.play_hit()
            self._spawn_hit_effects(pos)
            self.crosshair_flash_type = "hit"
        else:
            audio.play_miss()
            self._spawn_miss_effects(pos)
            self.crosshair_flash_type = "miss"
        self.crosshair_flash = 0.15

    def _dispatch_mouse(self, event):
        if self.state in ("hit_sounds", "miss_sounds") and event.type == pygame.MOUSEWHEEL:
            self._scroll_y -= event.y * 40
            self._refresh_sound_list()
        else:
            for b in self.buttons:
                b.handle_event(event)
            for s in self.sliders:
                s.handle_event(event)

    def _handle_key(self, key):
        if key == pygame.K_F11:
            self.toggle_fullscreen()
        elif key == pygame.K_ESCAPE:
            if self.state == "playing":
                self.end_session(aborted=True)
            elif self.state in ("mode_select", "settings", "crosshair", "hit_sounds", "miss_sounds"):
                self.set_state("menu")
            elif self.state == "results":
                self.set_state("mode_select")
            elif self.state == "menu":
                self.running = False

    def update(self, dt):
        self.mouse_pos = self._to_logical(pygame.mouse.get_pos())
        self.anim_time += dt
        if self.crosshair_flash > 0:
            self.crosshair_flash -= dt
        for e in self.effects:
            e.update(dt)
        self.effects = [e for e in self.effects if e.alive]
        if self.state == "playing" and self.session:
            self._update_crosshair_from_mouse()
            self.session.update(dt, self._play_bounds())
            if self.session.time_left <= 0:
                self.end_session()
        elif self.state == "menu":
            self._update_menu_particles(dt)

    def run(self):
        while self.running:
            dt = self.clock.tick(FPS) / 1000.0
            for event in pygame.event.get():
                self.handle_event(event)
            self.update(dt)
            self.draw()
            pygame.display.flip()
        pygame.quit()

    # ---------- 绘制 ----------

    def draw(self):
        if self.state == "playing":
            self.canvas.blit(self.bg, (0, 0))
            self._draw_playing()
        else:
            self.canvas.fill(BG)
            if self.state == "results":
                self._draw_results()
            else:
                self._draw_ui_state()
        sw, sh = self.screen.get_size()
        if sw == LOGICAL_W and sh == LOGICAL_H:
            self.screen.blit(self.canvas, (0, 0))
        else:
            self.screen.blit(pygame.transform.scale(self.canvas, (sw, sh)), (0, 0))

    def _draw_title(self, text, size=60, y=80):
        txt = ui.font(size).render(text, True, (235, 238, 245))
        self.canvas.blit(txt, txt.get_rect(center=(LOGICAL_W // 2, y)))

    def _draw_ui_state(self):
        if self.state == "menu":
            self._draw_menu_particles()
            title = ui.render_gradient_text(self.t("app_title"), 64, (150, 235, 255), (95, 120, 255))
            jx = int(math.sin(self.anim_time * 6) * 5) + int(math.sin(self.anim_time * 13) * 2)
            jy = int(math.cos(self.anim_time * 5) * 3)
            self.canvas.blit(title, title.get_rect(center=(LOGICAL_W // 2 + jx, 100 + jy)))
            sub = ui.font(26).render(self.t("app_subtitle"), True, (150, 158, 172))
            self.canvas.blit(sub, sub.get_rect(center=(LOGICAL_W // 2, 165)))
        elif self.state == "mode_select":
            self._draw_title(self.t("mode_select_title"), 50, 90)
        elif self.state == "settings":
            self._draw_title(self.t("settings_title"), 50, 70)
        elif self.state == "crosshair":
            self._draw_title(self.t("crosshair_title"), 50, 70)
        elif self.state == "hit_sounds":
            self._draw_title(self.t("hit_sounds_title"), 50, 70)
        elif self.state == "miss_sounds":
            self._draw_title(self.t("miss_sounds_title"), 50, 70)
        if self.state in ("hit_sounds", "miss_sounds"):
            hint = ui.font(22).render(self.t("sound_hint"), True, (150, 158, 172))
            self.canvas.blit(hint, hint.get_rect(center=(LOGICAL_W // 2, 112)))
            for label, rect in self.sound_rows:
                pygame.draw.rect(self.canvas, PANEL, rect, border_radius=10)
                pygame.draw.rect(self.canvas, (88, 96, 116), rect, width=1, border_radius=10)
                txt = ui.font(24).render(label, True, (235, 238, 245))
                self.canvas.blit(txt, (rect.x + 24, rect.centery - txt.get_height() // 2))
        for s in self.sliders:
            s.draw(self.canvas)
        for b in self.buttons:
            b.draw(self.canvas)
        if self.state == "crosshair":
            ui.draw_crosshair(self.canvas, self.mouse_pos, self.data.crosshair)
        if self.state not in ("hit_sounds", "miss_sounds"):
            tip = ui.font(20).render(self.t("tip"), True, (120, 128, 145))
            self.canvas.blit(tip, tip.get_rect(center=(LOGICAL_W // 2, LOGICAL_H - 30)))

    def _draw_playing(self):
        s = self.session
        bar = pygame.Rect(0, 0, LOGICAL_W, 60)
        pygame.draw.rect(self.canvas, PANEL, bar)
        pygame.draw.line(self.canvas, (60, 66, 82), (0, 60), (LOGICAL_W, 60), 1)

        cx = LOGICAL_W // 2
        mode_txt = ui.font(22).render(self.t("mode_" + s.mode_id), True, (170, 178, 192))
        time_txt = ui.font(32).render(self.t("hud_time", n=int(s.time_left)), True, (255, 255, 255))
        score_txt = ui.font(32).render(self.t("hud_score", n=s.score), True, (0, 210, 255))
        stat_txt = ui.font(20).render(self.t("hud_stat", a=s.accuracy(), c=s.combo), True, (170, 178, 192))

        self.canvas.blit(mode_txt, (20, 8))
        self.canvas.blit(time_txt, time_txt.get_rect(center=(cx, 30)))
        self.canvas.blit(score_txt, score_txt.get_rect(topright=(LOGICAL_W - 20, 14)))
        self.canvas.blit(stat_txt, (20, 36))

        for t in s.targets:
            t.draw(self.canvas)
        for e in self.effects:
            e.draw(self.canvas)

        ch = dict(self.data.crosshair)
        if self.crosshair_flash > 0:
            if self.crosshair_flash_type == "hit":
                ch["color"] = [255, 255, 255]
            elif self.crosshair_flash_type == "miss":
                ch["color"] = [255, 80, 80]
        ui.draw_crosshair(self.canvas, self.crosshair_pos, ch)

    def _draw_results(self):
        r = self.last_result
        self._draw_title(self.t("result_done") if not r.get("aborted") else self.t("result_aborted"), 54, 90)
        cx = LOGICAL_W // 2
        best = self.data.get_best(r["mode"])
        lines = [
            (self.t("result_mode"), self.t("mode_" + r["mode"])),
            (self.t("result_score"), str(r["score"])),
            (self.t("result_accuracy"), f"{r['accuracy']:.1f}%"),
            (self.t("result_combo"), str(r["max_combo"])),
            (self.t("result_best"), str(best)),
        ]
        if r["mode"] == MODE_FLICK:
            lines.append((self.t("result_missed"), str(r["despawned"])))
        sep = "：" if self.lang == "zh" else ": "
        y = 190
        for label, value in lines:
            txt = ui.font(32).render(f"{label}{sep}{value}", True, (235, 238, 245))
            self.canvas.blit(txt, txt.get_rect(center=(cx, y)))
            y += 46
        if r.get("new_best"):
            nb = ui.font(34).render(self.t("result_new_record"), True, (255, 210, 60))
            self.canvas.blit(nb, nb.get_rect(center=(cx, y + 6)))
            y += 46
        for b in self.buttons:
            b.draw(self.canvas)


def main():
    App().run()


if __name__ == "__main__":
    main()
