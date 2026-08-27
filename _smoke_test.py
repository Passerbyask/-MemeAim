import os
os.environ["SDL_VIDEODRIVER"] = "dummy"
os.environ["SDL_AUDIODRIVER"] = "dummy"

import pygame
pygame.init()

import ui
from settings import AppData
from targets import MODE_ORDER, Session
from main import App

print("CJK font match:", pygame.font.match_font("microsoftyahei"))
surf = ui.font(30).render("练枪软件", True, (255, 255, 255))
print("render width:", surf.get_width())

settings = AppData().settings
bounds = pygame.Rect(0, 60, 1280, 660)
for mode in MODE_ORDER:
    s = Session(mode, settings)
    s.start(bounds)
    for _ in range(30):
        s.update(0.016, bounds)
    for _ in range(5):
        if s.targets:
            t = s.targets[0]
            s.shoot((t.x, t.y), bounds)
        s.update(0.016, bounds)
    print(mode, "score=", s.score, "shots=", s.shots,
          "targets=", len(s.targets), "time_left=", round(s.time_left, 2))

app = App()
print("App state:", app.state, "buttons:", len(app.buttons))
app.start_session(MODE_ORDER[0])
app.update(0.016)
app.draw()
print("playing targets:", len(app.session.targets))
app.end_session()
print("results:", app.last_result)
app.draw()
pygame.quit()
print("APP OK")
