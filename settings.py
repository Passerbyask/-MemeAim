"""配置与成绩的读取/保存。

所有可调参数、准星样式、各模式最佳成绩都持久化到 save_data.json。
"""
import json
import os
import sys


def _writable_dir():
    """可写目录：打包成 exe 后指向 exe 所在目录，未打包时即脚本目录。"""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


SAVE_PATH = os.path.join(_writable_dir(), "save_data.json")

DEFAULT_SETTINGS = {
    "session_duration": 60,   # 每局时长（秒）
    "ball_radius": 15,        # 小球半径（像素，基准 1280x720）
    "max_targets": 3,         # 同时存在的小球数量（速点/追踪）
    "target_speed": 240,      # 追踪模式小球移动速度（像素/秒，基准）
    "target_lifetime": 1.0,   # 闪现模式小球停留时长（秒）
    "resolution": "1280x720", # 窗口分辨率档位
    "fullscreen": False,      # 是否全屏
    "sensitivity": 1.0,       # 鼠标灵敏度倍率（eDPI 手感）
    "lang": "zh",             # 界面语言：zh / en
}

DEFAULT_CROSSHAIR = {
    "style": "cross",          # cross / dot / circle
    "color": [0, 255, 120],    # RGB
    "size": 14,                # 十字线长 / 圆点直径 / 圆圈半径
    "thickness": 2,            # 线条粗细
    "gap": 5,                  # 十字中心缺口
}

DEFAULT_DATA = {
    "settings": dict(DEFAULT_SETTINGS),
    "crosshair": dict(DEFAULT_CROSSHAIR),
    "best": {},                # {mode_id: best_score}
    "hit_enabled": {},         # {文件名: True/False} 每个命中音效的启停状态
    "miss_enabled": {},        # {文件名: True/False} 每个未命中音效的启停状态
}


class AppData:
    def __init__(self):
        self.data = self._load()

    def _load(self):
        data = json.loads(json.dumps(DEFAULT_DATA))  # 深拷贝默认值
        if os.path.exists(SAVE_PATH):
            try:
                with open(SAVE_PATH, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                for section in ("settings", "crosshair", "best", "hit_enabled", "miss_enabled"):
                    if section in loaded and isinstance(loaded[section], dict):
                        data[section].update(loaded[section])
            except (OSError, ValueError):
                pass
        return data

    def save(self):
        try:
            with open(SAVE_PATH, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
        except OSError:
            pass

    @property
    def settings(self):
        return self.data["settings"]

    @property
    def crosshair(self):
        return self.data["crosshair"]

    @property
    def best(self):
        return self.data["best"]

    def get_best(self, mode_id):
        return self.best.get(mode_id, 0)

    def update_best(self, mode_id, score):
        if score > self.get_best(mode_id):
            self.best[mode_id] = score
            self.save()
            return True
        return False

    def is_hit_enabled(self, name):
        return self.data["hit_enabled"].get(name, True)

    def set_hit_enabled(self, name, enabled):
        self.data["hit_enabled"][name] = bool(enabled)
        self.save()

    def is_miss_enabled(self, name):
        return self.data["miss_enabled"].get(name, True)

    def set_miss_enabled(self, name, enabled):
        self.data["miss_enabled"][name] = bool(enabled)
        self.save()
