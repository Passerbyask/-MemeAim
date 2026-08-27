"""小球目标、三种模式的生成逻辑与单局会话。"""
import math
import random

import pygame

MODE_GRIDSHOT = "gridshot"
MODE_TRACKING = "tracking"
MODE_FLICK = "flick"

MODE_ORDER = [MODE_GRIDSHOT, MODE_TRACKING, MODE_FLICK]

MODE_NAMES = {
    MODE_GRIDSHOT: "定点速点",
    MODE_TRACKING: "追踪移动靶",
    MODE_FLICK: "闪现甩枪",
}

TARGET_COLOR = (0, 210, 255)


class Target:
    def __init__(self, x, y, radius, speed=0.0, lifetime=None, color=TARGET_COLOR):
        self.x = float(x)
        self.y = float(y)
        self.radius = radius
        self.color = color
        self.lifetime = lifetime  # None 表示不会自动消失
        self.born = pygame.time.get_ticks()
        self.vx = 0.0
        self.vy = 0.0
        if speed > 0:
            angle = random.uniform(0, math.tau)
            self.vx = math.cos(angle) * speed
            self.vy = math.sin(angle) * speed

    def age(self):
        return (pygame.time.get_ticks() - self.born) / 1000.0

    def update(self, dt, bounds):
        self.x += self.vx * dt
        self.y += self.vy * dt
        r = self.radius
        if self.x - r < bounds.left:
            self.x = bounds.left + r
            self.vx = abs(self.vx)
        elif self.x + r > bounds.right:
            self.x = bounds.right - r
            self.vx = -abs(self.vx)
        if self.y - r < bounds.top:
            self.y = bounds.top + r
            self.vy = abs(self.vy)
        elif self.y + r > bounds.bottom:
            self.y = bounds.bottom - r
            self.vy = -abs(self.vy)

    def contains(self, px, py):
        dx = px - self.x
        dy = py - self.y
        return dx * dx + dy * dy <= self.radius * self.radius

    def draw(self, surface):
        pos = (int(self.x), int(self.y))
        r = int(self.radius)
        pygame.draw.circle(surface, self.color, pos, r)
        pygame.draw.circle(surface, (255, 255, 255), pos, r, 2)


def _random_position(bounds, radius):
    margin = radius + 8
    left = bounds.left + margin
    right = bounds.right - margin
    top = bounds.top + margin
    bottom = bounds.bottom - margin
    if right < left:
        left = right = bounds.centerx
    if bottom < top:
        top = bottom = bounds.centery
    return random.uniform(left, right), random.uniform(top, bottom)


def gridshot_target(bounds, settings):
    x, y = _random_position(bounds, settings["ball_radius"])
    return Target(x, y, settings["ball_radius"])


def tracking_target(bounds, settings):
    x, y = _random_position(bounds, settings["ball_radius"])
    return Target(x, y, settings["ball_radius"], speed=settings["target_speed"])


def flick_target(bounds, settings):
    x, y = _random_position(bounds, settings["ball_radius"])
    return Target(x, y, settings["ball_radius"], lifetime=settings["target_lifetime"])


class Session:
    """单局训练的状态：小球列表、得分、命中率、连击、计时。"""

    def __init__(self, mode_id, settings, scale=1.0):
        self.mode_id = mode_id
        self.settings = dict(settings)
        self.settings["ball_radius"] = settings["ball_radius"] * scale
        self.settings["target_speed"] = settings["target_speed"] * scale
        self.targets = []
        self.score = 0
        self.hits = 0
        self.shots = 0
        self.combo = 0
        self.max_combo = 0
        self.despawned = 0
        self.elapsed = 0.0
        self.time_left = settings["session_duration"]

    def start(self, bounds):
        self.targets = []
        count = 1 if self.mode_id == MODE_FLICK else self.settings["max_targets"]
        for _ in range(count):
            self._spawn_one(bounds)

    def _spawn_one(self, bounds):
        if self.mode_id == MODE_GRIDSHOT:
            self.targets.append(gridshot_target(bounds, self.settings))
        elif self.mode_id == MODE_TRACKING:
            self.targets.append(tracking_target(bounds, self.settings))
        else:
            self.targets.append(flick_target(bounds, self.settings))

    def update(self, dt, bounds):
        self.elapsed += dt
        self.time_left = max(0.0, self.settings["session_duration"] - self.elapsed)

        for target in self.targets:
            target.update(dt, bounds)

        expired = [t for t in self.targets if t.lifetime is not None and t.age() >= t.lifetime]
        for t in expired:
            self.targets.remove(t)
            self.despawned += 1
            self.combo = 0
            if self.mode_id == MODE_FLICK:
                self._spawn_one(bounds)

    def shoot(self, pos, bounds):
        self.shots += 1
        for target in self.targets:
            if target.contains(pos[0], pos[1]):
                self.targets.remove(target)
                self.hits += 1
                self.score += 1
                self.combo += 1
                self.max_combo = max(self.max_combo, self.combo)
                self._spawn_one(bounds)
                return True
        self.combo = 0
        self.score = max(0, self.score - 1)
        return False

    def accuracy(self):
        return (self.hits / self.shots * 100.0) if self.shots else 0.0
