"""音效与背景音乐的加载、播放，以及命中/未命中音效的启停管理。

命中音效放在 sounds/hit/ 目录下（支持 mp3 / wav / ogg），命中时随机播放
其中一个「已启用」的音效；未命中音效放在 sounds/miss/ 目录下，逻辑相同。
结算音效（l.mp3 / w.mp3）放在 sounds/ 目录下，一局结束时按得分自动播放。
所有文件缺失时静默降级，不影响游戏运行。

文件约定：
  sounds/hit/*.mp3(或 wav/ogg)   命中音效（可多个，逐个可试听/启停）
  sounds/miss/*.mp3(或 wav/ogg)  未命中音效（可多个，逐个可试听/启停）
  sounds/l.mp3                   结算音效：得分低于 60
  sounds/w.mp3                   结算音效：得分 60 及以上
  sounds/bgm.ogg                 背景音乐（可选，无限循环）

打包成 exe 后，内置资源从 PyInstaller 临时目录读取；同时也会扫描 exe
同目录下的 sounds/ 文件夹，方便之后自行补充音效而无需重新打包。
"""
import os
import random
import sys

import pygame

SUPPORTED_EXTS = (".mp3", ".wav", ".ogg")

_hit_sounds = []
_miss_sounds = []
_result_l = None
_result_w = None
_ready = False


def _resource_dir():
    """只读资源目录：打包后指向 PyInstaller 的临时解压目录。"""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))


def _external_dir():
    """可写目录：打包后指向 exe 所在目录，未打包时即脚本目录。"""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def _group_dirs(subfolder):
    dirs = []
    for d in (os.path.join(_resource_dir(), "sounds", subfolder),
              os.path.join(_external_dir(), "sounds", subfolder)):
        if os.path.isdir(d) and d not in dirs:
            dirs.append(d)
    return dirs


def _find_effect(filename):
    """优先 exe 同目录（用户可自行覆盖），其次内置目录。"""
    for p in (os.path.join(_external_dir(), "sounds", filename),
              os.path.join(_resource_dir(), "sounds", filename)):
        if os.path.exists(p):
            return p
    return None


def _load_sound(path, volume=0.8):
    if not path or not os.path.exists(path):
        return None
    try:
        sound = pygame.mixer.Sound(path)
        sound.set_volume(volume)
        return sound
    except pygame.error:
        return None


def _load_group(subfolder):
    sounds = []
    seen = set()
    for d in _group_dirs(subfolder):
        if not os.path.isdir(d):
            continue
        for fname in sorted(os.listdir(d)):
            if os.path.splitext(fname)[1].lower() not in SUPPORTED_EXTS:
                continue
            if fname in seen:
                continue
            sound = _load_sound(os.path.join(d, fname))
            if sound is not None:
                seen.add(fname)
                sounds.append({
                    "name": fname,
                    "label": os.path.splitext(fname)[0],
                    "sound": sound,
                    "enabled": True,
                })
    return sounds


def init():
    global _hit_sounds, _miss_sounds, _result_l, _result_w, _ready
    try:
        pygame.mixer.init()
        _ready = True
    except pygame.error:
        _ready = False
        _hit_sounds = []
        _miss_sounds = []
        _result_l = None
        _result_w = None
        return
    load_hit_sounds()
    load_miss_sounds()
    l_path = _find_effect("l.mp3")
    w_path = _find_effect("w.mp3")
    _result_l = _load_sound(l_path) if l_path else None
    _result_w = _load_sound(w_path) if w_path else None


def load_hit_sounds():
    global _hit_sounds
    _hit_sounds = _load_group("hit")


def load_miss_sounds():
    global _miss_sounds
    _miss_sounds = _load_group("miss")


def get_hit_sounds():
    return _hit_sounds


def get_miss_sounds():
    return _miss_sounds


def _set_enabled(group, name, enabled):
    for entry in group:
        if entry["name"] == name:
            entry["enabled"] = bool(enabled)
            return


def _is_enabled(group, name):
    for entry in group:
        if entry["name"] == name:
            return entry["enabled"]
    return True


def set_hit_enabled(name, enabled):
    _set_enabled(_hit_sounds, name, enabled)


def is_hit_enabled(name):
    return _is_enabled(_hit_sounds, name)


def set_miss_enabled(name, enabled):
    _set_enabled(_miss_sounds, name, enabled)


def is_miss_enabled(name):
    return _is_enabled(_miss_sounds, name)


def _play_random(group):
    enabled = [e for e in group if e["enabled"]]
    if enabled:
        random.choice(enabled)["sound"].play()


def _preview(group, name):
    for entry in group:
        if entry["name"] == name:
            entry["sound"].play()
            return


def play_hit():
    _play_random(_hit_sounds)


def preview_hit(name):
    _preview(_hit_sounds, name)


def play_miss():
    _play_random(_miss_sounds)


def preview_miss(name):
    _preview(_miss_sounds, name)


def play_result(score):
    """按得分播放结算音效：低于 60 播放 l，60 及以上播放 w。"""
    if score >= 60:
        if _result_w is not None:
            _result_w.play()
    else:
        if _result_l is not None:
            _result_l.play()


def start_bgm():
    if not _ready:
        return
    bgm_path = _find_effect("bgm.ogg")
    if not bgm_path:
        return
    try:
        pygame.mixer.music.load(bgm_path)
        pygame.mixer.music.set_volume(0.35)
        pygame.mixer.music.play(-1)
    except pygame.error:
        pass


def stop_bgm():
    try:
        pygame.mixer.music.stop()
    except pygame.error:
        pass
