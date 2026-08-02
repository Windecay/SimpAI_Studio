import csv
import json
import os
import random
import re

import modules.canvas_danbooru_service as canvas_danbooru_service


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECOMMENDATIONS_DIR = os.path.join(ROOT_DIR, "presets", "scene_prompt_recommendations")
RANDOM_PROMPT_ASSOCIATIONS_FILE = os.path.join(RECOMMENDATIONS_DIR, "random_prompt_associations.csv")
RANDOM_PROMPT_NOISE_FILE = os.path.join(RECOMMENDATIONS_DIR, "random_prompt_noise.csv")
RANDOM_PROMPT_CHARACTERS_FILE = os.path.join(RECOMMENDATIONS_DIR, "random_prompt_characters.csv")
RANDOM_PROMPT_KNOWN_CHARACTERS_ZH_FILE = os.path.join(
    RECOMMENDATIONS_DIR,
    "random_prompt_known_characters_zh.json",
)
RANDOM_PROMPT_SFW_ZH_FILE = os.path.join(RECOMMENDATIONS_DIR, "random_prompt_sfw_zh.json")
RANDOM_PROMPT_NSFW_ZH_FILE = os.path.join(RECOMMENDATIONS_DIR, "random_prompt_nsfw_zh.json")
RANDOM_PROMPT_ADULT_SLOTS_FILE = os.path.join(ROOT_DIR, "docs", "adult_trigger_slots.csv")
RANDOM_PROMPT_ADULT_NEGATIVE_FILE = os.path.join(ROOT_DIR, "docs", "adult_negative_conflicts.csv")
RANDOM_PROMPT_NSFW_ENV = "SIMPAI_DEV_RANDOM_PROMPT_NSFW"
RANDOM_PROMPT_RECENT_HISTORY_LIMIT = 10
RANDOM_PROMPT_RECENT_TAG_LIMIT = 80
RANDOM_PROMPT_RECENT_CANDIDATE_COUNT = 5

RANDOM_PROMPT_RECENT_AXIS_SCORES = {
    "wardrobe_exposure": 5.0,
    "activity": 4.0,
    "event": 3.0,
    "setting": 2.5,
    "expression": 1.0,
    "subject": 0.75,
}

RANDOM_PROMPT_RECENT_TAG_IGNORE = {
    "nsfw", "1girl", "1boy", "2girls", "2boys", "solo", "couple", "multiple_girls", "multiple_boys",
}

RANDOM_PROMPT_RECENT_RECENCY = (1.0, 0.78, 0.60, 0.46, 0.34, 0.25, 0.18, 0.13, 0.09, 0.06)

_random_prompt_association_cache = None
_random_prompt_noise_cache = None
_random_prompt_character_cache = None
_random_prompt_known_characters_zh_cache = None
_random_prompt_sfw_zh_cache = None
_random_prompt_nsfw_zh_cache = None
_random_prompt_adult_slot_cache = None
_random_prompt_adult_negative_cache = None
RANDOM_CHARACTER_SAMPLE_POOL = 600

RANDOM_SUBJECT_MODE_IDS = {
    "person": {"solo_girl", "solo_boy", "duo"},
    "animal": {"animal_focus"},
    "scenery": {"scenery"},
}

PROMPT_TARGETS = {
    "positive_prompt": "positive_prompt",
    "prompt": "positive_prompt",
    "main": "positive_prompt",
    "scene_additional_prompt": "scene_additional_prompt",
    "additional_prompt": "scene_additional_prompt",
    "scene_additional_prompt_2": "scene_additional_prompt_2",
    "additional_prompt_2": "scene_additional_prompt_2",
}

PROMPT_MODES = {"replace", "append"}

SHARED_RECOMMENDATION_FILES = {
    "text_to_video": "_text_to_video.csv",
    "image_to_video": "_image_to_video.csv",
    "image_edit": "_image_edit.csv",
}

IMAGE_EDIT_SHARED_PRESETS = {
    "Bernini-ImageEdit",
    "Flux2-KleinEdit",
    "QwenEdit+",
    "NunQwenEdit+_fp4",
    "NunQwenEdit+_int4",
    "QwenNSFW",
}

RANDOM_QUALITY_TAGS = [
    "masterpiece",
    "best_quality",
    "highres",
]

RANDOM_ART_DIRECTION_PROFILES = [
    {
        "id": "cinematic_film_frame",
        "style": ["cinematic_still", "film_grain"],
        "color": [["controlled_color_grading", "warm_cool_contrast"], ["low_key_palette", "saturated_accents"]],
    },
    {
        "id": "editorial_color_story",
        "style": ["editorial_photography", "refined_styling"],
        "color": [["bold_color_blocking", "clean_tonal_separation"], ["limited_palette", "accent_color"]],
    },
    {
        "id": "documentary_observation",
        "style": ["documentary_photography", "candid_moment"],
        "color": [["natural_colors", "subtle_film_tones"], ["muted_palette", "soft_highlights"]],
    },
    {
        "id": "watercolor_atmosphere",
        "style": ["watercolor_painting", "textured_paper"],
        "color": [["translucent_color_washes", "soft_color_bleed"], ["granulating_pigment", "restrained_palette"]],
    },
    {
        "id": "oil_painted_drama",
        "style": ["oil_painting", "visible_brushstrokes"],
        "color": [["chiaroscuro", "rich_shadow_colors"], ["impasto_highlights", "deep_color_palette"]],
    },
    {
        "id": "graphic_gouache",
        "style": ["gouache_painting", "matte_paint_texture"],
        "color": [["flat_color_shapes", "limited_palette"], ["opaque_colors", "bold_value_structure"]],
    },
    {
        "id": "ink_wash_poetry",
        "style": ["ink_wash_painting", "expressive_brushwork"],
        "color": [["monochrome_ink", "subtle_color_accents"], ["tonal_washes", "paper_white_negative_space"]],
    },
    {
        "id": "woodblock_graphic",
        "style": ["woodblock_print", "carved_line_texture"],
        "color": [["flat_colors", "strong_contours"], ["restricted_palette", "decorative_pattern"]],
    },
    {
        "id": "graphic_novel_panel",
        "style": ["graphic_novel", "heavy_ink_lines"],
        "color": [["high_contrast", "selective_color"], ["limited_palette", "halftone_texture"]],
    },
    {
        "id": "art_nouveau_ornament",
        "style": ["art_nouveau", "ornamental_linework"],
        "color": [["jewel_tone_palette", "decorative_flats"], ["pastel_palette", "gold_accents"]],
    },
    {
        "id": "surreal_dream_image",
        "style": ["surrealism", "symbolic_imagery"],
        "color": [["uncanny_color_harmony", "luminous_accents"], ["dreamlike_palette", "unexpected_color_contrast"]],
    },
    {
        "id": "retro_futurist_poster",
        "style": ["retro_futurism", "screen_print_texture"],
        "color": [["bold_geometric_colors", "limited_palette"], ["vintage_print_colors", "bright_accents"]],
    },
    {
        "id": "atmospheric_concept_art",
        "style": ["concept_art", "painterly_rendering"],
        "color": [["atmospheric_color_depth", "controlled_saturation"], ["cinematic_palette", "luminous_haze"]],
    },
    {
        "id": "cel_animation_keyframe",
        "style": ["anime_illustration", "clean_cel_shading"],
        "color": [["dynamic_color_script", "crisp_color_separation"], ["vibrant_palette", "colored_shadows"]],
    },
    {
        "id": "layered_paper_art",
        "style": ["paper_cut_art", "layered_paper_texture"],
        "color": [["layered_color_shapes", "cast_paper_shadows"], ["handmade_palette", "tactile_color_layers"]],
    },
    {
        "id": "monochrome_fine_art",
        "style": ["fine_art_photography", "monochrome"],
        "color": [["rich_tonal_range", "silver_gelatin_texture"], ["deep_blacks", "luminous_highlights"]],
    },
]

RANDOM_SUBJECT_PROFILES = [
    {
        "id": "solo_girl",
        "tags": ["1girl", "solo"],
        "appearance": [
            ["long_hair", "hair_ornament", "blue_eyes"],
            ["short_hair", "bob_cut", "brown_eyes"],
            ["ponytail", "black_hair", "ribbon"],
            ["silver_hair", "green_eyes", "hair_between_eyes"],
        ],
        "outfit": [
            ["school_uniform", "pleated_skirt", "loafers"],
            ["dress", "frills", "detached_sleeves"],
            ["hoodie", "shorts", "sneakers"],
            ["coat", "scarf", "boots"],
        ],
        "action": [
            ["walking", "looking_at_viewer", "gentle_smile"],
            ["sitting", "holding_book", "soft_smile"],
            ["turning_around", "looking_back", "wind"],
            ["standing", "hand_on_chest", "serious"],
        ],
        "lookup_terms": ["school uniform", "long hair", "gentle smile", "walking"],
    },
    {
        "id": "solo_boy",
        "tags": ["1boy", "solo"],
        "appearance": [
            ["short_hair", "messy_hair", "brown_eyes"],
            ["black_hair", "blue_eyes", "hair_between_eyes"],
            ["white_hair", "red_eyes", "serious"],
            ["medium_hair", "green_eyes", "earrings"],
        ],
        "outfit": [
            ["jacket", "shirt", "pants"],
            ["hoodie", "cargo_pants", "sneakers"],
            ["suit", "necktie", "gloves"],
            ["coat", "scarf", "boots"],
        ],
        "action": [
            ["standing", "hands_in_pockets", "looking_at_viewer"],
            ["walking", "looking_away", "wind"],
            ["sitting", "holding_cup", "relaxed"],
            ["running", "dynamic_pose", "determined"],
        ],
        "lookup_terms": ["jacket", "hands in pockets", "dynamic pose", "walking"],
    },
    {
        "id": "duo",
        "tags": ["2girls"],
        "appearance": [
            ["long_hair", "short_hair", "contrasting_hair"],
            ["twin_tails", "bob_cut", "hair_ribbon"],
            ["black_hair", "blonde_hair", "smile"],
            ["white_hair", "brown_hair", "looking_at_each_other"],
        ],
        "outfit": [
            ["school_uniform", "matching_outfit", "pleated_skirt"],
            ["dress", "capelet", "boots"],
            ["jacket", "shorts", "sneakers"],
            ["kimono", "wide_sleeves", "hair_ornament"],
        ],
        "action": [
            ["walking_together", "holding_hands", "smile"],
            ["sitting", "sharing_food", "laughing"],
            ["standing", "looking_at_viewer", "peace_sign"],
            ["running", "dynamic_pose", "motion_blur"],
        ],
        "lookup_terms": ["2girls", "holding hands", "matching outfit", "laughing"],
    },
    {
        "id": "animal_focus",
        "tags": ["animal_focus"],
        "appearance": [
            ["cat", "fluffy", "green_eyes"],
            ["dog", "collar", "wagging_tail"],
            ["fox", "fluffy_tail", "orange_fur"],
            ["rabbit", "long_ears", "soft_fur"],
        ],
        "outfit": [
            ["ribbon", "tiny_hat"],
            ["collar", "bell"],
            ["scarf", "small_bag"],
            ["flower_crown"],
        ],
        "action": [
            ["sitting", "looking_at_viewer"],
            ["sleeping", "curled_up"],
            ["jumping", "motion_blur"],
            ["playing", "pawing_at_object"],
        ],
        "lookup_terms": ["cat", "animal focus", "ribbon", "sitting"],
    },
    {
        "id": "scenery",
        "tags": ["scenery", "no_humans"],
        "appearance": [
            ["wide_shot", "clouds", "distant_mountains"],
            ["river", "stone_path", "trees"],
            ["cityscape", "street_lights", "reflection"],
            ["room", "window", "sunbeam"],
        ],
        "outfit": [[]],
        "action": [
            ["still_water", "floating_leaves"],
            ["wind", "falling_leaves"],
            ["rain", "wet_ground"],
            ["sunlight", "dust_particles"],
        ],
        "lookup_terms": ["scenery", "cityscape", "sunlight", "rain"],
    },
]

RANDOM_SCENE_PROFILES = [
    {
        "id": "rainy_neon_street",
        "tags": ["city", "street", "rain", "wet_ground", "reflection", "neon_lights"],
        "details": [
            ["umbrella", "puddle", "shopfront"],
            ["street_lamp", "traffic_light", "mist"],
            ["raindrops", "window_reflection", "steam"],
            ["crosswalk", "backlighting", "crowd_blur"],
        ],
        "lighting": [
            ["night", "rim_lighting", "glowing_sign"],
            ["blue_light", "pink_light", "backlighting"],
            ["soft_focus", "bokeh", "reflected_light"],
        ],
        "lookup_terms": ["rain", "neon lights", "city street", "reflection"],
    },
    {
        "id": "sunlit_forest_path",
        "tags": ["forest", "path", "trees", "flowers", "sunlight"],
        "details": [
            ["dappled_sunlight", "moss", "wildflowers"],
            ["butterfly", "fallen_leaves", "tree_roots"],
            ["stream", "rocks", "fern"],
            ["wooden_bridge", "mist", "bird"],
        ],
        "lighting": [
            ["morning", "god_rays", "soft_shadows"],
            ["golden_hour", "warm_light", "lens_flare"],
            ["overcast", "diffused_light", "calm"],
        ],
        "lookup_terms": ["forest", "flowers", "sunlight", "mist"],
    },
    {
        "id": "quiet_library",
        "tags": ["library", "bookshelf", "window", "wooden_floor"],
        "details": [
            ["book_stack", "desk", "teacup"],
            ["ladder", "old_books", "curtains"],
            ["paper", "ink_bottle", "dust_particles"],
            ["reading_nook", "lamp", "soft_shadow"],
        ],
        "lighting": [
            ["sunbeam", "warm_light", "soft_focus"],
            ["lamplight", "cozy", "shallow_depth_of_field"],
            ["late_afternoon", "golden_light", "quiet"],
        ],
        "lookup_terms": ["library", "bookshelf", "sunbeam", "book"],
    },
    {
        "id": "seaside_evening",
        "tags": ["ocean", "beach", "waves", "clouds", "horizon"],
        "details": [
            ["sunset", "seafoam", "wet_sand"],
            ["lighthouse", "distant_ship", "seagull"],
            ["pier", "fishing_net", "rope"],
            ["wind", "flowing_clothes", "sparkling_water"],
        ],
        "lighting": [
            ["sunset", "orange_sky", "backlighting"],
            ["blue_hour", "soft_light", "silhouette"],
            ["moonlight", "silver_light", "calm"],
        ],
        "lookup_terms": ["ocean", "sunset", "wind", "waves"],
    },
    {
        "id": "fantasy_ruins",
        "tags": ["ruins", "overgrown", "ancient", "stone", "glowing"],
        "details": [
            ["vines", "broken_pillar", "magic_circle"],
            ["crystal", "floating_particles", "moss"],
            ["statue", "cracked_wall", "flowers"],
            ["archway", "waterfall", "mist"],
        ],
        "lighting": [
            ["mysterious_light", "volumetric_lighting", "blue_glow"],
            ["moonlight", "fog", "soft_shadow"],
            ["sunlight", "god_rays", "atmospheric_perspective"],
        ],
        "lookup_terms": ["ruins", "glowing", "magic circle", "mist"],
    },
    {
        "id": "cozy_room",
        "tags": ["bedroom", "window", "curtains", "plants", "wooden_floor"],
        "details": [
            ["desk", "book", "coffee"],
            ["bed", "blanket", "pillow"],
            ["cat", "chair", "sunbeam"],
            ["poster", "string_lights", "small_shelf"],
        ],
        "lighting": [
            ["morning", "soft_light", "warm_color_palette"],
            ["evening", "lamplight", "cozy"],
            ["rainy_day", "window_light", "muted_colors"],
        ],
        "lookup_terms": ["bedroom", "coffee", "plants", "window"],
    },
    {
        "id": "festival_night",
        "tags": ["festival", "night", "lantern", "crowd", "food_stall"],
        "details": [
            ["fireworks", "paper_lantern", "yakisoba"],
            ["mask_stall", "goldfish_scooping", "banner"],
            ["torii", "stone_steps", "hanging_lantern"],
            ["cotton_candy", "wooden_booth", "crowd_blur"],
        ],
        "lighting": [
            ["warm_lantern_light", "night_sky", "rim_lighting"],
            ["fireworks", "colorful_light", "backlighting"],
            ["soft_shadow", "glowing_sign", "blue_hour"],
        ],
        "lookup_terms": ["festival", "lantern", "fireworks", "food stall"],
    },
    {
        "id": "train_station_morning",
        "tags": ["train_station", "platform", "morning", "commute"],
        "details": [
            ["train", "ticket_gate", "signboard"],
            ["bench", "vending_machine", "timetable"],
            ["suitcase", "overpass", "sunbeam"],
            ["railway_tracks", "distant_train", "motion_blur"],
        ],
        "lighting": [
            ["morning_light", "soft_shadow", "clear_sky"],
            ["overcast", "diffused_light", "muted_colors"],
            ["backlighting", "light_rays", "warm_light"],
        ],
        "lookup_terms": ["train station", "platform", "suitcase", "commute"],
    },
    {
        "id": "stage_performance",
        "tags": ["stage", "spotlight", "audience", "concert"],
        "details": [
            ["microphone", "speaker", "confetti"],
            ["stage_lights", "smoke_machine", "glowstick"],
            ["curtains", "music_note", "backdrop"],
            ["dance_floor", "sparkles", "crowd_blur"],
        ],
        "lighting": [
            ["spotlight", "colorful_light", "high_contrast"],
            ["rim_lighting", "stage_lights", "dark_background"],
            ["glitter", "backlighting", "sharp_focus"],
        ],
        "lookup_terms": ["stage", "microphone", "concert", "spotlight"],
    },
    {
        "id": "sci_fi_workshop",
        "tags": ["laboratory", "workshop", "hologram", "monitor", "machinery"],
        "details": [
            ["control_panel", "floating_screen", "cable"],
            ["robot_arm", "toolbox", "blue_glow"],
            ["mechanical_parts", "schematic", "workbench"],
            ["glass_wall", "server_rack", "warning_light"],
        ],
        "lighting": [
            ["blue_light", "rim_lighting", "screen_glow"],
            ["neon_light", "low_light", "high_contrast"],
            ["cool_light", "sharp_focus", "reflected_light"],
        ],
        "lookup_terms": ["hologram", "workshop", "machinery", "control panel"],
    },
    {
        "id": "sports_court",
        "tags": ["sports", "court", "outdoors", "blue_sky"],
        "details": [
            ["basketball", "chain_link_fence", "water_bottle"],
            ["running_track", "finish_line", "sports_bag"],
            ["tennis_court", "racket", "net"],
            ["soccer_field", "goal", "grass"],
        ],
        "lighting": [
            ["sunny", "clear_sky", "sharp_shadow"],
            ["golden_hour", "warm_light", "motion_blur"],
            ["overcast", "diffused_light", "fresh_air"],
        ],
        "lookup_terms": ["sports", "basketball", "running", "court"],
    },
    {
        "id": "art_studio",
        "tags": ["art_studio", "easel", "canvas", "paint"],
        "details": [
            ["paintbrush", "palette", "apron"],
            ["sketchbook", "pencil", "paper"],
            ["clay_model", "shelf", "tool"],
            ["window", "sunbeam", "paint_splatter"],
        ],
        "lighting": [
            ["north_light", "soft_shadow", "warm_light"],
            ["afternoon_light", "dust_particles", "calm"],
            ["lamplight", "cozy", "shallow_depth_of_field"],
        ],
        "lookup_terms": ["art studio", "paintbrush", "easel", "sketchbook"],
    },
]


def _sfw_scene_profile(scene_id, tags, details, lighting, lookup_terms):
    return {
        "id": scene_id,
        "tags": tags,
        "details": details,
        "lighting": lighting,
        "lookup_terms": lookup_terms,
    }


RANDOM_SCENE_PROFILES.extend([
    _sfw_scene_profile(
        "airport_terminal",
        ["airport", "terminal", "glass_wall", "luggage"],
        [["departure_board", "suitcase", "ticket"], ["security_gate", "queue", "signboard"], ["large_window", "airplane", "runway"]],
        [["morning_light", "glass_reflection", "clear_sky"], ["overcast", "diffused_light", "muted_colors"], ["night", "soft_light", "window_reflection"]],
        ["airport terminal", "luggage", "departure board"],
    ),
    _sfw_scene_profile(
        "subway_platform",
        ["subway", "platform", "train", "underground"],
        [["yellow_line", "tile_wall", "map"], ["turnstile", "ticket_gate", "crowd"], ["motion_blur", "arriving_train", "signboard"]],
        [["fluorescent_light", "cool_light", "reflection"], ["dim_light", "high_contrast", "long_shadow"], ["neon_light", "depth_of_field", "blue_light"]],
        ["subway platform", "train", "ticket gate"],
    ),
    _sfw_scene_profile(
        "shopping_arcade",
        ["shopping_arcade", "storefront", "crowd", "signboard"],
        [["glass_roof", "shop_window", "mannequin"], ["escalator", "poster", "bag"], ["food_court", "table", "menu"]],
        [["soft_indoor_light", "reflected_light", "clean"], ["evening", "warm_light", "glowing_sign"], ["skylight", "bright", "sharp_focus"]],
        ["shopping arcade", "storefront", "escalator"],
    ),
    _sfw_scene_profile(
        "old_town_alley",
        ["old_town", "alley", "cobblestone", "building"],
        [["flower_pot", "wooden_door", "window"], ["street_lamp", "bicycle", "stone_wall"], ["stairs", "awning", "shopfront"]],
        [["golden_hour", "warm_light", "soft_shadow"], ["rain", "wet_ground", "reflection"], ["morning", "sunbeam", "calm"]],
        ["old town alley", "cobblestone", "street lamp"],
    ),
    _sfw_scene_profile(
        "rooftop_garden",
        ["rooftop", "garden", "cityscape", "plants"],
        [["railing", "flower_pot", "bench"], ["greenhouse", "water_tank", "stairs"], ["table", "parasol", "skyline"]],
        [["sunset", "backlighting", "orange_sky"], ["blue_hour", "city_lights", "rim_lighting"], ["clear_sky", "soft_light", "wind"]],
        ["rooftop garden", "cityscape", "plants"],
    ),
    _sfw_scene_profile(
        "museum_gallery",
        ["museum", "gallery", "painting", "marble_floor"],
        [["frame", "bench", "spotlight"], ["sculpture", "pedestal", "rope_barrier"], ["large_hall", "skylight", "quiet"]],
        [["gallery_light", "soft_shadow", "clean"], ["spotlight", "dark_background", "high_contrast"], ["skylight", "diffused_light", "calm"]],
        ["museum gallery", "painting", "sculpture"],
    ),
    _sfw_scene_profile(
        "classroom_afternoon",
        ["classroom", "desk", "chalkboard", "window"],
        [["school_desk", "notebook", "pencil"], ["curtains", "sunbeam", "chair"], ["bulletin_board", "clock", "book_stack"]],
        [["afternoon_light", "warm_light", "dust_particles"], ["overcast", "diffused_light", "quiet"], ["sunset", "orange_light", "long_shadow"]],
        ["classroom", "school desk", "chalkboard"],
    ),
    _sfw_scene_profile(
        "kitchen_table",
        ["kitchen", "table", "food", "window"],
        [["cutting_board", "vegetables", "knife"], ["steam", "soup", "bowl"], ["apron", "sink", "tile_wall"]],
        [["morning_light", "soft_shadow", "warm_light"], ["lamplight", "cozy", "shallow_depth_of_field"], ["sunbeam", "clean", "bright"]],
        ["kitchen table", "food", "apron"],
    ),
    _sfw_scene_profile(
        "greenhouse",
        ["greenhouse", "plants", "glass_roof", "flowers"],
        [["watering_can", "terracotta_pot", "vines"], ["orchid", "fern", "mist"], ["wooden_table", "seedling", "garden_tool"]],
        [["sunbeam", "diffused_light", "warm_light"], ["mist", "soft_focus", "fresh"], ["rain", "window_reflection", "calm"]],
        ["greenhouse", "plants", "watering can"],
    ),
    _sfw_scene_profile(
        "aquarium_tunnel",
        ["aquarium", "underwater", "fish", "glass_tunnel"],
        [["shark", "coral", "blue_light"], ["jellyfish", "reflection", "visitor"], ["bubble", "water", "school_of_fish"]],
        [["blue_light", "caustics", "soft_shadow"], ["glowing_jellyfish", "dark_background", "rim_lighting"], ["reflected_light", "dreamy", "depth_of_field"]],
        ["aquarium", "jellyfish", "underwater"],
    ),
    _sfw_scene_profile(
        "bamboo_forest",
        ["bamboo_forest", "path", "greenery", "sunlight"],
        [["bamboo", "stone_path", "fallen_leaves"], ["torii", "moss", "mist"], ["stream", "bridge", "fern"]],
        [["morning", "dappled_sunlight", "soft_shadow"], ["fog", "diffused_light", "calm"], ["golden_hour", "warm_light", "wind"]],
        ["bamboo forest", "stone path", "mist"],
    ),
    _sfw_scene_profile(
        "snowy_mountain",
        ["mountain", "snow", "pine_tree", "clouds"],
        [["mountain_peak", "snowfield", "footprints"], ["cabin", "smoke", "frozen_lake"], ["cliff", "distant_mountains", "wind"]],
        [["clear_sky", "bright_light", "sharp_shadow"], ["snowfall", "diffused_light", "soft_focus"], ["sunset", "pink_sky", "backlighting"]],
        ["snowy mountain", "snow", "cabin"],
    ),
    _sfw_scene_profile(
        "desert_oasis",
        ["desert", "oasis", "sand", "palm_tree"],
        [["water", "date_palm", "tent"], ["camel", "dune", "carpet"], ["ruins", "sun", "heat_haze"]],
        [["sunset", "orange_sky", "long_shadow"], ["noon", "harsh_light", "clear_sky"], ["moonlight", "cool_light", "stars"]],
        ["desert oasis", "sand dune", "palm tree"],
    ),
    _sfw_scene_profile(
        "coral_reef",
        ["coral_reef", "underwater", "fish", "sunlight"],
        [["coral", "sea_turtle", "bubble"], ["reef", "tropical_fish", "seaweed"], ["sunbeam", "clear_water", "shell"]],
        [["caustics", "blue_light", "sparkling_water"], ["sunlight", "soft_shadow", "clear"], ["deep_blue", "glowing", "dreamy"]],
        ["coral reef", "sea turtle", "underwater"],
    ),
    _sfw_scene_profile(
        "volcanic_landscape",
        ["volcano", "lava", "rock", "smoke"],
        [["lava_flow", "ash", "cracked_ground"], ["obsidian", "steam", "red_glow"], ["cliff", "embers", "dark_clouds"]],
        [["red_light", "high_contrast", "rim_lighting"], ["smoke", "low_light", "dramatic"], ["sunset", "orange_sky", "backlighting"]],
        ["volcanic landscape", "lava", "ash"],
    ),
    _sfw_scene_profile(
        "waterfall_gorge",
        ["waterfall", "gorge", "river", "rocks"],
        [["mist", "rainbow", "moss"], ["wooden_bridge", "cliff", "fern"], ["pool", "wet_rocks", "spray"]],
        [["sunbeam", "mist", "soft_light"], ["overcast", "diffused_light", "calm"], ["golden_hour", "warm_light", "sparkling_water"]],
        ["waterfall", "gorge", "mist"],
    ),
    _sfw_scene_profile(
        "autumn_park",
        ["park", "autumn", "fallen_leaves", "bench"],
        [["maple_leaf", "path", "street_lamp"], ["pond", "duck", "wooden_bridge"], ["bicycle", "scarf", "picnic"]],
        [["golden_hour", "warm_light", "soft_shadow"], ["overcast", "muted_colors", "calm"], ["sunbeam", "falling_leaves", "gentle_wind"]],
        ["autumn park", "fallen leaves", "bench"],
    ),
    _sfw_scene_profile(
        "space_station",
        ["space_station", "space", "window", "earth"],
        [["airlock", "spacesuit", "control_panel"], ["solar_panel", "hatch", "floating"], ["observation_deck", "planet", "stars"]],
        [["screen_glow", "blue_light", "rim_lighting"], ["earthlight", "dark_background", "soft_shadow"], ["warning_light", "high_contrast", "low_light"]],
        ["space station", "spacesuit", "control panel"],
    ),
    _sfw_scene_profile(
        "starship_bridge",
        ["starship", "bridge", "control_panel", "space"],
        [["captain_chair", "hologram", "monitor"], ["window", "stars", "planet"], ["console", "crew", "warning_light"]],
        [["screen_glow", "blue_light", "sharp_focus"], ["red_alert", "high_contrast", "rim_lighting"], ["starlight", "dark_background", "cool_light"]],
        ["starship bridge", "hologram", "monitor"],
    ),
    _sfw_scene_profile(
        "lunar_base",
        ["moon", "lunar_base", "space", "crater"],
        [["dome", "rover", "antenna"], ["airlock", "spacesuit", "footprints"], ["earth", "solar_panel", "rock"]],
        [["earthlight", "cool_light", "dark_sky"], ["sunrise", "long_shadow", "sharp_light"], ["blue_light", "rim_lighting", "clear"]],
        ["lunar base", "moon", "rover"],
    ),
    _sfw_scene_profile(
        "alien_market",
        ["alien_market", "market", "neon_lights", "crowd"],
        [["alien_vendor", "floating_sign", "stall"], ["crystal", "strange_fruit", "lantern"], ["hover_vehicle", "street", "glowing"]],
        [["neon_light", "colorful_light", "reflected_light"], ["night", "rim_lighting", "mist"], ["screen_glow", "blue_light", "depth_of_field"]],
        ["alien market", "neon lights", "crystal"],
    ),
    _sfw_scene_profile(
        "robot_factory",
        ["factory", "robot", "assembly_line", "machinery"],
        [["robot_arm", "conveyor_belt", "sparks"], ["toolbox", "cable", "warning_sign"], ["metal_floor", "steam", "monitor"]],
        [["industrial_light", "high_contrast", "sharp_focus"], ["orange_light", "sparks", "rim_lighting"], ["cool_light", "screen_glow", "metal_reflection"]],
        ["robot factory", "assembly line", "machinery"],
    ),
    _sfw_scene_profile(
        "alien_biodome",
        ["alien_biodome", "glass_dome", "plants", "glowing"],
        [["alien_flower", "pool", "mist"], ["floating_seed", "vines", "crystal"], ["research_station", "path", "blue_glow"]],
        [["bioluminescence", "soft_light", "dreamy"], ["blue_light", "rim_lighting", "mist"], ["sunbeam", "glass_reflection", "calm"]],
        ["alien biodome", "glowing plants", "crystal"],
    ),
    _sfw_scene_profile(
        "arcane_library",
        ["arcane_library", "bookshelf", "magic_circle", "candle"],
        [["floating_book", "rune", "ladder"], ["spellbook", "crystal_ball", "desk"], ["stained_glass", "dust_particles", "old_books"]],
        [["candlelight", "warm_light", "soft_shadow"], ["blue_glow", "magic_circle", "rim_lighting"], ["moonlight", "window", "mysterious_light"]],
        ["arcane library", "floating book", "magic circle"],
    ),
    _sfw_scene_profile(
        "floating_island",
        ["floating_island", "sky", "clouds", "waterfall"],
        [["ancient_tree", "bridge", "wind"], ["ruins", "crystal", "grass"], ["airship", "distant_islands", "sunlight"]],
        [["sunlight", "god_rays", "clear_sky"], ["sunset", "orange_sky", "backlighting"], ["moonlight", "clouds", "soft_shadow"]],
        ["floating island", "sky", "waterfall"],
    ),
    _sfw_scene_profile(
        "dragon_cave",
        ["cave", "dragon", "treasure", "crystal"],
        [["gold", "gem", "rock"], ["stalactite", "torch", "smoke"], ["ancient_bone", "water", "glow"]],
        [["torchlight", "warm_light", "dark_background"], ["crystal_glow", "blue_light", "rim_lighting"], ["red_light", "smoke", "dramatic"]],
        ["dragon cave", "treasure", "crystal"],
    ),
    _sfw_scene_profile(
        "sky_castle",
        ["castle", "sky", "clouds", "fantasy"],
        [["tower", "flag", "bridge"], ["balcony", "stained_glass", "garden"], ["airship", "waterfall", "distant_mountains"]],
        [["sunrise", "golden_light", "clouds"], ["moonlight", "blue_light", "soft_shadow"], ["sunset", "backlighting", "orange_sky"]],
        ["sky castle", "tower", "clouds"],
    ),
    _sfw_scene_profile(
        "enchanted_garden",
        ["enchanted_garden", "flowers", "glowing", "butterfly"],
        [["mushroom", "fairy_light", "pond"], ["rose_arch", "fountain", "vines"], ["firefly", "grass", "sparkles"]],
        [["soft_light", "glowing", "dreamy"], ["moonlight", "firefly", "blue_light"], ["morning", "dew", "sunbeam"]],
        ["enchanted garden", "glowing flowers", "butterfly"],
    ),
    _sfw_scene_profile(
        "crystal_cavern",
        ["crystal_cavern", "cave", "glowing", "water"],
        [["crystal", "underground_lake", "reflection"], ["stone_bridge", "stalactite", "mist"], ["geode", "blue_glow", "rock"]],
        [["crystal_glow", "blue_light", "reflected_light"], ["low_light", "rim_lighting", "dark_background"], ["soft_light", "mist", "dreamy"]],
        ["crystal cavern", "underground lake", "blue glow"],
    ),
    _sfw_scene_profile(
        "dungeon_corridor",
        ["dungeon", "corridor", "stone_wall", "torch"],
        [["wooden_door", "chain", "barrel"], ["stairs", "shadow", "moss"], ["gate", "cobweb", "water"]],
        [["torchlight", "warm_light", "long_shadow"], ["low_light", "dark_background", "high_contrast"], ["blue_light", "mist", "mysterious"]],
        ["dungeon corridor", "torch", "stone wall"],
    ),
    _sfw_scene_profile(
        "treasure_room",
        ["treasure_room", "gold", "chest", "gem"],
        [["treasure_chest", "coins", "jewel"], ["statue", "pillar", "torch"], ["map", "scroll", "key"]],
        [["golden_light", "sparkles", "warm_light"], ["torchlight", "soft_shadow", "dark_background"], ["sunbeam", "dust_particles", "mysterious"]],
        ["treasure room", "gold", "chest"],
    ),
    _sfw_scene_profile(
        "airship_deck",
        ["airship", "deck", "sky", "clouds"],
        [["sail", "rope", "wooden_floor"], ["propeller", "railing", "wind"], ["map_table", "compass", "distant_mountains"]],
        [["sunset", "backlighting", "orange_sky"], ["clear_sky", "bright_light", "wind"], ["storm_clouds", "dramatic", "high_contrast"]],
        ["airship deck", "clouds", "compass"],
    ),
    _sfw_scene_profile(
        "boss_arena",
        ["arena", "ruins", "dramatic", "wide_shot"],
        [["broken_pillar", "magic_circle", "cracked_floor"], ["torch", "banner", "stone_gate"], ["dust", "weapon", "storm_clouds"]],
        [["dramatic_lighting", "high_contrast", "rim_lighting"], ["red_light", "smoke", "dark_background"], ["moonlight", "fog", "blue_light"]],
        ["boss arena", "ruins", "magic circle"],
    ),
    _sfw_scene_profile(
        "parade_street",
        ["parade", "street", "crowd", "confetti"],
        [["float", "banner", "balloon"], ["marching_band", "drum", "flag"], ["food_stall", "streamer", "smile"]],
        [["sunny", "colorful_light", "sharp_focus"], ["golden_hour", "warm_light", "crowd_blur"], ["night", "lantern", "glowing_sign"]],
        ["parade", "confetti", "balloon"],
    ),
    _sfw_scene_profile(
        "wedding_garden",
        ["wedding", "garden", "flowers", "arch"],
        [["flower_arch", "chair", "ribbon"], ["cake", "table", "bouquet"], ["fountain", "path", "white_cloth"]],
        [["soft_light", "warm_light", "bloom"], ["sunset", "golden_light", "backlighting"], ["overcast", "diffused_light", "calm"]],
        ["wedding garden", "bouquet", "flower arch"],
    ),
    _sfw_scene_profile(
        "market_bazaar",
        ["market", "bazaar", "stall", "crowd"],
        [["spice", "basket", "cloth"], ["fruit", "awning", "signboard"], ["lantern", "carpet", "ceramic"]],
        [["warm_light", "sunbeam", "colorful"], ["evening", "lantern", "soft_shadow"], ["overcast", "diffused_light", "busy"]],
        ["market bazaar", "spice", "fruit stall"],
    ),
    _sfw_scene_profile(
        "tea_house",
        ["tea_house", "tatami", "teacup", "window"],
        [["tea_set", "low_table", "flowers"], ["shoji", "garden", "sunbeam"], ["kettle", "steam", "wooden_floor"]],
        [["warm_light", "soft_shadow", "calm"], ["morning", "diffused_light", "peaceful"], ["rainy_day", "window_light", "muted_colors"]],
        ["tea house", "teacup", "tatami"],
    ),
])

RANDOM_VISUAL_DIRECTION_PROFILES = {
    "character": [
        {
            "id": "eye_level_editorial",
            "composition": ["cowboy_shot", "eye_level", "balanced_composition"],
            "lens": [["50mm_lens", "natural_perspective"], ["85mm_lens", "shallow_depth_of_field"]],
        },
        {
            "id": "heroic_low_angle",
            "composition": ["full_body", "from_below", "diagonal_composition"],
            "lens": [["24mm_wide_angle_lens", "foreshortening"], ["35mm_lens", "dramatic_perspective"]],
        },
        {
            "id": "high_angle_isolation",
            "composition": ["full_body", "from_above", "negative_space"],
            "lens": [["35mm_lens", "high_vantage_point"], ["50mm_lens", "compressed_background"]],
        },
        {
            "id": "dutch_angle_action",
            "composition": ["medium_shot", "dutch_angle", "diagonal_lines"],
            "lens": [["28mm_lens", "perspective_distortion"], ["action_camera", "dynamic_depth"]],
        },
        {
            "id": "extreme_closeup_tension",
            "composition": ["extreme_close_up", "cropped_composition", "intense_gaze"],
            "lens": [["85mm_lens", "shallow_depth_of_field"], ["macro_lens", "fine_surface_detail"]],
        },
        {
            "id": "environmental_portrait",
            "composition": ["wide_shot", "small_figure", "layered_composition"],
            "lens": [["35mm_lens", "deep_focus"], ["24mm_lens", "expansive_background"]],
        },
        {
            "id": "over_shoulder_story",
            "composition": ["over_shoulder", "foreground_silhouette", "off_center_subject"],
            "lens": [["50mm_lens", "depth_of_field"], ["70mm_lens", "foreground_blur"]],
        },
        {
            "id": "back_view_depth",
            "composition": ["from_behind", "leading_lines", "vanishing_point"],
            "lens": [["35mm_lens", "deep_perspective"], ["50mm_lens", "layered_depth"]],
        },
        {
            "id": "worm_eye_monumental",
            "composition": ["full_body", "worm_eye_view", "exaggerated_scale"],
            "lens": [["18mm_ultra_wide_lens", "strong_foreshortening"], ["24mm_lens", "towering_perspective"]],
        },
        {
            "id": "overhead_graphic",
            "composition": ["overhead_view", "top_down_composition", "radial_layout"],
            "lens": [["35mm_lens", "graphic_depth"], ["50mm_lens", "flattened_perspective"]],
        },
        {
            "id": "profile_negative_space",
            "composition": ["profile", "side_view", "asymmetrical_negative_space"],
            "lens": [["85mm_lens", "background_compression"], ["50mm_lens", "soft_depth_of_field"]],
        },
        {
            "id": "tracking_motion",
            "composition": ["action_shot", "tracking_shot", "motion_direction"],
            "lens": [["35mm_lens", "panning_motion_blur"], ["24mm_lens", "speed_lines"]],
        },
        {
            "id": "frame_within_frame",
            "composition": ["medium_shot", "frame_within_frame", "center_focus"],
            "lens": [["50mm_lens", "foreground_elements"], ["85mm_lens", "layered_focus"]],
        },
        {
            "id": "foreground_depth",
            "composition": ["cowboy_shot", "foreground_occlusion", "three_plane_composition"],
            "lens": [["35mm_lens", "deep_staging"], ["50mm_lens", "foreground_blur"]],
        },
        {
            "id": "reflection_dual_frame",
            "composition": ["reflection_shot", "symmetrical_composition", "dual_framing"],
            "lens": [["50mm_lens", "selective_focus"], ["85mm_lens", "compressed_layers"]],
        },
        {
            "id": "asymmetric_close_portrait",
            "composition": ["close_up", "off_center_composition", "visual_tension"],
            "lens": [["85mm_lens", "shallow_depth_of_field"], ["50mm_lens", "subtle_perspective"]],
        },
    ],
    "scenery": [
        {
            "id": "epic_panorama",
            "composition": ["extreme_wide_shot", "panorama", "layered_horizon"],
            "lens": [["18mm_ultra_wide_lens", "atmospheric_perspective"], ["24mm_lens", "deep_focus"]],
        },
        {
            "id": "aerial_geometry",
            "composition": ["aerial_view", "bird_eye_view", "geometric_composition"],
            "lens": [["35mm_lens", "flattened_depth"], ["50mm_lens", "pattern_emphasis"]],
        },
        {
            "id": "monumental_low_angle",
            "composition": ["low_angle", "towering_scale", "diagonal_composition"],
            "lens": [["20mm_wide_angle_lens", "dramatic_perspective"], ["28mm_lens", "foreground_scale"]],
        },
        {
            "id": "ground_level_immersion",
            "composition": ["ground_level_view", "leading_foreground", "deep_perspective"],
            "lens": [["18mm_ultra_wide_lens", "immersive_scale"], ["24mm_lens", "near_far_contrast"]],
        },
        {
            "id": "overhead_pattern",
            "composition": ["overhead_view", "top_down_composition", "repeating_pattern"],
            "lens": [["35mm_lens", "graphic_flattening"], ["50mm_lens", "precise_geometry"]],
        },
        {
            "id": "one_point_architecture",
            "composition": ["one_point_perspective", "vanishing_point", "symmetrical_architecture"],
            "lens": [["24mm_lens", "deep_focus"], ["35mm_lens", "controlled_perspective"]],
        },
        {
            "id": "dutch_urban_energy",
            "composition": ["dutch_angle", "diagonal_lines", "dynamic_architecture"],
            "lens": [["24mm_lens", "perspective_distortion"], ["28mm_lens", "energetic_depth"]],
        },
        {
            "id": "natural_foreground_frame",
            "composition": ["frame_within_frame", "foreground_elements", "distant_focal_point"],
            "lens": [["35mm_lens", "layered_focus"], ["50mm_lens", "foreground_blur"]],
        },
        {
            "id": "three_plane_landscape",
            "composition": ["foreground_midground_background", "layered_composition", "depth_cues"],
            "lens": [["35mm_lens", "deep_focus"], ["50mm_lens", "atmospheric_depth"]],
        },
        {
            "id": "reflection_symmetry",
            "composition": ["reflection_composition", "horizontal_symmetry", "centered_horizon"],
            "lens": [["35mm_lens", "crisp_reflection"], ["50mm_lens", "compressed_layers"]],
        },
        {
            "id": "telephoto_layers",
            "composition": ["distant_view", "stacked_layers", "compressed_perspective"],
            "lens": [["135mm_telephoto_lens", "atmospheric_layers"], ["200mm_telephoto_lens", "flattened_distance"]],
        },
        {
            "id": "fisheye_immersion",
            "composition": ["fisheye_view", "curved_perspective", "center_weighted_composition"],
            "lens": [["fisheye_lens", "extreme_field_of_view"], ["14mm_lens", "barrel_distortion"]],
        },
        {
            "id": "isometric_world",
            "composition": ["isometric_view", "structured_layout", "miniature_world_composition"],
            "lens": [["orthographic_view", "uniform_scale"], ["tilt_shift_lens", "miniature_effect"]],
        },
        {
            "id": "environmental_detail",
            "composition": ["close_detail", "abstract_crop", "texture_composition"],
            "lens": [["macro_lens", "selective_focus"], ["100mm_lens", "fine_texture_detail"]],
        },
    ],
}

RANDOM_ATMOSPHERE_GROUPS = [
    ["calm", "peaceful", "gentle_wind"],
    ["dramatic", "high_contrast", "cinematic_shadow"],
    ["dreamy", "floating_particles", "soft_focus"],
    ["melancholy", "muted_colors", "lonely"],
    ["energetic", "motion_blur", "dynamic_pose"],
]

RANDOM_SFW_THEME_PROFILES = [
    {
        "id": "cafe_daily_work",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo"],
        "scene_ids": ["quiet_library", "cozy_room", "art_studio", "train_station_morning"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop"],
        "tags": ["slice_of_life"],
        "outfit": [["apron", "rolled_up_sleeves"], ["cardigan", "casual"], ["shirt", "vest"]],
        "action": [["serving_food", "holding_tray"], ["pouring_coffee", "gentle_smile"], ["writing", "looking_down"]],
        "interaction": [["talking", "smile"], ["looking_at_another", "laughing"], ["handing_object", "soft_smile"]],
        "prop": [["coffee_cup", "dessert", "menu"], ["teapot", "book", "flower_vase"], ["notebook", "pen", "receipt"]],
        "scene_detail": [["counter", "steam", "chalkboard_menu"], ["wooden_table", "chair", "warm_light"]],
        "lookup_terms": ["coffee cup", "serving food", "slice of life"],
    },
    {
        "id": "festival_outing",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo"],
        "scene_ids": ["festival_night", "seaside_evening", "rainy_neon_street"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "scene"],
        "tags": ["festival"],
        "outfit": [["yukata", "hair_ornament"], ["casual", "hoodie"], ["kimono", "wide_sleeves"]],
        "action": [["holding_mask", "looking_at_viewer"], ["buying_food", "smile"], ["watching_fireworks", "looking_up"]],
        "interaction": [["holding_hands", "laughing"], ["sharing_food", "smile"], ["walking_together", "crowd"]],
        "prop": [["paper_lantern", "fox_mask", "food_stall"], ["cotton_candy", "balloon", "festival_fan"]],
        "scene_detail": [["fireworks", "lantern", "night_sky"], ["stall", "banner", "crowd_blur"]],
        "lookup_terms": ["festival", "yukata", "fireworks"],
    },
    {
        "id": "fantasy_quest",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo"],
        "scene_ids": ["fantasy_ruins", "sunlit_forest_path"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "scene"],
        "tags": ["fantasy", "adventure"],
        "outfit": [["cloak", "boots", "belt"], ["armor", "cape"], ["traveling_clothes", "gloves"]],
        "action": [["holding_map", "looking_forward"], ["casting_spell", "dynamic_pose"], ["reaching_out", "serious"]],
        "interaction": [["pointing", "looking_at_another"], ["protective_stance", "determined"], ["team_pose", "smile"]],
        "prop": [["map", "compass", "satchel"], ["staff", "magic_circle", "glowing_orb"], ["sword", "scabbard", "pouch"]],
        "scene_detail": [["ancient_gate", "rune", "floating_particles"], ["campfire", "moss", "broken_pillar"]],
        "lookup_terms": ["fantasy", "map", "magic circle"],
    },
    {
        "id": "sci_fi_operator",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo"],
        "scene_ids": ["sci_fi_workshop", "rainy_neon_street"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "style_light"],
        "tags": ["science_fiction"],
        "outfit": [["bodysuit", "jacket", "gloves"], ["pilot_suit", "headset"], ["lab_coat", "goggles"]],
        "action": [["operating_console", "focused"], ["repairing_machine", "kneeling"], ["pointing_at_screen", "serious"]],
        "interaction": [["discussing_plan", "looking_at_another"], ["passing_tool", "focused"], ["team_pose", "monitor"]],
        "prop": [["hologram", "control_panel", "cable"], ["tablet_pc", "toolbox", "robot_arm"], ["blueprint", "mechanical_parts"]],
        "scene_detail": [["screen_glow", "server_rack", "warning_light"], ["workbench", "sparks", "blue_glow"]],
        "lookup_terms": ["hologram", "control panel", "pilot suit"],
    },
    {
        "id": "idol_stage_show",
        "weight": 3,
        "subject_ids": ["solo_girl", "duo"],
        "scene_ids": ["stage_performance", "festival_night"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "style_light"],
        "tags": ["idol", "performance"],
        "outfit": [["idol_clothes", "frills", "hair_ribbon"], ["stage_outfit", "boots"], ["dress", "detached_sleeves"]],
        "action": [["singing", "holding_microphone"], ["dancing", "dynamic_pose"], ["waving", "big_smile"]],
        "interaction": [["duet", "looking_at_another"], ["group_pose", "smile"], ["reaching_out", "audience"]],
        "prop": [["microphone", "glowstick", "confetti"], ["speaker", "stage_light", "music_note"]],
        "scene_detail": [["spotlight", "stage", "audience"], ["curtains", "sparkles", "crowd_blur"]],
        "lookup_terms": ["idol", "microphone", "stage"],
    },
    {
        "id": "sports_training",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo"],
        "scene_ids": ["sports_court", "sunlit_forest_path", "seaside_evening"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop"],
        "tags": ["sports"],
        "outfit": [["sportswear", "sneakers"], ["track_jacket", "shorts"], ["jersey", "knee_socks"]],
        "action": [["running", "dynamic_pose"], ["jumping", "determined"], ["stretching", "smile"]],
        "interaction": [["passing_ball", "looking_at_another"], ["high_five", "laughing"], ["team_pose", "energetic"]],
        "prop": [["basketball", "water_bottle", "towel"], ["racket", "sports_bag"], ["soccer_ball", "goal"]],
        "scene_detail": [["court_line", "fence", "blue_sky"], ["running_track", "finish_line", "motion_blur"]],
        "lookup_terms": ["sportswear", "basketball", "running"],
    },
    {
        "id": "travel_snapshot",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo"],
        "scene_ids": ["train_station_morning", "seaside_evening", "rainy_neon_street", "festival_night"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "scene"],
        "tags": ["travel"],
        "outfit": [["backpack", "jacket"], ["coat", "scarf"], ["casual", "sneakers"]],
        "action": [["taking_photo", "camera"], ["checking_map", "looking_down"], ["waving", "smile"]],
        "interaction": [["showing_photo", "laughing"], ["walking_together", "suitcase"], ["pointing", "looking_away"]],
        "prop": [["camera", "suitcase", "map"], ["ticket", "phone", "backpack"], ["umbrella", "travel_bag"]],
        "scene_detail": [["signboard", "platform", "sunbeam"], ["street_corner", "shopfront", "reflection"]],
        "lookup_terms": ["camera", "suitcase", "travel"],
    },
    {
        "id": "art_studio_session",
        "weight": 2,
        "subject_ids": ["solo_girl", "solo_boy", "duo"],
        "scene_ids": ["art_studio", "quiet_library", "cozy_room"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "scene"],
        "tags": ["art"],
        "outfit": [["apron", "rolled_up_sleeves"], ["cardigan", "casual"], ["shirt", "gloves"]],
        "action": [["painting", "holding_brush"], ["sketching", "looking_down"], ["mixing_paint", "focused"]],
        "interaction": [["showing_sketch", "smile"], ["teaching", "pointing"], ["looking_at_canvas", "thoughtful"]],
        "prop": [["paintbrush", "palette", "canvas"], ["sketchbook", "pencil", "easel"], ["paint_tube", "rag", "jar"]],
        "scene_detail": [["paint_splatter", "wooden_floor", "sunbeam"], ["shelf", "clay_model", "paper"]],
        "lookup_terms": ["paintbrush", "easel", "sketchbook"],
    },
    {
        "id": "animal_companion",
        "weight": 2,
        "subject_ids": ["solo_girl", "solo_boy", "duo", "animal_focus"],
        "scene_ids": ["sunlit_forest_path", "cozy_room", "seaside_evening", "festival_night"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "prop", "scene"],
        "tags": ["animal", "pet"],
        "outfit": [["casual", "sneakers"], ["coat", "scarf"], ["apron"]],
        "action": [["feeding_animal", "gentle_smile"], ["holding_pet", "smile"], ["playing", "laughing"]],
        "interaction": [["petting_animal", "looking_down"], ["walking_dog", "leash"], ["sharing_food", "smile"]],
        "prop": [["leash", "pet_bowl", "toy"], ["basket", "blanket", "ribbon"], ["treat", "small_bag"]],
        "scene_detail": [["grass", "flowers", "sunlight"], ["sofa", "blanket", "window_light"]],
        "lookup_terms": ["petting animal", "cat", "dog"],
    },
    {
        "id": "landscape_weather",
        "weight": 2,
        "subject_ids": ["scenery", "animal_focus"],
        "scene_ids": ["sunlit_forest_path", "seaside_evening", "rainy_neon_street", "fantasy_ruins"],
        "association_max": 4,
        "association_slots": ["scene", "prop", "style_light", "camera"],
        "tags": ["environment"],
        "outfit": [[]],
        "action": [["wind", "falling_leaves"], ["rain", "ripples"], ["sunlight", "floating_particles"]],
        "interaction": [[]],
        "prop": [["bird", "butterfly", "flower"], ["boat", "rope", "lantern"], ["umbrella", "puddle", "reflection"]],
        "scene_detail": [["distant_mountains", "clouds", "river"], ["waves", "seafoam", "sparkling_water"]],
        "lookup_terms": ["scenery", "rain", "sunlight"],
    },
    {
        "id": "still_life_corner",
        "weight": 2,
        "subject_ids": ["scenery", "animal_focus"],
        "scene_ids": ["quiet_library", "cozy_room", "art_studio"],
        "association_max": 4,
        "association_slots": ["scene", "prop", "style_light", "camera"],
        "tags": ["still_life"],
        "outfit": [[]],
        "action": [["sunbeam", "dust_particles"], ["steam", "soft_shadow"], ["falling_petals", "calm"]],
        "interaction": [[]],
        "prop": [["book", "coffee_cup", "flower_vase"], ["paintbrush", "palette", "sketchbook"], ["blanket", "plant", "chair"]],
        "scene_detail": [["wooden_table", "window", "warm_light"], ["shelf", "paper", "small_lamp"]],
        "lookup_terms": ["still life", "coffee cup", "flower vase"],
    },
    {
        "id": "urban_architecture",
        "weight": 2,
        "subject_ids": ["scenery", "animal_focus"],
        "scene_ids": ["rainy_neon_street", "train_station_morning", "sci_fi_workshop", "festival_night"],
        "association_max": 4,
        "association_slots": ["scene", "prop", "style_light", "camera"],
        "tags": ["architecture"],
        "outfit": [[]],
        "action": [["rain", "reflection"], ["moving_train", "motion_blur"], ["crowd_blur", "glowing_sign"]],
        "interaction": [[]],
        "prop": [["signboard", "street_lamp", "umbrella"], ["ticket_gate", "bench", "vending_machine"], ["lantern", "banner", "stairs"]],
        "scene_detail": [["vanishing_point", "leading_lines", "wet_ground"], ["platform", "overpass", "cityscape"]],
        "lookup_terms": ["architecture", "street lamp", "train station"],
    },
]

RANDOM_SFW_THEME_PROFILES.extend([
    {
        "id": "commuter_public_space",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo"],
        "scene_ids": ["airport_terminal", "subway_platform", "shopping_arcade", "old_town_alley", "rooftop_garden"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "scene"],
        "tags": ["daily_life"],
        "outfit": [["coat", "scarf"], ["jacket", "backpack"], ["casual", "sneakers"]],
        "action": [["checking_phone", "looking_down"], ["waiting", "looking_away"], ["walking", "holding_bag"]],
        "interaction": [["asking_directions", "smile"], ["walking_together", "talking"], ["pointing", "looking_at_another"]],
        "prop": [["phone", "ticket", "bag"], ["suitcase", "coffee_cup", "map"], ["umbrella", "shopping_bag", "signboard"]],
        "scene_detail": [["crowd_blur", "signboard", "reflection"], ["glass_wall", "bench", "large_window"]],
        "lookup_terms": ["commute", "ticket", "shopping bag"],
    },
    {
        "id": "market_food_walk",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo"],
        "scene_ids": ["market_bazaar", "kitchen_table", "tea_house", "shopping_arcade", "festival_night"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "scene"],
        "tags": ["food", "market"],
        "outfit": [["apron", "rolled_up_sleeves"], ["casual", "cardigan"], ["kimono", "hair_ornament"]],
        "action": [["tasting_food", "smile"], ["cooking", "focused"], ["holding_cup", "gentle_smile"]],
        "interaction": [["sharing_food", "laughing"], ["handing_object", "soft_smile"], ["talking", "looking_at_another"]],
        "prop": [["bowl", "chopsticks", "steam"], ["basket", "fruit", "spice"], ["teacup", "kettle", "dessert"]],
        "scene_detail": [["stall", "wooden_table", "menu"], ["steam", "warm_light", "flower_vase"]],
        "lookup_terms": ["food stall", "teacup", "cooking"],
    },
    {
        "id": "school_museum_visit",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo"],
        "scene_ids": ["classroom_afternoon", "museum_gallery", "quiet_library", "arcane_library"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "scene"],
        "tags": ["study", "education"],
        "outfit": [["school_uniform", "pleated_skirt"], ["shirt", "necktie"], ["cardigan", "loafers"]],
        "action": [["reading", "looking_down"], ["taking_notes", "focused"], ["looking_at_painting", "thoughtful"]],
        "interaction": [["discussing", "looking_at_another"], ["showing_book", "smile"], ["pointing", "curious"]],
        "prop": [["notebook", "pencil", "book"], ["guidebook", "frame", "bench"], ["tablet_pc", "map", "ticket"]],
        "scene_detail": [["chalkboard", "desk", "sunbeam"], ["painting", "sculpture", "spotlight"]],
        "lookup_terms": ["classroom", "museum", "notebook"],
    },
    {
        "id": "nature_expedition",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo", "animal_focus", "scenery"],
        "scene_ids": ["bamboo_forest", "snowy_mountain", "desert_oasis", "volcanic_landscape", "waterfall_gorge", "autumn_park", "greenhouse"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "scene", "style_light"],
        "tags": ["outdoors", "exploration"],
        "outfit": [["hiking_boots", "backpack"], ["coat", "scarf"], ["traveling_clothes", "gloves"]],
        "action": [["hiking", "looking_forward"], ["taking_photo", "camera"], ["resting", "smile"]],
        "interaction": [["pointing", "looking_at_another"], ["helping_hand", "smile"], ["walking_together", "trail"]],
        "prop": [["map", "compass", "water_bottle"], ["camera", "walking_stick", "bag"], ["flower", "leaf", "notebook"]],
        "scene_detail": [["trail", "rocks", "distant_mountains"], ["mist", "sunbeam", "wind"]],
        "lookup_terms": ["hiking", "compass", "waterfall"],
    },
    {
        "id": "underwater_visit",
        "weight": 2,
        "subject_ids": ["solo_girl", "solo_boy", "duo", "animal_focus", "scenery"],
        "scene_ids": ["aquarium_tunnel", "coral_reef", "seaside_evening"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "prop", "scene", "style_light"],
        "tags": ["aquatic"],
        "outfit": [["casual", "shorts"], ["sailor_collar", "ribbon"], ["swimsuit", "coverup"]],
        "action": [["watching_fish", "smile"], ["pointing_up", "wonder"], ["floating", "relaxed"]],
        "interaction": [["showing_fish", "laughing"], ["looking_at_another", "smile"], ["holding_hands", "blue_light"]],
        "prop": [["fish", "bubble", "shell"], ["jellyfish", "camera", "glass"], ["coral", "seaweed", "water"]],
        "scene_detail": [["blue_light", "caustics", "reflection"], ["glass_tunnel", "school_of_fish", "water"]],
        "lookup_terms": ["aquarium", "coral reef", "jellyfish"],
    },
    {
        "id": "space_expedition",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo", "scenery"],
        "scene_ids": ["space_station", "starship_bridge", "lunar_base", "alien_market", "alien_biodome"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "style_light"],
        "tags": ["space", "science_fiction"],
        "outfit": [["spacesuit", "helmet"], ["pilot_suit", "gloves"], ["jacket", "headset"]],
        "action": [["floating", "reaching_out"], ["operating_console", "focused"], ["exploring", "looking_forward"]],
        "interaction": [["team_pose", "monitor"], ["passing_tool", "focused"], ["pointing_at_planet", "wonder"]],
        "prop": [["helmet", "control_panel", "hologram"], ["rover", "antenna", "tablet_pc"], ["crystal", "sample_container", "toolbox"]],
        "scene_detail": [["earth", "stars", "window"], ["airlock", "screen_glow", "warning_light"]],
        "lookup_terms": ["spacesuit", "starship", "lunar base"],
    },
    {
        "id": "machine_lab",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo", "scenery"],
        "scene_ids": ["robot_factory", "sci_fi_workshop", "alien_biodome"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "style_light"],
        "tags": ["technology", "machine"],
        "outfit": [["lab_coat", "goggles"], ["mechanic_clothes", "gloves"], ["bodysuit", "jacket"]],
        "action": [["repairing_machine", "focused"], ["holding_tool", "kneeling"], ["checking_screen", "serious"]],
        "interaction": [["passing_tool", "looking_at_another"], ["discussing_plan", "monitor"], ["team_pose", "robot"]],
        "prop": [["robot_arm", "toolbox", "cable"], ["wrench", "tablet_pc", "blueprint"], ["control_panel", "mechanical_parts", "sparks"]],
        "scene_detail": [["assembly_line", "metal_floor", "steam"], ["workbench", "screen_glow", "warning_sign"]],
        "lookup_terms": ["robot arm", "mechanic", "blueprint"],
    },
    {
        "id": "fantasy_landmark",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo", "scenery", "animal_focus"],
        "scene_ids": ["arcane_library", "floating_island", "dragon_cave", "sky_castle", "enchanted_garden", "crystal_cavern"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "scene", "style_light"],
        "tags": ["fantasy", "magic"],
        "outfit": [["cloak", "boots"], ["robe", "wide_sleeves"], ["armor", "cape"]],
        "action": [["casting_spell", "dynamic_pose"], ["holding_lantern", "looking_forward"], ["reaching_out", "wonder"]],
        "interaction": [["showing_map", "smile"], ["protective_stance", "determined"], ["looking_at_another", "curious"]],
        "prop": [["staff", "spellbook", "magic_circle"], ["lantern", "map", "crystal"], ["sword", "shield", "satchel"]],
        "scene_detail": [["rune", "floating_particles", "glowing"], ["tower", "waterfall", "clouds"]],
        "lookup_terms": ["fantasy", "spellbook", "crystal cavern"],
    },
    {
        "id": "dungeon_adventure",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo", "scenery"],
        "scene_ids": ["dungeon_corridor", "treasure_room", "airship_deck", "boss_arena", "fantasy_ruins"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "scene"],
        "tags": ["adventure", "rpg"],
        "outfit": [["adventurer", "cloak", "boots"], ["armor", "gloves"], ["traveling_clothes", "belt"]],
        "action": [["holding_sword", "determined"], ["opening_chest", "surprised"], ["running", "dynamic_pose"]],
        "interaction": [["team_pose", "serious"], ["pointing", "looking_at_another"], ["protective_stance", "determined"]],
        "prop": [["sword", "shield", "torch"], ["treasure_chest", "map", "key"], ["rope", "compass", "scroll"]],
        "scene_detail": [["stone_wall", "torch", "shadow"], ["gold", "pillar", "cracked_floor"]],
        "lookup_terms": ["dungeon", "treasure chest", "sword"],
    },
    {
        "id": "celebration_event",
        "weight": 3,
        "subject_ids": ["solo_girl", "solo_boy", "duo"],
        "scene_ids": ["parade_street", "wedding_garden", "festival_night", "stage_performance", "market_bazaar"],
        "association_max": 4,
        "association_slots": ["pose_action", "expression", "clothing", "prop", "scene"],
        "tags": ["celebration"],
        "outfit": [["dress", "flower"], ["suit", "necktie"], ["yukata", "hair_ornament"]],
        "action": [["waving", "big_smile"], ["holding_bouquet", "smile"], ["throwing_confetti", "laughing"]],
        "interaction": [["holding_hands", "smile"], ["group_pose", "laughing"], ["dancing", "looking_at_another"]],
        "prop": [["bouquet", "ribbon", "confetti"], ["balloon", "flag", "banner"], ["cake", "flower_arch", "lantern"]],
        "scene_detail": [["crowd", "streamer", "colorful"], ["garden", "chair", "soft_light"]],
        "lookup_terms": ["celebration", "bouquet", "parade"],
    },
])

RANDOM_SFW_OPTIONAL_SLOT_CHANCES = {
    "atmosphere": 0.7,
    "style": 0.9,
}

RANDOM_BAD_LOOKUP_TAGS = {
    "mouth",
    "pose",
    "soft_serve",
    "lighting_cigarette",
    "kiss",
    "softboiled_egg",
    "open_clothes",
    "open_fly",
    "pov",
    "windowboxed",
    "street_fighter",
}

RANDOM_FALLBACK_CHARACTERS = [
    {"character_tag": "hatsune_miku", "copyright_tag": "vocaloid", "subject_hint": "1girl", "score": "100"},
    {"character_tag": "artoria_pendragon_(fate)", "copyright_tag": "fate_(series)", "subject_hint": "1girl", "score": "96"},
    {"character_tag": "ganyu_(genshin_impact)", "copyright_tag": "genshin_impact", "subject_hint": "1girl", "score": "94"},
    {"character_tag": "raiden_shogun", "copyright_tag": "genshin_impact", "subject_hint": "1girl", "score": "92"},
    {"character_tag": "frieren_(sousou_no_frieren)", "copyright_tag": "sousou_no_frieren", "subject_hint": "1girl", "score": "90"},
    {"character_tag": "makima", "copyright_tag": "chainsaw_man", "subject_hint": "1girl", "score": "88"},
    {"character_tag": "hoshino_ai", "copyright_tag": "oshi_no_ko", "subject_hint": "1girl", "score": "86"},
    {"character_tag": "saber_alter", "copyright_tag": "fate/stay_night", "subject_hint": "1girl", "score": "84"},
    {"character_tag": "zhongli_(genshin_impact)", "copyright_tag": "genshin_impact", "subject_hint": "1boy", "score": "82"},
    {"character_tag": "venti_(genshin_impact)", "copyright_tag": "genshin_impact", "subject_hint": "1boy", "score": "80"},
    {"character_tag": "mario", "copyright_tag": "mario_(series)", "subject_hint": "1boy", "score": "78"},
    {"character_tag": "uzumaki_naruto", "copyright_tag": "naruto_(series)", "subject_hint": "1boy", "score": "78"},
    {"character_tag": "monkey_d._luffy", "copyright_tag": "one_piece", "subject_hint": "1boy", "score": "76"},
    {"character_tag": "gojo_satoru", "copyright_tag": "jujutsu_kaisen", "subject_hint": "1boy", "score": "74"},
    {"character_tag": "levi_(shingeki_no_kyojin)", "copyright_tag": "shingeki_no_kyojin", "subject_hint": "1boy", "score": "72"},
    {"character_tag": "edogawa_conan", "copyright_tag": "detective_conan", "subject_hint": "1boy", "score": "70"},
    {"character_tag": "kirito", "copyright_tag": "sword_art_online", "subject_hint": "1boy", "score": "68"},
    {"character_tag": "link", "copyright_tag": "the_legend_of_zelda", "subject_hint": "1boy", "score": "66"},
    {"character_tag": "sakata_gintoki", "copyright_tag": "gintama", "subject_hint": "1boy", "score": "64"},
    {"character_tag": "kaito_(vocaloid)", "copyright_tag": "vocaloid", "subject_hint": "1boy", "score": "62"},
]

RANDOM_PROMPT_NSFW_CONTENT_LEVEL_WEIGHTS = {
    "suggestive": 62,
    "nudity": 25,
    "explicit": 13,
}

RANDOM_PROMPT_NSFW_SUGGESTIVE_PROFILES = [
    {
        "id": "dev_nsfw_lingerie_editorial",
        "content_level": "suggestive",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.7,
        "association_max": 0,
        "trigger_tags": ["lingerie", "cleavage", "sideboob"],
        "tags": ["1girl", "solo", "lingerie", "cleavage"],
        "setting": [
            ["photo_studio", "backdrop", "studio_light"],
            ["hotel_room", "window", "city_lights"],
            ["boutique", "display_table", "clothes_rack"],
            ["balcony", "curtains", "night"],
        ],
        "pose": [["standing", "hand_on_hip"], ["sitting", "crossed_legs"], ["reclining", "looking_at_viewer"]],
        "action": [["adjusting_clothes", "bra_strap"], ["leaning_forward", "cleavage"], ["looking_back", "sideboob"]],
        "expression": [["teasing_smile", "looking_at_viewer"], ["blush", "parted_lips"], ["confident", "half-closed_eyes"]],
        "body_detail": [["sideboob", "bare_shoulders"], ["cleavage", "thighs"], ["underboob", "midriff"]],
        "lighting": [["studio_lighting", "soft_shadow"], ["window_light", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_wet_shirt_rain",
        "content_level": "suggestive",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.65,
        "association_max": 0,
        "trigger_tags": ["wet_clothes", "see-through_shirt", "no_bra"],
        "tags": ["1girl", "solo", "wet_clothes", "see-through_shirt"],
        "setting": [
            ["rain", "city_street", "puddle"],
            ["bus_stop", "rain", "street_lamp"],
            ["rooftop", "storm_clouds", "railing"],
            ["laundromat", "window", "night"],
        ],
        "pose": [["standing", "arms_at_sides"], ["leaning_forward", "looking_at_viewer"], ["sitting", "from_side"]],
        "action": [["wringing_clothes", "wet_shirt"], ["holding_umbrella", "wet_clothes"], ["shirt_clinging", "no_bra"]],
        "expression": [["embarrassed", "blush"], ["teasing_smile", "looking_at_viewer"], ["surprised", "open_mouth"]],
        "body_detail": [["nipples", "wet_shirt"], ["erect_nipples", "see-through_clothes"], ["underboob", "wet"]],
        "lighting": [["neon_lights", "reflection"], ["overcast", "soft_lighting"]],
    },
    {
        "id": "dev_nsfw_bikini_slip",
        "content_level": "suggestive",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.7,
        "copyright_chance": 0.45,
        "lighting_chance": 0.65,
        "association_max": 0,
        "trigger_tags": ["bikini", "wardrobe_malfunction", "nipples"],
        "tags": ["1girl", "solo", "bikini", "wardrobe_malfunction"],
        "setting": [
            ["beach", "waves", "sunlight"],
            ["poolside", "deck_chair", "water"],
            ["yacht", "ocean", "railing"],
            ["waterfall", "rocks", "mist"],
        ],
        "pose": [["standing", "contrapposto"], ["kneeling", "from_above"], ["sitting", "legs_to_the_side"]],
        "action": [["adjusting_bikini", "bikini_top"], ["bikini_top_lift", "covering_breasts"], ["looking_back", "untied_bikini"]],
        "expression": [["embarrassed", "blush"], ["playful_smile", "looking_at_viewer"], ["surprised", "parted_lips"]],
        "body_detail": [["one_nipple", "tan_lines"], ["sideboob", "water_drops"], ["underboob", "midriff"]],
        "lighting": [["sunlight", "sparkling_water"], ["sunset", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_towel_spa",
        "content_level": "suggestive",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.7,
        "association_max": 0,
        "trigger_tags": ["towel", "towel_slip", "sideboob"],
        "tags": ["1girl", "solo", "towel", "wet"],
        "setting": [
            ["spa", "massage_table", "candle"],
            ["sauna", "wooden_wall", "steam"],
            ["bathroom", "bathtub", "sink"],
            ["pool_locker_room", "bench", "locker"],
        ],
        "pose": [["standing", "holding_towel"], ["sitting", "crossed_legs"], ["reclining", "from_side"]],
        "action": [["towel_slip", "covering_breasts"], ["drying_hair", "towel"], ["adjusting_towel", "looking_at_viewer"]],
        "expression": [["relaxed", "half-closed_eyes"], ["embarrassed", "blush"], ["soft_smile", "looking_at_viewer"]],
        "body_detail": [["sideboob", "wet_hair"], ["one_nipple", "water_drops"], ["bare_back", "shoulders"]],
        "lighting": [["candlelight", "soft_shadow"], ["steam", "diffused_light"]],
    },
    {
        "id": "dev_nsfw_fitting_room",
        "content_level": "suggestive",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.75,
        "copyright_chance": 0.45,
        "lighting_chance": 0.55,
        "association_max": 0,
        "trigger_tags": ["changing_clothes", "underwear", "wardrobe_malfunction"],
        "tags": ["1girl", "solo", "changing_clothes", "underwear"],
        "setting": [
            ["fitting_room", "mirror", "curtain"],
            ["dressing_room", "clothes_rack", "chair"],
            ["walk-in_closet", "wardrobe", "dressing_bench"],
            ["backstage", "costume_rack", "curtains"],
        ],
        "pose": [["standing", "one_leg_raised"], ["sitting", "putting_on_clothes"], ["from_behind", "looking_back"]],
        "action": [["removing_shirt", "bra"], ["pulling_up_stockings", "panties"], ["dress_lift", "adjusting_clothes"]],
        "expression": [["caught_in_the_act", "blush"], ["teasing_smile", "looking_at_viewer"], ["concentrating", "parted_lips"]],
        "body_detail": [["cleavage", "bare_shoulders"], ["sideboob", "thighs"], ["underboob", "midriff"]],
        "lighting": [["fitting_room_lighting", "soft_shadow"], ["backstage_lighting", "depth_of_field"]],
    },
    {
        "id": "dev_nsfw_loose_shirt_morning",
        "content_level": "suggestive",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.7,
        "copyright_chance": 0.45,
        "lighting_chance": 0.75,
        "association_max": 0,
        "trigger_tags": ["oversized_shirt", "no_bra", "button_gap"],
        "tags": ["1girl", "solo", "oversized_shirt", "no_bra"],
        "setting": [
            ["kitchen", "coffee_mug", "morning"],
            ["balcony", "curtains", "sunrise"],
            ["living_room", "couch", "window"],
            ["hotel_room", "window", "cityscape"],
        ],
        "pose": [["stretching", "arms_up"], ["sitting", "crossed_legs"], ["leaning_on_counter", "looking_at_viewer"]],
        "action": [["shirt_slip", "bare_shoulders"], ["button_gap", "holding_cup"], ["arms_up", "shirt_lift"]],
        "expression": [["sleepy", "half-closed_eyes"], ["soft_smile", "looking_at_viewer"], ["yawning", "blush"]],
        "body_detail": [["underboob", "midriff"], ["cleavage", "bare_legs"], ["one_nipple", "loose_clothes"]],
        "lighting": [["morning_light", "soft_shadow"], ["window_light", "backlighting"]],
    },
    {
        "id": "dev_nsfw_backstage_costume",
        "content_level": "suggestive",
        "weight": 1,
        "subject_id": "solo_girl",
        "character_chance": 0.75,
        "copyright_chance": 0.45,
        "lighting_chance": 0.6,
        "association_max": 0,
        "trigger_tags": ["cosplay", "costume_malfunction", "cleavage"],
        "tags": ["1girl", "solo", "cosplay", "costume_malfunction"],
        "setting": [
            ["backstage", "curtains", "costume_rack"],
            ["convention_center", "empty_hall", "poster"],
            ["photo_studio", "props", "backdrop"],
            ["theater_dressing_room", "makeup_table", "light_bulbs"],
        ],
        "pose": [["standing", "adjusting_clothes"], ["kneeling", "looking_up"], ["looking_back", "hand_on_hip"]],
        "action": [["broken_strap", "covering_breasts"], ["zipper_pull", "bare_back"], ["skirt_tug", "thighs"]],
        "expression": [["nervous_smile", "blush"], ["confident", "looking_at_viewer"], ["surprised", "open_mouth"]],
        "body_detail": [["sideboob", "bare_shoulders"], ["cleavage", "thighs"], ["one_nipple", "costume"]],
        "lighting": [["stage_lighting", "rim_lighting"], ["dressing_room_lighting", "soft_shadow"]],
    },
    {
        "id": "dev_nsfw_festival_yukata",
        "content_level": "suggestive",
        "weight": 1,
        "subject_id": "solo_girl",
        "character_chance": 0.7,
        "copyright_chance": 0.45,
        "lighting_chance": 0.7,
        "association_max": 0,
        "trigger_tags": ["yukata", "loose_clothes", "no_bra"],
        "tags": ["1girl", "solo", "yukata", "loose_clothes"],
        "setting": [
            ["festival", "lantern", "food_stall"],
            ["shrine", "torii", "night"],
            ["fireworks", "riverbank", "summer"],
            ["traditional_inn", "veranda", "garden"],
        ],
        "pose": [["standing", "holding_fan"], ["sitting", "knees_together"], ["looking_back", "from_behind"]],
        "action": [["adjusting_yukata", "collarbone"], ["loose_collar", "cleavage"], ["wind_lift", "bare_legs"]],
        "expression": [["shy_smile", "blush"], ["looking_at_viewer", "parted_lips"], ["playful_smile", "wink"]],
        "body_detail": [["cleavage", "bare_shoulders"], ["sideboob", "loose_clothes"], ["thighs", "bare_legs"]],
        "lighting": [["lantern_light", "rim_lighting"], ["fireworks", "backlighting"]],
    },
    {
        "id": "dev_nsfw_fantasy_armor_gap",
        "content_level": "suggestive",
        "weight": 1,
        "subject_id": "solo_girl",
        "character_chance": 0.7,
        "copyright_chance": 0.45,
        "lighting_chance": 0.65,
        "association_max": 0,
        "trigger_tags": ["bikini_armor", "sideboob", "battle_damage"],
        "tags": ["1girl", "solo", "bikini_armor", "fantasy"],
        "setting": [
            ["castle_ruins", "broken_column", "mist"],
            ["dragon_lair", "treasure", "torch"],
            ["enchanted_forest", "glowing_mushroom", "moonlight"],
            ["adventurer_guild", "wooden_table", "fireplace"],
        ],
        "pose": [["standing", "holding_sword"], ["kneeling", "catching_breath"], ["sitting", "armor_removed"]],
        "action": [["adjusting_armor", "broken_strap"], ["battle_damage", "torn_clothes"], ["armor_removed", "covering_breasts"]],
        "expression": [["determined", "blush"], ["exhausted", "parted_lips"], ["confident", "looking_at_viewer"]],
        "body_detail": [["sideboob", "midriff"], ["underboob", "scratches"], ["one_nipple", "torn_clothes"]],
        "lighting": [["torchlight", "dramatic_shadow"], ["moonlight", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_sports_cooldown",
        "content_level": "suggestive",
        "weight": 1,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.6,
        "association_max": 0,
        "trigger_tags": ["sports_bra", "sweat", "clothes_lift"],
        "tags": ["1girl", "solo", "sports_bra", "sweat"],
        "setting": [
            ["gym", "exercise_machine", "exercise_mat"],
            ["running_track", "stadium", "sunset"],
            ["dance_studio", "wooden_floor", "ballet_barre"],
            ["boxing_gym", "punching_bag", "bench"],
        ],
        "pose": [["stretching", "arms_up"], ["sitting", "wiping_sweat"], ["leaning_forward", "hands_on_knees"]],
        "action": [["lifting_shirt", "wiping_sweat"], ["adjusting_sports_bra", "cleavage"], ["drinking_water", "wet_clothes"]],
        "expression": [["out_of_breath", "blush"], ["confident", "looking_at_viewer"], ["relieved", "half-closed_eyes"]],
        "body_detail": [["underboob", "midriff"], ["cleavage", "sweatdrops"], ["sideboob", "toned_body"]],
        "lighting": [["fluorescent_light", "reflection"], ["sunset", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_office_blouse",
        "content_level": "suggestive",
        "weight": 1,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.6,
        "association_max": 0,
        "trigger_tags": ["office_lady", "button_gap", "cleavage"],
        "tags": ["1girl", "solo", "office_lady", "unbuttoned_shirt"],
        "setting": [
            ["office", "desk", "computer"],
            ["meeting_room", "conference_table", "window"],
            ["archive_room", "bookshelf", "file_box"],
            ["elevator", "control_panel", "city_lights"],
        ],
        "pose": [["sitting", "crossed_legs"], ["leaning_over_desk", "looking_at_viewer"], ["standing", "arms_crossed"]],
        "action": [["loosening_necktie", "unbuttoned_shirt"], ["leaning_forward", "button_gap"], ["adjusting_skirt", "thighs"]],
        "expression": [["tired_smile", "half-closed_eyes"], ["confident", "looking_at_viewer"], ["embarrassed", "blush"]],
        "body_detail": [["cleavage", "button_gap"], ["sideboob", "unbuttoned_shirt"], ["thighs", "pantyhose"]],
        "lighting": [["office_lighting", "soft_shadow"], ["window_light", "city_lights"]],
    },
    {
        "id": "dev_nsfw_intimate_couple",
        "content_level": "suggestive",
        "weight": 2,
        "subject_id": "duo",
        "character_chance": 0.5,
        "copyright_chance": 0.3,
        "lighting_chance": 0.7,
        "association_max": 0,
        "trigger_tags": ["kissing", "embrace", "disheveled_clothes"],
        "tags": ["1girl", "1boy", "couple", "intimate"],
        "setting": [
            ["hotel_balcony", "city_lights", "curtains"],
            ["living_room", "couch", "fireplace"],
            ["kitchen", "counter", "night"],
            ["car_interior", "rain", "window"],
        ],
        "pose": [["embracing", "standing"], ["sitting_on_lap", "close-up"], ["against_wall", "from_side"]],
        "action": [["kissing", "hand_on_waist"], ["neck_kiss", "embrace"], ["almost_kissing", "holding_hands"]],
        "expression": [["blush", "half-closed_eyes"], ["soft_smile", "looking_at_another"], ["parted_lips", "heavy_breathing"]],
        "body_detail": [["cleavage", "disheveled_clothes"], ["bare_shoulders", "loose_clothes"], ["thighs", "shirt_tug"]],
        "lighting": [["warm_lighting", "soft_shadow"], ["city_lights", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_male_after_shower",
        "content_level": "suggestive",
        "weight": 1,
        "subject_id": "solo_boy",
        "character_chance": 0.55,
        "copyright_chance": 0.35,
        "lighting_chance": 0.65,
        "association_max": 0,
        "trigger_tags": ["shirtless_male", "towel", "wet_hair"],
        "tags": ["1boy", "solo", "shirtless_male", "towel"],
        "setting": [
            ["bathroom", "shower_glass", "steam"],
            ["locker_room", "bench", "locker"],
            ["hotel_room", "window", "morning"],
            ["poolside", "deck_chair", "water"],
        ],
        "pose": [["standing", "hand_in_hair"], ["sitting", "leaning_back"], ["from_behind", "looking_back"]],
        "action": [["drying_hair", "towel"], ["adjusting_towel", "low_towel"], ["stretching", "arms_up"]],
        "expression": [["relaxed", "half-closed_eyes"], ["confident", "looking_at_viewer"], ["soft_smile", "wet_hair"]],
        "body_detail": [["male_chest", "water_drops"], ["abs", "low_towel"], ["bare_back", "wet"]],
        "lighting": [["steam", "diffused_light"], ["window_light", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_yuri_dressing_room",
        "content_level": "suggestive",
        "weight": 1,
        "subject_id": "duo",
        "character_chance": 0.5,
        "copyright_chance": 0.3,
        "lighting_chance": 0.6,
        "association_max": 0,
        "trigger_tags": ["2girls", "lingerie", "changing_clothes"],
        "tags": ["2girls", "lingerie", "changing_clothes"],
        "setting": [
            ["dressing_room", "makeup_table", "clothes_rack"],
            ["boutique", "fitting_room", "curtain"],
            ["backstage", "costume_rack", "chair"],
            ["bedroom", "wardrobe", "window"],
        ],
        "pose": [["standing", "close_together"], ["sitting", "legs_to_the_side"], ["from_behind", "looking_back"]],
        "action": [["helping_with_clothes", "bra_strap"], ["adjusting_lingerie", "embrace"], ["almost_kissing", "holding_waist"]],
        "expression": [["blush", "looking_at_another"], ["teasing_smile", "looking_at_viewer"], ["shy", "parted_lips"]],
        "body_detail": [["cleavage", "bare_shoulders"], ["sideboob", "thighs"], ["underboob", "midriff"]],
        "lighting": [["dressing_room_lighting", "soft_shadow"], ["window_light", "depth_of_field"]],
    },
    {
        "id": "dev_nsfw_hosiery_focus",
        "content_level": "suggestive",
        "weight": 3,
        "subject_id": "solo_girl",
        "character_chance": 0.7,
        "copyright_chance": 0.45,
        "lighting_chance": 0.7,
        "association_max": 0,
        "trigger_tags": ["hosiery_focus", "legwear"],
        "tags": ["1girl", "solo", "hosiery_focus", "legwear"],
        "setting": [
            ["photo_studio", "seamless_backdrop", "studio_stool"],
            ["boutique", "display_stand", "shoe_display"],
            ["office", "desk", "window_blinds"],
            ["hotel_room", "armchair", "floor_lamp"],
        ],
        "pose": [["sitting", "crossed_legs"], ["standing", "one_leg_raised"], ["reclining", "legs_up"]],
        "action": [["adjusting_legwear", "looking_down"], ["smoothing_stockings", "thighs"], ["pointing_toes", "looking_at_viewer"]],
        "expression": [["confident", "looking_at_viewer"], ["focused", "parted_lips"], ["teasing_smile", "half-closed_eyes"]],
        "body_detail": [
            ["thighhighs", "stocking_tops", "thighs"],
            ["pantyhose", "sheer_legwear", "feet"],
            ["stockings", "garter_straps", "thighs"],
        ],
        "lighting": [["studio_lighting", "leg_highlight"], ["window_light", "soft_shadow"]],
    },
    {
        "id": "dev_nsfw_barefoot_focus",
        "content_level": "suggestive",
        "weight": 3,
        "subject_id": "solo_girl",
        "character_chance": 0.7,
        "copyright_chance": 0.45,
        "lighting_chance": 0.7,
        "association_max": 0,
        "trigger_tags": ["foot_focus", "barefoot"],
        "tags": ["1girl", "solo", "foot_focus", "barefoot"],
        "setting": [
            ["living_room", "soft_rug", "window"],
            ["spa", "footbath", "towel"],
            ["dance_studio", "wooden_floor", "ballet_barre"],
            ["poolside", "deck_chair", "sunlight"],
        ],
        "pose": [["sitting", "one_leg_raised"], ["reclining", "feet_up"], ["standing", "on_tiptoes"]],
        "action": [["removing_shoes", "barefoot"], ["curling_toes", "looking_at_viewer"], ["painting_toenails", "feet"]],
        "expression": [["relaxed", "soft_smile"], ["playful_smile", "looking_at_viewer"], ["focused", "parted_lips"]],
        "body_detail": [
            ["soles", "toes", "feet"],
            ["barefoot", "ankles", "toenails"],
            ["feet", "arched_feet", "toes"],
        ],
        "lighting": [["window_light", "floor_reflection"], ["soft_lighting", "gentle_shadow"]],
    },
]

RANDOM_PROMPT_NSFW_NUDITY_PROFILES = [
    {
        "id": "dev_nsfw_art_model_studio",
        "content_level": "nudity",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.55,
        "copyright_chance": 0.35,
        "lighting_chance": 0.8,
        "association_max": 0,
        "trigger_tags": ["nude", "art_model", "fine_art_parody"],
        "tags": ["1girl", "solo", "nude", "art_model"],
        "setting": [["art_studio", "easel", "canvas"], ["loft", "large_window", "wooden_floor"], ["gallery", "pedestal", "white_wall"]],
        "pose": [["contrapposto", "standing"], ["reclining", "from_side"], ["sitting", "knees_together"]],
        "action": [["posing", "covering_breasts"], ["holding_drapery", "looking_away"], ["arms_up", "looking_at_viewer"]],
        "expression": [["calm", "looking_away"], ["soft_smile", "looking_at_viewer"], ["serious", "half-closed_eyes"]],
        "body_detail": [["nipples", "natural_breasts"], ["bare_back", "body_curve"], ["pubic_hair", "thighs"]],
        "lighting": [["north_light", "soft_shadow"], ["chiaroscuro", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_quiet_onsen",
        "content_level": "nudity",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.6,
        "copyright_chance": 0.4,
        "lighting_chance": 0.75,
        "association_max": 0,
        "trigger_tags": ["nude", "onsen", "towel"],
        "tags": ["1girl", "solo", "nude", "onsen"],
        "setting": [["outdoor_onsen", "rocks", "steam"], ["bathhouse", "wooden_wall", "water"], ["mountain_inn", "snow", "hot_spring"]],
        "pose": [["sitting", "knees_together"], ["standing", "from_behind"], ["reclining", "arms_on_edge"]],
        "action": [["entering_water", "covering_breasts"], ["washing_hair", "eyes_closed"], ["holding_towel", "looking_at_viewer"]],
        "expression": [["relaxed", "eyes_closed"], ["embarrassed", "blush"], ["soft_smile", "looking_at_viewer"]],
        "body_detail": [["nipples", "water_drops"], ["bare_back", "wet_hair"], ["sideboob", "steam"]],
        "lighting": [["lantern_light", "steam"], ["moonlight", "diffused_light"]],
    },
    {
        "id": "dev_nsfw_steam_shower",
        "content_level": "nudity",
        "weight": 1,
        "subject_id": "solo_girl",
        "character_chance": 0.6,
        "copyright_chance": 0.4,
        "lighting_chance": 0.8,
        "association_max": 0,
        "trigger_tags": ["nude", "shower", "steam"],
        "tags": ["1girl", "solo", "nude", "shower"],
        "setting": [["glass_shower", "tile_wall", "steam"], ["rain_shower", "bathroom", "mirror"], ["outdoor_shower", "wooden_fence", "plants"]],
        "pose": [["standing", "from_side"], ["from_behind", "looking_back"], ["leaning_on_wall", "eyes_closed"]],
        "action": [["washing_hair", "arms_up"], ["hand_on_glass", "looking_at_viewer"], ["holding_shower_head", "wet_hair"]],
        "expression": [["relaxed", "eyes_closed"], ["blush", "parted_lips"], ["soft_smile", "looking_at_viewer"]],
        "body_detail": [["nipples", "water_drops"], ["bare_back", "wet"], ["body_curve", "steam"]],
        "lighting": [["backlighting", "steam"], ["bathroom_light", "reflection"]],
    },
    {
        "id": "dev_nsfw_moonlit_nude_beach",
        "content_level": "nudity",
        "weight": 1,
        "subject_id": "solo_girl",
        "character_chance": 0.55,
        "copyright_chance": 0.35,
        "lighting_chance": 0.8,
        "association_max": 0,
        "trigger_tags": ["nude", "beach", "moonlight"],
        "tags": ["1girl", "solo", "nude", "outdoors"],
        "setting": [["beach", "waves", "moonlight"], ["secluded_cove", "rocks", "night"], ["lakeshore", "reeds", "stars"]],
        "pose": [["walking", "from_behind"], ["kneeling", "from_side"], ["standing", "covering_breasts"]],
        "action": [["entering_water", "looking_back"], ["holding_clothes", "barefoot"], ["covering_breasts", "looking_at_viewer"]],
        "expression": [["calm", "looking_away"], ["embarrassed", "blush"], ["playful_smile", "looking_at_viewer"]],
        "body_detail": [["nipples", "wet_skin"], ["bare_back", "body_curve"], ["pubic_hair", "thighs"]],
        "lighting": [["moonlight", "rim_lighting"], ["starlight", "reflection"]],
    },
    {
        "id": "dev_nsfw_body_paint",
        "content_level": "nudity",
        "weight": 1,
        "subject_id": "solo_girl",
        "character_chance": 0.6,
        "copyright_chance": 0.4,
        "lighting_chance": 0.75,
        "association_max": 0,
        "trigger_tags": ["nude", "bodypaint", "paint_splatter"],
        "tags": ["1girl", "solo", "nude", "bodypaint"],
        "setting": [["photo_studio", "paint_bucket", "backdrop"], ["art_workshop", "canvas", "drop_cloth"], ["festival_stage", "spotlight", "dark_background"]],
        "pose": [["standing", "arms_out"], ["sitting", "crossed_legs"], ["turning", "looking_back"]],
        "action": [["painting_body", "paintbrush"], ["handprint", "covering_breasts"], ["posing", "looking_at_viewer"]],
        "expression": [["playful_smile", "looking_at_viewer"], ["focused", "parted_lips"], ["confident", "half-closed_eyes"]],
        "body_detail": [["painted_nipples", "paint_splatter"], ["bare_back", "bodypaint"], ["body_curve", "colorful_paint"]],
        "lighting": [["studio_lighting", "high_contrast"], ["spotlight", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_fantasy_ritual_nude",
        "content_level": "nudity",
        "weight": 1,
        "subject_id": "solo_girl",
        "character_chance": 0.6,
        "copyright_chance": 0.4,
        "lighting_chance": 0.85,
        "association_max": 0,
        "trigger_tags": ["nude", "magic_circle", "fantasy"],
        "tags": ["1girl", "solo", "nude", "fantasy"],
        "setting": [["ancient_temple", "altar", "candle"], ["forest_shrine", "magic_circle", "fireflies"], ["crystal_cave", "glowing_crystal", "water"]],
        "pose": [["kneeling", "hands_together"], ["standing", "arms_up"], ["floating", "arched_back"]],
        "action": [["casting_spell", "covering_breasts"], ["ritual", "eyes_closed"], ["holding_crystal", "looking_at_viewer"]],
        "expression": [["serene", "eyes_closed"], ["entranced", "parted_lips"], ["mysterious_smile", "looking_at_viewer"]],
        "body_detail": [["nipples", "glowing_markings"], ["bare_back", "magic_runes"], ["body_curve", "floating_hair"]],
        "lighting": [["candlelight", "chiaroscuro"], ["magic_glow", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_bedsheet_implied",
        "content_level": "nudity",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.8,
        "association_max": 0,
        "trigger_tags": ["implied_nude", "bedsheet", "sideboob"],
        "tags": ["1girl", "solo", "implied_nude", "bedsheet"],
        "setting": [["hotel_room", "large_window", "morning"], ["loft_bedroom", "brick_wall", "sunlight"], ["cabin", "fireplace", "blanket"]],
        "pose": [["sitting", "wrapped_in_sheet"], ["reclining", "from_side"], ["standing", "holding_sheet"]],
        "action": [["sheet_slip", "covering_breasts"], ["stretching", "bare_shoulders"], ["looking_back", "wrapped_in_sheet"]],
        "expression": [["sleepy", "half-closed_eyes"], ["soft_smile", "looking_at_viewer"], ["embarrassed", "blush"]],
        "body_detail": [["sideboob", "bare_back"], ["one_nipple", "sheet_slip"], ["body_curve", "bare_shoulders"]],
        "lighting": [["morning_light", "soft_shadow"], ["firelight", "warm_lighting"]],
    },
    {
        "id": "dev_nsfw_topless_sunbath",
        "content_level": "nudity",
        "weight": 1,
        "subject_id": "solo_girl",
        "character_chance": 0.6,
        "copyright_chance": 0.4,
        "lighting_chance": 0.8,
        "association_max": 0,
        "trigger_tags": ["topless", "sunbathing", "tan_lines"],
        "tags": ["1girl", "solo", "topless", "sunbathing"],
        "setting": [["private_pool", "deck_chair", "sunlight"], ["rooftop_terrace", "parasol", "cityscape"], ["secluded_beach", "beach_towel", "waves"]],
        "pose": [["lying_on_back", "arms_up"], ["lying_on_stomach", "looking_back"], ["sitting", "knees_up"]],
        "action": [["applying_sunscreen", "topless"], ["adjusting_sunglasses", "looking_at_viewer"], ["covering_breasts", "sitting_up"]],
        "expression": [["relaxed", "eyes_closed"], ["playful_smile", "looking_at_viewer"], ["surprised", "blush"]],
        "body_detail": [["nipples", "tan_lines"], ["sideboob", "oiled_skin"], ["bare_back", "sunlight"]],
        "lighting": [["bright_sunlight", "hard_shadow"], ["golden_hour", "rim_lighting"]],
    },
]

RANDOM_PROMPT_NSFW_AXIS_CONTEXTS = {
    "dev_nsfw_lingerie_editorial": {"fashion", "private", "studio"},
    "dev_nsfw_wet_shirt_rain": {"wet", "urban", "outdoor"},
    "dev_nsfw_bikini_slip": {"wet", "leisure", "outdoor"},
    "dev_nsfw_towel_spa": {"wet", "wellness", "private"},
    "dev_nsfw_fitting_room": {"fashion", "private", "performance"},
    "dev_nsfw_loose_shirt_morning": {"home", "private", "urban"},
    "dev_nsfw_backstage_costume": {"fashion", "performance", "studio"},
    "dev_nsfw_festival_yukata": {"festival", "outdoor", "traditional"},
    "dev_nsfw_fantasy_armor_gap": {"fantasy", "outdoor", "performance"},
    "dev_nsfw_sports_cooldown": {"sports", "wet", "public"},
    "dev_nsfw_office_blouse": {"work", "urban", "indoor"},
    "dev_nsfw_intimate_couple": {"intimate", "private", "urban"},
    "dev_nsfw_male_after_shower": {"wet", "wellness", "sports", "private"},
    "dev_nsfw_yuri_dressing_room": {"intimate", "fashion", "private"},
    "dev_nsfw_hosiery_focus": {"fashion", "private", "work", "studio"},
    "dev_nsfw_barefoot_focus": {"home", "private", "leisure", "studio", "wellness"},
    "dev_nsfw_art_model_studio": {"art", "studio", "private"},
    "dev_nsfw_quiet_onsen": {"wet", "wellness", "nature"},
    "dev_nsfw_steam_shower": {"wet", "wellness", "private"},
    "dev_nsfw_moonlit_nude_beach": {"wet", "nature", "outdoor"},
    "dev_nsfw_body_paint": {"art", "studio", "performance"},
    "dev_nsfw_fantasy_ritual_nude": {"fantasy", "ritual", "nature"},
    "dev_nsfw_bedsheet_implied": {"home", "private", "studio"},
    "dev_nsfw_topless_sunbath": {"leisure", "outdoor", "nature"},
}

RANDOM_PROMPT_NSFW_AXIS_SUBJECTS = {
    "suggestive": [
        {
            "id": "solo_girl",
            "weight": 58,
            "subject_id": "solo_girl",
            "tags": ["1girl", "solo"],
            "exclude_profiles": ["dev_nsfw_intimate_couple", "dev_nsfw_male_after_shower"],
            "character_chance": 0.65,
            "copyright_chance": 0.4,
        },
        {
            "id": "two_girls",
            "weight": 17,
            "subject_id": "duo",
            "tags": ["2girls"],
            "exclude_profiles": ["dev_nsfw_intimate_couple", "dev_nsfw_male_after_shower"],
            "interaction": [
                ["close_together", "looking_at_another"],
                ["helping_with_clothes", "blush"],
                ["holding_waist", "looking_at_viewer"],
            ],
            "interaction_chance": 0.75,
            "character_chance": 0.5,
            "copyright_chance": 0.3,
        },
        {
            "id": "couple",
            "weight": 17,
            "subject_id": "duo",
            "tags": ["1girl", "1boy", "couple"],
            "exclude_profiles": ["dev_nsfw_male_after_shower", "dev_nsfw_yuri_dressing_room"],
            "interaction": [
                ["standing_close", "looking_at_another"],
                ["hand_on_waist", "blush"],
                ["embrace", "almost_kissing"],
            ],
            "interaction_chance": 0.8,
            "character_chance": 0.45,
            "copyright_chance": 0.25,
        },
        {
            "id": "solo_boy",
            "weight": 8,
            "subject_id": "solo_boy",
            "tags": ["1boy", "solo"],
            "include_profiles": ["dev_nsfw_male_after_shower"],
            "character_chance": 0.5,
            "copyright_chance": 0.3,
        },
    ],
    "nudity": [
        {
            "id": "solo_girl",
            "weight": 70,
            "subject_id": "solo_girl",
            "tags": ["1girl", "solo"],
            "character_chance": 0.6,
            "copyright_chance": 0.4,
        },
        {
            "id": "two_girls",
            "weight": 18,
            "subject_id": "duo",
            "tags": ["2girls"],
            "interaction": [
                ["standing_close", "looking_at_another"],
                ["sharing_towel", "blush"],
                ["back-to-back", "looking_at_viewer"],
            ],
            "interaction_chance": 0.7,
            "character_chance": 0.45,
            "copyright_chance": 0.25,
        },
        {
            "id": "couple",
            "weight": 12,
            "subject_id": "duo",
            "tags": ["1girl", "1boy", "couple"],
            "interaction": [
                ["standing_close", "looking_at_another"],
                ["covering_each_other", "blush"],
                ["holding_hands", "looking_away"],
            ],
            "interaction_chance": 0.75,
            "character_chance": 0.4,
            "copyright_chance": 0.25,
        },
    ],
}

RANDOM_PROMPT_NSFW_AXIS_ACTIVITIES = {
    "suggestive": [
        {
            "id": "editorial_pose",
            "weight": 3,
            "contexts": ["fashion", "studio", "private", "performance", "leisure"],
            "trigger_tags": ["posing"],
            "pose": [["standing", "hand_on_hip"], ["reclining", "looking_at_viewer"], ["sitting", "crossed_legs"]],
            "action": [["posing", "looking_at_viewer"], ["turning", "looking_back"], ["leaning_forward", "parted_lips"]],
        },
        {
            "id": "adjusting_outfit",
            "weight": 3,
            "contexts": ["fashion", "private", "work", "festival", "performance", "sports"],
            "trigger_tags": ["adjusting_clothes"],
            "pose": [["standing", "looking_down"], ["sitting", "knees_together"], ["from_behind", "looking_back"]],
            "action": [["adjusting_clothes", "looking_down"], ["fixing_strap", "bare_shoulders"], ["smoothing_fabric", "hand_on_hip"]],
        },
        {
            "id": "caught_in_rain",
            "weight": 2,
            "contexts": ["wet", "urban", "outdoor"],
            "trigger_tags": ["rain", "wet_clothes"],
            "pose": [["standing", "arms_at_sides"], ["walking", "looking_back"], ["leaning_on_wall", "from_side"]],
            "action": [["holding_umbrella", "wet_clothes"], ["wringing_clothes", "water_drops"], ["brushing_wet_hair", "looking_at_viewer"]],
        },
        {
            "id": "drying_off",
            "weight": 2,
            "contexts": ["wet", "wellness", "leisure", "home", "sports"],
            "trigger_tags": ["drying_off", "wet_hair"],
            "pose": [["standing", "arms_up"], ["sitting", "leaning_back"], ["from_behind", "looking_back"]],
            "action": [["drying_hair", "water_drops"], ["wiping_shoulders", "wet_hair"], ["shaking_out_hair", "eyes_closed"]],
        },
        {
            "id": "mirror_check",
            "weight": 1,
            "contexts": ["fashion", "work", "studio"],
            "trigger_tags": ["mirror", "checking_clothes"],
            "pose": [["standing", "facing_mirror"], ["sitting", "from_side"], ["turning", "looking_back"]],
            "action": [["checking_clothes", "mirror"], ["touching_hair", "looking_at_reflection"], ["leaning_toward_mirror", "parted_lips"]],
        },
        {
            "id": "stretching_break",
            "weight": 2,
            "contexts": ["sports", "home", "work", "wellness", "private"],
            "trigger_tags": ["stretching"],
            "pose": [["stretching", "arms_up"], ["leaning_forward", "hands_on_knees"], ["sitting", "one_leg_raised"]],
            "action": [["stretching", "arms_up"], ["catching_breath", "sweatdrops"], ["reaching_for_water", "looking_at_viewer"]],
        },
        {
            "id": "windy_walk",
            "weight": 2,
            "contexts": ["outdoor", "festival", "urban", "leisure", "fantasy"],
            "trigger_tags": ["wind", "walking"],
            "pose": [["walking", "from_side"], ["standing", "looking_back"], ["one_leg_raised", "full_body"]],
            "action": [["holding_clothes", "wind"], ["brushing_hair_aside", "looking_at_viewer"], ["walking", "clothes_fluttering"]],
        },
        {
            "id": "poolside_break",
            "weight": 2,
            "contexts": ["wet", "leisure", "outdoor", "sports"],
            "trigger_tags": ["wet_hair", "water_drops"],
            "pose": [["sitting", "legs_to_the_side"], ["kneeling", "from_above"], ["standing", "contrapposto"]],
            "action": [["stepping_out_of_water", "water_drops"], ["sitting_on_edge", "feet_in_water"], ["looking_over_shoulder", "wet_hair"]],
        },
        {
            "id": "backstage_prep",
            "weight": 2,
            "contexts": ["performance", "fashion", "studio"],
            "trigger_tags": ["backstage", "preparing"],
            "pose": [["standing", "one_leg_raised"], ["sitting", "looking_down"], ["turning", "from_behind"]],
            "action": [["preparing_for_show", "checking_clothes"], ["walking_between_props", "looking_back"], ["waiting_by_curtain", "parted_lips"]],
        },
        {
            "id": "morning_routine",
            "weight": 2,
            "contexts": ["home", "private", "work", "urban"],
            "trigger_tags": ["morning", "casual"],
            "pose": [["stretching", "arms_up"], ["leaning_on_counter", "looking_at_viewer"], ["sitting", "crossed_legs"]],
            "action": [["holding_cup", "sleepy"], ["opening_curtains", "backlighting"], ["reaching_for_clothes", "looking_back"]],
        },
        {
            "id": "dance_rehearsal",
            "weight": 1,
            "contexts": ["performance", "sports", "festival", "studio"],
            "trigger_tags": ["dancing", "rehearsal"],
            "pose": [["dancing", "one_leg_raised"], ["arms_up", "arched_back"], ["turning", "full_body"]],
            "action": [["rehearsing", "clothes_fluttering"], ["finishing_pose", "looking_at_viewer"], ["spinning", "hair_flow"]],
        },
        {
            "id": "fantasy_rest",
            "weight": 1,
            "contexts": ["fantasy", "outdoor", "performance"],
            "trigger_tags": ["fantasy", "resting"],
            "pose": [["kneeling", "catching_breath"], ["sitting", "leaning_back"], ["standing", "looking_at_viewer"]],
            "action": [["resting_after_battle", "looking_down"], ["holding_accessory", "wind"], ["walking_through_ruins", "looking_back"]],
        },
        {
            "id": "quiet_flirt",
            "weight": 2,
            "contexts": ["intimate", "private", "urban", "home"],
            "subjects": ["two_girls", "couple"],
            "trigger_tags": ["flirting"],
            "pose": [["standing_close", "from_side"], ["sitting_together", "close-up"], ["against_wall", "eye_level"]],
            "action": [["almost_kissing", "looking_at_another"], ["whispering", "hand_on_waist"], ["sharing_a_drink", "blush"]],
        },
        {
            "id": "window_pose",
            "weight": 2,
            "contexts": ["private", "urban", "studio", "work", "home"],
            "trigger_tags": ["window", "backlighting"],
            "pose": [["standing", "from_behind"], ["sitting_on_windowsill", "from_side"], ["leaning_on_window", "looking_at_viewer"]],
            "action": [["opening_window", "wind"], ["looking_over_city", "bare_shoulders"], ["touching_glass", "looking_at_viewer"]],
        },
    ],
    "nudity": [
        {
            "id": "fine_art_pose",
            "weight": 3,
            "contexts": ["art", "studio", "private"],
            "trigger_tags": ["art_model", "posing"],
            "pose": [["contrapposto", "standing"], ["reclining", "from_side"], ["sitting", "knees_together"]],
            "action": [["posing", "looking_away"], ["holding_drapery", "looking_at_viewer"], ["turning", "bare_back"]],
        },
        {
            "id": "quiet_bathing",
            "weight": 3,
            "contexts": ["wet", "wellness", "nature"],
            "trigger_tags": ["bathing", "water"],
            "pose": [["sitting", "knees_together"], ["reclining", "arms_on_edge"], ["standing", "from_behind"]],
            "action": [["entering_water", "looking_back"], ["washing_hair", "eyes_closed"], ["resting_in_water", "looking_at_viewer"]],
        },
        {
            "id": "steam_shower",
            "weight": 2,
            "contexts": ["wet", "wellness", "private"],
            "trigger_tags": ["shower", "steam"],
            "pose": [["standing", "from_side"], ["leaning_on_wall", "eyes_closed"], ["from_behind", "looking_back"]],
            "action": [["washing_hair", "arms_up"], ["hand_on_glass", "looking_at_viewer"], ["holding_shower_head", "wet_hair"]],
        },
        {
            "id": "waterside_walk",
            "weight": 2,
            "contexts": ["wet", "nature", "outdoor", "leisure"],
            "trigger_tags": ["waterside", "walking"],
            "pose": [["walking", "from_behind"], ["kneeling", "from_side"], ["standing", "covering_breasts"]],
            "action": [["entering_water", "looking_back"], ["walking_on_shore", "wind"], ["holding_clothes", "barefoot"]],
        },
        {
            "id": "body_painting",
            "weight": 2,
            "contexts": ["art", "studio", "performance"],
            "trigger_tags": ["bodypaint", "paintbrush"],
            "pose": [["standing", "arms_out"], ["sitting", "crossed_legs"], ["turning", "looking_back"]],
            "action": [["painting_body", "paintbrush"], ["posing_with_paint", "looking_at_viewer"], ["holding_paint_palette", "parted_lips"]],
        },
        {
            "id": "fantasy_ritual",
            "weight": 1,
            "contexts": ["fantasy", "ritual", "nature"],
            "trigger_tags": ["ritual", "magic_circle"],
            "pose": [["kneeling", "hands_together"], ["standing", "arms_up"], ["floating", "arched_back"]],
            "action": [["casting_spell", "eyes_closed"], ["holding_crystal", "looking_at_viewer"], ["walking_through_magic_circle", "floating_hair"]],
        },
        {
            "id": "wrapped_morning",
            "weight": 2,
            "contexts": ["home", "private", "studio"],
            "trigger_tags": ["bedsheet", "morning"],
            "pose": [["sitting", "wrapped_in_sheet"], ["reclining", "from_side"], ["standing", "holding_sheet"]],
            "action": [["stretching", "bare_shoulders"], ["opening_curtains", "backlighting"], ["looking_back", "holding_sheet"]],
        },
        {
            "id": "sunbathing",
            "weight": 2,
            "contexts": ["leisure", "outdoor", "nature"],
            "trigger_tags": ["sunbathing", "sunlight"],
            "pose": [["lying_on_back", "arms_up"], ["lying_on_stomach", "looking_back"], ["sitting", "knees_up"]],
            "action": [["applying_sunscreen", "eyes_closed"], ["adjusting_sunglasses", "looking_at_viewer"], ["sitting_up", "wind"]],
        },
        {
            "id": "drying_after_bath",
            "weight": 2,
            "contexts": ["wet", "wellness", "private", "home"],
            "trigger_tags": ["drying_off", "wet_hair"],
            "pose": [["standing", "arms_up"], ["sitting", "leaning_back"], ["from_behind", "looking_back"]],
            "action": [["drying_hair", "water_drops"], ["wiping_shoulders", "wet_hair"], ["wiping_neck", "looking_at_viewer"]],
        },
    ],
}

RANDOM_PROMPT_NSFW_AXIS_EVENTS = [
    {
        "id": "sudden_weather",
        "weight": 3,
        "levels": ["suggestive", "nudity"],
        "contexts": ["wet", "outdoor", "urban", "nature", "festival", "fantasy"],
        "activities": ["caught_in_rain", "windy_walk", "waterside_walk"],
        "setup": [["sudden_rain", "caught_unprepared"], ["wind_gust", "air_turning_cold"]],
        "turn": [["reaching_for_cover", "turning_away"], ["holding_clothes", "looking_back"]],
        "reaction": [["startled", "blush"], ["surprised", "parted_lips"]],
        "effect": [["water_dripping", "wet_skin"], ["windblown_hair", "goosebumps"]],
    },
    {
        "id": "garment_shift",
        "weight": 3,
        "levels": ["suggestive"],
        "contexts": ["fashion", "private", "performance", "studio", "work"],
        "activities": ["editorial_pose", "adjusting_outfit", "backstage_prep", "dance_rehearsal"],
        "subjects": ["solo_girl", "two_girls", "couple"],
        "setup": [["loose_strap", "wardrobe_malfunction"], ["fabric_caught", "clothes_shift"]],
        "turn": [["fixing_strap", "covering_breasts"], ["freezing_mid-pose", "reaching_for_clothes"]],
        "reaction": [["embarrassed", "blush"], ["nervous_smile", "looking_at_viewer"]],
        "effect": [["bare_shoulders", "sideboob"], ["slipped_fabric", "one_nipple"]],
    },
    {
        "id": "mirror_discovery",
        "weight": 1,
        "levels": ["suggestive"],
        "contexts": ["fashion", "work", "studio"],
        "activities": ["mirror_check"],
        "setup": [["mirror_reflection", "door_ajar"], ["checking_clothes", "unnoticed_viewer"]],
        "turn": [["noticing_reflection", "turning_head"], ["reaching_for_cover", "looking_over_shoulder"]],
        "reaction": [["caught_in_the_act", "blush"], ["surprised", "open_mouth"]],
        "effect": [["fabric_slipped", "bare_shoulders"], ["water_drops", "fogged_mirror"]],
    },
    {
        "id": "interrupted_routine",
        "weight": 3,
        "levels": ["suggestive", "nudity"],
        "contexts": ["home", "private", "work", "urban", "wellness"],
        "activities": ["morning_routine", "stretching_break", "window_pose", "wrapped_morning", "drying_after_bath"],
        "setup": [["door_opening", "unexpected_visitor"], ["footsteps_approaching", "caught_off_guard"]],
        "turn": [["freezing_mid-action", "looking_toward_door"], ["reaching_for_clothes", "turning_away"]],
        "reaction": [["sleepy_surprise", "blush"], ["startled", "parted_lips"]],
        "effect": [["loose_fabric", "bare_shoulders"], ["doorway_light", "moving_shadow"]],
    },
    {
        "id": "camera_direction",
        "weight": 3,
        "levels": ["suggestive", "nudity"],
        "contexts": ["fashion", "studio", "performance", "art", "private"],
        "activities": ["editorial_pose", "backstage_prep", "dance_rehearsal", "fine_art_pose", "body_painting"],
        "setup": [["camera_flash", "photographer_cue"], ["studio_silence", "camera_ready"]],
        "turn": [["changing_pose", "turning_toward_camera"], ["holding_pose", "chin_up"]],
        "reaction": [["confident_gaze", "parted_lips"], ["shy_smile", "blush"]],
        "effect": [["hair_movement", "rim_light"], ["body_curve", "cast_shadow"]],
    },
    {
        "id": "water_exit",
        "weight": 3,
        "levels": ["suggestive", "nudity"],
        "contexts": ["wet", "wellness", "leisure", "nature", "outdoor"],
        "activities": ["poolside_break", "drying_off", "quiet_bathing", "steam_shower", "waterside_walk", "drying_after_bath"],
        "wardrobes": [
            "dev_nsfw_wet_shirt_rain", "dev_nsfw_bikini_slip", "dev_nsfw_towel_spa",
            "dev_nsfw_sports_cooldown", "dev_nsfw_male_after_shower", "dev_nsfw_quiet_onsen",
            "dev_nsfw_steam_shower", "dev_nsfw_moonlit_nude_beach", "dev_nsfw_topless_sunbath",
        ],
        "setup": [["stepping_out_of_water", "wet_hair"], ["water_surface_breaking", "water_dripping"]],
        "turn": [["brushing_hair_back", "reaching_for_edge"], ["pausing_mid-step", "looking_up"]],
        "reaction": [["noticing_viewer", "blush"], ["soft_surprise", "parted_lips"]],
        "effect": [["water_dripping", "wet_skin"], ["wet_footprints", "reflected_light"]],
    },
    {
        "id": "backstage_countdown",
        "weight": 2,
        "levels": ["suggestive"],
        "contexts": ["performance", "fashion", "studio", "festival"],
        "activities": ["adjusting_outfit", "backstage_prep", "dance_rehearsal"],
        "wardrobes": [
            "dev_nsfw_fitting_room", "dev_nsfw_backstage_costume", "dev_nsfw_festival_yukata",
            "dev_nsfw_fantasy_armor_gap", "dev_nsfw_yuri_dressing_room",
        ],
        "setup": [["stage_call", "curtain_opening"], ["countdown", "audience_noise"]],
        "turn": [["last_adjustment", "stepping_into_light"], ["holding_curtain", "looking_back"]],
        "reaction": [["nervous_smile", "blush"], ["focused_gaze", "deep_breath"]],
        "effect": [["spotlight", "clothes_fluttering"], ["stage_haze", "rim_light"]],
    },
    {
        "id": "exercise_pause",
        "weight": 2,
        "levels": ["suggestive"],
        "contexts": ["sports", "wellness", "studio", "leisure"],
        "activities": ["stretching_break", "dance_rehearsal", "poolside_break"],
        "setup": [["exercise_ended", "heavy_breathing"], ["music_stopped", "catching_breath"]],
        "turn": [["wiping_sweat", "reaching_for_water"], ["leaning_forward", "looking_up"]],
        "reaction": [["noticing_gaze", "playful_smile"], ["out_of_breath", "blush"]],
        "effect": [["sweatdrops", "fabric_clinging"], ["flushed_skin", "loose_hair"]],
    },
    {
        "id": "magic_surge",
        "weight": 3,
        "levels": ["suggestive", "nudity"],
        "contexts": ["fantasy", "ritual", "nature"],
        "activities": ["fantasy_rest", "fantasy_ritual", "quiet_bathing", "sunbathing"],
        "setup": [["magic_pulse", "glowing_circle"], ["crystal_flare", "sudden_wind"]],
        "turn": [["losing_balance", "raising_hands"], ["turning_toward_light", "floating"]],
        "reaction": [["entranced", "parted_lips"], ["surprised", "wide_eyes"]],
        "effect": [["floating_hair", "glowing_markings"], ["spark_particles", "rim_light"]],
    },
    {
        "id": "quiet_flirt_event",
        "weight": 3,
        "levels": ["suggestive"],
        "contexts": ["intimate", "private", "urban", "home"],
        "activities": ["quiet_flirt"],
        "subjects": ["two_girls", "couple"],
        "setup": [["private_whisper", "close_distance"], ["shared_glance", "room_quiet"]],
        "turn": [["leaning_closer", "hand_on_waist"], ["almost_kissing", "holding_breath"]],
        "reaction": [["shared_blush", "half-closed_eyes"], ["shy_smile", "looking_at_another"]],
        "effect": [["disheveled_clothes", "curtain_sway"], ["warm_breath", "loose_strap"]],
    },
    {
        "id": "sheet_slip",
        "weight": 3,
        "levels": ["nudity"],
        "contexts": ["home", "private", "studio", "urban"],
        "activities": ["wrapped_morning"],
        "wardrobes": ["dev_nsfw_bedsheet_implied"],
        "setup": [["sheet_loosened", "curtain_opening"], ["fabric_sliding", "morning_breeze"]],
        "turn": [["clutching_sheet", "sitting_up"], ["reaching_for_edge", "turning_away"]],
        "reaction": [["sleepy_surprise", "blush"], ["embarrassed_smile", "looking_at_viewer"]],
        "effect": [["exposed_shoulders", "sideboob"], ["bare_back", "sunlight_on_skin"]],
    },
    {
        "id": "sunbath_interruption",
        "weight": 2,
        "levels": ["suggestive", "nudity"],
        "contexts": ["leisure", "outdoor", "nature", "wet"],
        "activities": ["sunbathing", "poolside_break"],
        "wardrobes": [
            "dev_nsfw_bikini_slip", "dev_nsfw_wet_shirt_rain", "dev_nsfw_topless_sunbath",
            "dev_nsfw_moonlit_nude_beach",
        ],
        "setup": [["shadow_falling", "footsteps_nearby"], ["breeze_rising", "parasol_moving"]],
        "turn": [["sitting_up", "covering_breasts"], ["turning_toward_sound", "reaching_for_cover"]],
        "reaction": [["surprised", "blush"], ["playful_smile", "looking_at_viewer"]],
        "effect": [["sunscreen_shine", "tan_lines"], ["windblown_hair", "goosebumps"]],
    },
    {
        "id": "bodypaint_progress",
        "weight": 3,
        "levels": ["nudity"],
        "contexts": ["art", "studio", "performance"],
        "activities": ["body_painting", "fine_art_pose"],
        "setup": [["unfinished_bodypaint", "wet_paint"], ["new_color_mixed", "paintbrush_ready"]],
        "turn": [["brush_across_skin", "changing_stance"], ["holding_still", "looking_down"]],
        "reaction": [["focused", "parted_lips"], ["playful_smile", "looking_at_viewer"]],
        "effect": [["paint_drip", "colorful_handprint"], ["paint_splatter", "glossy_skin"]],
    },
    {
        "id": "spa_interruption",
        "weight": 3,
        "levels": ["suggestive", "nudity"],
        "contexts": ["wet", "wellness", "private"],
        "activities": ["drying_off", "quiet_bathing", "steam_shower", "drying_after_bath"],
        "wardrobes": [
            "dev_nsfw_wet_shirt_rain", "dev_nsfw_towel_spa", "dev_nsfw_male_after_shower",
            "dev_nsfw_quiet_onsen", "dev_nsfw_steam_shower", "dev_nsfw_moonlit_nude_beach",
        ],
        "setup": [["steam_clearing", "door_sliding_open"], ["unexpected_sound", "fogged_glass"]],
        "turn": [["turning_away", "reaching_for_cover"], ["pausing_mid-motion", "looking_over_shoulder"]],
        "reaction": [["startled", "blush"], ["embarrassed", "parted_lips"]],
        "effect": [["water_drops", "steam_trail"], ["wet_hair", "reflection"]],
    },
    {
        "id": "pose_break",
        "weight": 2,
        "levels": ["suggestive", "nudity"],
        "contexts": ["fashion", "studio", "art", "performance", "private"],
        "activities": ["editorial_pose", "fine_art_pose", "body_painting"],
        "setup": [["long_pose", "studio_quiet"], ["lighting_adjustment", "holding_still"]],
        "turn": [["relaxing_pose", "stretching_arms"], ["changing_stance", "looking_toward_camera"]],
        "reaction": [["calm_gaze", "half-closed_eyes"], ["soft_smile", "parted_lips"]],
        "effect": [["body_curve", "soft_shadow"], ["hair_falling_loose", "rim_light"]],
    },
    {
        "id": "accidental_reach",
        "weight": 3,
        "levels": ["suggestive"],
        "contexts": ["home", "private", "work", "fashion", "sports"],
        "activities": ["stretching_break", "morning_routine", "adjusting_outfit", "window_pose"],
        "subjects": ["solo_girl", "two_girls", "couple"],
        "setup": [["object_out_of_reach", "unaware"], ["fabric_caught", "arms_occupied"]],
        "turn": [["reaching_higher", "arms_up"], ["pulling_free", "looking_down"]],
        "reaction": [["noticing_exposure", "blush"], ["caught_off_guard", "open_mouth"]],
        "effect": [["hem_lifted", "underboob"], ["loose_clothes", "bare_midriff"]],
    },
    {
        "id": "festival_moment",
        "weight": 2,
        "levels": ["suggestive"],
        "contexts": ["festival", "outdoor", "performance", "traditional"],
        "activities": ["windy_walk", "dance_rehearsal", "editorial_pose"],
        "wardrobes": [
            "dev_nsfw_backstage_costume", "dev_nsfw_festival_yukata", "dev_nsfw_fantasy_armor_gap",
        ],
        "setup": [["fireworks_starting", "crowd_parting"], ["lanterns_swaying", "music_rising"]],
        "turn": [["turning_toward_light", "holding_clothes"], ["finishing_pose", "looking_back"]],
        "reaction": [["bright_smile", "blush"], ["surprised", "parted_lips"]],
        "effect": [["lantern_glow", "windblown_hair"], ["firework_reflection", "clothes_fluttering"]],
    },
    {
        "id": "hosiery_adjustment",
        "weight": 4,
        "levels": ["suggestive"],
        "contexts": ["fashion", "private", "work", "studio"],
        "wardrobes": ["dev_nsfw_hosiery_focus"],
        "setup": [["legwear_shifted", "detail_check"], ["sheer_fabric_wrinkled", "mid-pose"]],
        "turn": [["adjusting_legwear", "balancing_on_one_leg"], ["smoothing_sheer_fabric", "looking_down"]],
        "reaction": [["focused", "parted_lips"], ["noticing_viewer", "blush"]],
        "effect": [["legwear_edge_visible", "thighs"], ["sheer_legwear", "leg_highlight"]],
    },
    {
        "id": "barefoot_pause",
        "weight": 3,
        "levels": ["suggestive"],
        "contexts": ["home", "private", "leisure", "studio", "wellness"],
        "wardrobes": ["dev_nsfw_barefoot_focus"],
        "setup": [["shoes_set_aside", "cool_floor"], ["pause_between_steps", "barefoot"]],
        "turn": [["curling_toes", "shifting_weight"], ["lifting_one_foot", "looking_down"]],
        "reaction": [["relaxed", "soft_smile"], ["noticing_viewer", "blush"]],
        "effect": [["bare_feet", "floor_reflection"], ["ankle_line", "soft_shadow"]],
    },
    {
        "id": "footcare_moment",
        "weight": 3,
        "levels": ["suggestive"],
        "contexts": ["home", "private", "studio", "wellness"],
        "wardrobes": ["dev_nsfw_barefoot_focus"],
        "setup": [["warm_footbath", "towel_nearby"], ["nail_polish_open", "footcare_tools"]],
        "turn": [["drying_feet", "lifting_one_foot"], ["painting_toenails", "toes_spread"]],
        "reaction": [["focused", "parted_lips"], ["content_smile", "looking_at_viewer"]],
        "effect": [["water_drops_on_feet", "soft_skin"], ["painted_toenails", "toe_detail"]],
    },
    {
        "id": "male_towel_adjustment",
        "weight": 3,
        "levels": ["suggestive"],
        "contexts": ["wet", "wellness", "private", "sports"],
        "activities": ["adjusting_outfit"],
        "subjects": ["solo_boy"],
        "wardrobes": ["dev_nsfw_male_after_shower"],
        "setup": [["towel_loosened", "reaching_for_clothes"], ["locker_door_closing", "caught_mid-change"]],
        "turn": [["securing_towel", "turning_away"], ["pulling_clothes_on", "looking_over_shoulder"]],
        "reaction": [["startled", "parted_lips"], ["calm_gaze", "noticing_viewer"]],
        "effect": [["low_towel", "water_drops"], ["bare_back", "steam_trail"]],
    },
]

RANDOM_PROMPT_NSFW_AXIS_CAMERA_GROUPS = [
    ["cowboy_shot", "eye_level"],
    ["upper_body", "from_side"],
    ["full_body", "three-quarter_view"],
    ["medium_shot", "looking_at_viewer"],
    ["close-up", "depth_of_field"],
    ["from_behind", "looking_back"],
    ["low_angle", "full_body"],
    ["high_angle", "knees_up"],
]

RANDOM_PROMPT_NSFW_AXIS_SUBJECT_TAGS = {
    "1girl", "1boy", "2girls", "2boys", "solo", "couple", "multiple_girls", "multiple_boys",
}

_RANDOM_PROMPT_NSFW_EXPLICIT_PROFILES = [
    {
        "id": "dev_nsfw_pair_bedroom",
        "weight": 3,
        "subject_id": "duo",
        "character_chance": 0.55,
        "copyright_chance": 0.35,
        "lighting_chance": 0.25,
        "association_max": 2,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["sex", "vaginal", "cum"],
        "tags": ["1girl", "1boy", "sex", "vaginal"],
        "setting": [
            ["bedroom", "bed", "bed_sheet"],
            ["couch", "indoors", "night"],
            ["shower", "wet", "tile_floor"],
            ["table", "indoors", "lamp"],
        ],
        "pose": [["missionary_position", "legs_up"], ["cowgirl_position", "straddling"]],
        "action": [["sex", "vaginal", "penetration", "grabbing_hips"], ["cowgirl_position", "vaginal", "penetration", "straddling"]],
        "expression": [["orgasm", "open_mouth", "blush"], ["ahegao", "half-closed_eyes", "heavy_breathing"]],
        "body_detail": [["pussy", "penis", "nipples", "wet_pussy"], ["cum", "cum_on_body", "pussy", "penis"]],
        "finish_detail": [["cum", "cum_in_pussy", "cumdrip"], ["after_sex", "cum_on_breasts", "cum_on_body"]],
        "lighting": [["warm_lighting", "depth_of_field"], ["low_light", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_pair_from_behind",
        "weight": 3,
        "subject_id": "duo",
        "character_chance": 0.55,
        "copyright_chance": 0.35,
        "lighting_chance": 0.25,
        "association_max": 2,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["sex_from_behind", "vaginal", "cum"],
        "tags": ["1girl", "1boy", "sex", "sex_from_behind"],
        "setting": [
            ["bedroom", "bed", "pillow"],
            ["shower", "wet", "tile_wall"],
            ["kitchen", "counter", "indoors"],
            ["car_interior", "night", "window"],
        ],
        "pose": [["sex_from_behind", "on_all_fours"], ["doggystyle", "ass_focus"]],
        "action": [["sex_from_behind", "vaginal", "penetration", "grabbing_hips"], ["doggystyle", "spread_legs", "penetration"]],
        "expression": [["orgasm", "open_mouth", "blush"], ["ahegao", "heavy_breathing", "tears"]],
        "body_detail": [["pussy", "penis", "ass", "wet_pussy"], ["cum", "cum_on_ass", "nipples", "pussy"]],
        "finish_detail": [["cum", "cum_in_pussy", "cumdrip"], ["cum_on_ass", "after_sex", "cum_on_body"]],
        "lighting": [["warm_lighting", "soft_shadow"], ["low_light", "depth_of_field"]],
    },
    {
        "id": "dev_nsfw_pair_oral",
        "weight": 3,
        "subject_id": "duo",
        "character_chance": 0.55,
        "copyright_chance": 0.35,
        "lighting_chance": 0.25,
        "association_max": 2,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["fellatio", "cum"],
        "tags": ["1girl", "1boy", "fellatio"],
        "setting": [
            ["bedroom", "bed", "night"],
            ["indoors", "couch", "lamp"],
            ["office_chair", "desk", "indoors"],
            ["car_interior", "night", "window"],
        ],
        "pose": [["kneeling", "looking_up"], ["sitting", "from_above"]],
        "action": [["fellatio", "penis", "saliva"], ["deepthroat", "saliva", "handjob"]],
        "expression": [["open_mouth", "blush", "half-closed_eyes"], ["ahegao", "tears", "drooling"]],
        "body_detail": [["penis", "saliva"], ["breasts", "nipples"]],
        "finish_detail": [["cum", "cum_on_face", "cum_on_tongue"], ["cum_in_mouth", "after_sex", "drooling"]],
        "lighting": [["warm_lighting", "depth_of_field"], ["soft_lighting", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_yuri_pair",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.25,
        "association_max": 3,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["yuri", "tribadism", "cunnilingus"],
        "tags": ["2girls", "yuri", "sex"],
        "setting": [
            ["dressing_room", "mirror", "chair"],
            ["shower", "wet", "tile_floor"],
            ["couch", "indoors", "night"],
            ["poolside", "wet", "water"],
        ],
        "pose": [["straddling", "breast_press"], ["lying", "legs_intertwined"], ["sitting", "spread_legs"]],
        "action": [["tribadism", "grinding"], ["cunnilingus", "spread_legs"], ["kissing", "breast_grab"]],
        "expression": [["orgasm", "open_mouth", "blush"], ["ahegao", "heavy_breathing"], ["teasing_smile", "half-closed_eyes"]],
        "body_detail": [["pussy", "thighs"], ["nipples", "breasts"], ["wet_pussy", "female_ejaculation"]],
        "finish_detail": [["female_ejaculation", "cum_on_body"], ["after_sex", "messy_hair"], ["wet_pussy", "pussy_juice"]],
        "lighting": [["soft_lighting", "depth_of_field"], ["rim_lighting", "wet"]],
    },
    {
        "id": "dev_nsfw_toy_private",
        "weight": 3,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.25,
        "association_max": 2,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["sex_toy", "vibrator", "orgasm"],
        "tags": ["1girl", "solo", "nude", "sex_toy"],
        "setting": [
            ["bedroom", "bed", "pillow"],
            ["bathroom", "mirror", "tile_floor"],
            ["dressing_room", "mirror", "chair"],
            ["couch", "indoors", "night"],
        ],
        "pose": [["lying", "spread_legs"], ["sitting", "legs_apart"]],
        "action": [["vibrator", "masturbation", "hand_between_legs"], ["dildo", "penetration", "spread_legs"]],
        "expression": [["orgasm", "open_mouth", "blush"], ["ahegao", "heavy_breathing", "drooling"]],
        "body_detail": [["pussy", "wet_pussy"], ["nipples", "pubic_hair"]],
        "finish_detail": [["cum", "cum_on_body", "cumdrip"], ["after_sex", "cum_on_thighs", "wet_pussy"]],
        "lighting": [["soft_lighting", "depth_of_field"], ["warm_lighting", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_exposure_outfit",
        "weight": 3,
        "subject_id": "solo_girl",
        "character_chance": 0.7,
        "copyright_chance": 0.45,
        "lighting_chance": 0.2,
        "association_max": 3,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["clothes_lift", "upskirt", "no_panties"],
        "tags": ["1girl", "solo", "clothes_lift", "no_panties"],
        "setting": [
            ["dressing_room", "mirror", "chair"],
            ["classroom", "desk", "window"],
            ["backstage", "curtains", "spotlight"],
            ["stairwell", "indoors", "railing"],
        ],
        "pose": [["standing", "skirt_lift"], ["sitting", "spread_legs"], ["bent_over", "looking_back"]],
        "action": [["clothes_lift", "flashing"], ["upskirt", "pantyshot"], ["shirt_lift", "no_bra"]],
        "expression": [["embarrassed", "blush", "open_mouth"], ["teasing_smile", "looking_at_viewer"], ["heavy_breathing", "half-closed_eyes"]],
        "body_detail": [["pussy", "cameltoe"], ["nipples", "underboob"], ["thighs", "ass"]],
        "finish_detail": [["wet_pussy", "pussy_juice"], ["cum", "cum_on_clothes"], ["after_sex", "disheveled_clothes"]],
        "lighting": [["soft_lighting", "depth_of_field"], ["spotlight", "dark_background"]],
    },
    {
        "id": "dev_nsfw_wet_see_through",
        "weight": 3,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.25,
        "association_max": 3,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["see-through_clothes", "wet_clothes", "nipples"],
        "tags": ["1girl", "solo", "wet_clothes", "see-through_clothes"],
        "setting": [
            ["shower", "wet", "tile_wall"],
            ["rain", "wet", "night"],
            ["poolside", "wet", "water"],
            ["bathroom", "mirror", "steam"],
        ],
        "pose": [["standing", "from_side"], ["sitting", "spread_legs"], ["leaning_forward", "looking_at_viewer"]],
        "action": [["see-through_clothes", "clothes_lift"], ["wet_shirt", "no_bra"], ["panties_aside", "hand_between_legs"]],
        "expression": [["blush", "open_mouth", "heavy_breathing"], ["orgasm", "half-closed_eyes"], ["teasing_smile", "looking_at_viewer"]],
        "body_detail": [["nipples", "erect_nipples"], ["pussy", "wet_pussy"], ["underboob", "thighs"]],
        "finish_detail": [["cum", "cum_on_body"], ["wet_pussy", "pussy_juice"], ["after_sex", "messy_hair"]],
        "lighting": [["steam", "diffused_light"], ["backlighting", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_after_scene",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.25,
        "association_max": 3,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["after_sex", "cum", "disheveled_clothes"],
        "tags": ["1girl", "solo", "after_sex", "cum"],
        "setting": [
            ["couch", "indoors", "night"],
            ["car_interior", "window", "night"],
            ["dressing_room", "mirror", "chair"],
            ["bedroom", "bed", "pillow"],
        ],
        "pose": [["lying", "spread_legs"], ["sitting", "legs_apart"], ["reclining", "looking_at_viewer"]],
        "action": [["after_sex", "disheveled_clothes"], ["clothes_lift", "cum"], ["panties_aside", "cumdrip"]],
        "expression": [["afterglow", "half-closed_eyes", "blush"], ["heavy_breathing", "open_mouth"], ["tired", "messy_hair"]],
        "body_detail": [["cum_on_body", "pussy"], ["cum_on_breasts", "nipples"], ["wet_pussy", "thighs"]],
        "finish_detail": [["cum", "cumdrip"], ["cum_on_clothes", "messy_hair"], ["after_sex", "pussy_juice"]],
        "lighting": [["low_light", "soft_shadow"], ["warm_lighting", "depth_of_field"]],
    },
    {
        "id": "dev_nsfw_cosplay_private",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.75,
        "copyright_chance": 0.45,
        "lighting_chance": 0.2,
        "association_max": 3,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["cosplay", "no_panties", "clothes_lift"],
        "tags": ["1girl", "solo", "cosplay", "no_panties"],
        "setting": [
            ["dressing_room", "mirror", "clothes_rack"],
            ["bedroom", "mirror", "night"],
            ["photo_studio", "curtains", "spotlight"],
            ["backstage", "curtains", "chair"],
        ],
        "pose": [["standing", "clothes_lift"], ["sitting", "spread_legs"], ["kneeling", "looking_at_viewer"]],
        "action": [["clothes_lift", "panties_aside"], ["shirt_lift", "no_bra"], ["breast_grab", "skirt_lift"]],
        "expression": [["teasing_smile", "blush"], ["orgasm", "open_mouth"], ["ahegao", "heavy_breathing"]],
        "body_detail": [["pussy", "nipples"], ["cameltoe", "thighs"], ["wet_pussy", "underboob"]],
        "finish_detail": [["cum", "cum_on_body"], ["wet_pussy", "pussy_juice"], ["after_sex", "disheveled_clothes"]],
        "lighting": [["spotlight", "dark_background"], ["soft_lighting", "depth_of_field"]],
    },
    {
        "id": "dev_nsfw_lingerie_private",
        "weight": 1,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.2,
        "association_max": 2,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["lingerie", "orgasm", "wet_pussy"],
        "tags": ["1girl", "solo", "lingerie", "no_panties"],
        "setting": [
            ["bedroom", "bed", "curtains"],
            ["dressing_room", "mirror", "chair"],
            ["couch", "indoors", "curtains"],
            ["balcony", "curtains", "night"],
        ],
        "pose": [["lying", "spread_legs"], ["sitting", "legs_apart"], ["standing", "clothes_lift"]],
        "action": [["masturbation", "hand_between_legs", "spread_legs"], ["panties_aside", "wet_pussy"], ["breast_grab", "no_bra"]],
        "expression": [["orgasm", "open_mouth", "blush"], ["ahegao", "half-closed_eyes", "heavy_breathing"]],
        "body_detail": [["pussy", "nipples"], ["wet_pussy", "thighs"]],
        "finish_detail": [["cum", "cum_on_body", "cumdrip"], ["after_sex", "cum_on_breasts", "wet_pussy"]],
        "lighting": [["soft_lighting", "depth_of_field"], ["warm_lighting", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_onsen",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.2,
        "association_max": 2,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["nude", "wet_pussy", "orgasm"],
        "tags": ["1girl", "solo", "nude", "wet"],
        "setting": [["onsen", "steam", "water"], ["bath", "wet", "towel"], ["shower", "wet", "tile_wall"]],
        "pose": [["sitting", "spread_legs"], ["lying", "legs_apart"]],
        "action": [["masturbation", "fingering", "spread_legs"], ["touching_self", "wet_pussy", "legs_apart"], ["breast_grab", "legs_apart"]],
        "expression": [["orgasm", "open_mouth", "blush"], ["ahegao", "half-closed_eyes", "heavy_breathing"]],
        "body_detail": [["pussy", "nipples"], ["wet_pussy", "pubic_hair"]],
        "finish_detail": [["cum", "cum_on_body", "cumdrip"], ["after_sex", "cum_on_thighs", "wet_pussy"]],
        "lighting": [["steam", "soft_lighting"], ["mist", "diffused_light"]],
    },
    {
        "id": "dev_nsfw_lounge",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.2,
        "association_max": 2,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["topless", "breast_grab", "orgasm"],
        "tags": ["1girl", "solo", "topless", "breast_grab"],
        "setting": [["couch", "fireplace", "curtains"], ["chair", "indoors", "lamp"], ["table", "indoors", "night"]],
        "pose": [["reclining", "spread_legs"], ["sitting", "legs_apart"]],
        "action": [["breast_grab", "hand_between_legs"], ["panties_aside", "spread_legs", "touching_self"], ["clothes_lift", "no_bra"]],
        "expression": [["orgasm", "open_mouth", "blush"], ["ahegao", "half-closed_eyes", "heavy_breathing"]],
        "body_detail": [["nipples", "areolae"], ["pussy", "thighs"]],
        "finish_detail": [["cum", "cum_on_breasts", "cumdrip"], ["after_sex", "cum_on_body", "wet_pussy"]],
        "lighting": [["warm_light", "soft_shadow"], ["low_light", "depth_of_field"]],
    },
    {
        "id": "dev_nsfw_stage",
        "weight": 1,
        "subject_id": "solo_girl",
        "character_chance": 0.55,
        "copyright_chance": 0.3,
        "lighting_chance": 0.15,
        "association_max": 2,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["no_bra", "clothes_lift", "orgasm"],
        "tags": ["1girl", "solo", "no_bra", "clothes_lift"],
        "setting": [["stage", "spotlight", "curtains"], ["dressing_room", "mirror", "spotlight"]],
        "pose": [["standing", "spread_legs"], ["sitting", "legs_apart"]],
        "action": [["clothes_lift", "breast_grab", "spread_legs"], ["panties_aside", "hand_between_legs", "spread_legs"]],
        "expression": [["orgasm", "open_mouth", "heavy_breathing"], ["ahegao", "half-closed_eyes", "blush"]],
        "body_detail": [["nipples", "underboob"], ["pussy", "cameltoe"]],
        "finish_detail": [["cum", "cum_on_body", "cumdrip"], ["after_sex", "cum_on_breasts", "wet_pussy"]],
        "lighting": [["spotlight", "dramatic_lighting"], ["rim_lighting", "dark_background"]],
    },
    {
        "id": "dev_nsfw_striptease_photo",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.7,
        "copyright_chance": 0.45,
        "lighting_chance": 0.25,
        "association_max": 3,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["striptease", "nude", "no_panties"],
        "tags": ["1girl", "solo", "striptease", "no_panties"],
        "setting": [
            ["photo_studio", "curtains", "spotlight"],
            ["dressing_room", "mirror", "clothes_rack"],
            ["balcony", "night", "curtains"],
            ["office_chair", "desk", "indoors"],
        ],
        "pose": [["standing", "clothes_lift"], ["sitting", "spread_legs"], ["from_behind", "looking_back"]],
        "action": [["shirt_lift", "no_bra"], ["skirt_lift", "panties_aside"], ["breast_grab", "clothes_lift"]],
        "expression": [["teasing_smile", "looking_at_viewer"], ["orgasm", "open_mouth"], ["embarrassed", "blush"]],
        "body_detail": [["pussy", "thighs"], ["nipples", "underboob"], ["wet_pussy", "cameltoe"]],
        "finish_detail": [["wet_pussy", "pussy_juice"], ["cum", "cum_on_clothes"], ["after_sex", "disheveled_clothes"]],
        "lighting": [["spotlight", "dark_background"], ["soft_lighting", "depth_of_field"]],
    },
    {
        "id": "dev_nsfw_love_hotel_pair",
        "weight": 2,
        "subject_id": "duo",
        "character_chance": 0.6,
        "copyright_chance": 0.35,
        "lighting_chance": 0.25,
        "association_max": 2,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["sex", "love_hotel", "cum"],
        "tags": ["1girl", "1boy", "sex", "love_hotel"],
        "setting": [
            ["love_hotel", "bed", "colored_lighting"],
            ["hotel_room", "window", "city_lights"],
            ["bathroom", "bathtub", "steam"],
            ["karaoke_room", "sofa", "microphone"],
            ["balcony", "night", "curtains"],
        ],
        "pose": [["cowgirl_position", "straddling"], ["sitting", "legs_apart"], ["lying", "legs_up"]],
        "action": [["sex", "vaginal", "penetration"], ["panties_aside", "grabbing_hips", "penetration"], ["breast_grab", "kissing"]],
        "expression": [["orgasm", "open_mouth", "blush"], ["ahegao", "heavy_breathing"], ["half-closed_eyes", "tears"]],
        "body_detail": [["pussy", "penis", "wet_pussy"], ["cum", "cum_on_body", "nipples"]],
        "finish_detail": [["cum", "cum_in_pussy", "cumdrip"], ["after_sex", "messy_hair", "cum_on_body"]],
        "lighting": [["colored_lighting", "low_light"], ["city_lights", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_office_after_hours",
        "weight": 2,
        "subject_id": "duo",
        "character_chance": 0.55,
        "copyright_chance": 0.35,
        "lighting_chance": 0.2,
        "association_max": 2,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["office", "sex", "panties_aside"],
        "tags": ["1girl", "1boy", "sex", "office"],
        "setting": [
            ["office", "desk", "night"],
            ["meeting_room", "table", "window"],
            ["storage_room", "shelf", "low_light"],
            ["archive_room", "bookshelf", "desk"],
            ["elevator", "mirror", "indoors"],
        ],
        "pose": [["bent_over", "looking_back"], ["sitting", "spread_legs"], ["standing", "against_wall"]],
        "action": [["panties_aside", "penetration", "grabbing_hips"], ["sex", "vaginal", "desk"], ["shirt_lift", "breast_grab"]],
        "expression": [["orgasm", "open_mouth", "blush"], ["heavy_breathing", "half-closed_eyes"], ["embarrassed", "tears"]],
        "body_detail": [["pussy", "penis", "wet_pussy"], ["nipples", "thighs", "ass"]],
        "finish_detail": [["cum", "cum_on_clothes"], ["after_sex", "disheveled_clothes"], ["cumdrip", "messy_hair"]],
        "lighting": [["office_lighting", "low_light"], ["window_light", "city_lights"]],
    },
    {
        "id": "dev_nsfw_public_tease",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.7,
        "copyright_chance": 0.45,
        "lighting_chance": 0.2,
        "association_max": 3,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["no_panties", "clothes_lift", "flashing"],
        "tags": ["1girl", "solo", "no_panties", "clothes_lift"],
        "setting": [
            ["train_interior", "window", "handrail"],
            ["elevator", "mirror", "indoors"],
            ["rooftop", "railing", "cityscape"],
            ["alley", "street_lamp", "night"],
            ["festival", "lantern", "crowd_blur"],
        ],
        "pose": [["standing", "skirt_lift"], ["sitting", "spread_legs"], ["from_behind", "looking_back"]],
        "action": [["clothes_lift", "flashing"], ["skirt_lift", "no_panties"], ["shirt_lift", "no_bra"]],
        "expression": [["teasing_smile", "looking_at_viewer"], ["embarrassed", "blush"], ["open_mouth", "heavy_breathing"]],
        "body_detail": [["pussy", "cameltoe"], ["nipples", "underboob"], ["thighs", "ass"]],
        "finish_detail": [["wet_pussy", "pussy_juice"], ["after_sex", "disheveled_clothes"], ["cum", "cum_on_clothes"]],
        "lighting": [["street_lamp", "low_light"], ["lantern_light", "rim_lighting"]],
    },
    {
        "id": "dev_nsfw_locker_room_wet",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.25,
        "association_max": 3,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["towel", "wet_clothes", "no_bra"],
        "tags": ["1girl", "solo", "wet_clothes", "towel"],
        "setting": [
            ["locker_room", "locker", "bench"],
            ["gym", "locker_room", "mirror"],
            ["shower_room", "tile_floor", "steam"],
            ["pool", "wet", "water"],
            ["bathhouse", "steam", "towel"],
        ],
        "pose": [["standing", "towel"], ["sitting", "legs_apart"], ["leaning_forward", "looking_at_viewer"]],
        "action": [["towel_lift", "no_bra"], ["wet_shirt", "clothes_lift"], ["panties_aside", "hand_between_legs"]],
        "expression": [["blush", "open_mouth"], ["teasing_smile", "looking_at_viewer"], ["orgasm", "half-closed_eyes"]],
        "body_detail": [["nipples", "erect_nipples"], ["pussy", "wet_pussy"], ["thighs", "underboob"]],
        "finish_detail": [["wet_pussy", "pussy_juice"], ["cum", "cum_on_body"], ["after_sex", "messy_hair"]],
        "lighting": [["steam", "diffused_light"], ["fluorescent_light", "soft_shadow"]],
    },
    {
        "id": "dev_nsfw_outdoor_night",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.2,
        "association_max": 3,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["outdoors", "nude", "clothes_lift"],
        "tags": ["1girl", "solo", "nude", "outdoors"],
        "setting": [
            ["beach", "night", "moonlight"],
            ["forest", "moonlight", "grass"],
            ["camping", "tent", "lantern"],
            ["rooftop", "night", "railing"],
            ["hot_spring", "steam", "rocks"],
        ],
        "pose": [["standing", "covering_breasts"], ["sitting", "spread_legs"], ["kneeling", "looking_at_viewer"]],
        "action": [["clothes_lift", "breast_grab"], ["panties_aside", "touching_self"], ["nude", "covering"]],
        "expression": [["embarrassed", "blush"], ["teasing_smile", "looking_at_viewer"], ["open_mouth", "heavy_breathing"]],
        "body_detail": [["pussy", "nipples"], ["wet_pussy", "thighs"], ["underboob", "ass"]],
        "finish_detail": [["cum", "cum_on_body"], ["wet_pussy", "pussy_juice"], ["after_sex", "messy_hair"]],
        "lighting": [["moonlight", "rim_lighting"], ["lantern_light", "soft_shadow"]],
    },
    {
        "id": "dev_nsfw_fantasy_private",
        "weight": 2,
        "subject_id": "solo_girl",
        "character_chance": 0.65,
        "copyright_chance": 0.4,
        "lighting_chance": 0.25,
        "association_max": 3,
        "association_slots": ["pose", "expression", "body_detail", "prop", "clothing"],
        "trigger_tags": ["fantasy", "nude", "magic_circle"],
        "tags": ["1girl", "solo", "fantasy", "nude"],
        "setting": [
            ["shrine", "torii", "lantern"],
            ["temple", "altar", "candle"],
            ["ruins", "magic_circle", "glowing"],
            ["greenhouse", "flowers", "vines"],
            ["cave", "crystal", "water"],
        ],
        "pose": [["kneeling", "spread_legs"], ["standing", "clothes_lift"], ["sitting", "legs_apart"]],
        "action": [["clothes_lift", "breast_grab"], ["panties_aside", "wet_pussy"], ["touching_self", "open_mouth"]],
        "expression": [["orgasm", "open_mouth", "blush"], ["ahegao", "half-closed_eyes"], ["teasing_smile", "looking_at_viewer"]],
        "body_detail": [["pussy", "nipples"], ["wet_pussy", "thighs"], ["underboob", "pubic_hair"]],
        "finish_detail": [["cum", "cum_on_body"], ["wet_pussy", "pussy_juice"], ["after_sex", "disheveled_clothes"]],
        "lighting": [["candlelight", "warm_light"], ["magic_circle", "blue_glow"]],
    },
]

RANDOM_PROMPT_NSFW_PROFILES = (
    RANDOM_PROMPT_NSFW_SUGGESTIVE_PROFILES
    + RANDOM_PROMPT_NSFW_NUDITY_PROFILES
    + [{**profile, "content_level": "explicit"} for profile in _RANDOM_PROMPT_NSFW_EXPLICIT_PROFILES]
)

RANDOM_PROMPT_ADULT_SLOT_MAP = {
    "scene": "setting",
    "camera": "camera",
    "pose_action": "pose",
    "expression": "expression",
    "clothing": "clothing",
    "body_detail": "body_detail",
    "prop": "prop",
    "style_light": "lighting",
}

RANDOM_PROMPT_ADULT_SLOT_ORDER = (
    "setting",
    "camera",
    "pose",
    "expression",
    "clothing",
    "body_detail",
    "prop",
    "lighting",
)

RANDOM_PROMPT_ADULT_BLOCKED_EXACT_TAGS = {
    "bald",
}

RANDOM_PROMPT_ADULT_BLOCKED_FRAGMENTS = (
    "child", "children", "loli", "shota", "minor", "kindergarten", "elementary",
    "watermark", "signature", "artist", "commentary", "request", "text", "english_text",
    "mosaic", "censored",
)

RANDOM_PROMPT_ADULT_CHARACTER_BLOCK_FRAGMENTS = (
    "child", "children", "loli", "shota", "minor", "kindergarten",
    "elementary", "klee", "qiqi", "yaoyao", "paimon", "edogawa_conan",
    "detective_conan",
)

RANDOM_PROMPT_ADULT_NEGATIVE_MIN_SCORE = 2500.0
RANDOM_PROMPT_ADULT_NEGATIVE_MAX_LIFT = 0.45


def _clean_text(value):
    return str(value or "").strip()


def _clean_lang(value):
    lang = _clean_text(value).lower()
    return "en" if lang.startswith("en") else "cn"


def _safe_prompt_file_name(preset_name):
    name = _clean_text(preset_name)
    if not name:
        return ""
    name = os.path.basename(name)
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip().strip(".")
    return name


def _preset_json_path(preset_name):
    safe = _safe_prompt_file_name(preset_name)
    if not safe:
        return ""
    return os.path.join(ROOT_DIR, "presets", f"{safe}.json")


def _load_preset_scene_frontend(preset_name):
    path = _preset_json_path(preset_name)
    if not path or not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    default_engine = data.get("default_engine") if isinstance(data, dict) else {}
    scene_frontend = default_engine.get("scene_frontend") if isinstance(default_engine, dict) else {}
    return scene_frontend if isinstance(scene_frontend, dict) else {}


def _scene_value_candidates(value):
    if isinstance(value, dict):
        return [_clean_text(item) for item in value.values() if _clean_text(item)]
    if isinstance(value, (list, tuple, set)):
        return [_clean_text(item) for item in value if _clean_text(item)]
    clean = _clean_text(value)
    return [clean] if clean else []


def _scene_director_capability(scene_frontend):
    capability = scene_frontend.get("director_capability") if isinstance(scene_frontend, dict) else {}
    return capability if isinstance(capability, dict) else {}


def _has_i2v_marker(value):
    clean = _clean_text(value).lower()
    if not clean or "ai2v" in clean or "ia2v" in clean:
        return False
    normalized = re.sub(r"[^a-z0-9]+", "_", clean).strip("_")
    parts = [part for part in normalized.split("_") if part]
    return "(i2v)" in clean or "i2v" in parts or normalized.endswith("i2v")


def _has_image_to_video_phrase(value):
    clean = _clean_text(value).lower().replace("_", " ").replace("-", " ")
    return "image to video" in clean


def _scene_prompt_supports_shared_image_to_video(preset_name, scene_frontend, task_methods, capability):
    image_policy = _clean_text(capability.get("image_policy")).lower()
    video_policy = _clean_text(capability.get("video_policy")).lower()
    audio_policy = _clean_text(capability.get("audio_policy")).lower()
    if image_policy != "required" or video_policy not in {"", "forbidden"} or audio_policy not in {"", "forbidden"}:
        return False

    image_modes = [item.lower() for item in _scene_value_candidates(capability.get("image_modes"))]
    has_image_input = _safe_int(capability.get("max_images"), 0) > 0 or any(
        mode in {"first_frame", "first_last", "reference_set"} for mode in image_modes
    )
    if not has_image_input:
        return False

    marker_values = [preset_name, scene_frontend.get("theme_title")]
    marker_values.extend(task_methods)
    marker_values.extend(_scene_value_candidates(scene_frontend.get("theme")))
    return any(_has_i2v_marker(item) or _has_image_to_video_phrase(item) for item in marker_values)


def _scene_prompt_shared_keys(preset_name):
    keys = []
    if _safe_prompt_file_name(preset_name) in IMAGE_EDIT_SHARED_PRESETS:
        keys.append("image_edit")

    scene_frontend = _load_preset_scene_frontend(preset_name)
    if not scene_frontend:
        return keys
    task_methods = [item.lower() for item in _scene_value_candidates(scene_frontend.get("task_method"))]
    capability = _scene_director_capability(scene_frontend)
    image_policy = _clean_text(capability.get("image_policy")).lower()
    video_policy = _clean_text(capability.get("video_policy")).lower()
    audio_policy = _clean_text(capability.get("audio_policy")).lower()
    if _scene_prompt_supports_shared_image_to_video(preset_name, scene_frontend, task_methods, capability):
        keys.append("image_to_video")
    no_media_input = (
        image_policy in {"", "forbidden"}
        and video_policy in {"", "forbidden"}
        and audio_policy in {"", "forbidden"}
    )
    if no_media_input and any("t2v" in method for method in task_methods):
        keys.append("text_to_video")
    return keys


def _candidate_prompt_files(preset_name):
    safe = _safe_prompt_file_name(preset_name)
    result = []
    if safe:
        result.append(os.path.join(RECOMMENDATIONS_DIR, f"{safe}.csv"))
    for key in _scene_prompt_shared_keys(preset_name):
        shared_name = SHARED_RECOMMENDATION_FILES.get(key)
        if shared_name:
            result.append(os.path.join(RECOMMENDATIONS_DIR, shared_name))
    result.append(os.path.join(RECOMMENDATIONS_DIR, "_default.csv"))
    seen = set()
    unique = []
    for path in result:
        if path in seen:
            continue
        seen.add(path)
        if os.path.isfile(path):
            unique.append(path)
    return unique


def _relative_prompt_file(path):
    return os.path.relpath(path, ROOT_DIR).replace("\\", "/")


def _read_prompt_rows(path):
    rows = []
    if not os.path.isfile(path):
        return rows
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(line for line in f if not line.lstrip().startswith("#"))
        for index, row in enumerate(reader):
            if not isinstance(row, dict):
                continue
            prompt = _clean_text(row.get("prompt"))
            if not prompt:
                continue
            target = PROMPT_TARGETS.get(_clean_text(row.get("target")).lower(), "positive_prompt")
            mode = _clean_text(row.get("mode")).lower()
            if mode not in PROMPT_MODES:
                mode = "replace"
            item = {
                "id": _clean_text(row.get("id")) or f"{os.path.basename(path)}:{index + 1}",
                "scene_theme": _clean_text(row.get("scene_theme")) or "*",
                "target": target,
                "mode": mode,
                "title_en": _clean_text(row.get("title_en")),
                "title_cn": _clean_text(row.get("title_cn")),
                "prompt": prompt,
                "seed_terms": _split_terms(row.get("seed_terms")),
                "weight": _safe_int(row.get("weight"), 100),
                "source_file": _relative_prompt_file(path),
            }
            rows.append(item)
    return rows


def _safe_int(value, default=0):
    try:
        return int(float(value))
    except Exception:
        return default


def _split_terms(value):
    terms = []
    for item in re.split(r"[|,;]", str(value or "")):
        clean = item.strip()
        if clean and clean not in terms:
            terms.append(clean)
    return terms


def _scene_theme_matches(row_theme, scene_theme):
    wanted = _clean_text(scene_theme).lower()
    current = _clean_text(row_theme).lower()
    if not current or current == "*":
        return True
    if not wanted:
        return True
    return current == wanted


def _recommendation_title(row, lang):
    if _clean_lang(lang) == "en":
        return row.get("title_en") or row.get("title_cn") or row.get("id")
    return row.get("title_cn") or row.get("title_en") or row.get("id")


def _dedupe_prompt_rows(rows):
    result = []
    seen_ids = set()
    seen_prompts = set()
    for row in rows:
        item_id = _clean_text(row.get("id")).lower()
        prompt_key = re.sub(r"\s+", "", _clean_text(row.get("prompt")).lower())
        if item_id and item_id in seen_ids:
            continue
        if prompt_key and prompt_key in seen_prompts:
            continue
        if item_id:
            seen_ids.add(item_id)
        if prompt_key:
            seen_prompts.add(prompt_key)
        result.append(row)
    return result


def list_prompt_recommendations(preset_name, scene_theme="", lang="cn", limit=12):
    rows = []
    for path in _candidate_prompt_files(preset_name):
        rows.extend(_read_prompt_rows(path))
    rows = [row for row in rows if _scene_theme_matches(row.get("scene_theme"), scene_theme)]
    rows = _dedupe_prompt_rows(rows)
    rows.sort(key=lambda row: (-_safe_int(row.get("weight"), 100), str(row.get("id") or "")))
    max_limit = max(1, min(_safe_int(limit, 12), 50))
    preset = _clean_text(preset_name)
    return [
        {
            **row,
            "title": _recommendation_title(row, lang),
            "preset": preset,
        }
        for row in rows[:max_limit]
    ]


def recommendation_payload(preset_name, scene_theme="", lang="cn", limit=12):
    candidate_files = [_relative_prompt_file(path) for path in _candidate_prompt_files(preset_name)]
    return {
        "ok": True,
        "preset": _clean_text(preset_name),
        "scene_theme": _clean_text(scene_theme),
        "items": list_prompt_recommendations(preset_name, scene_theme=scene_theme, lang=lang, limit=limit),
        "source_dir": os.path.relpath(RECOMMENDATIONS_DIR, ROOT_DIR).replace("\\", "/"),
        "source_files": candidate_files,
    }


def _safe_danbooru_tag(tag):
    return canvas_danbooru_service._canvas_prompt_safe_danbooru_tag(tag)


def _prompt_lookup_norm(value):
    return re.sub(r"[^a-z0-9_]+", "_", str(value or "").strip().lower()).strip("_")


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def _read_csv_dict_rows(path):
    if not path or not os.path.isfile(path):
        return []
    rows = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if isinstance(row, dict):
                rows.append(row)
    return rows


def _env_flag_enabled(name):
    return _clean_text(os.environ.get(name)).lower() in {"1", "true", "yes", "on"}


def _developer_random_prompt_nsfw_enabled():
    return _env_flag_enabled(RANDOM_PROMPT_NSFW_ENV)


def _random_prompt_nsfw_requested(prompt_text):
    prompt = _clean_text(prompt_text)
    return bool(re.match(r"^nsfw(?:$|[\s,.;:!?，。；：！？、|/\\()\[\]{}_-])", prompt, re.I))


def _random_prompt_adult_tag_blocked(tag, character=False):
    clean = _prompt_lookup_norm(tag)
    if not clean:
        return True
    if len(clean) > 56 or clean.count("_") > 6:
        return True
    if clean in RANDOM_PROMPT_ADULT_BLOCKED_EXACT_TAGS:
        return True
    fragments = RANDOM_PROMPT_ADULT_CHARACTER_BLOCK_FRAGMENTS if character else RANDOM_PROMPT_ADULT_BLOCKED_FRAGMENTS
    return any(fragment in clean for fragment in fragments)


def _random_prompt_adult_tag_allowed(tag):
    clean = _prompt_lookup_norm(tag)
    if _random_prompt_adult_tag_blocked(clean):
        return False
    if clean in RANDOM_BAD_LOOKUP_TAGS:
        return False
    if clean in {"male_focus", "female_focus", "solo_focus"}:
        return False
    return True


def _random_prompt_adult_slot_rows():
    global _random_prompt_adult_slot_cache
    if _random_prompt_adult_slot_cache is not None:
        return _random_prompt_adult_slot_cache
    by_trigger = {}
    for row in _read_csv_dict_rows(RANDOM_PROMPT_ADULT_SLOTS_FILE):
        trigger = _prompt_lookup_norm(row.get("trigger_tag"))
        related = _prompt_lookup_norm(row.get("related_tag"))
        source_slot = _clean_text(row.get("slot")).lower()
        slot = RANDOM_PROMPT_ADULT_SLOT_MAP.get(source_slot)
        if not trigger or not related or not slot:
            continue
        if not _random_prompt_adult_tag_allowed(related):
            continue
        item = {
            "trigger": trigger,
            "related": related,
            "slot": slot,
            "source_slot": source_slot,
            "support": _safe_int(row.get("support"), 0),
            "lift": _safe_float(row.get("lift"), 0.0),
            "score": _safe_float(row.get("score"), 0.0),
        }
        by_trigger.setdefault(trigger, []).append(item)
    for rows in by_trigger.values():
        rows.sort(key=lambda item: (-item["score"], -item["support"], item["related"]))
    _random_prompt_adult_slot_cache = by_trigger
    return by_trigger


def _random_prompt_adult_negative_pairs():
    global _random_prompt_adult_negative_cache
    if _random_prompt_adult_negative_cache is not None:
        return _random_prompt_adult_negative_cache
    pairs = set()
    for row in _read_csv_dict_rows(RANDOM_PROMPT_ADULT_NEGATIVE_FILE):
        left = _prompt_lookup_norm(row.get("trigger_tag"))
        right = _prompt_lookup_norm(row.get("related_tag"))
        if not left or not right or left == right:
            continue
        score = _safe_float(row.get("negative_score"), 0.0)
        lift = _safe_float(row.get("lift"), 1.0)
        if score >= RANDOM_PROMPT_ADULT_NEGATIVE_MIN_SCORE and lift <= RANDOM_PROMPT_ADULT_NEGATIVE_MAX_LIFT:
            pairs.add(tuple(sorted((left, right))))
    _random_prompt_adult_negative_cache = pairs
    return pairs


def _random_prompt_adult_negative_conflicts(tag, anchors):
    clean = _prompt_lookup_norm(tag)
    if not clean:
        return True
    pairs = _random_prompt_adult_negative_pairs()
    for anchor in anchors or ():
        anchor_norm = _prompt_lookup_norm(anchor)
        if anchor_norm and anchor_norm != clean and tuple(sorted((anchor_norm, clean))) in pairs:
            return True
    return False


def _random_prompt_adult_stats_tags(trigger_tags, current_tags, rng, max_count=6, allowed_slots=None):
    by_trigger = _random_prompt_adult_slot_rows()
    if not by_trigger:
        return []
    triggers = []
    for tag in list(trigger_tags or []) + list(current_tags or []):
        clean = _prompt_lookup_norm(tag)
        if clean and clean in by_trigger and clean not in triggers:
            triggers.append(clean)
    if not triggers:
        return []

    current_norms = {_prompt_lookup_norm(tag) for tag in current_tags if _prompt_lookup_norm(tag)}
    candidates_by_slot = {}
    allowed_slot_set = {_clean_text(item).lower() for item in allowed_slots or [] if _clean_text(item)}
    for trigger in triggers:
        for row in by_trigger.get(trigger, [])[:80]:
            related = row.get("related")
            slot = _clean_text(row.get("slot")).lower()
            if allowed_slot_set and slot not in allowed_slot_set:
                continue
            if not related or related in current_norms:
                continue
            candidates_by_slot.setdefault(slot, []).append(row)

    picked = []
    picked_norms = set()
    anchors = set(current_norms)
    for slot in RANDOM_PROMPT_ADULT_SLOT_ORDER:
        if len(picked) >= max_count:
            break
        candidates = []
        seen = set()
        for row in candidates_by_slot.get(slot, []):
            related = row.get("related")
            if not related or related in seen or related in picked_norms:
                continue
            if _random_prompt_adult_negative_conflicts(related, anchors.union(picked_norms)):
                continue
            seen.add(related)
            candidates.append(row)
        if not candidates:
            continue
        pool = candidates[: min(len(candidates), 10)]
        row = rng.choice(pool)
        related = row.get("related")
        if related:
            picked.append(_safe_danbooru_tag(related))
            picked_norms.add(related)
    return picked[:max(1, max_count)]


def _adult_character_row_allowed(row):
    return not (
        _random_prompt_adult_tag_blocked(row.get("character_tag"), character=True)
        or _random_prompt_adult_tag_blocked(row.get("copyright_tag"), character=True)
    )


def _pick_adult_random_character_tags(rng, subject_id, chance=1.0, copyright_chance=1.0):
    chance = max(0.0, min(1.0, _safe_float(chance, 1.0)))
    if chance < 1.0 and rng.random() > chance:
        return []
    rows = [
        row for row in _random_prompt_character_rows()
        if _character_subject_matches(row, subject_id) and _adult_character_row_allowed(row)
    ]
    if not rows:
        rows = [row for row in _random_prompt_character_rows() if _adult_character_row_allowed(row)]
    if not rows:
        return []
    top = rows[: min(len(rows), RANDOM_CHARACTER_SAMPLE_POOL)]
    picked = rng.choice(top)
    tags = [picked.get("character_tag")]
    copyright_chance = max(0.0, min(1.0, _safe_float(copyright_chance, 1.0)))
    if picked.get("copyright_tag") and rng.random() <= copyright_chance:
        tags.append(picked.get("copyright_tag"))
    return [tag for tag in tags if tag]


def _random_prompt_noise_tags():
    global _random_prompt_noise_cache
    if _random_prompt_noise_cache is not None:
        return _random_prompt_noise_cache
    noise = set()
    for row in _read_csv_dict_rows(RANDOM_PROMPT_NOISE_FILE):
        tag = _prompt_lookup_norm(row.get("tag"))
        reason = _clean_text(row.get("reason")).lower()
        if tag and reason in {"adult", "artist", "copyright", "bad_pattern", "low_value", "unwanted"}:
            noise.add(tag)
    _random_prompt_noise_cache = noise
    return noise


def _random_prompt_association_rows():
    global _random_prompt_association_cache
    if _random_prompt_association_cache is not None:
        return _random_prompt_association_cache
    by_trigger = {}
    for row in _read_csv_dict_rows(RANDOM_PROMPT_ASSOCIATIONS_FILE):
        trigger = _prompt_lookup_norm(row.get("trigger"))
        related = _prompt_lookup_norm(row.get("related"))
        slot = _clean_text(row.get("slot")).lower()
        if not trigger or not related or not slot:
            continue
        item = {
            "trigger": trigger,
            "related": related,
            "slot": slot,
            "support": _safe_int(row.get("support"), 0),
            "lift": _safe_float(row.get("lift"), 0.0),
            "score": _safe_float(row.get("score"), 0.0),
        }
        by_trigger.setdefault(trigger, []).append(item)
    for rows in by_trigger.values():
        rows.sort(key=lambda item: (-item["score"], -item["support"], item["related"]))
    _random_prompt_association_cache = by_trigger
    return by_trigger


def _random_prompt_character_rows():
    global _random_prompt_character_cache
    if _random_prompt_character_cache is not None:
        return _random_prompt_character_cache
    csv_rows = _read_csv_dict_rows(RANDOM_PROMPT_CHARACTERS_FILE)
    source_rows = list(csv_rows) + list(RANDOM_FALLBACK_CHARACTERS) if csv_rows else RANDOM_FALLBACK_CHARACTERS
    rows = []
    seen = set()
    for row in source_rows:
        character = _safe_danbooru_tag(row.get("character_tag"))
        copyright_tag = _safe_danbooru_tag(row.get("copyright_tag"))
        if not character:
            continue
        key = (character.lower(), copyright_tag.lower())
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "character_tag": character,
                "copyright_tag": copyright_tag,
                "subject_hint": _prompt_lookup_norm(row.get("subject_hint")),
                "score": _safe_float(row.get("score"), 0.0),
            }
        )
    rows.sort(key=lambda item: (-item["score"], item["character_tag"], item["copyright_tag"]))
    _random_prompt_character_cache = rows
    return rows


def _random_prompt_known_characters_zh_catalog():
    global _random_prompt_known_characters_zh_cache
    if _random_prompt_known_characters_zh_cache is not None:
        return _random_prompt_known_characters_zh_cache
    with open(RANDOM_PROMPT_KNOWN_CHARACTERS_ZH_FILE, "r", encoding="utf-8") as handle:
        catalog = json.load(handle)
    if (
        not isinstance(catalog, dict)
        or not isinstance(catalog.get("category"), dict)
        or not isinstance(catalog.get("items"), list)
    ):
        raise ValueError("Chinese known character catalog must contain a category and items list.")
    _random_prompt_known_characters_zh_cache = catalog
    return catalog


def _random_prompt_catalog_with_known_characters(catalog, content_mode):
    known_catalog = _random_prompt_known_characters_zh_catalog()
    character_category = dict(known_catalog.get("category") or {})
    character_items = []
    for item in known_catalog.get("items") or []:
        if not isinstance(item, dict):
            continue
        if content_mode == "nsfw" and item.get("allow_nsfw") is not True:
            continue
        character_items.append(dict(item))
    character_category["items"] = character_items

    categories = []
    inserted = False
    for category in catalog.get("categories") or []:
        if not isinstance(category, dict) or category.get("id") == "character":
            continue
        categories.append(category)
        if category.get("id") == "subject":
            categories.append(character_category)
            inserted = True
    if not inserted:
        categories.append(character_category)

    merged_catalog = dict(catalog)
    merged_catalog["categories"] = categories
    return merged_catalog


def _random_prompt_sfw_zh_catalog():
    global _random_prompt_sfw_zh_cache
    if _random_prompt_sfw_zh_cache is not None:
        return _random_prompt_sfw_zh_cache
    with open(RANDOM_PROMPT_SFW_ZH_FILE, "r", encoding="utf-8") as handle:
        catalog = json.load(handle)
    if not isinstance(catalog, dict) or not isinstance(catalog.get("categories"), list):
        raise ValueError("Chinese SFW prompt catalog must contain a categories list.")
    catalog = _random_prompt_catalog_with_known_characters(catalog, "sfw")
    _random_prompt_sfw_zh_cache = catalog
    return catalog


def _random_prompt_nsfw_zh_catalog():
    global _random_prompt_nsfw_zh_cache
    if _random_prompt_nsfw_zh_cache is not None:
        return _random_prompt_nsfw_zh_cache
    with open(RANDOM_PROMPT_NSFW_ZH_FILE, "r", encoding="utf-8") as handle:
        catalog = json.load(handle)
    if not isinstance(catalog, dict) or not isinstance(catalog.get("categories"), list):
        raise ValueError("Chinese NSFW prompt catalog must contain a categories list.")

    base_categories = {
        category.get("id"): category
        for category in _random_prompt_sfw_zh_catalog().get("categories") or []
        if isinstance(category, dict) and category.get("id")
    }
    merged_categories = []
    for category in catalog.get("categories") or []:
        if not isinstance(category, dict):
            continue
        merged = dict(category)
        if category.get("inherit"):
            base = base_categories.get(category.get("id")) or {}
            inherited_items = []
            for item in base.get("items") or []:
                if not isinstance(item, dict):
                    continue
                inherited = dict(item)
                if inherited.get("themes"):
                    inherited["themes"] = ["all"]
                inherited_items.append(inherited)
            merged = dict(base)
            merged.update({key: value for key, value in category.items() if key not in {"items", "inherit"}})
            merged["items"] = inherited_items + list(category.get("items") or [])
        merged_categories.append(merged)

    merged_catalog = dict(catalog)
    merged_catalog["categories"] = merged_categories
    merged_catalog = _random_prompt_catalog_with_known_characters(merged_catalog, "nsfw")
    _random_prompt_nsfw_zh_cache = merged_catalog
    return merged_catalog


def random_prompt_catalog_payload(content_mode="sfw"):
    mode = "nsfw" if _prompt_lookup_norm(content_mode) == "nsfw" else "sfw"
    if mode == "nsfw":
        catalog = _random_prompt_nsfw_zh_catalog()
        source_files = [
            "presets/scene_prompt_recommendations/random_prompt_sfw_zh.json",
            "presets/scene_prompt_recommendations/random_prompt_known_characters_zh.json",
            "presets/scene_prompt_recommendations/random_prompt_nsfw_zh.json",
        ]
    else:
        catalog = _random_prompt_sfw_zh_catalog()
        source_files = [
            "presets/scene_prompt_recommendations/random_prompt_known_characters_zh.json",
            "presets/scene_prompt_recommendations/random_prompt_sfw_zh.json",
        ]
    return {
        "ok": True,
        "content_mode": mode,
        "catalog": catalog,
        "source_file": source_files[-1],
        "source_files": source_files,
    }


def _prompt_lookup_tag_is_visual(tag):
    raw = str(tag or "").strip().lower()
    if raw.startswith("@") or "\\" in raw:
        return False
    if re.search(r"[,/&!:\\]|\(|\)|\[|\]", raw):
        return False
    clean = _prompt_lookup_norm(tag)
    if not clean or clean in RANDOM_BAD_LOOKUP_TAGS or clean in _random_prompt_noise_tags() or "kiss" in clean:
        return False
    if len(clean) > 48:
        return False
    if clean.count("_") > 5:
        return False
    return True


def _prompt_lookup_relevance(tag, query, fallback_tags=None):
    tag_norm = _prompt_lookup_norm(tag)
    query_norm = _prompt_lookup_norm(query)
    fallback_norms = {_prompt_lookup_norm(item) for item in fallback_tags or []}
    if not tag_norm or not query_norm:
        return 0
    if tag_norm in fallback_norms:
        return 120
    if tag_norm == query_norm:
        return 110
    if "_" not in query_norm:
        return 0
    if tag_norm.startswith(f"{query_norm}_"):
        suffix_parts = [part for part in tag_norm[len(query_norm) + 1:].split("_") if part]
        if len(suffix_parts) <= 1:
            return 92
        return 0
    if query_norm.startswith(f"{tag_norm}_") and len(tag_norm) >= max(6, int(len(query_norm) * 0.7)):
        return 76
    query_parts = [part for part in query_norm.split("_") if len(part) >= 3]
    tag_parts = tag_norm.split("_")
    if len(query_parts) >= 2 and len(tag_parts) <= len(query_parts) + 1 and all(part in tag_parts for part in query_parts):
        return 72
    return 0


def _lookup_prompt_tags(query, fallback_tags=None, source_mode="all", rng=None, max_count=1):
    fallbacks = [_safe_danbooru_tag(item) for item in fallback_tags or [] if _safe_danbooru_tag(item)]
    try:
        matches = canvas_danbooru_service._canvas_lookup_danbooru_tags(
            query,
            limit=12,
            source_mode=source_mode,
        )
    except Exception:
        matches = []
    candidates = []
    for item in matches or []:
        tag = _safe_danbooru_tag(item.get("tag") if isinstance(item, dict) else item)
        category = _clean_text(item.get("category") if isinstance(item, dict) else "").lower()
        if category in {"artist", "character", "copyright"}:
            continue
        if not tag or not _prompt_lookup_tag_is_visual(tag):
            continue
        relevance = _prompt_lookup_relevance(tag, query, fallback_tags=fallbacks)
        if relevance <= 0:
            continue
        count = _safe_int(item.get("count"), 0) if isinstance(item, dict) else 0
        candidates.append((relevance, count, tag))
    candidates.sort(key=lambda item: (-item[0], -item[1], item[2]))
    if candidates and rng is not None:
        top = candidates[: min(len(candidates), 5)]
        rng.shuffle(top)
        candidates = top + candidates[min(len(candidates), 5):]
    result = []
    for _relevance, _count, tag in candidates:
        if tag not in result:
            result.append(tag)
        if len(result) >= max_count:
            break
    for tag in fallbacks:
        if tag and tag not in result:
            result.append(tag)
        if len(result) >= max_count:
            break
    return result[:max(1, max_count)]


def _random_prompt_association_tags(current_tags, rng, max_count=5, allowed_slots=None):
    by_trigger = _random_prompt_association_rows()
    if not by_trigger:
        return []
    allowed_slot_keys = {
        _prompt_lookup_norm(slot)
        for slot in allowed_slots or []
        if _prompt_lookup_norm(slot)
    }
    current_norms = {_prompt_lookup_norm(tag) for tag in current_tags if _prompt_lookup_norm(tag)}
    picked = []
    picked_slots = set()
    candidates = []
    for trigger in current_norms:
        for row in by_trigger.get(trigger, [])[:18]:
            related = row.get("related")
            slot = row.get("slot")
            if allowed_slot_keys and _prompt_lookup_norm(slot) not in allowed_slot_keys:
                continue
            if not _random_prompt_related_tag_allowed(related, current_norms):
                continue
            candidates.append(row)
    rng.shuffle(candidates)
    candidates.sort(key=lambda item: (-item.get("score", 0.0), -item.get("support", 0), item.get("related", "")))
    for row in candidates:
        related = row.get("related")
        slot = row.get("slot")
        if not related or related in current_norms or related in picked:
            continue
        if slot in picked_slots and len(picked_slots) < 4:
            continue
        picked.append(_safe_danbooru_tag(related))
        picked_slots.add(slot)
        if len(picked) >= max_count:
            break
    return picked


def _random_prompt_related_tag_allowed(related, current_norms):
    related_norm = _prompt_lookup_norm(related)
    if not related_norm or related_norm in current_norms or related_norm in _random_prompt_noise_tags():
        return False
    if related_norm in RANDOM_BAD_LOOKUP_TAGS or "kiss" in related_norm:
        return False
    if related_norm == "male_focus" and "1boy" not in current_norms:
        return False
    if related_norm == "female_focus" and not current_norms.intersection({"1girl", "2girls"}):
        return False
    if "no_humans" in current_norms:
        if related_norm in {"male_focus", "female_focus", "pov", "solo_focus"}:
            return False
        if related_norm.startswith(("holding_", "looking_", "hand_", "arm_", "leg_")):
            return False
    return True


def _subject_accepts_character(subject_id):
    return _prompt_lookup_norm(subject_id) in {"solo_girl", "solo_boy", "duo"}


def _normalize_random_subject_mode(value):
    mode = _prompt_lookup_norm(value)
    aliases = {
        "people": "person",
        "human": "person",
        "character": "person",
        "animals": "animal",
        "landscape": "scenery",
        "landscapes": "scenery",
        "scene": "scenery",
    }
    mode = aliases.get(mode, mode)
    return mode if mode in RANDOM_SUBJECT_MODE_IDS else "auto"


def _pick_random_subject_profile(rng, subject_mode="auto"):
    mode = _normalize_random_subject_mode(subject_mode)
    if mode == "auto":
        return rng.choice(RANDOM_SUBJECT_PROFILES)
    accepted = RANDOM_SUBJECT_MODE_IDS[mode]
    candidates = [profile for profile in RANDOM_SUBJECT_PROFILES if profile.get("id") in accepted]
    return rng.choice(candidates or RANDOM_SUBJECT_PROFILES)


def _random_character_option_enabled(value):
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip().lower() not in {"", "0", "false", "no", "off"}
    return bool(value)


def _normalize_random_content_mode(value):
    mode = _prompt_lookup_norm(value)
    return mode if mode in {"sfw", "nsfw"} else "auto"


def _character_subject_matches(row, subject_id):
    hint = _prompt_lookup_norm(row.get("subject_hint"))
    subject = _prompt_lookup_norm(subject_id)
    if not hint:
        return True
    if subject == "solo_boy":
        return hint == "1boy"
    if subject in {"solo_girl", "duo"}:
        return hint in {"1girl", "2girls", "multiple_girls"}
    return False


def _pick_random_character_tags(rng, subject_id):
    if not _subject_accepts_character(subject_id):
        return []
    rows = [row for row in _random_prompt_character_rows() if _character_subject_matches(row, subject_id)]
    if not rows:
        rows = _random_prompt_character_rows()
    if not rows:
        return []
    top = rows[: min(len(rows), RANDOM_CHARACTER_SAMPLE_POOL)]
    picked = rng.choice(top)
    tags = [picked.get("character_tag")]
    if picked.get("copyright_tag"):
        tags.append(picked.get("copyright_tag"))
    return [tag for tag in tags if tag]


def _dedupe_tags(tags):
    output = []
    seen = set()
    for tag in tags:
        clean = _safe_danbooru_tag(tag)
        if not clean:
            continue
        key = clean.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(clean)
    return output


def _pick_group(rng, groups):
    if not groups:
        return []
    picked = rng.choice(groups)
    return list(picked or [])


def _normalize_random_prompt_recent_history(value):
    if not isinstance(value, (list, tuple)):
        return []
    output = []
    axis_keys = set(RANDOM_PROMPT_RECENT_AXIS_SCORES)
    for row in list(value)[-RANDOM_PROMPT_RECENT_HISTORY_LIMIT:]:
        if not isinstance(row, dict):
            continue
        axes = row.get("axes") if isinstance(row.get("axes"), dict) else {}
        clean_axes = {
            key: _clean_text(axes.get(key))
            for key in axis_keys
            if _clean_text(axes.get(key))
        }
        raw_tags = row.get("tags")
        if isinstance(raw_tags, str):
            raw_tags = raw_tags.split(",")
        clean_tags = []
        for tag in raw_tags or []:
            clean = _prompt_lookup_norm(tag)
            if clean and clean not in clean_tags:
                clean_tags.append(clean)
            if len(clean_tags) >= RANDOM_PROMPT_RECENT_TAG_LIMIT:
                break
        output.append({
            "profile": _clean_text(row.get("profile")),
            "content_level": _prompt_lookup_norm(row.get("content_level")),
            "axes": clean_axes,
            "tags": clean_tags,
        })
    return output


def _random_prompt_recent_candidate_tags(profile):
    fields = (
        "tags", "axis_detail", "setting", "camera", "pose", "event_setup", "action", "event_turn",
        "interaction", "expression", "event_reaction", "body_detail", "event_effect", "finish_detail", "lighting",
    )
    output = set()

    def collect(value):
        if isinstance(value, (list, tuple, set)):
            for item in value:
                collect(item)
            return
        clean = _prompt_lookup_norm(value)
        if clean and clean not in RANDOM_PROMPT_RECENT_TAG_IGNORE:
            output.add(clean)

    for field in fields:
        collect(profile.get(field))
    return output


def _random_prompt_recent_candidate_score(profile, recent_history):
    if not recent_history:
        return 0.0
    axes = profile.get("axis_choices") if isinstance(profile.get("axis_choices"), dict) else {}
    profile_id = _clean_text(profile.get("id"))
    candidate_tags = _random_prompt_recent_candidate_tags(profile)
    score = 0.0
    for age, recent in enumerate(reversed(recent_history)):
        recency = RANDOM_PROMPT_RECENT_RECENCY[min(age, len(RANDOM_PROMPT_RECENT_RECENCY) - 1)]
        recent_axes = recent.get("axes") if isinstance(recent.get("axes"), dict) else {}
        for key, axis_score in RANDOM_PROMPT_RECENT_AXIS_SCORES.items():
            candidate_value = _clean_text(axes.get(key))
            if candidate_value and candidate_value == _clean_text(recent_axes.get(key)):
                score += axis_score * recency
        if not axes and profile_id and profile_id == _clean_text(recent.get("profile")):
            score += 6.0 * recency
        recent_tags = set(recent.get("tags") or ()) - RANDOM_PROMPT_RECENT_TAG_IGNORE
        overlap = candidate_tags.intersection(recent_tags)
        score += min(8, len(overlap)) * 0.22 * recency
    return score


def _pick_recent_nsfw_candidate(rng, candidates, recent_history):
    rows = [profile for profile in candidates or [] if isinstance(profile, dict)]
    if not rows:
        return {}
    if not recent_history or len(rows) == 1:
        return rows[0]
    weighted = []
    total = 0.0
    for profile in rows:
        score = _random_prompt_recent_candidate_score(profile, recent_history)
        weight = 1.0 / ((1.0 + score) ** 2)
        total += weight
        weighted.append((total, profile))
    target = rng.uniform(0.0, total)
    for upper, profile in weighted:
        if target <= upper:
            return profile
    return weighted[-1][1]


def _pick_weighted_profile(rng, profiles):
    rows = [profile for profile in profiles or [] if isinstance(profile, dict)]
    if not rows:
        return {}
    weighted = []
    total = 0
    for profile in rows:
        weight = max(1, _safe_int(profile.get("weight"), 1))
        total += weight
        weighted.append((total, profile))
    target = rng.uniform(0, total)
    for upper, profile in weighted:
        if target <= upper:
            return profile
    return weighted[-1][1]


def _random_prompt_nsfw_axis_archetypes(content_level):
    if content_level == "suggestive":
        return RANDOM_PROMPT_NSFW_SUGGESTIVE_PROFILES
    if content_level == "nudity":
        return RANDOM_PROMPT_NSFW_NUDITY_PROFILES
    return []


def _random_prompt_nsfw_axis_contexts(profile):
    return set(RANDOM_PROMPT_NSFW_AXIS_CONTEXTS.get(_clean_text(profile.get("id"))) or ())


def _random_prompt_nsfw_axis_subject_allows(profile, subject):
    profile_id = _clean_text(profile.get("id"))
    included = {_clean_text(item) for item in subject.get("include_profiles") or [] if _clean_text(item)}
    excluded = {_clean_text(item) for item in subject.get("exclude_profiles") or [] if _clean_text(item)}
    if included and profile_id not in included:
        return False
    return profile_id not in excluded


def _random_prompt_nsfw_axis_activity_allows(activity, subject):
    subject_key = _prompt_lookup_norm(subject.get("id"))
    allowed = {
        _prompt_lookup_norm(item) for item in activity.get("subjects") or [] if _prompt_lookup_norm(item)
    }
    return not allowed or subject_key in allowed


def _random_prompt_nsfw_axis_expression_allows(profile, subject):
    profile_subject = _prompt_lookup_norm(profile.get("subject_id"))
    subject_key = _prompt_lookup_norm(subject.get("id"))
    if subject_key == "solo_girl":
        return profile_subject == "solo_girl"
    if subject_key == "solo_boy":
        return profile_subject == "solo_boy"
    return profile_subject in {"solo_girl", "duo"}


def _random_prompt_nsfw_axis_activity_contexts(activity):
    return {_prompt_lookup_norm(item) for item in activity.get("contexts") or [] if _prompt_lookup_norm(item)}


def _pick_compatible_nsfw_axis_profile(rng, base_profile, profiles):
    base_contexts = _random_prompt_nsfw_axis_contexts(base_profile)
    scored = []
    for profile in profiles or []:
        overlap = len(base_contexts.intersection(_random_prompt_nsfw_axis_contexts(profile)))
        if overlap <= 0:
            continue
        scored.append((overlap, profile))
    strong = [(overlap, profile) for overlap, profile in scored if overlap >= 2]
    pool = strong if len(strong) >= 2 else scored
    weighted = [
        {
            **profile,
            "weight": max(1, _safe_int(profile.get("weight"), 1)) * (3 if overlap >= 2 else 1),
        }
        for overlap, profile in pool
    ]
    return _pick_weighted_profile(rng, weighted) or base_profile


def _pick_compatible_nsfw_axis_activity(rng, base_profile, activities, subject):
    base_contexts = _random_prompt_nsfw_axis_contexts(base_profile)
    scored = []
    for activity in activities or []:
        if not _random_prompt_nsfw_axis_activity_allows(activity, subject):
            continue
        overlap = len(base_contexts.intersection(_random_prompt_nsfw_axis_activity_contexts(activity)))
        if overlap <= 0:
            continue
        scored.append((overlap, activity))
    strong = [(overlap, activity) for overlap, activity in scored if overlap >= 2]
    pool = strong if len(strong) >= 2 else scored
    weighted = [
        {
            **activity,
            "weight": max(1, _safe_int(activity.get("weight"), 1)) * (3 if overlap >= 2 else 1),
        }
        for overlap, activity in pool
    ]
    return _pick_weighted_profile(rng, weighted)


def _random_prompt_nsfw_axis_event_allows(event, content_level, base_profile, activity, subject):
    levels = {_prompt_lookup_norm(item) for item in event.get("levels") or [] if _prompt_lookup_norm(item)}
    activities = {_clean_text(item) for item in event.get("activities") or [] if _clean_text(item)}
    subjects = {_prompt_lookup_norm(item) for item in event.get("subjects") or [] if _prompt_lookup_norm(item)}
    wardrobes = {_clean_text(item) for item in event.get("wardrobes") or [] if _clean_text(item)}
    if levels and content_level not in levels:
        return False
    if activities and _clean_text(activity.get("id")) not in activities:
        return False
    if subjects and _prompt_lookup_norm(subject.get("id")) not in subjects:
        return False
    if wardrobes and _clean_text(base_profile.get("id")) not in wardrobes:
        return False
    return True


def _pick_compatible_nsfw_axis_event(rng, content_level, base_profile, activity, subject):
    base_contexts = _random_prompt_nsfw_axis_contexts(base_profile)
    activity_contexts = _random_prompt_nsfw_axis_activity_contexts(activity)
    scored = []
    for event in RANDOM_PROMPT_NSFW_AXIS_EVENTS:
        if not _random_prompt_nsfw_axis_event_allows(event, content_level, base_profile, activity, subject):
            continue
        event_contexts = {
            _prompt_lookup_norm(item) for item in event.get("contexts") or [] if _prompt_lookup_norm(item)
        }
        overlap = len(base_contexts.intersection(event_contexts)) + len(activity_contexts.intersection(event_contexts))
        if overlap <= 0:
            continue
        scored.append((overlap, event))
    strong = [(overlap, event) for overlap, event in scored if overlap >= 3]
    pool = strong if len(strong) >= 2 else scored
    weighted = [
        {
            **event,
            "weight": max(1, _safe_int(event.get("weight"), 1)) * (3 if overlap >= 3 else 1),
        }
        for overlap, event in pool
    ]
    return _pick_weighted_profile(rng, weighted)


def _random_prompt_nsfw_axis_theme_tags(profile):
    return [
        tag
        for tag in profile.get("tags") or []
        if _prompt_lookup_norm(tag) not in RANDOM_PROMPT_NSFW_AXIS_SUBJECT_TAGS
    ]


def _build_developer_nsfw_axis_profile(rng, content_level):
    archetypes = [profile for profile in _random_prompt_nsfw_axis_archetypes(content_level) if isinstance(profile, dict)]
    activities = [
        activity
        for activity in RANDOM_PROMPT_NSFW_AXIS_ACTIVITIES.get(content_level) or []
        if isinstance(activity, dict)
    ]
    subject = _pick_weighted_profile(rng, RANDOM_PROMPT_NSFW_AXIS_SUBJECTS.get(content_level))
    base_candidates = [
        profile for profile in archetypes if _random_prompt_nsfw_axis_subject_allows(profile, subject)
    ]
    base_profile = _pick_weighted_profile(rng, base_candidates or archetypes)
    activity = _pick_compatible_nsfw_axis_activity(rng, base_profile, activities, subject)
    event = _pick_compatible_nsfw_axis_event(rng, content_level, base_profile, activity, subject)
    setting_profile = _pick_compatible_nsfw_axis_profile(rng, base_profile, archetypes)
    expression_candidates = [
        profile for profile in archetypes if _random_prompt_nsfw_axis_expression_allows(profile, subject)
    ]
    expression_profile = _pick_compatible_nsfw_axis_profile(rng, base_profile, expression_candidates)

    setting_group = _pick_group(rng, setting_profile.get("setting"))
    pose_group = _pick_group(rng, activity.get("pose"))
    action_group = _pick_group(rng, activity.get("action"))
    event_setup_group = _pick_group(rng, event.get("setup"))
    event_turn_group = _pick_group(rng, event.get("turn"))
    event_reaction_group = _pick_group(rng, event.get("reaction"))
    event_effect_group = _pick_group(rng, event.get("effect"))
    expression_group = _pick_group(rng, expression_profile.get("expression"))
    body_detail_group = _pick_group(rng, base_profile.get("body_detail"))
    lighting_group = _pick_group(rng, setting_profile.get("lighting"))
    camera_group = _pick_group(rng, RANDOM_PROMPT_NSFW_AXIS_CAMERA_GROUPS)
    interaction_group = []
    if rng.random() <= max(0.0, min(1.0, _safe_float(subject.get("interaction_chance"), 0.0))):
        interaction_group = _pick_group(rng, subject.get("interaction"))

    trigger_tags = []
    for source in (base_profile, activity):
        for tag in source.get("trigger_tags") or []:
            clean = _clean_text(tag)
            if clean and clean not in trigger_tags:
                trigger_tags.append(clean)
    detail_candidates = list(trigger_tags)
    rng.shuffle(detail_candidates)
    detail_count = rng.choice((1, 2, 2, 3)) if detail_candidates else 0
    axis_detail_group = detail_candidates[:detail_count]

    return {
        "id": f"dev_nsfw_axes_{content_level}",
        "content_level": content_level,
        "subject_id": subject.get("subject_id"),
        "character_chance": subject.get("character_chance", 0.6),
        "copyright_chance": subject.get("copyright_chance", 0.35),
        "camera_chance": 0.82,
        "lighting_chance": 0.72 if content_level == "suggestive" else 0.8,
        "association_max": 0,
        "trigger_tags": trigger_tags,
        "tags": list(subject.get("tags") or []) + _random_prompt_nsfw_axis_theme_tags(base_profile),
        "axis_detail": [axis_detail_group] if axis_detail_group else [],
        "setting": [setting_group],
        "camera": [camera_group],
        "pose": [pose_group],
        "event_setup": [event_setup_group],
        "action": [action_group],
        "event_turn": [event_turn_group],
        "interaction": [interaction_group] if interaction_group else [],
        "expression": [expression_group],
        "event_reaction": [event_reaction_group],
        "body_detail": [body_detail_group],
        "event_effect": [event_effect_group],
        "lighting": [lighting_group],
        "axis_choices": {
            "subject": subject.get("id"),
            "wardrobe_exposure": base_profile.get("id"),
            "activity": activity.get("id"),
            "event": event.get("id"),
            "setting": setting_profile.get("id"),
            "expression": expression_profile.get("id"),
        },
    }


def _pick_developer_nsfw_profile(rng, recent_history=None, content_levels=None):
    profiles = [profile for profile in RANDOM_PROMPT_NSFW_PROFILES if isinstance(profile, dict)]
    allowed_levels = {
        _prompt_lookup_norm(level)
        for level in content_levels or []
        if _prompt_lookup_norm(level)
    }
    if allowed_levels:
        filtered = [
            profile
            for profile in profiles
            if _prompt_lookup_norm(profile.get("content_level")) in allowed_levels
        ]
        if filtered:
            profiles = filtered
    profiles_by_level = {}
    for profile in profiles:
        level = _prompt_lookup_norm(profile.get("content_level"))
        if level in RANDOM_PROMPT_NSFW_CONTENT_LEVEL_WEIGHTS:
            profiles_by_level.setdefault(level, []).append(profile)
    if not profiles_by_level:
        return _pick_weighted_profile(rng, profiles)
    level_profile = _pick_weighted_profile(
        rng,
        [
            {"id": level, "weight": weight}
            for level, weight in RANDOM_PROMPT_NSFW_CONTENT_LEVEL_WEIGHTS.items()
            if profiles_by_level.get(level)
        ],
    )
    content_level = level_profile.get("id")
    level_profiles = profiles_by_level.get(content_level, profiles)
    axis_profile_ids = {
        _clean_text(profile.get("id"))
        for profile in _random_prompt_nsfw_axis_archetypes(content_level)
        if _clean_text(profile.get("id"))
    }
    selected_profile_ids = {
        _clean_text(profile.get("id")) for profile in level_profiles if _clean_text(profile.get("id"))
    }
    candidate_count = RANDOM_PROMPT_RECENT_CANDIDATE_COUNT if recent_history else 1
    if content_level in {"suggestive", "nudity"} and selected_profile_ids.issubset(axis_profile_ids):
        candidates = [
            _build_developer_nsfw_axis_profile(rng, content_level)
            for _index in range(candidate_count)
        ]
        return _pick_recent_nsfw_candidate(rng, candidates, recent_history)
    candidates = [
        _pick_weighted_profile(rng, level_profiles)
        for _index in range(candidate_count)
    ]
    return _pick_recent_nsfw_candidate(rng, candidates, recent_history)


def _profile_id_matches(value, allowed_values):
    allowed = {_prompt_lookup_norm(item) for item in allowed_values or [] if _prompt_lookup_norm(item)}
    if not allowed:
        return True
    return _prompt_lookup_norm(value) in allowed


def _pick_sfw_theme_profile(rng, subject_id, scene_id):
    subject_matches = [
        profile
        for profile in RANDOM_SFW_THEME_PROFILES
        if _profile_id_matches(subject_id, profile.get("subject_ids"))
    ]
    scene_matches = [
        profile
        for profile in subject_matches
        if _profile_id_matches(scene_id, profile.get("scene_ids"))
    ]
    return _pick_weighted_profile(rng, scene_matches or subject_matches or RANDOM_SFW_THEME_PROFILES)


def _extend_tag_group(tags, slots, slot_name, values):
    clean_values = [item for item in values or [] if _clean_text(item)]
    if not clean_values:
        return
    tags.extend(clean_values)
    slots.append({"slot": slot_name, "values": clean_values})


def _random_prompt_lookup_terms(rng, subject, scene, theme=None):
    terms = []
    values = []
    values.extend(subject.get("lookup_terms") or [])
    values.extend(scene.get("lookup_terms") or [])
    if isinstance(theme, dict):
        values.extend(theme.get("lookup_terms") or [])
    for value in values:
        clean = _clean_text(value)
        if clean and clean not in terms:
            terms.append(clean)
    rng.shuffle(terms)
    return terms[:3]


def _compose_developer_nsfw_random_prompt(
    preset_name="",
    scene_theme="",
    lang="cn",
    seed=None,
    recent_history=None,
    include_character=None,
    content_levels=None,
):
    rng = random.Random(seed) if seed is not None else random.Random()
    recent_history = _normalize_random_prompt_recent_history(recent_history)
    profile = _pick_developer_nsfw_profile(
        rng,
        recent_history=recent_history,
        content_levels=content_levels,
    )
    picked_slots = []
    prompt_tags = []

    _extend_tag_group(prompt_tags, picked_slots, "rating", ["nsfw"])
    _extend_tag_group(prompt_tags, picked_slots, "subject", profile.get("tags"))
    _extend_tag_group(prompt_tags, picked_slots, "axis_detail", _pick_group(rng, profile.get("axis_detail")))
    character_tags = []
    if _random_character_option_enabled(include_character):
        character_tags = _pick_adult_random_character_tags(
            rng,
            profile.get("subject_id"),
            chance=1.0 if include_character is not None else profile.get("character_chance", 1.0),
            copyright_chance=profile.get("copyright_chance", 1.0),
        )
    _extend_tag_group(prompt_tags, picked_slots, "character", character_tags)
    _extend_tag_group(prompt_tags, picked_slots, "setting", _pick_group(rng, profile.get("setting")))
    _extend_tag_group(prompt_tags, picked_slots, "event_setup", _pick_group(rng, profile.get("event_setup")))
    camera_chance = max(0.0, min(1.0, _safe_float(profile.get("camera_chance"), 0.0)))
    if camera_chance > 0.0 and rng.random() <= camera_chance:
        _extend_tag_group(prompt_tags, picked_slots, "camera", _pick_group(rng, profile.get("camera")))
    _extend_tag_group(prompt_tags, picked_slots, "pose", _pick_group(rng, profile.get("pose")))
    _extend_tag_group(prompt_tags, picked_slots, "adult_action", _pick_group(rng, profile.get("action")))
    _extend_tag_group(prompt_tags, picked_slots, "event_turn", _pick_group(rng, profile.get("event_turn")))
    _extend_tag_group(prompt_tags, picked_slots, "interaction", _pick_group(rng, profile.get("interaction")))
    _extend_tag_group(prompt_tags, picked_slots, "adult_expression", _pick_group(rng, profile.get("expression")))
    _extend_tag_group(prompt_tags, picked_slots, "event_reaction", _pick_group(rng, profile.get("event_reaction")))
    _extend_tag_group(prompt_tags, picked_slots, "adult_body_detail", _pick_group(rng, profile.get("body_detail")))
    _extend_tag_group(prompt_tags, picked_slots, "event_effect", _pick_group(rng, profile.get("event_effect")))
    _extend_tag_group(prompt_tags, picked_slots, "adult_finish_detail", _pick_group(rng, profile.get("finish_detail")))
    if rng.random() <= max(0.0, min(1.0, _safe_float(profile.get("lighting_chance"), 1.0))):
        _extend_tag_group(prompt_tags, picked_slots, "lighting", _pick_group(rng, profile.get("lighting")))

    association_tags = _random_prompt_adult_stats_tags(
        profile.get("trigger_tags"),
        prompt_tags,
        rng,
        max_count=max(0, _safe_int(profile.get("association_max"), 6)),
        allowed_slots=profile.get("association_slots"),
    )
    _extend_tag_group(prompt_tags, picked_slots, "adult_association_stats", association_tags)
    prompt = ", ".join(_dedupe_tags(prompt_tags))
    title = "Random Prompt (NSFW)" if _clean_lang(lang) == "en" else "随机提示词(NSFW)"
    return {
        "ok": True,
        "preset": _clean_text(preset_name),
        "scene_theme": _clean_text(scene_theme),
        "item": {
            "id": "developer_random_nsfw",
            "target": "positive_prompt",
            "mode": "replace",
            "title": title,
            "prompt": prompt,
            "seed_terms": [_safe_danbooru_tag(tag) for tag in profile.get("trigger_tags") or []],
            "slots": picked_slots,
            "recipe": {
                "mode": "developer_nsfw",
                "profile": profile.get("id"),
                "content_level": _prompt_lookup_norm(profile.get("content_level")) or "explicit",
                "axes": profile.get("axis_choices") or {},
                "character": character_tags[:1],
                "stat_triggers": [_safe_danbooru_tag(tag) for tag in profile.get("trigger_tags") or []],
            },
            "source": "developer_nsfw_random_prompt",
        },
    }


def compose_random_prompt(
    preset_name="",
    scene_theme="",
    lang="cn",
    seed=None,
    source_mode="all",
    prompt_text="",
    recent_history=None,
    subject_mode="auto",
    include_character=None,
    content_mode="auto",
):
    normalized_content_mode = _normalize_random_content_mode(content_mode)
    use_nsfw = normalized_content_mode == "nsfw" or (
        normalized_content_mode == "auto"
        and (_developer_random_prompt_nsfw_enabled() or _random_prompt_nsfw_requested(prompt_text))
    )
    if use_nsfw:
        nsfw_options = {
            "preset_name": preset_name,
            "scene_theme": scene_theme,
            "lang": lang,
            "seed": seed,
            "recent_history": recent_history,
        }
        if include_character is not None:
            nsfw_options["include_character"] = include_character
        if normalized_content_mode == "nsfw":
            nsfw_options["content_levels"] = {"suggestive"}
        return _compose_developer_nsfw_random_prompt(**nsfw_options)

    rng = random.Random(seed) if seed is not None else random.Random()
    subject = _pick_random_subject_profile(rng, subject_mode=subject_mode)
    scene = rng.choice(RANDOM_SCENE_PROFILES)
    theme = _pick_sfw_theme_profile(rng, subject.get("id"), scene.get("id"))
    scenery_only = "no_humans" in subject.get("tags", [])
    composition_key = "scenery" if scenery_only else "character"
    picked_slots = []
    lookup_terms = []
    prompt_tags = []

    _extend_tag_group(prompt_tags, picked_slots, "subject", subject.get("tags"))
    character_tags = (
        _pick_random_character_tags(rng, subject.get("id"))
        if _random_character_option_enabled(include_character)
        else []
    )
    _extend_tag_group(prompt_tags, picked_slots, "character", character_tags)
    _extend_tag_group(prompt_tags, picked_slots, "appearance", _pick_group(rng, subject.get("appearance")))
    _extend_tag_group(prompt_tags, picked_slots, "outfit", _pick_group(rng, subject.get("outfit")))
    _extend_tag_group(prompt_tags, picked_slots, "theme", theme.get("tags"))
    _extend_tag_group(prompt_tags, picked_slots, "theme_outfit", _pick_group(rng, theme.get("outfit")))
    _extend_tag_group(prompt_tags, picked_slots, "action", _pick_group(rng, subject.get("action")))
    _extend_tag_group(prompt_tags, picked_slots, "theme_action", _pick_group(rng, theme.get("action")))
    _extend_tag_group(prompt_tags, picked_slots, "interaction", _pick_group(rng, theme.get("interaction")))
    _extend_tag_group(prompt_tags, picked_slots, "setting", scene.get("tags"))
    _extend_tag_group(prompt_tags, picked_slots, "scene_detail", _pick_group(rng, scene.get("details")))
    _extend_tag_group(prompt_tags, picked_slots, "theme_scene_detail", _pick_group(rng, theme.get("scene_detail")))
    _extend_tag_group(prompt_tags, picked_slots, "prop", _pick_group(rng, theme.get("prop")))
    _extend_tag_group(prompt_tags, picked_slots, "lighting", _pick_group(rng, scene.get("lighting")))
    visual_direction = _pick_weighted_profile(rng, RANDOM_VISUAL_DIRECTION_PROFILES.get(composition_key))
    _extend_tag_group(prompt_tags, picked_slots, "composition", visual_direction.get("composition"))
    _extend_tag_group(prompt_tags, picked_slots, "camera_lens", _pick_group(rng, visual_direction.get("lens")))
    if rng.random() <= _safe_float(RANDOM_SFW_OPTIONAL_SLOT_CHANCES.get("atmosphere"), 1.0):
        _extend_tag_group(prompt_tags, picked_slots, "atmosphere", _pick_group(rng, RANDOM_ATMOSPHERE_GROUPS))
    art_direction = {}
    if rng.random() <= _safe_float(RANDOM_SFW_OPTIONAL_SLOT_CHANCES.get("style"), 1.0):
        art_direction = _pick_weighted_profile(rng, RANDOM_ART_DIRECTION_PROFILES)
        _extend_tag_group(prompt_tags, picked_slots, "style", art_direction.get("style"))
        _extend_tag_group(prompt_tags, picked_slots, "color_design", _pick_group(rng, art_direction.get("color")))

    for term in _random_prompt_lookup_terms(rng, subject, scene, theme):
        tags = _lookup_prompt_tags(term, source_mode=source_mode, rng=rng, max_count=1)
        if tags:
            lookup_terms.append(term)
            _extend_tag_group(prompt_tags, picked_slots, "danbooru_related", tags)

    association_tags = _random_prompt_association_tags(
        prompt_tags,
        rng,
        max_count=max(0, _safe_int(theme.get("association_max"), 5)),
        allowed_slots=theme.get("association_slots"),
    )
    _extend_tag_group(prompt_tags, picked_slots, "association_stats", association_tags)

    _extend_tag_group(prompt_tags, picked_slots, "quality", RANDOM_QUALITY_TAGS)

    prompt = ", ".join(_dedupe_tags(prompt_tags))
    return {
        "ok": True,
        "preset": _clean_text(preset_name),
        "scene_theme": _clean_text(scene_theme),
        "item": {
            "id": "local_random_danbooru",
            "target": "positive_prompt",
            "mode": "replace",
            "title": "Random Prompt" if _clean_lang(lang) == "en" else "随机提示词",
            "prompt": prompt,
            "seed_terms": lookup_terms,
            "slots": picked_slots,
            "recipe": {
                "subject": subject.get("id"),
                "scene": scene.get("id"),
                "theme": theme.get("id"),
                "character": character_tags[:1],
                "visual_direction": visual_direction.get("id"),
                "art_direction": art_direction.get("id"),
            },
            "source": "local_prompt_recipe_danbooru_lookup",
        },
    }
