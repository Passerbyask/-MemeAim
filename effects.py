"""视觉特效：命中粒子与浮动文字。"""
import math
import random

import pygame

import ui


class Particle:
    def __init__(self, x, y, color, speed_range=(80, 260), radius=5, life=0.35):
        self.x = float(x)
        self.y = float(y)
        angle = random.uniform(0, math.tau)
        speed = random.uniform(*speed_range)
        self.vx = math.cos(angle) * speed
        self.vy = math.sin(angle) * speed
        self.color = color
        self.radius = radius
        self.life = life
        self.age = 0.0

    def update(self, dt):
        self.age += dt
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.vx *= 0.88
        self.vy *= 0.88

    @property
    def alive(self):
        return self.age < self.life

    def draw(self, surface):
        t = 1.0 - self.age / self.life
        r = max(1, int(self.radius * t))
        c = (int(self.color[0] * t), int(self.color[1] * t), int(self.color[2] * t))
        pygame.draw.circle(surface, c, (int(self.x), int(self.y)), r)


class FloatingText:
    def __init__(self, x, y, text, color, size=30, life=0.6, rise=70):
        self.x = float(x)
        self.y = float(y)
        self.text = text
        self.color = color
        self.size = size
        self.life = life
        self.rise = rise
        self.age = 0.0

    def update(self, dt):
        self.age += dt
        self.y -= self.rise * dt

    @property
    def alive(self):
        return self.age < self.life

    def draw(self, surface):
        t = 1.0 - self.age / self.life
        surf = ui.font(self.size).render(self.text, True, self.color)
        surf.set_alpha(int(255 * t))
        surface.blit(surf, surf.get_rect(center=(int(self.x), int(self.y))))
