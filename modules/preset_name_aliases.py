"""Search names for renamed built-in presets; execution uses the original IDs."""

from modules.localization import localized_text


H3_LEGACY_NAMES = {
    "MiniMax-H3(T2V)": "MiniMax-H3文生",
    "MiniMax-H3(I2V)": "MiniMax-H3图生",
    "MiniMax-H3(R2V)": "MiniMax-H3多参",
    "MiniMax-H3(R2C)": "MiniMax-H3续写",
    "MiniMax-H3(R2I)": "MiniMax-H3图编",
}
_H3_IDS = {name.casefold(): name for name in H3_LEGACY_NAMES}


def h3_search_names(preset_id):
    name = _H3_IDS.get(str(preset_id or "").strip().casefold())
    if not name:
        return ()
    translated = localized_text({"__lang": "cn"}, name)
    return tuple(dict.fromkeys((name, translated, H3_LEGACY_NAMES[name])))


def h3_preset_id_for_name(value):
    wanted = str(value or "").strip().casefold()
    if not wanted:
        return ""
    for preset_id in H3_LEGACY_NAMES:
        if wanted in {name.casefold() for name in h3_search_names(preset_id)}:
            return preset_id
    return ""
