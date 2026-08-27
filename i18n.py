"""界面文案的中英双语支持。"""
import re

TEXTS = {
    # 标题
    "app_title": {"zh": "特别热闹的练枪软件", "en": "MemeAim"},
    "app_subtitle": {"zh": "2D 平面打靶 · 提升准度与手速", "en": "2D aim training · Improve accuracy & speed"},

    # 主菜单
    "menu_start": {"zh": "开始训练", "en": "Start Training"},
    "menu_settings": {"zh": "参数设置", "en": "Settings"},
    "menu_crosshair": {"zh": "准星设置", "en": "Crosshair"},
    "menu_hit_sounds": {"zh": "命中音效", "en": "Hit Sounds"},
    "menu_miss_sounds": {"zh": "未命中音效", "en": "Miss Sounds"},
    "menu_exit": {"zh": "退出", "en": "Exit"},

    # 模式
    "mode_gridshot": {"zh": "定点速点", "en": "Gridshot"},
    "mode_tracking": {"zh": "追踪移动靶", "en": "Tracking"},
    "mode_flick": {"zh": "闪现甩枪", "en": "Flick"},
    "mode_select_title": {"zh": "选择训练模式", "en": "Select Mode"},

    # 通用
    "back": {"zh": "返回", "en": "Back"},
    "save_back": {"zh": "保存并返回", "en": "Save & Back"},

    # 设置
    "settings_title": {"zh": "参数设置", "en": "Settings"},
    "set_duration": {"zh": "每局时长（秒）", "en": "Duration (s)"},
    "set_radius": {"zh": "小球半径（像素）", "en": "Ball Radius (px)"},
    "set_max_targets": {"zh": "同时小球数量", "en": "Targets at Once"},
    "set_speed": {"zh": "移动速度（像素/秒）", "en": "Move Speed (px/s)"},
    "set_lifetime": {"zh": "闪现停留时长（秒）", "en": "Flick Lifetime (s)"},
    "set_sensitivity": {"zh": "鼠标灵敏度（倍率）", "en": "Mouse Sensitivity"},
    "set_resolution": {"zh": "分辨率：", "en": "Resolution: "},
    "set_fullscreen": {"zh": "全屏：", "en": "Fullscreen: "},
    "set_lang": {"zh": "语言：", "en": "Language: "},
    "on": {"zh": "开", "en": "On"},
    "off": {"zh": "关", "en": "Off"},

    # 准星
    "crosshair_title": {"zh": "准星设置", "en": "Crosshair"},
    "ch_size": {"zh": "大小", "en": "Size"},
    "ch_thickness": {"zh": "粗细", "en": "Thickness"},
    "ch_gap": {"zh": "缺口", "en": "Gap"},
    "ch_style": {"zh": "样式：", "en": "Style: "},
    "ch_color": {"zh": "颜色：", "en": "Color: "},
    "style_cross": {"zh": "十字", "en": "Cross"},
    "style_dot": {"zh": "圆点", "en": "Dot"},
    "style_circle": {"zh": "圆圈", "en": "Circle"},
    "color_green": {"zh": "绿色", "en": "Green"},
    "color_red": {"zh": "红色", "en": "Red"},
    "color_blue": {"zh": "蓝色", "en": "Blue"},
    "color_white": {"zh": "白色", "en": "White"},
    "color_yellow": {"zh": "黄色", "en": "Yellow"},
    "color_purple": {"zh": "紫色", "en": "Purple"},

    # 音效管理
    "hit_sounds_title": {"zh": "命中音效管理", "en": "Hit Sound Manager"},
    "miss_sounds_title": {"zh": "未命中音效管理", "en": "Miss Sound Manager"},
    "preview": {"zh": "试听", "en": "Preview"},
    "enabled": {"zh": "已启用", "en": "Enabled"},
    "disabled": {"zh": "已禁用", "en": "Disabled"},
    "sound_hint": {"zh": "滚轮滚动 · 点击试听 / 启停 · ESC 返回",
                   "en": "Scroll · Click to preview/toggle · ESC to go back"},

    # HUD
    "hud_time": {"zh": "剩余 {n} 秒", "en": "{n} s left"},
    "hud_score": {"zh": "得分 {n}", "en": "Score {n}"},
    "hud_stat": {"zh": "命中率 {a:.0f}% · 连击 {c}", "en": "Accuracy {a:.0f}% | Combo {c}"},
    "combo": {"zh": "连击 x{n}!", "en": "Combo x{n}!"},

    # 结算
    "result_done": {"zh": "训练结束", "en": "Training Complete"},
    "result_aborted": {"zh": "已中断", "en": "Aborted"},
    "result_mode": {"zh": "模式", "en": "Mode"},
    "result_score": {"zh": "总分", "en": "Score"},
    "result_accuracy": {"zh": "命中率", "en": "Accuracy"},
    "result_combo": {"zh": "最大连击", "en": "Best Combo"},
    "result_best": {"zh": "最佳成绩", "en": "Best Score"},
    "result_missed": {"zh": "漏球", "en": "Missed"},
    "result_new_record": {"zh": "★ 新纪录！", "en": "★ New Record!"},
    "play_again": {"zh": "再来一局", "en": "Play Again"},
    "main_menu": {"zh": "返回菜单", "en": "Main Menu"},

    # 提示
    "tip": {"zh": "F11 全屏 · ESC 返回/退出", "en": "F11 Fullscreen · ESC Back/Exit"},

    # 语言名
    "lang_zh": {"zh": "中文", "en": "Chinese"},
    "lang_en": {"zh": "English", "en": "English"},
}


def get_text(lang, key, **fmt):
    entry = TEXTS.get(key)
    if not entry:
        return key
    text = entry.get(lang) or entry.get("zh") or key
    if fmt:
        text = text.format(**fmt)
    return text
