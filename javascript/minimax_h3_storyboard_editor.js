(function initMiniMaxH3StoryboardEditor(root) {
    if (root.SimpAIH3StoryboardEditor) {
        if (typeof module !== 'undefined' && module.exports) module.exports = root.SimpAIH3StoryboardEditor;
        return;
    }

    const MODE_T2VA = 'T2VA';
    const MODE_I2VA = 'I2VA';
    const MODE_FL2VA = 'FL2VA';
    const MODE_L2VA = 'L2VA';
    const MODE_REF2VA = 'Ref2VA';
    const MAX_SHOTS = 20;
    const H3_FPS = 24;
    const H3_MIN_DURATION = 4;
    const H3_MAX_DURATION = 30;
    const MIN_SHOT_DURATION = Math.round((1 / H3_FPS) * 1000) / 1000;
    const DIALOGUE_CJK_CHARS_PER_SECOND = 4.5;
    const DIALOGUE_WORDS_PER_SECOND = 2.6;
    const DIALOGUE_DIGITS_PER_SECOND = 3.5;
    const DIALOGUE_PAUSE_SECONDS = 0.06;
    const DIALOGUE_HEADROOM_SECONDS = 0.18;
    const SHOT_TEMPLATES = Object.freeze({
        one_take: Object.freeze({
            id: 'one_take',
            label_en: 'One continuous take',
            label_cn: '\u4e00\u955c\u5230\u5e95',
            shots: Object.freeze([{ 
                description: Object.freeze({
                    en: 'A continuous take carries the subject from the opening action to the ending beat.',
                    cn: '\u4e00\u955c\u5230\u5e95\uff0c\u4e3b\u4f53\u4ece\u5f00\u573a\u52a8\u4f5c\u8fde\u7eed\u63a8\u8fdb\u5230\u7ed3\u5c3e\u52a8\u4f5c\u3002'
                }),
                camera: Object.freeze({
                    en: 'One continuous take follows the subject from start to finish with a gradual move.',
                    cn: '\u8fde\u7eed\u957f\u955c\u5934\u8ddf\u968f\u4e3b\u4f53，\u4ece\u5f00\u573a\u5e73\u6ed1\u63a8\u8fdb\u5230\u7ed3\u5c3e\u3002'
                }),
                dialogue: '',
                sound: ''
            }])
        }),
        three_act: Object.freeze({
            id: 'three_act',
            label_en: 'Three-beat narrative',
            label_cn: '\u4e09\u6bb5\u53d9\u4e8b',
            shots: Object.freeze([
                Object.freeze({
                    description: Object.freeze({
                        en: 'Establish the setting, subject, and immediate goal.',
                        cn: '\u4ea4\u4ee3\u573a\u666f、\u4e3b\u4f53\u548c\u5f53\u4e0b\u76ee\u6807。'
                    }),
                    camera: Object.freeze({
                        en: 'Wide establishing shot, then a gentle move toward the subject.',
                        cn: '\u5e7f\u89d2\u5efa\u7acb\u955c\u5934\uff0c\u518d\u5e73\u7f13\u79fb\u5411\u4e3b\u4f53\u3002'
                    }),
                    dialogue: '',
                    sound: ''
                }),
                Object.freeze({
                    description: Object.freeze({
                        en: 'Show the main action and its visible change.',
                        cn: '\u5c55\u793a\u4e3b\u8981\u52a8\u4f5c\u548c\u53ef\u89c1\u53d8\u5316\u3002'
                    }),
                    camera: Object.freeze({
                        en: 'Medium tracking shot follows the key action.',
                        cn: '\u4e2d\u666f\u8ddf\u62cd\u8ddf\u968f\u5173\u952e\u52a8\u4f5c\u3002'
                    }),
                    dialogue: '',
                    sound: ''
                }),
                Object.freeze({
                    description: Object.freeze({
                        en: 'End on the result or a clear final beat.',
                        cn: '\u4ee5\u7ed3\u679c\u6216\u660e\u786e\u7684\u7ed3\u5c3e\u8282\u594f\u6536\u675f\u3002'
                    }),
                    camera: Object.freeze({
                        en: 'Hold on the result with a controlled push-in or pull-back.',
                        cn: '\u7a33\u5b9a\u505c\u7559\u5728\u7ed3\u679c\u4e0a\uff0c\u914d\u5408\u53d7\u63a7\u7684\u63a8\u8fdb\u6216\u62c9\u8fdc\u3002'
                    }),
                    dialogue: '',
                    sound: ''
                })
            ])
        }),
        long_form: Object.freeze({
            id: 'long_form',
            label_en: 'Long-form progression',
            label_cn: '\u957f\u65f6\u6bb5\u63a8\u8fdb',
            shots: Object.freeze([
                Object.freeze({
                    description: Object.freeze({
                        en: 'Establish the starting state, subject goal, setting, and visual anchors.',
                        cn: '\u4ea4\u4ee3\u5f00\u573a\u72b6\u6001\u3001\u4e3b\u4f53\u76ee\u6807\u3001\u73af\u5883\u548c\u7a33\u5b9a\u7684\u89c6\u89c9\u7279\u5f81\u3002'
                    }),
                    camera: Object.freeze({
                        en: 'Measured establishing move that reveals the subject and the direction of action.',
                        cn: '\u4ee5\u53d7\u63a7\u7684\u5efa\u7acb\u955c\u5934\u5c55\u793a\u4e3b\u4f53\u548c\u52a8\u4f5c\u65b9\u5411\u3002'
                    }),
                    dialogue: '',
                    sound: ''
                }),
                Object.freeze({
                    description: Object.freeze({
                        en: 'Begin the main action and show the first physical or emotional change.',
                        cn: '\u5f00\u59cb\u4e3b\u8981\u52a8\u4f5c\uff0c\u5c55\u793a\u7b2c\u4e00\u4e2a\u53ef\u89c1\u7684\u7269\u7406\u6216\u60c5\u7eea\u53d8\u5316\u3002'
                    }),
                    camera: Object.freeze({
                        en: 'Tracking or lateral move follows the subject through the first transition.',
                        cn: '\u7528\u8ddf\u62cd\u6216\u6a2a\u79fb\u8ddf\u968f\u4e3b\u4f53\u5b8c\u6210\u7b2c\u4e00\u6b21\u72b6\u6001\u8f6c\u6362\u3002'
                    }),
                    dialogue: '',
                    sound: ''
                }),
                Object.freeze({
                    description: Object.freeze({
                        en: 'Develop the action through a causal obstacle, interaction, or visible escalation.',
                        cn: '\u901a\u8fc7\u6709\u56e0\u679c\u5173\u7cfb\u7684\u969c\u788d\u3001\u4ea4\u4e92\u6216\u5347\u7ea7\u63a8\u8fdb\u52a8\u4f5c\u3002'
                    }),
                    camera: Object.freeze({
                        en: 'Change distance or viewpoint to keep the physical cause and effect readable.',
                        cn: '\u6539\u53d8\u666f\u522b\u6216\u89c6\u89d2\uff0c\u8ba9\u52a8\u4f5c\u7684\u56e0\u679c\u5173\u7cfb\u4fdd\u6301\u6e05\u6670\u3002'
                    }),
                    dialogue: '',
                    sound: ''
                }),
                Object.freeze({
                    description: Object.freeze({
                        en: 'Show the consequence, reaction, or decisive change while carrying forward the current state.',
                        cn: '\u5c55\u793a\u540e\u679c\u3001\u53cd\u5e94\u6216\u5173\u952e\u53d8\u5316\uff0c\u5e76\u4fdd\u6301\u524d\u4e00\u6bb5\u7684\u8eab\u4f53\u548c\u73af\u5883\u72b6\u6001\u3002'
                    }),
                    camera: Object.freeze({
                        en: 'Follow the result with a purposeful push, pull, pan, or reveal.',
                        cn: '\u7528\u6709\u660e\u786e\u76ee\u7684\u7684\u63a8\u8fdb\u3001\u540e\u62c9\u3001\u6a2a\u79fb\u6216\u9732\u51fa\u8ddf\u968f\u7ed3\u679c\u3002'
                    }),
                    dialogue: '',
                    sound: ''
                }),
                Object.freeze({
                    description: Object.freeze({
                        en: 'Resolve the action and hold on a readable final state or payoff.',
                        cn: '\u89e3\u51b3\u52a8\u4f5c\uff0c\u5e76\u5728\u6e05\u6670\u7684\u6700\u7ec8\u72b6\u6001\u6216\u7ed3\u679c\u4e0a\u6536\u5c3e\u3002'
                    }),
                    camera: Object.freeze({
                        en: 'Settle into a composed final view that preserves the ending state.',
                        cn: '\u7a33\u5b9a\u5728\u5b8c\u6574\u6784\u56fe\u4e0a\uff0c\u4fdd\u7559\u52a8\u4f5c\u7ed3\u675f\u65f6\u7684\u6700\u7ec8\u72b6\u6001\u3002'
                    }),
                    dialogue: '',
                    sound: ''
                })
            ])
        }),
        product_showcase: Object.freeze({
            id: 'product_showcase',
            label_en: 'Product showcase',
            label_cn: '\u4ea7\u54c1\u5c55\u793a',
            shots: Object.freeze([
                Object.freeze({
                    description: Object.freeze({
                        en: 'Open with a clean hero view of the product and its strongest visual feature.',
                        cn: '\u4ee5\u4ea7\u54c1\u7684\u6574\u4f53\u82f1\u96c4\u753b\u9762\u5f00\u573a\uff0c\u7a81\u51fa\u6700\u5f3a\u7684\u89c6\u89c9\u7279\u5f81\u3002'
                    }),
                    camera: Object.freeze({
                        en: 'Slow premium reveal from a three-quarter hero angle.',
                        cn: '\u4ece\u4e09\u5206\u4e4b\u4e00\u82f1\u96c4\u89d2\u5ea6\u7f13\u6162\u5c55\u793a\u4ea7\u54c1\u3002'
                    }),
                    dialogue: '',
                    sound: ''
                }),
                Object.freeze({
                    description: Object.freeze({
                        en: 'Move to a close detail of the material, interface, or signature feature.',
                        cn: '\u5207\u5165\u6750\u8d28\u3001\u754c\u9762\u6216\u6807\u5fd7\u6027\u529f\u80fd\u7684\u8fd1\u666f\u7ec6\u8282\u3002'
                    }),
                    camera: Object.freeze({
                        en: 'Macro or close-up push-in with precise focus.',
                        cn: '\u5fae\u8ddd\u6216\u8fd1\u666f\u63a8\u8fdb\uff0c\u7cbe\u51c6\u5bf9\u7126\u3002'
                    }),
                    dialogue: '',
                    sound: ''
                }),
                Object.freeze({
                    description: Object.freeze({
                        en: 'Show the product in use and make its main benefit visible.',
                        cn: '\u5c55\u793a\u4ea7\u54c1\u7684\u4f7f\u7528\u8fc7\u7a0b\uff0c\u8ba9\u4e3b\u8981\u4f18\u52bf\u53ef\u89c1\u3002'
                    }),
                    camera: Object.freeze({
                        en: 'Smooth tracking move follows the interaction.',
                        cn: '\u5e73\u6ed1\u8ddf\u62cd\u8ddf\u968f\u4f7f\u7528\u52a8\u4f5c\u3002'
                    }),
                    dialogue: '',
                    sound: ''
                }),
                Object.freeze({
                    description: Object.freeze({
                        en: 'Finish with a composed product hero frame and clear brand presence.',
                        cn: '\u4ee5\u6784\u56fe\u5b8c\u6574\u7684\u4ea7\u54c1\u82f1\u96c4\u753b\u9762\u6536\u5c3e\uff0c\u4fdd\u6301\u6e05\u6670\u7684\u54c1\u724c\u5c55\u793a\u3002'
                    }),
                    camera: Object.freeze({
                        en: 'Stable final hero composition with a restrained pull-back.',
                        cn: '\u7a33\u5b9a\u7684\u4ea7\u54c1\u82f1\u96c4\u6784\u56fe\uff0c\u914d\u5408\u514b\u5236\u7684\u62c9\u8fdc\u3002'
                    }),
                    dialogue: '',
                    sound: ''
                })
            ])
        })
    });
    const CAMERA_PRESETS = Object.freeze([
        Object.freeze({ id: 'static', label_en: 'Static camera', label_cn: '\u56fa\u5b9a\u673a\u4f4d', text_en: 'Static camera, holding the subject and setting clearly.', text_cn: '\u56fa\u5b9a\u673a\u4f4d\uff0c\u65e0\u955c\u5934\u8fd0\u52a8\uff0c\u4fdd\u6301\u4e3b\u4f53\u548c\u573a\u666f\u6e05\u6670\u3002' }),
        Object.freeze({ id: 'slow_push_in', label_en: 'Slow push-in', label_cn: '\u7f13\u6162\u63a8\u8fdb', text_en: 'Slow push-in toward the subject.', text_cn: '\u7f13\u6162\u63a8\u8fdb\uff0c\u9010\u6e10\u9760\u8fd1\u4e3b\u4f53\u3002' }),
        Object.freeze({ id: 'fast_push_in', label_en: 'Fast push-in', label_cn: '\u5feb\u901f\u63a8\u8fdb', text_en: 'Fast push-in toward the subject.', text_cn: '\u5feb\u901f\u63a8\u8fdb\uff0c\u8fc5\u901f\u9760\u8fd1\u4e3b\u4f53\u3002' }),
        Object.freeze({ id: 'slow_pull_back', label_en: 'Slow pull-back', label_cn: '\u7f13\u6162\u540e\u62c9', text_en: 'Slow pull-back, gradually revealing more of the setting.', text_cn: '\u7f13\u6162\u540e\u62c9\uff0c\u9010\u6e10\u5c55\u73b0\u66f4\u591a\u73af\u5883\u3002' }),
        Object.freeze({ id: 'fast_pull_back', label_en: 'Fast pull-back', label_cn: '\u5feb\u901f\u540e\u62c9', text_en: 'Fast pull-back, quickly widening the view.', text_cn: '\u5feb\u901f\u540e\u62c9\uff0c\u8fc5\u901f\u6269\u5927\u89c6\u91ce\u3002' }),
        Object.freeze({ id: 'slow_pan', label_en: 'Slow lateral pan', label_cn: '\u7f13\u6162\u6a2a\u79fb', text_en: 'Slow lateral pan across the scene.', text_cn: '\u7f13\u6162\u6a2a\u79fb\uff0c\u5e73\u6ed1\u63a0\u8fc7\u573a\u666f\u3002' }),
        Object.freeze({ id: 'fast_pan', label_en: 'Fast lateral pan', label_cn: '\u5feb\u901f\u6a2a\u79fb', text_en: 'Fast lateral pan across the scene.', text_cn: '\u5feb\u901f\u6a2a\u79fb\uff0c\u5feb\u901f\u63a0\u8fc7\u573a\u666f\u3002' }),
        Object.freeze({ id: 'medium_tracking', label_en: 'Medium tracking shot', label_cn: '\u4e2d\u666f\u8ddf\u62cd', text_en: 'Medium tracking shot follows the subject action.', text_cn: '\u4e2d\u666f\u8ddf\u62cd\uff0c\u8ddf\u968f\u4e3b\u4f53\u52a8\u4f5c\u3002' }),
        Object.freeze({ id: 'orbit_subject', label_en: 'Orbit the subject', label_cn: '\u73af\u7ed5\u4e3b\u4f53', text_en: 'Smooth orbit around the subject.', text_cn: '\u73af\u7ed5\u4e3b\u4f53\uff0c\u955c\u5934\u5e73\u6ed1\u79fb\u52a8\u3002' })
    ]);
    const SECTION_NAMES = [
        'integrated_multimodal_description',
        'overall_soundscape',
        'non_diegetic_music',
        'subject_definitions',
        'summary',
        'retention_analysis',
        'detailed_description'
    ];
    const RETENTION_LEVELS = Object.freeze({
        visual: Object.freeze([
            Object.freeze({ value: 'fully_preserved', en: 'Fully preserved', cn: '\u5b8c\u6574\u4fdd\u7559' }),
            Object.freeze({ value: 'partially_preserved', en: 'Partially preserved', cn: '\u90e8\u5206\u4fdd\u7559' }),
            Object.freeze({ value: 'attribute_transfer', en: 'Attribute transfer', cn: '\u5c5e\u6027\u8f6c\u79fb' }),
            Object.freeze({ value: 'weak_reference', en: 'Weak reference', cn: '\u5f31\u53c2\u8003' })
        ]),
        audio: Object.freeze([
            Object.freeze({ value: 'fully_copy', en: 'Fully copied', cn: '\u5b8c\u6574\u590d\u5236' }),
            Object.freeze({ value: 'partially_copy', en: 'Partially copied', cn: '\u90e8\u5206\u590d\u5236' }),
            Object.freeze({ value: 'reference', en: 'Reference only', cn: '\u4ec5\u4f5c\u53c2\u8003' }),
            Object.freeze({ value: 'weak_reference', en: 'Weak reference', cn: '\u5f31\u53c2\u8003' })
        ])
    });
    const RETENTION_CONTENTS = Object.freeze({
        image: Object.freeze([
            Object.freeze({ value: 'identity_appearance', en: 'Identity and appearance', cn: '\u8eab\u4efd\u4e0e\u5916\u89c2', output_en: 'identity, face, hairstyle, clothing, colors, and accessories', output_cn: '\u8eab\u4efd\u3001\u9762\u5bb9\u3001\u53d1\u578b\u3001\u670d\u88c5\u3001\u914d\u8272\u548c\u9970\u54c1' }),
            Object.freeze({ value: 'face_hair', en: 'Face and hair', cn: '\u9762\u5bb9\u4e0e\u53d1\u578b', output_en: 'face, hairstyle, and facial features', output_cn: '\u9762\u5bb9\u3001\u53d1\u578b\u548c\u4e94\u5b98\u7279\u5f81' }),
            Object.freeze({ value: 'clothing_colors', en: 'Clothing and colors', cn: '\u670d\u88c5\u4e0e\u914d\u8272', output_en: 'clothing shape, materials, and colors', output_cn: '\u670d\u88c5\u5f62\u5236\u3001\u6750\u8d28\u548c\u914d\u8272' }),
            Object.freeze({ value: 'pose_action', en: 'Pose and action', cn: '\u59ff\u6001\u4e0e\u52a8\u4f5c', output_en: 'pose, gesture, and action cues', output_cn: '\u59ff\u6001\u3001\u624b\u52bf\u548c\u52a8\u4f5c\u7279\u5f81' }),
            Object.freeze({ value: 'scene_composition', en: 'Scene and composition', cn: '\u573a\u666f\u4e0e\u6784\u56fe', output_en: 'setting, lighting, and composition', output_cn: '\u573a\u666f\u3001\u5149\u7ebf\u548c\u6784\u56fe' }),
            Object.freeze({ value: 'product_design', en: 'Product design', cn: '\u4ea7\u54c1\u8bbe\u8ba1', output_en: 'product shape, materials, and signature details', output_cn: '\u4ea7\u54c1\u5f62\u6001\u3001\u6750\u8d28\u548c\u6807\u5fd7\u6027\u7ec6\u8282' }),
            Object.freeze({ value: 'custom', en: 'Custom', cn: '\u81ea\u5b9a\u4e49', output_en: '', output_cn: '' })
        ]),
        video: Object.freeze([
            Object.freeze({ value: 'identity_appearance', en: 'Identity and appearance', cn: '\u8eab\u4efd\u4e0e\u5916\u89c2', output_en: 'identity and visible appearance', output_cn: '\u8eab\u4efd\u4e0e\u53ef\u89c1\u5916\u89c2' }),
            Object.freeze({ value: 'motion_timing', en: 'Motion and timing', cn: '\u8fd0\u52a8\u4e0e\u65f6\u5e8f', output_en: 'motion, timing, and temporal continuity', output_cn: '\u8fd0\u52a8\u3001\u65f6\u5e8f\u548c\u65f6\u95f4\u8fde\u8d2f\u6027' }),
            Object.freeze({ value: 'scene_composition', en: 'Scene and composition', cn: '\u573a\u666f\u4e0e\u6784\u56fe', output_en: 'setting, lighting, and composition', output_cn: '\u573a\u666f\u3001\u5149\u7ebf\u548c\u6784\u56fe' }),
            Object.freeze({ value: 'custom', en: 'Custom', cn: '\u81ea\u5b9a\u4e49', output_en: '', output_cn: '' })
        ]),
        audio: Object.freeze([
            Object.freeze({ value: 'voice_dialogue', en: 'Voice and dialogue', cn: '\u4eba\u58f0\u4e0e\u5bf9\u767d', output_en: 'voice identity, dialogue, and delivery', output_cn: '\u4eba\u58f0\u7279\u5f81\u3001\u5bf9\u767d\u548c\u8bed\u6c14' }),
            Object.freeze({ value: 'rhythm_timing', en: 'Rhythm and timing', cn: '\u8282\u594f\u4e0e\u65f6\u5e8f', output_en: 'rhythm, timing, and synchronization', output_cn: '\u8282\u594f\u3001\u65f6\u5e8f\u548c\u540c\u6b65' }),
            Object.freeze({ value: 'sound_character', en: 'Sound character', cn: '\u97f3\u8272\u4e0e\u58f0\u573a', output_en: 'sound character, dynamics, and ambience', output_cn: '\u97f3\u8272\u3001\u52a8\u6001\u548c\u73af\u5883\u58f0' }),
            Object.freeze({ value: 'custom', en: 'Custom', cn: '\u81ea\u5b9a\u4e49', output_en: '', output_cn: '' })
        ])
    });
    let activeModal = null;
    let activeOptions = null;

    function createHistory(limit = 100) {
        const maximum = Math.max(1, Math.round(finiteNumber(limit, 100)));
        const undoStack = [];
        const redoStack = [];
        return {
            record(before, after) {
                const previous = String(before ?? '');
                const current = String(after ?? '');
                if (previous === current) return false;
                undoStack.push(previous);
                if (undoStack.length > maximum) undoStack.shift();
                redoStack.length = 0;
                return true;
            },
            takeUndo(current) {
                if (!undoStack.length) return null;
                redoStack.push(String(current ?? ''));
                return undoStack.pop();
            },
            takeRedo(current) {
                if (!redoStack.length) return null;
                undoStack.push(String(current ?? ''));
                return redoStack.pop();
            },
            canUndo() { return undoStack.length > 0; },
            canRedo() { return redoStack.length > 0; }
        };
    }

    function languageState(source) {
        return source && typeof source === 'object'
            ? source
            : (root.simpleaiTopbarSystemParams || root.topbarLastSystemParams || { __lang: root.locale_lang || '' });
    }

    function isEnglish(source) {
        return String(languageState(source).__lang || root.locale_lang || '').toLowerCase().startsWith('en');
    }

    function t(en, cn, source) {
        if (root.SimpAII18n?.t) {
            try { return root.SimpAII18n.t(en, cn, languageState(source)); } catch (error) {}
        }
        return isEnglish(source) ? en : (cn || en);
    }

    function cameraPresetDefinitions() {
        return CAMERA_PRESETS.map((preset) => ({
            id: preset.id,
            label_en: preset.label_en,
            label_cn: preset.label_cn,
            text_en: preset.text_en,
            text_cn: preset.text_cn
        }));
    }

    function cameraPresetText(value, source) {
        const preset = CAMERA_PRESETS.find((item) => item.id === cleanText(value));
        if (!preset) return '';
        return isEnglish(source) ? preset.text_en : preset.text_cn;
    }

    function cameraPresetSelection(value) {
        const text = cleanText(value);
        if (!text) return '';
        const preset = CAMERA_PRESETS.find((item) => item.text_en === text || item.text_cn === text);
        return preset?.id || '';
    }

    function normalizeOverallSoundscape(value, source) {
        const text = cleanText(value);
        if (!text || /^(?:n\s*\/?\s*a|not\s+applicable)[.\s]*$/i.test(text)) {
            return t('Silence', '\u9759\u97f3', source);
        }
        return text;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[ch]);
    }

    function cleanText(value) {
        return String(value ?? '').replace(/\r\n/g, '\n').trim();
    }

    function finiteNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function boundedNumber(value, fallback, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback)));
    }

    function boolValue(value, fallback) {
        if (value === true || value === false) return value;
        if (value === 'true' || value === 1 || value === '1') return true;
        if (value === 'false' || value === 0 || value === '0') return false;
        return !!fallback;
    }

    function parseJsonObject(value) {
        if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        try {
            const parsed = JSON.parse(String(value || ''));
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function inventoryItems(source, kind) {
        const plural = kind === 'audio' ? 'audio' : `${kind}s`;
        const direct = source?.[`${kind}_refs`];
        if (Array.isArray(direct)) return direct;
        return Array.isArray(source?.[plural]) ? source[plural] : [];
    }

    function inventoryCount(source, kind, items) {
        const plural = kind === 'audio' ? 'audio' : `${kind}s`;
        const explicit = source?.[`${kind}_count`];
        const legacy = Array.isArray(source?.[plural]) ? source[plural].length : source?.[plural];
        return Math.max(items.length, Math.max(0, Math.round(finiteNumber(explicit ?? legacy, 0))));
    }

    function referenceTitle(kind) {
        if (kind === 'image') return 'Picture';
        if (kind === 'video') return 'Video';
        return 'Audio';
    }

    function referenceLabelCn(kind, index) {
        if (kind === 'image') return `\u56fe\u7247 ${index}`;
        if (kind === 'video') return `\u89c6\u9891 ${index}`;
        return `\u97f3\u9891 ${index}`;
    }

    function normalizeReferenceItems(source, kind, count, items) {
        const title = referenceTitle(kind);
        return Array.from({ length: count }, (_unused, index) => {
            const raw = items[index] && typeof items[index] === 'object' ? items[index] : {};
            const number = index + 1;
            return {
                kind,
                index: number,
                token: `<${title} ${number}>`,
                slot: cleanText(raw.slot || raw.key || ''),
                label_en: cleanText(raw.label_en || raw.label || `${title} ${number}`),
                label_cn: cleanText(raw.label_cn || raw.label_zh || referenceLabelCn(kind, number)),
                preview: cleanText(raw.preview || raw.thumb || raw.src || raw.data_url || '')
            };
        });
    }

    function inventoryFromOptions(options) {
        const source = options?.inventory && typeof options.inventory === 'object' ? options.inventory : {};
        const imageItems = inventoryItems(source, 'image');
        const videoItems = inventoryItems(source, 'video');
        const audioItems = inventoryItems(source, 'audio');
        const imageCount = inventoryCount(source, 'image', imageItems);
        const videoCount = inventoryCount(source, 'video', videoItems);
        const audioCount = inventoryCount(source, 'audio', audioItems);
        return {
            image_count: imageCount,
            video_count: videoCount,
            audio_count: audioCount,
            image_refs: normalizeReferenceItems(source, 'image', imageCount, imageItems),
            video_refs: normalizeReferenceItems(source, 'video', videoCount, videoItems),
            audio_refs: normalizeReferenceItems(source, 'audio', audioCount, audioItems)
        };
    }

    function normalizeMode(value, options) {
        const inventory = inventoryFromOptions(options);
        let raw = value;
        if (raw && typeof raw === 'object') raw = raw.mode || raw.route || raw.id || raw.compiler || raw.name || '';
        const parsed = parseJsonObject(raw);
        if (parsed) raw = parsed.mode || parsed.route || parsed.id || parsed.compiler || parsed.name || '';
        const text = String(raw || '').trim();
        const compact = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (compact.includes('ref2va') || compact.includes('reference') || compact.includes('ref2v') || compact.includes('r2v')) return MODE_REF2VA;
        if (compact.includes('fl2va') || compact.includes('firstlast')) return MODE_FL2VA;
        if (compact.includes('l2va') || compact.includes('lastframe')) return MODE_L2VA;
        if (compact.includes('i2va') || compact.includes('i2v')) return MODE_I2VA;
        if (compact.includes('frameanchor')) return inventory.image_count >= 2 ? MODE_FL2VA : MODE_I2VA;
        if (compact.includes('t2va') || compact.includes('t2v') || compact.includes('text')) return MODE_T2VA;
        return MODE_T2VA;
    }

    function referenceTokenRegex() {
        return /<(Picture|Video|Audio)\s+(\d+)>/gi;
    }

    function referenceVariantRegex() {
        return /(?<![A-Za-z0-9])(?:(?:<|\uFF1C|\u3008|\[)\s*)?(Picture|Image|Video|Audio)\s*#?\s*(\d+)(?:\s*(?:>|\uFF1E|\u3009|\]))?(?![A-Za-z0-9])/gi;
    }

    function subjectTokenRegex() {
        return /<Subject\s+(\d+)>/gi;
    }

    function subjectVariantRegex() {
        return /(?<![A-Za-z0-9])(?:(?:<|\uFF1C|\u3008|\[)\s*)?(?:Subject|\u4e3b\u4f53)\s*#?\s*(\d+)(?:\s*(?:>|\uFF1E|\u3009|\]))?(?![A-Za-z0-9])/gi;
    }

    function canonicalSubject(number) {
        const parsed = Number(number);
        return Number.isFinite(parsed) && parsed > 0 ? '<Subject ' + parsed + '>' : '';
    }

    function canonicalReference(kind, number) {
        const key = String(kind || '').toLowerCase() === 'image' ? 'picture' : String(kind || '').toLowerCase();
        const titles = { picture: 'Picture', video: 'Video', audio: 'Audio' };
        const title = titles[key];
        return title ? `<${title} ${Number(number)}>` : '';
    }

    function referenceLimits(options) {
        const inventory = inventoryFromOptions(options);
        const mode = normalizeMode(options?.mode, options);
        if (mode === MODE_T2VA) return { picture: 0, video: 0, audio: 0 };
        if (mode === MODE_I2VA || mode === MODE_L2VA) return { picture: 1, video: 0, audio: 0 };
        if (mode === MODE_FL2VA) return { picture: 2, video: 0, audio: 0 };
        return {
            picture: inventory.image_count,
            video: inventory.video_count,
            audio: inventory.audio_count
        };
    }

    function protectedReferenceTokens(value, options) {
        const limits = referenceLimits(options);
        const tokens = [];
        for (const match of cleanText(value).matchAll(referenceTokenRegex())) {
            const kind = String(match[1] || '').toLowerCase();
            const number = Number(match[2]);
            if (number < 1 || number > Number(limits[kind] || 0)) continue;
            const token = canonicalReference(kind, number);
            if (token && !tokens.includes(token)) tokens.push(token);
        }
        return tokens;
    }

    function preserveReferenceTokens(originalValue, rewrittenValue, options) {
        const protectedTokens = protectedReferenceTokens(originalValue, options);
        let candidate = cleanText(rewrittenValue);
        if (!protectedTokens.length || !candidate) return candidate;

        const protectedKeys = new Set(protectedTokens.map((token) => token.toLowerCase()));
        candidate = candidate.replace(referenceVariantRegex(), (match, kind, number) => {
            const token = canonicalReference(kind, number);
            return protectedKeys.has(token.toLowerCase()) ? token : match;
        });

        const byKind = { picture: [], video: [], audio: [] };
        protectedTokens.forEach((token) => {
            const match = referenceTokenRegex().exec(token);
            const kind = String(match?.[1] || '').toLowerCase();
            if (byKind[kind] && !byKind[kind].includes(token)) byKind[kind].push(token);
        });
        Object.entries(byKind).forEach(([kind, tokens]) => {
            const missing = tokens.filter((token) => !candidate.includes(token));
            if (!missing.length) return;
            let replacementIndex = 0;
            candidate = candidate.replace(referenceVariantRegex(), (match, foundKind) => {
                const normalizedKind = String(foundKind || '').toLowerCase() === 'image'
                    ? 'picture'
                    : String(foundKind || '').toLowerCase();
                if (normalizedKind !== kind || replacementIndex >= missing.length) return match;
                return missing[replacementIndex++];
            });
            if (replacementIndex < missing.length) candidate = `${candidate} ${missing.slice(replacementIndex).join(' ')}`.trim();
        });

        const missing = protectedTokens.filter((token) => !candidate.includes(token));
        return missing.length ? `${candidate} ${missing.join(' ')}`.trim() : candidate;
    }

    function protectedSubjectTokens(value, options) {
        const limit = inventoryFromOptions(options).image_count;
        const tokens = [];
        for (const match of cleanText(value).matchAll(subjectTokenRegex())) {
            const number = Number(match[1]);
            if (number < 1 || number > limit) continue;
            const token = canonicalSubject(number);
            if (token && !tokens.includes(token)) tokens.push(token);
        }
        return tokens;
    }

    function preserveSubjectTokens(originalValue, rewrittenValue, options) {
        const protectedTokens = protectedSubjectTokens(originalValue, options);
        let candidate = cleanText(rewrittenValue);
        if (!protectedTokens.length || !candidate) return candidate;

        const protectedKeys = new Set(protectedTokens.map((token) => token.toLowerCase()));
        candidate = candidate.replace(subjectVariantRegex(), (match, number) => {
            const token = canonicalSubject(number);
            return protectedKeys.has(token.toLowerCase()) ? token : match;
        });

        if (protectedTokens.length === 1 && !candidate.includes(protectedTokens[0])) {
            let replaced = false;
            candidate = candidate.replace(subjectVariantRegex(), (match) => {
                if (replaced) return match;
                replaced = true;
                return protectedTokens[0];
            });
        }

        const missing = protectedTokens.filter((token) => !candidate.includes(token));
        return missing.length ? (candidate + ' ' + missing.join(' ')).trim() : candidate;
    }

    function preserveStoryboardReferenceTokens(originalValue, rewrittenValue, options) {
        return preserveSubjectTokens(
            originalValue,
            preserveReferenceTokens(originalValue, rewrittenValue, options),
            options
        );
    }

    function formatSeconds(value) {
        const total = Math.max(0, finiteNumber(value, 0));
        const minutes = Math.floor(total / 60);
        const seconds = total - minutes * 60;
        return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
    }

    function roundSeconds(value) {
        return Math.round(Math.max(0, finiteNumber(value, 0)) * 1000) / 1000;
    }

    function formatPromptSeconds(value) {
        const rounded = roundSeconds(value);
        return Number(rounded.toFixed(3)).toString();
    }

    function formatPromptRange(start, end) {
        return `${formatPromptSeconds(start)}-${formatPromptSeconds(end)}s`;
    }

    function dialogueTextForTiming(value) {
        const sourceText = cleanText(value);
        if (!sourceText) return '';
        const hasSpokenLabel = /Dialogue|\u5bf9\u767d/i.test(sourceText);
        const hasVisibleTextLabel = /visible\s+text|visual\s+text|\u753b\u9762\u6587\u5b57/i.test(sourceText);
        if (hasVisibleTextLabel && !hasSpokenLabel) return '';
        let text = sourceText;
        if (!text) return '';
        text = text
            .replace(/<\/?d\b[^>]*>/gi, ' ')
            .replace(/<[^>\n]+>/g, ' ')
            .replace(/^(?:Dialogue(?:\s+and\s+visible\s+text)?|\u5bf9\u767d(?:\s*[\/%\uff0f]\s*\u753b\u9762\u6587\u5b57)?|\u753b\u9762\u6587\u5b57)\s*[:\uff1a]\s*/i, '')
            .replace(/(?:^|[\n;\uff1b])\s*(?:Dialogue(?:\s+and\s+visible\s+text)?|\u5bf9\u767d(?:\s*[\/%\uff0f]\s*\u753b\u9762\u6587\u5b57)?|\u753b\u9762\u6587\u5b57)\s*[:\uff1a]\s*/gi, ' ')
            .replace(/(?:^|\s)[(\[]?\s*S\d+\s*[)\]]?\s*[:\uff1a-]\s*/gi, ' ')
            .replace(/^\s*\[[A-Za-z][A-Za-z0-9 _-]{0,24}\]\s*/, '')
            .trim();
        if (/^(?:none|no\s+(?:spoken\s+)?(?:content|dialogue)|n\s*\/?\s*a|silence|\u65e0|\u65e0\u5bf9\u767d|\u6ca1\u6709\u5bf9\u767d|\u9759\u97f3|\u65e0\u58f0)[.!?\u3002\uff01\uff1f\u3002\uff1b;]*$/i.test(text)) {
            return '';
        }
        return text;
    }

    function estimateDialogueMetrics(value, options) {
        const text = dialogueTextForTiming(value);
        if (!text) {
            return {
                text: '',
                estimated: 0,
                recommended: 0,
                cjkCharacters: 0,
                words: 0,
                digits: 0,
                pauses: 0
            };
        }
        const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || [];
        const withoutCjk = text.replace(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ');
        const latinWords = withoutCjk.match(/[A-Za-z]+(?:['\u2019-][A-Za-z]+)*/g) || [];
        const digits = withoutCjk.match(/\d+(?:[.,]\d+)?/g) || [];
        const otherWords = withoutCjk
            .replace(/[A-Za-z]+(?:['\u2019-][A-Za-z]+)*/g, ' ')
            .replace(/\d+(?:[.,]\d+)?/g, ' ')
            .split(/\s+/)
            .filter((item) => item && /[^\x00-\x7F]/.test(item) && /\p{L}/u.test(item));
        const pauses = text.match(/[,.!?;:\u3001\u3002\uff0c\uff01\uff1f\uff1b\uff1a]/g)?.length || 0;
        const cjkRate = Math.max(1, finiteNumber(options?.dialogueCjkCharsPerSecond, DIALOGUE_CJK_CHARS_PER_SECOND));
        const wordRate = Math.max(0.5, finiteNumber(options?.dialogueWordsPerSecond, DIALOGUE_WORDS_PER_SECOND));
        const digitRate = Math.max(0.5, finiteNumber(options?.dialogueDigitsPerSecond, DIALOGUE_DIGITS_PER_SECOND));
        const estimated = roundSeconds(
            cjk.length / cjkRate
            + (latinWords.length + otherWords.length) / wordRate
            + digits.length / digitRate
            + pauses * DIALOGUE_PAUSE_SECONDS
        );
        const headroom = Math.min(0.35, DIALOGUE_HEADROOM_SECONDS + Math.min(6, pauses) * 0.025);
        return {
            text,
            estimated,
            recommended: roundSeconds(estimated + headroom),
            cjkCharacters: cjk.length,
            words: latinWords.length + otherWords.length,
            digits: digits.length,
            pauses
        };
    }

    function estimateDialogueDuration(value, options) {
        return estimateDialogueMetrics(value, options).estimated;
    }

    function dialogueTiming(value, availableDuration, options) {
        const metrics = estimateDialogueMetrics(value, options);
        const rawAvailable = Number(availableDuration);
        const available = Number.isFinite(rawAvailable) ? roundSeconds(Math.max(0, rawAvailable)) : null;
        let status = metrics.estimated > 0 ? 'unknown' : 'empty';
        if (metrics.estimated > 0 && available !== null) {
            if (metrics.recommended > available + 0.001) status = 'over';
            else if (metrics.recommended > Math.max(0, available - 0.12) || metrics.estimated > available * 0.9) status = 'tight';
            else status = 'fit';
        }
        return Object.assign({}, metrics, {
            available,
            ratio: available && available > 0 ? roundSeconds(metrics.estimated / available) : null,
            status
        });
    }

    function dialogueTimingLabel(timing, source) {
        if (!timing || timing.status === 'empty') return t('No spoken content', '\u65e0\u5bf9\u767d\u5185\u5bb9', source);
        const estimate = `${formatPromptSeconds(timing.estimated)}s`;
        const recommended = `${formatPromptSeconds(timing.recommended)}s`;
        const available = timing.available === null ? '' : ` / ${formatPromptSeconds(timing.available)}s`;
        const base = t(`Speech ~${estimate}${available} \u00b7 reserve ${recommended}`, `\u5bf9\u767d\u7ea6 ${estimate}${available} \u00b7 \u5efa\u8bae\u9884\u7559 ${recommended}`, source);
        if (timing.status === 'over') return `${base} \u00b7 ${t('too long', '\u955c\u5934\u65f6\u957f\u4e0d\u8db3', source)}`;
        if (timing.status === 'tight') return `${base} \u00b7 ${t('tight', '\u65f6\u95f4\u504f\u7d27', source)}`;
        if (timing.status === 'fit') return `${base} \u00b7 ${t('fits', '\u53ef\u5bb9\u7eb3', source)}`;
        return base;
    }

    function dialogueTimingTone(timing) {
        if (timing?.status === 'over') return 'error';
        if (timing?.status === 'tight') return 'warning';
        if (timing?.status === 'fit') return 'success';
        return 'info';
    }

    function distributeDialogueTiming(value, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const state = normalize(value, opts);
        const total = Math.max(MIN_SHOT_DURATION, finiteNumber(opts.duration, 5));
        const existing = timelineIntervals(state, Object.assign({}, opts, { duration: total }));
        const analyses = state.shots.map((shot, index) => dialogueTiming(shot.dialogue, existing[index]?.duration, opts));
        const weights = analyses.map((item) => item.estimated > 0 ? Math.max(item.recommended, 0.25) : 1);
        const unitScale = boolValue(opts.snapToFrames, false) ? H3_FPS : 1000;
        const totalUnits = Math.max(state.shots.length, Math.round(total * unitScale));
        const minimumUnits = Math.max(1, Math.round(MIN_SHOT_DURATION * unitScale));
        const baseUnits = minimumUnits * state.shots.length;
        const extraUnits = Math.max(0, totalUnits - baseUnits);
        const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || state.shots.length || 1;
        const exactExtras = weights.map((weight) => extraUnits * weight / weightTotal);
        const extras = exactExtras.map((value) => Math.floor(value));
        let remainder = extraUnits - extras.reduce((sum, value) => sum + value, 0);
        const order = exactExtras
            .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
            .sort((left, right) => right.fraction - left.fraction);
        for (let index = 0; index < order.length && remainder > 0; index += 1, remainder -= 1) {
            extras[order[index].index] += 1;
        }
        const durationUnits = extras.map((extra) => minimumUnits + extra);
        let cursorUnits = 0;
        state.shots.forEach((shot, index) => {
            shot.start = roundSeconds(cursorUnits / unitScale);
            cursorUnits += durationUnits[index];
        });
        return {
            state,
            intervals: timelineIntervals(state, Object.assign({}, opts, { duration: total })),
            analyses,
            weights
        };
    }

    function snapSeconds(value, enabled) {
        const raw = Math.max(0, finiteNumber(value, 0));
        return roundSeconds(enabled ? Math.round(raw * H3_FPS) / H3_FPS : raw);
    }

    function defaultShotCount(duration) {
        const total = Math.max(0.3, finiteNumber(duration, 5));
        if (total >= 20) return 5;
        if (total >= 10) return 4;
        return 3;
    }

    function defaultShotStarts(duration, count = null) {
        const total = Math.max(0.3, finiteNumber(duration, 5));
        const requested = count === null || count === undefined ? Number.NaN : Number(count);
        const size = Math.max(
            1,
            Math.min(
                MAX_SHOTS,
                Number.isFinite(requested) ? Math.round(requested) : defaultShotCount(total)
            )
        );
        return Array.from({ length: size }, (_unused, index) => roundSeconds(total * index / size));
    }

    function timelineIntervals(value, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const state = value && Array.isArray(value.shots) ? value : normalize(value, opts);
        const total = Math.max(MIN_SHOT_DURATION, finiteNumber(opts.duration, 5));
        return state.shots.map((shot, index) => {
            const start = index === 0
                ? 0
                : boundedNumber(shot.start, 0, 0, total);
            const nextStart = index < state.shots.length - 1
                ? boundedNumber(state.shots[index + 1]?.start, total, 0, total)
                : total;
            const end = Math.max(start, nextStart);
            return {
                start: roundSeconds(start),
                end: roundSeconds(end),
                duration: roundSeconds(end - start)
            };
        });
    }

    function applyShotStart(state, index, requested, totalDuration, snapToFrames) {
        const shots = Array.isArray(state?.shots) ? state.shots : [];
        if (!shots[index] || index === 0) {
            if (shots[0]) shots[0].start = 0;
            return { value: 0, clamped: false };
        }
        const total = Math.max(MIN_SHOT_DURATION, finiteNumber(totalDuration, 5));
        const minimum = roundSeconds(shots[index - 1].start + MIN_SHOT_DURATION);
        const nextStart = index < shots.length - 1 ? finiteNumber(shots[index + 1].start, total) : total;
        const maximum = Math.max(minimum, roundSeconds(nextStart - MIN_SHOT_DURATION));
        const requestedValue = snapSeconds(requested, snapToFrames);
        const value = roundSeconds(Math.min(maximum, Math.max(minimum, requestedValue)));
        shots[index].start = value;
        return { value, clamped: Math.abs(value - requestedValue) > 0.0005 };
    }

    function applyShotDuration(state, index, requested, totalDuration, snapToFrames) {
        const shots = Array.isArray(state?.shots) ? state.shots : [];
        if (!shots[index]) return { value: 0, clamped: true };
        const total = Math.max(MIN_SHOT_DURATION, finiteNumber(totalDuration, 5));
        const intervals = timelineIntervals(state, { duration: total });
        const start = intervals[index]?.start ?? 0;
        const requestedValue = snapSeconds(requested, snapToFrames);
        const maximumEnd = total - MIN_SHOT_DURATION * Math.max(0, shots.length - index - 1);
        const minimumEnd = start + MIN_SHOT_DURATION;
        const end = roundSeconds(Math.min(Math.max(minimumEnd, maximumEnd), Math.max(minimumEnd, start + requestedValue)));
        const oldEnd = intervals[index]?.end ?? total;
        const delta = roundSeconds(end - oldEnd);
        if (index < shots.length - 1) {
            shots[index + 1].start = end;
            let previous = end;
            for (let shotIndex = index + 2; shotIndex < shots.length; shotIndex += 1) {
                const minimumStart = previous + MIN_SHOT_DURATION;
                const maximumStart = total - MIN_SHOT_DURATION * (shots.length - shotIndex);
                const shifted = finiteNumber(shots[shotIndex].start, previous) + delta;
                const bounded = Math.min(Math.max(minimumStart, maximumStart), Math.max(minimumStart, shifted));
                shots[shotIndex].start = roundSeconds(bounded);
                previous = shots[shotIndex].start;
            }
        }
        shots[0].start = 0;
        return {
            value: roundSeconds(end - start),
            clamped: Math.abs(roundSeconds(end - start) - requestedValue) > 0.0005
        };
    }

    function resizeShot(value, index, requestedDuration, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const state = normalize(value, opts);
        const result = applyShotDuration(
            state,
            index,
            requestedDuration,
            opts.duration,
            boolValue(opts.snapToFrames, false)
        );
        return { state, intervals: timelineIntervals(state, opts), result };
    }

    function insertShotIntoState(state, totalDuration, snapToFrames) {
        const intervals = timelineIntervals(state, { duration: totalDuration });
        if (!intervals.length) return { inserted: false, index: -1 };
        let targetIndex = 0;
        intervals.forEach((interval, index) => {
            if (interval.duration > intervals[targetIndex].duration) targetIndex = index;
        });
        const target = intervals[targetIndex];
        if (target.duration < MIN_SHOT_DURATION * 2) return { inserted: false, index: -1 };
        const split = snapSeconds(target.start + target.duration / 2, snapToFrames);
        state.shots.splice(targetIndex + 1, 0, normalizeShot({ start: split }, targetIndex + 1, defaultShotStarts(totalDuration, state.shots.length + 1)));
        return { inserted: true, index: targetIndex + 1 };
    }

    function insertShot(value, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const state = normalize(value, opts);
        const result = insertShotIntoState(state, opts.duration, boolValue(opts.snapToFrames, false));
        return { state, intervals: timelineIntervals(state, opts), result };
    }

    function duplicateShotIntoState(state, index, totalDuration, snapToFrames) {
        const shots = Array.isArray(state?.shots) ? state.shots : [];
        const intervals = timelineIntervals(state, { duration: totalDuration });
        const sourceIndex = Math.max(0, Math.min(shots.length - 1, Number(index) || 0));
        const sourceInterval = intervals[sourceIndex];
        if (!sourceInterval || sourceInterval.duration < MIN_SHOT_DURATION * 2) return { inserted: false, index: -1 };
        const split = snapSeconds(sourceInterval.start + sourceInterval.duration / 2, snapToFrames);
        const starts = defaultShotStarts(totalDuration, shots.length + 1);
        const duplicate = normalizeShot(Object.assign({}, shots[sourceIndex], { start: split }), sourceIndex + 1, starts);
        shots.splice(sourceIndex + 1, 0, duplicate);
        return { inserted: true, index: sourceIndex + 1 };
    }

    function duplicateShot(value, index, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const state = normalize(value, opts);
        const result = duplicateShotIntoState(state, index, opts.duration, boolValue(opts.snapToFrames, false));
        return { state, intervals: timelineIntervals(state, opts), result };
    }

    function splitShotIntoState(state, index, totalDuration, snapToFrames) {
        const shots = Array.isArray(state?.shots) ? state.shots : [];
        const intervals = timelineIntervals(state, { duration: totalDuration });
        const sourceIndex = Math.max(0, Math.min(shots.length - 1, Number(index) || 0));
        const sourceInterval = intervals[sourceIndex];
        if (!sourceInterval || sourceInterval.duration < MIN_SHOT_DURATION * 2) return { inserted: false, index: -1 };
        const split = snapSeconds(sourceInterval.start + sourceInterval.duration / 2, snapToFrames);
        const starts = defaultShotStarts(totalDuration, shots.length + 1);
        shots.splice(sourceIndex + 1, 0, normalizeShot({ start: split }, sourceIndex + 1, starts));
        return { inserted: true, index: sourceIndex + 1 };
    }

    function splitShot(value, index, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const state = normalize(value, opts);
        const result = splitShotIntoState(state, index, opts.duration, boolValue(opts.snapToFrames, false));
        return { state, intervals: timelineIntervals(state, opts), result };
    }

    function mergeTextValues(left, right, separator = ' ') {
        const values = [left, right].map(cleanText).filter(Boolean);
        if (!values.length) return '';
        const meaningful = values.filter((item) => !/^(?:none|n\s*\/?\s*a|silence|\u65e0|\u9759\u97f3)[.!?\u3002\uff01\uff1f]*$/i.test(item));
        return (meaningful.length ? meaningful : values).join(separator).trim();
    }

    function mergeShotIntoState(state, index) {
        const shots = Array.isArray(state?.shots) ? state.shots : [];
        const sourceIndex = Number(index);
        if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= shots.length - 1) return { merged: false, index: -1 };
        const current = shots[sourceIndex];
        const next = shots[sourceIndex + 1];
        current.description = mergeTextValues(current.description, next.description);
        current.camera = mergeTextValues(current.camera, next.camera, '; ');
        current.dialogue = mergeTextValues(current.dialogue, next.dialogue);
        current.sound = mergeTextValues(current.sound, next.sound);
        shots.splice(sourceIndex + 1, 1);
        return { merged: true, index: sourceIndex };
    }

    function mergeShot(value, index, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const state = normalize(value, opts);
        const result = mergeShotIntoState(state, index);
        return { state, intervals: timelineIntervals(state, opts), result };
    }

    function shotTemplateDefinitions() {
        return Object.values(SHOT_TEMPLATES).map((template) => ({
            id: template.id,
            label_en: template.label_en,
            label_cn: template.label_cn,
            count: template.shots.length
        }));
    }

    function templateText(value, lang) {
        if (!value || typeof value !== 'object') return cleanText(value);
        return cleanText(isEnglish(lang) ? value.en : value.cn);
    }

    function moveShotIntoState(state, fromIndex, toIndex) {
        const shots = Array.isArray(state?.shots) ? state.shots : [];
        const source = Number(fromIndex);
        const destination = Number(toIndex);
        if (!Number.isInteger(source) || !Number.isInteger(destination)
                || source < 0 || source >= shots.length
                || destination < 0 || destination >= shots.length
                || source === destination) {
            return { moved: false, index: source };
        }
        const starts = shots.map((shot) => finiteNumber(shot?.start, 0));
        const [moved] = shots.splice(source, 1);
        shots.splice(destination, 0, moved);
        shots.forEach((shot, index) => {
            shot.start = roundSeconds(index === 0 ? 0 : starts[index] ?? starts[starts.length - 1] ?? index);
        });
        return { moved: true, index: destination };
    }

    function moveShot(value, fromIndex, toIndex, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const state = normalize(value, opts);
        const result = moveShotIntoState(state, fromIndex, toIndex);
        return { state, intervals: timelineIntervals(state, opts), result };
    }

    function applyShotTemplateIntoState(state, templateId, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const template = SHOT_TEMPLATES[cleanText(templateId)] || SHOT_TEMPLATES.three_act;
        const total = Math.max(MIN_SHOT_DURATION, finiteNumber(opts.duration, 5));
        const targetCount = Math.min(MAX_SHOTS, template.shots.length);
        const current = Array.isArray(state?.shots) ? state.shots : [];
        const shots = current.map((shot) => Object.assign({}, shot));
        while (shots.length > targetCount) {
            const overflow = shots.pop();
            const last = shots[shots.length - 1];
            if (last && overflow) {
                last.description = mergeTextValues(last.description, overflow.description);
                last.camera = mergeTextValues(last.camera, overflow.camera, '; ');
                last.dialogue = mergeTextValues(last.dialogue, overflow.dialogue);
                last.sound = mergeTextValues(last.sound, overflow.sound);
            }
        }
        while (shots.length < targetCount) shots.push({});
        const starts = defaultShotStarts(total, targetCount);
        const lang = opts.langState;
        const nextShots = shots.map((shot, index) => {
            const blueprint = template.shots[index];
            return normalizeShot({
                start: starts[index],
                description: cleanText(shot.description) || templateText(blueprint?.description, lang),
                camera: cleanText(shot.camera) || templateText(blueprint?.camera, lang),
                dialogue: cleanText(shot.dialogue) || templateText(blueprint?.dialogue, lang),
                sound: cleanText(shot.sound) || templateText(blueprint?.sound, lang),
                reference_binding: shot.reference_binding
            }, index, starts);
        });
        const nextState = Object.assign({}, state, { shots: nextShots });
        return { state: nextState, template: template.id, count: targetCount };
    }

    function applyShotTemplate(value, templateId, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const state = normalize(value, opts);
        const result = applyShotTemplateIntoState(state, templateId, opts);
        return Object.assign(result, { intervals: timelineIntervals(result.state, opts) });
    }

    function normalizeShotBinding(value) {
        const text = cleanText(value).toLowerCase();
        if (!text || text === 'auto') return text;
        if (text === 'none' || text === 'manual-none') return 'none';
        const number = Number(text);
        return Number.isInteger(number) && number > 0 ? String(number) : '';
    }

    function normalizeShot(value, index, starts) {
        const source = value && typeof value === 'object' ? value : {};
        return {
            start: index === 0 ? 0 : roundSeconds(boundedNumber(source.start, starts[index] ?? index, 0, 86400)),
            description: cleanText(source.description ?? source.visual ?? source.action ?? ''),
            camera: cleanText(source.camera ?? ''),
            dialogue: cleanText(source.dialogue ?? source.text ?? ''),
            sound: cleanText(source.sound ?? source.audio ?? ''),
            reference_binding: normalizeShotBinding(source.reference_binding ?? source.referenceBinding ?? '')
        };
    }

    function defaultState(options) {
        const duration = Math.max(0.3, finiteNumber(options?.duration, 5));
        const starts = defaultShotStarts(duration);
        return {
            version: 1,
            mode: normalizeMode(options?.mode, options),
            optimize: false,
            shots: starts.map((start, index) => normalizeShot({ start }, index, starts)),
            overall_soundscape: normalizeOverallSoundscape('', options?.langState),
            non_diegetic_music: 'N/A',
            subject_definitions: '',
            summary: '',
            retention_analysis: '',
            prompt_snapshot: ''
        };
    }

    function sectionMap(prompt) {
        const text = String(prompt || '');
        const names = SECTION_NAMES.join('|');
        const regex = new RegExp(`^(${names})\\s*:\\s*`, 'gmi');
        const matches = Array.from(text.matchAll(regex));
        const sections = {};
        matches.forEach((match, index) => {
            const start = match.index + match[0].length;
            const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
            sections[String(match[1] || '').toLowerCase()] = text.slice(start, end).trim();
        });
        return sections;
    }

    function parseShots(timeline, duration) {
        const text = String(timeline || '');
        const matches = Array.from(text.matchAll(
            /\[Shot\s+(\d+)\](?:\s+(?:At\s+(\d{2}):(\d{2}(?:\.\d{1,3})?)|(\d+(?:\.\d{1,3})?)\s*-\s*(\d+(?:\.\d{1,3})?)\s*(?:s|seconds?)?))?/gi
        ));
        if (!matches.length) return [];
        const starts = defaultShotStarts(duration);
        return matches.slice(0, MAX_SHOTS).map((match, index) => {
            const startIndex = match.index + match[0].length;
            const endIndex = index + 1 < matches.length ? matches[index + 1].index : text.length;
            const seconds = index === 0
                ? Number(match[4] || 0)
                : (match[4] !== undefined
                    ? Number(match[4])
                    : (Number(match[2] || 0) * 60 + Number(match[3] || starts[index] || index)));
            const body = cleanText(text.slice(startIndex, endIndex));
            const fieldMatches = Array.from(body.matchAll(
                /(?:Camera|Dialogue and visible text|Synchronized sound|\u8fd0\u955c|\u955c\u5934\u8fd0\u52a8|\u76f8\u673a\u8fd0\u52a8|\u5bf9\u767d\s*[\/\uff0f]\s*\u753b\u9762\u6587\u5b57|\u5bf9\u767d\u4e0e\u753b\u9762\u6587\u5b57|\u5bf9\u767d\u6216\u753b\u9762\u6587\u5b57|\u5bf9\u767d|\u753b\u9762\u6587\u5b57|\u540c\u6b65\u58f0\u97f3|\u73af\u5883\u58f0\u97f3|\u58f0\u97f3)\s*[:\uff1a]\s*/gi
            ));
            const description = fieldMatches.length ? cleanText(body.slice(0, fieldMatches[0].index)) : body;
            const parsedBody = {
                description: description.replace(
                    /^(?:Scene\s*[\/\uff0f]\s*action|Visual(?:\s*[\/\uff0f]\s*action)?|\u753b\u9762\s*[\/\uff0f]\s*\u52a8\u4f5c|\u753b\u9762\u52a8\u4f5c|\u52a8\u4f5c\u8fc7\u7a0b)\s*[:\uff1a]\s*/i,
                    ''
                ).trim(),
                camera: '',
                dialogue: '',
                sound: ''
            };
            fieldMatches.forEach((fieldMatch, fieldIndex) => {
                const fieldName = String(fieldMatch[0] || '').replace(/\s*[:\uff1a]\s*$/, '').toLowerCase();
                const valueStart = fieldMatch.index + fieldMatch[0].length;
                const valueEnd = fieldIndex + 1 < fieldMatches.length ? fieldMatches[fieldIndex + 1].index : body.length;
                const key = fieldName === 'camera' || /\u8fd0\u955c|\u955c\u5934\u8fd0\u52a8|\u76f8\u673a\u8fd0\u52a8/.test(fieldName)
                    ? 'camera'
                    : (fieldName.startsWith('dialogue') || /\u5bf9\u767d|\u753b\u9762\u6587\u5b57/.test(fieldName) ? 'dialogue' : 'sound');
                parsedBody[key] = cleanText(body.slice(valueStart, valueEnd));
            });
            return normalizeShot(Object.assign({ start: seconds }, parsedBody), index, starts);
        });
    }

    function parsePrompt(prompt, options) {
        const base = defaultState(options);
        const text = cleanText(prompt);
        if (!text) return applyRef2VADefaultBindings(base, options);
        const sections = sectionMap(text);
        const timeline = sections.detailed_description || sections.integrated_multimodal_description || '';
        const shots = parseShots(timeline, options?.duration);
        const inferredMode = sections.detailed_description
            ? MODE_REF2VA
            : (/Picture\s+2/i.test(text) ? MODE_FL2VA : (/final frame|target duration/i.test(text) && /Picture\s+1/i.test(text) ? MODE_L2VA : normalizeMode(options?.mode, options)));
        return applyRef2VADefaultBindings(Object.assign(base, {
            mode: inferredMode,
            optimize: boolValue(options?.optimize, false),
            shots: shots.length ? shots : base.shots,
            overall_soundscape: normalizeOverallSoundscape(sections.overall_soundscape || '', options?.langState),
            non_diegetic_music: cleanText(sections.non_diegetic_music || 'N/A'),
            subject_definitions: cleanText(sections.subject_definitions || ''),
            summary: cleanText(sections.summary || ''),
            retention_analysis: cleanText(sections.retention_analysis || ''),
            prompt_snapshot: text
        }), options);
    }

    function normalize(value, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const parsed = parseJsonObject(value);
        if (!parsed && typeof value === 'string' && /\[Shot\s+\d+\]/i.test(value)) return parsePrompt(value, opts);
        const source = parsed || (value && typeof value === 'object' ? value : {});
        const base = defaultState(Object.assign({}, opts, { mode: source.mode || opts.mode }));
        const starts = defaultShotStarts(opts.duration);
        const rawShots = Array.isArray(source.shots) ? source.shots.slice(0, MAX_SHOTS) : [];
        return applyRef2VADefaultBindings(Object.assign(base, {
            mode: normalizeMode(source.mode || opts.mode, opts),
            optimize: boolValue(source.optimize, false),
            shots: (rawShots.length ? rawShots : base.shots).map((shot, index) => normalizeShot(shot, index, starts)),
            overall_soundscape: normalizeOverallSoundscape(
                source.overall_soundscape ?? source.overallSoundscape ?? '',
                opts.langState
            ),
            non_diegetic_music: cleanText(source.non_diegetic_music ?? source.nonDiegeticMusic ?? 'N/A') || 'N/A',
            subject_definitions: cleanText(source.subject_definitions ?? source.subjectDefinitions ?? ''),
            summary: cleanText(source.summary ?? ''),
            retention_analysis: cleanText(source.retention_analysis ?? source.retentionAnalysis ?? ''),
            prompt_snapshot: cleanText(source.prompt_snapshot ?? source.promptSnapshot ?? '')
        }), opts);
    }

    function serialize(value, options) {
        return JSON.stringify(normalize(value, options));
    }

    function stripShotSubjectBindings(value) {
        let text = cleanText(value)
            .replace(/<Subject\s+\d+>\s*[\(\uFF08]\s*<(?:Picture|Image)\s+(\d+)>\s*[\)\uFF09]\s*(?:[:\uFF1A]\s*)?/gi, (match, number, offset, whole) => {
                const rest = String(whole || '').slice(Number(offset) + String(match).length);
                return validPictureNumbers(rest, Number.POSITIVE_INFINITY).includes(Number(number)) ? '' : `<Picture ${number}> `;
            })
            .replace(subjectVariantRegex(), '')
            .replace(referenceVariantRegex(), (match, kind, number) => {
                const normalizedKind = String(kind || '').toLowerCase();
                return ['picture', 'image'].includes(normalizedKind)
                    ? canonicalReference('picture', number)
                    : match;
            })
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+([:\uFF1A,\uFF0C;\uFF1B])/g, '$1');
        const seenPictures = new Set();
        text = text.replace(referenceVariantRegex(), (match, kind, number) => {
            const normalizedKind = String(kind || '').toLowerCase();
            if (!['picture', 'image'].includes(normalizedKind)) return match;
            const token = canonicalReference('picture', number);
            if (seenPictures.has(token)) return '';
            seenPictures.add(token);
            return token;
        });
        return cleanText(text).replace(/\s{2,}/g, ' ');
    }

    function shotDescriptionForEditor(value) {
        return stripShotSubjectBindings(value);
    }

    function mergeShotDescription(existingValue, editedValue) {
        const existingPictures = validPictureNumbers(existingValue, Number.POSITIVE_INFINITY);
        const editedPictures = validPictureNumbers(editedValue, Number.POSITIVE_INFINITY);
        const expectedPictures = editedPictures.length ? editedPictures : existingPictures;
        const body = stripShotSubjectBindings(editedValue);
        const presentPictures = validPictureNumbers(body, Number.POSITIVE_INFINITY);
        const missing = expectedPictures
            .filter((number) => !presentPictures.includes(number))
            .map((number) => canonicalReference('picture', number));
        return cleanText([...missing, body].filter(Boolean).join(' '));
    }

    function shotHasNarrativeContent(shot, mode) {
        return timelineShotStatus(shot, mode).filled_count > 0;
    }

    function timelineShotStatus(shot, mode) {
        const fields = {
            description: normalizeMode(mode) === MODE_REF2VA
                ? shotDescriptionForEditor(shot?.description)
                : cleanText(shot?.description),
            camera: cleanText(shot?.camera),
            dialogue: cleanText(shot?.dialogue),
            sound: cleanText(shot?.sound)
        };
        const filledCount = Object.values(fields).filter(Boolean).length;
        return {
            fields,
            filled_count: filledCount,
            total_count: Object.keys(fields).length,
            state: !filledCount ? 'empty' : (!fields.description ? 'needs-description' : 'ready')
        };
    }

    function shotBody(shot, options) {
        const lang = options?.langState;
        const description = cleanText(shot.description);
        const camera = cleanText(shot.camera) || t(
            'Static camera with no movement, holding the subject and setting clearly.',
            '\u56fa\u5b9a\u673a\u4f4d\uff0c\u65e0\u955c\u5934\u8fd0\u52a8\uff0c\u4fdd\u6301\u4e3b\u4f53\u548c\u573a\u666f\u6e05\u6670\u3002',
            lang
        );
        const dialogue = cleanText(shot.dialogue) || t('None', '\u65e0', lang);
        const sound = cleanText(shot.sound) || t('Silence', '\u9759\u97f3', lang);
        return [
            description,
            `Camera: ${camera}`,
            `Dialogue and visible text: ${dialogue}`,
            `Synchronized sound: ${sound}`
        ].filter(Boolean).join('\n').trim();
    }

    function timelineText(state, options) {
        const intervals = timelineIntervals(state, options);
        return state.shots.map((shot, index) => {
            const interval = intervals[index] || { start: 0, end: finiteNumber(options?.duration, 5) };
            const marker = `[Shot ${index + 1}] ${formatPromptRange(interval.start, interval.end)}`;
            return `${marker} ${shotBody(shot, options)}`.trim();
        }).join('\n');
    }

    function retentionReferenceItems(inventory) {
        return [...(inventory?.image_refs || []), ...(inventory?.video_refs || []), ...(inventory?.audio_refs || [])]
            .filter((item) => item && item.token && item.index > 0);
    }

    function retentionLevelsForKind(kind) {
        return kind === 'audio' ? RETENTION_LEVELS.audio : RETENTION_LEVELS.visual;
    }

    function retentionContentsForKind(kind) {
        return RETENTION_CONTENTS[kind] || RETENTION_CONTENTS.image;
    }

    function defaultRetentionLevel(kind) {
        return kind === 'audio' ? 'fully_copy' : 'fully_preserved';
    }

    function defaultRetentionContent(kind, item) {
        if (kind === 'video') {
            const slot = cleanText(item?.slot);
            if (slot === 'scene_video') return 'scene_composition';
            return 'motion_timing';
        }
        if (kind === 'audio') return 'rhythm_timing';
        return 'identity_appearance';
    }

    function retentionContentFromDetail(kind, detail, item) {
        const text = cleanText(detail).toLowerCase();
        if (!text) return defaultRetentionContent(kind, item);
        const rules = kind === 'image'
            ? [
                ['identity_appearance', /identity|appearance|\u8eab\u4efd|\u5916\u89c2/i],
                ['face_hair', /face|hair|facial|\u9762\u5bb9|\u53d1\u578b|\u4e94\u5b98/i],
                ['clothing_colors', /clothing|color|material|\u670d\u88c5|\u914d\u8272|\u6750\u8d28/i],
                ['pose_action', /pose|gesture|action|\u59ff\u6001|\u624b\u52bf|\u52a8\u4f5c/i],
                ['scene_composition', /setting|lighting|composition|scene|\u573a\u666f|\u5149\u7ebf|\u6784\u56fe/i],
                ['product_design', /product|signature|\u4ea7\u54c1|\u6807\u5fd7\u6027/i]
            ]
            : (kind === 'video'
                ? [
                    ['identity_appearance', /identity|appearance|\u8eab\u4efd|\u5916\u89c2/i],
                    ['motion_timing', /motion|timing|temporal|\u8fd0\u52a8|\u65f6\u5e8f|\u65f6\u95f4/i],
                    ['scene_composition', /setting|lighting|composition|scene|\u573a\u666f|\u5149\u7ebf|\u6784\u56fe/i]
                ]
                : [
                    ['voice_dialogue', /voice|dialogue|delivery|\u4eba\u58f0|\u5bf9\u767d|\u8bed\u6c14/i],
                    ['rhythm_timing', /rhythm|timing|synchron|\u8282\u594f|\u65f6\u5e8f|\u540c\u6b65/i],
                    ['sound_character', /sound|dynamic|ambien|\u97f3\u8272|\u52a8\u6001|\u73af\u5883\u58f0/i]
                ]);
        const match = rules.find(([, pattern]) => pattern.test(text));
        return match ? match[0] : 'custom';
    }

    function retentionContentOutput(kind, content, lang) {
        const option = retentionContentsForKind(kind).find((item) => item.value === content);
        if (!option || content === 'custom') return '';
        return isEnglish(lang) ? option.output_en : option.output_cn;
    }

    function retentionAnalysisLine(item, entry, lang) {
        const level = cleanText(entry?.level) || defaultRetentionLevel(item.kind);
        const content = entry?.content === 'custom'
            ? cleanText(entry.custom)
            : retentionContentOutput(item.kind, entry?.content || defaultRetentionContent(item.kind, item), lang);
        return `${item.token}: ${level}${content ? '; ' + content : ''}`;
    }

    function referenceRetention(inventory, lang) {
        const lines = retentionReferenceItems(inventory).map((item) => retentionAnalysisLine(item, {
            level: defaultRetentionLevel(item.kind),
            content: defaultRetentionContent(item.kind, item),
            custom: ''
        }, lang));
        return lines.join('\n') || 'No numbered reference media is declared.';
    }

    function retentionAnalysisEntries(value, inventory) {
        const parsed = new Map();
        const pattern = /<(Picture|Video|Audio)\s+(\d+)>\s*:\s*([\s\S]*?)(?=\s*<(?:Picture|Video|Audio)\s+\d+>\s*:|\r?\n|$)/gi;
        for (const match of cleanText(value).matchAll(pattern)) {
            const kindName = String(match[1] || '').toLowerCase();
            const kind = kindName === 'picture' ? 'image' : kindName;
            const index = Number(match[2]);
            const item = retentionReferenceItems(inventory).find((candidate) => candidate.kind === kind && candidate.index === index);
            if (!item) continue;
            const body = cleanText(match[3]);
            const level = retentionLevelsForKind(kind).find((option) => body.toLowerCase().startsWith(option.value.toLowerCase()));
            const detail = level ? cleanText(body.slice(level.value.length).replace(/^[;,:\-\s]+/, '')) : body;
            const content = retentionContentFromDetail(kind, detail, item);
            parsed.set(`${kind}:${index}`, {
                item,
                level: level?.value || defaultRetentionLevel(kind),
                content,
                custom: content === 'custom' ? detail : ''
            });
        }
        return retentionReferenceItems(inventory).map((item) => parsed.get(`${item.kind}:${item.index}`) || ({
            item,
            level: defaultRetentionLevel(item.kind),
            content: defaultRetentionContent(item.kind, item),
            custom: ''
        }));
    }

    function preferredStoryboardVideoSlot(state, inventory) {
        const videoEntries = retentionAnalysisEntries(state?.retention_analysis, inventory)
            .filter((entry) => entry?.item?.kind === 'video' && cleanText(entry.item.slot));
        if (!videoEntries.length) return '';
        const motionEntries = videoEntries.filter((entry) => entry.content === 'motion_timing');
        const candidates = motionEntries.length ? motionEntries : videoEntries;
        return cleanText(
            candidates.find((entry) => entry.item.slot === 'scene_reference_video')?.item?.slot
            || candidates[0]?.item?.slot
        );
    }

    function retentionAnalysisIsBare(value, inventory) {
        const items = retentionReferenceItems(inventory);
        if (!items.length) return false;
        const found = new Map();
        const pattern = /<(Picture|Video|Audio)\s+(\d+)>\s*:\s*([\s\S]*?)(?=\s*<(?:Picture|Video|Audio)\s+\d+>\s*:|\r?\n|$)/gi;
        for (const match of cleanText(value).matchAll(pattern)) {
            const kindName = String(match[1] || '').toLowerCase();
            const kind = kindName === 'picture' ? 'image' : kindName;
            const index = Number(match[2]);
            const item = items.find((candidate) => candidate.kind === kind && candidate.index === index);
            if (!item) continue;
            const body = cleanText(match[3]);
            const level = retentionLevelsForKind(kind).find((option) => body.toLowerCase().startsWith(option.value.toLowerCase()));
            const detail = level ? cleanText(body.slice(level.value.length).replace(/^[;,:\-\s]+/, '')) : body;
            found.set(`${kind}:${index}`, detail);
        }
        return found.size === items.length && Array.from(found.values()).every((detail) => !detail);
    }

    function retentionAnalysisFromControls(container, inventory, lang) {
        const rows = Array.from(container?.querySelectorAll?.('[data-h3sb-retention-row]') || []);
        if (!rows.length) return referenceRetention(inventory, lang);
        return rows.map((row) => {
            const kind = row.getAttribute('data-h3sb-retention-kind') || 'image';
            const index = Number(row.getAttribute('data-h3sb-retention-index'));
            const item = retentionReferenceItems(inventory).find((candidate) => candidate.kind === kind && candidate.index === index);
            if (!item) return '';
            const content = row.querySelector('[data-h3sb-retention-content]')?.value || defaultRetentionContent(kind, item);
            return retentionAnalysisLine(item, {
                level: row.querySelector('[data-h3sb-retention-level]')?.value || defaultRetentionLevel(kind),
                content,
                custom: row.querySelector('[data-h3sb-retention-custom]')?.value || ''
            }, lang);
        }).filter(Boolean).join('\n');
    }

    function retentionEditorRowsHtml(value, inventory, lang) {
        const entries = retentionAnalysisEntries(value, inventory);
        if (!entries.length) {
            return `<div class="sai-h3sb-retention-empty"><i class="fa-solid fa-circle-exclamation"></i><span>${escapeHtml(t('No reference media detected', '\u672a\u68c0\u6d4b\u5230\u53c2\u8003\u5a92\u4f53', lang))}</span></div>`;
        }
        return entries.map((entry) => {
            const item = entry.item;
            const levels = retentionLevelsForKind(item.kind).map((option) => `<option value="${escapeHtml(option.value)}" ${entry.level === option.value ? 'selected' : ''}>${escapeHtml(t(option.en, option.cn, lang))}</option>`).join('');
            const contents = retentionContentsForKind(item.kind).map((option) => `<option value="${escapeHtml(option.value)}" ${entry.content === option.value ? 'selected' : ''}>${escapeHtml(t(option.en, option.cn, lang))}</option>`).join('');
            const preview = item.kind === 'image' && validMediaSource(item.preview)
                ? `<img src="${escapeHtml(item.preview)}" alt="">`
                : `<i class="fa-solid ${referenceIcon(item.kind)}" aria-hidden="true"></i>`;
            const custom = entry.content === 'custom' ? entry.custom : '';
            const customState = entry.content === 'custom' ? '' : ' hidden disabled';
            return `<div class="sai-h3sb-retention-row" data-h3sb-retention-row data-h3sb-retention-kind="${escapeHtml(item.kind)}" data-h3sb-retention-index="${item.index}"><span class="sai-h3sb-retention-ref"><span class="sai-h3sb-retention-media">${preview}</span><code>${escapeHtml(item.token)}</code></span><label><span>${escapeHtml(t('Retention', '\u4fdd\u7559\u65b9\u5f0f', lang))}</span><select data-h3sb-retention-level aria-label="${escapeHtml(t(`${item.token} retention`, `${item.token} \u4fdd\u7559\u65b9\u5f0f`, lang))}">${levels}</select></label><label><span>${escapeHtml(t('Reference content', '\u53c2\u8003\u5185\u5bb9', lang))}</span><select data-h3sb-retention-content aria-label="${escapeHtml(t(`${item.token} reference content`, `${item.token} \u53c2\u8003\u5185\u5bb9`, lang))}">${contents}</select></label><input type="text" data-h3sb-retention-custom value="${escapeHtml(custom)}" placeholder="${escapeHtml(t('Custom reference content', '\u81ea\u5b9a\u4e49\u53c2\u8003\u5185\u5bb9', lang))}"${customState}></div>`;
        }).join('');
    }

    function alignmentLine(mode, duration) {
        if (mode === MODE_I2VA) return 'Image alignment: <Picture 1> is fully referenced at 0.00 seconds.';
        if (mode === MODE_FL2VA) return `Image alignment: <Picture 1> aligns at 0.00 seconds and <Picture 2> aligns at ${Number(duration).toFixed(2)} seconds.`;
        if (mode === MODE_L2VA) return `Image alignment: <Picture 1> aligns at ${Number(duration).toFixed(2)} seconds as the final frame.`;
        return '';
    }

    function defaultReferenceSubjectLine(number, lang) {
        return '<Subject ' + number + '> (<Picture ' + number + '>): ' + t(
            'Independent character defined only by this picture. Preserve identity, face, hairstyle, clothing, colors, accessories, and distinguishing features; do not merge this subject with any other numbered subject.',
            '\u4ec5\u7531\u8fd9\u5f20\u56fe\u7247\u5b9a\u4e49\u7684\u72ec\u7acb\u89d2\u8272\u3002\u4fdd\u7559\u8eab\u4efd\u3001\u9762\u5bb9\u3001\u53d1\u578b\u3001\u670d\u88c5\u3001\u914d\u8272\u3001\u9970\u54c1\u548c\u8fa8\u8bc6\u7279\u5f81\uff1b\u4e0d\u5f97\u4e0e\u5176\u4ed6\u7f16\u53f7\u4e3b\u4f53\u6df7\u5408\u3002',
            lang
        );
    }

    function defaultReferenceSubjects(inventory, lang) {
        if (inventory.image_count > 0) {
            return Array.from(
                { length: inventory.image_count },
                (_unused, index) => defaultReferenceSubjectLine(index + 1, lang)
            ).join('\n');
        }
        if (inventory.video_count > 0) {
            return '<Subject 1> (<Video 1>): Preserve the primary subject identity and appearance established by <Video 1>.';
        }
        if (inventory.audio_count > 0) {
            return 'N/A (audio reference only; no visual subject reference is supplied).';
        }
        return 'N/A (no visual subject reference is supplied).';
    }

    function sanitizeOptimizedSubjectLanguage(value) {
        return cleanText(value)
            .replace(/\u540c\u4e00(?:\u4e2a)?(?:\u4e3b\u8981)?(?:\u4eba\u7269|\u89d2\u8272|\u4e3b\u4f53)/g, '\u8be5\u72ec\u7acb\u89d2\u8272')
            .replace(/\u76f8\u540c(?:\u7684)?(?:\u4e3b\u8981)?(?:\u4eba\u7269|\u89d2\u8272|\u4e3b\u4f53)/g, '\u8be5\u72ec\u7acb\u89d2\u8272')
            .replace(/\b(?:the\s+)?same\s+(?:(?:primary|main)\s+)?(?:subject|character|person)\b/gi, 'this independent subject')
            .replace(/\b(?:the\s+)?same\s+identity\b/gi, "this subject's identity")
            .replace(/\b(?:the\s+)?same\s+appearance\b/gi, "this subject's appearance")
            .replace(/\b(?:the\s+)?(?:uploaded|supplied)\s+visual\s+references\b/gi, 'this picture')
            .replace(/(?:\u4e0a\u4f20|\u63d0\u4f9b)(?:\u7684)?\u89c6\u89c9\u53c2\u8003/g, '\u8be5\u56fe\u7247');
    }

    function isDefaultReferenceSubjectScaffold(value) {
        const text = cleanText(value).toLowerCase();
        return text.includes('independent character defined only by this picture');
    }

    function stripShotIdentityBoilerplate(value) {
        let text = cleanText(value);
        const patterns = [
            /^(?:\u4f5c\u4e3a|\u8eab\u4e3a)(?:\u4e00\u540d|\u4e00\u4e2a)?\u72ec\u7acb(?:\u89d2\u8272|\u4e3b\u4f53|\u4eba\u7269)[\uff0c,]\s*(?:\u5b8c\u6574|\u4e25\u683c)?\u4fdd\u7559.*?(?:\u4e0d\u4e0e|\u4e0d\u5f97\u4e0e|\u4e0d\u8981\u4e0e).*?(?:\u878d\u5408|\u6df7\u5408|\u5408\u5e76)[\uff1b;]\s*/i,
            /^(?:as\s+)?an?\s+independent\s+(?:character|subject|person)\s*[,;:]\s*(?:fully\s+|strictly\s+)?preserve\b.*?do\s+not\s+(?:merge|mix|combine)\b.*?[;.]\s*/i
        ];
        for (const pattern of patterns) text = text.replace(pattern, '');
        return cleanText(text);
    }

    function stripShotIdentityBoilerplateWithReferences(value) {
        let text = cleanText(value);
        const references = [];
        while (true) {
            const match = text.match(/^<Picture\s+(\d+)>\s*/i);
            if (!match) break;
            references.push(`<Picture ${Number(match[1])}>`);
            text = cleanText(text.slice(match[0].length));
        }
        text = stripShotIdentityBoilerplate(text.replace(/^[:\uFF1A]\s*/, ''));
        if (!references.length) return text;
        if (!text) return references.join(' ');
        const separator = /^[\u3400-\u9FFF]/.test(text) ? '' : ' ';
        return cleanText(references.join(' ') + separator + text);
    }

    function indexedSubjectBodies(value) {
        const text = cleanText(value);
        const matches = Array.from(text.matchAll(subjectVariantRegex()));
        const bodies = {};
        matches.forEach((match, index) => {
            const number = Number(match[1]);
            if (!Number.isFinite(number) || number < 1 || bodies[number] !== undefined) return;
            const start = match.index + match[0].length;
            const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
            bodies[number] = cleanText(text.slice(start, end));
        });
        return bodies;
    }

    function cleanSubjectBody(value) {
        return sanitizeOptimizedSubjectLanguage(
            cleanText(value)
                .replace(subjectVariantRegex(), '')
                .replace(referenceVariantRegex(), (match, kind) => {
                    const normalizedKind = String(kind || '').toLowerCase();
                    return normalizedKind === 'picture' || normalizedKind === 'image' ? '' : match;
                })
                .replace(/^[\s()[\]{}:\uFF1A,\uFF0C;\uFF1B.\-]+/, '')
                .replace(/[\s()[\]{}:\uFF1A,\uFF0C;\uFF1B.\-]+$/, '')
        );
    }

    function ensureDistinctReferenceSubjects(value, inventory, lang) {
        if (inventory.image_count < 1) return cleanText(value) || defaultReferenceSubjects(inventory, lang);
        const bodies = indexedSubjectBodies(value);
        return Array.from({ length: inventory.image_count }, (_unused, index) => {
            const number = index + 1;
            const body = cleanSubjectBody(bodies[number] || '');
            if (!body || (!isEnglish(lang) && isDefaultReferenceSubjectScaffold(body))) {
                return defaultReferenceSubjectLine(number, lang);
            }
            const distinct = /\bindependent\b|\bdistinct\b|\u72ec\u7acb|\u533a\u5206|\u4e0d\u8981\u6df7\u5408/i.test(body);
            const suffix = distinct ? '' : t(
                ' Keep this subject distinct from every other numbered subject.',
                ' \u8bf7\u5c06\u8be5\u4e3b\u4f53\u4e0e\u5176\u4ed6\u7f16\u53f7\u4e3b\u4f53\u660e\u786e\u533a\u5206\u3002',
                lang
            );
            return '<Subject ' + number + '> (<Picture ' + number + '>): ' + body + suffix;
        }).join('\n');
    }

    function validPictureNumbers(value, limit) {
        const numbers = [];
        for (const match of cleanText(value).matchAll(referenceVariantRegex())) {
            const kind = String(match[1] || '').toLowerCase();
            const number = Number(match[2]);
            if (!['picture', 'image'].includes(kind) || number < 1 || number > limit || numbers.includes(number)) continue;
            numbers.push(number);
        }
        return numbers;
    }

    function validSubjectNumbers(value, limit) {
        const numbers = [];
        for (const match of cleanText(value).matchAll(subjectVariantRegex())) {
            const number = Number(match[1]);
            if (number < 1 || number > limit || numbers.includes(number)) continue;
            numbers.push(number);
        }
        return numbers;
    }

    function timelinePictureNumbers(shot, index, state, options) {
        const inventory = inventoryFromOptions(options);
        if (inventory.image_count < 1) return [];
        const text = [shot?.description, shot?.camera, shot?.dialogue, shot?.sound].join('\n');
        return validPictureNumbers(text, inventory.image_count).sort((left, right) => left - right);
    }

    function timelinePictureReferences(shot, index, state, options) {
        const inventory = inventoryFromOptions(options);
        return timelinePictureNumbers(shot, index, state, options)
            .map((number) => inventory.image_refs[number - 1])
            .filter(Boolean);
    }

    function timelineBindingInfo(shot, index, state, options, lang) {
        if (state?.mode !== MODE_REF2VA) return { short: '', full: '' };
        const pictureNumbers = timelinePictureNumbers(shot, index, state, options);
        if (!pictureNumbers.length) {
            return {
                short: t('No picture reference', '\u65e0\u56fe\u7247\u5f15\u7528', lang),
                full: t('No picture reference in this shot', '\u8be5\u955c\u5934\u6ca1\u6709\u56fe\u7247\u5f15\u7528', lang)
            };
        }
        return {
            short: pictureNumbers.map((number) => `P${number}`).join(' + '),
            full: pictureNumbers.map((number) => `<Picture ${number}>`).join(', ')
        };
    }

    function normalizeRef2VAShot(shot) {
        return Object.assign({}, shot, {
            description: stripShotIdentityBoilerplateWithReferences(shotDescriptionForEditor(shot?.description)),
            reference_binding: 'none'
        });
    }

    function preserveFieldReferenceBindings(originalValue, rewrittenValue, options) {
        const inventory = inventoryFromOptions(options);
        const pictures = validPictureNumbers(originalValue, inventory.image_count);
        let candidate = cleanText(rewrittenValue);
        if (pictures.length === 1) {
            const picture = '<Picture ' + pictures[0] + '>';
            candidate = candidate.replace(referenceVariantRegex(), (match, kind) => {
                const normalizedKind = String(kind || '').toLowerCase();
                return ['picture', 'image'].includes(normalizedKind) ? picture : match;
            });
        }
        return preserveReferenceTokens(originalValue, candidate, options);
    }

    function applyRef2VADefaultBindings(state, options) {
        if (normalizeMode(state.mode || options?.mode, options) !== MODE_REF2VA) return state;
        const inventory = inventoryFromOptions(options);
        const currentRetention = cleanText(state.retention_analysis);
        const next = Object.assign({}, state, {
            subject_definitions: ensureDistinctReferenceSubjects(state.subject_definitions, inventory, options?.langState),
            retention_analysis: !currentRetention || retentionAnalysisIsBare(currentRetention, inventory)
                ? referenceRetention(inventory, options?.langState)
                : currentRetention
        });
        next.shots = (Array.isArray(state.shots) ? state.shots : []).map(
            (shot) => normalizeRef2VAShot(shot)
        );
        return next;
    }

    function defaultReferenceSummary(inventory) {
        const tasks = [];
        if (inventory.image_count > 0 || inventory.video_count > 0) tasks.push('reference generation');
        if (inventory.video_count > 0) tasks.push('video editing');
        if (inventory.audio_count > 0) tasks.push('audio reference');
        if (!tasks.length) return 'Generate the requested audiovisual scene without numbered reference media.';
        return `${tasks.join(' + ')} using the supplied runtime references.`;
    }

    function referenceLimitForMode(mode, inventory) {
        if (mode === MODE_T2VA) return { image: 0, video: 0, audio: 0 };
        if (mode === MODE_I2VA || mode === MODE_L2VA) return { image: 1, video: 0, audio: 0 };
        if (mode === MODE_FL2VA) return { image: 2, video: 0, audio: 0 };
        return {
            image: inventory.image_count,
            video: inventory.video_count,
            audio: inventory.audio_count
        };
    }

    function stateReferenceText(state) {
        const shotText = state.shots.map((shot) => [shot.description, shot.camera, shot.dialogue, shot.sound].join('\n')).join('\n');
        return [
            state.subject_definitions,
            state.summary,
            state.retention_analysis,
            shotText,
            state.overall_soundscape,
            state.non_diegetic_music
        ].join('\n');
    }

    function validateReferences(state, options) {
        const inventory = inventoryFromOptions(options);
        const mode = normalizeMode(state.mode || options?.mode, options);
        if ((mode === MODE_I2VA || mode === MODE_L2VA) && inventory.image_count < 1) {
            return {
                ok: false,
                error: t('Upload one picture before applying this H3 image-to-video storyboard.', 'H3 \u56fe\u751f\u89c6\u9891\u9700\u8981\u5148\u4e0a\u4f20 1 \u5f20\u56fe\u7247\u3002', options?.langState)
            };
        }
        if (mode === MODE_FL2VA && inventory.image_count < 2) {
            return {
                ok: false,
                error: t('Upload two pictures before applying this H3 first/last-frame storyboard.', 'H3 \u9996\u5c3e\u5e27\u9700\u8981\u5148\u4e0a\u4f20 2 \u5f20\u56fe\u7247\u3002', options?.langState)
            };
        }
        const limits = referenceLimitForMode(mode, inventory);
        const matches = stateReferenceText(state).matchAll(/<(Picture|Video|Audio)\s+(\d+)>/gi);
        for (const match of matches) {
            const rawKind = String(match[1] || '').toLowerCase();
            const kind = rawKind === 'picture' ? 'image' : rawKind;
            const number = Number(match[2] || 0);
            if (number >= 1 && number <= limits[kind]) continue;
            const token = `<${referenceTitle(kind)} ${number}>`;
            const mediaName = kind === 'image'
                ? t('picture', '\u56fe\u7247', options?.langState)
                : (kind === 'video' ? t('video', '\u89c6\u9891', options?.langState) : t('audio', '\u97f3\u9891', options?.langState));
            return {
                ok: false,
                error: t(
                    `${token} has no matching uploaded ${mediaName}.`,
                    `\u5f53\u524d\u6ca1\u6709\u4e0e ${token} \u5bf9\u5e94\u7684${mediaName}\u3002`,
                    options?.langState
                )
            };
        }
        return { ok: true };
    }

    function validateDuration(options) {
        const duration = finiteNumber(options?.duration, 5);
        if (duration < H3_MIN_DURATION || duration > H3_MAX_DURATION) {
            return {
                ok: false,
                error: t(
                    `MiniMax H3 output duration must be between ${H3_MIN_DURATION} and ${H3_MAX_DURATION} seconds.`,
                    `MiniMax H3 输出时长必须在 ${H3_MIN_DURATION} 到 ${H3_MAX_DURATION} 秒之间。`,
                    options?.langState
                )
            };
        }
        return { ok: true };
    }

    function validate(value, options) {
        const state = normalize(value, options);
        const duration = Math.max(0, finiteNumber(options?.duration, 0));
        const durationCheck = validateDuration(options);
        if (!durationCheck.ok) return durationCheck;
        if (!state.shots.length) return { ok: false, error: t('Add at least one shot.', '\u81f3\u5c11\u9700\u8981\u4e00\u4e2a\u955c\u5934\u3002', options?.langState) };
        let previous = -1;
        for (let index = 0; index < state.shots.length; index += 1) {
            const shot = state.shots[index];
            if (!shotHasNarrativeContent(shot, state.mode)) {
                return { ok: false, error: t(`Shot ${index + 1} is empty.`, `\u955c\u5934 ${index + 1} \u8fd8\u6ca1\u6709\u5185\u5bb9\u3002`, options?.langState) };
            }
            if (index === 0 && Number(shot.start) !== 0) shot.start = 0;
            if (index > 0 && Number(shot.start) <= previous) {
                return { ok: false, error: t('Shot start times must increase in table order.', '\u955c\u5934\u8d77\u59cb\u65f6\u95f4\u5fc5\u987b\u6309\u8868\u683c\u987a\u5e8f\u9012\u589e\u3002', options?.langState) };
            }
            if (index > 0 && duration > 0 && Number(shot.start) >= duration) {
                return { ok: false, error: t(`Shot ${index + 1} must start before ${duration.toFixed(3)} seconds.`, `\u955c\u5934 ${index + 1} \u5fc5\u987b\u5728 ${duration.toFixed(3)} \u79d2\u4e4b\u524d\u5f00\u59cb\u3002`, options?.langState) };
            }
            previous = Number(shot.start);
        }
        const referenceCheck = validateReferences(state, options);
        if (!referenceCheck.ok) return referenceCheck;
        return { ok: true, state };
    }

    function formatPrompt(value, options) {
        const opts = options && typeof options === 'object' ? options : {};
        const state = normalize(value, opts);
        const mode = normalizeMode(state.mode || opts.mode, opts);
        const duration = Math.max(0.3, finiteNumber(opts.duration, 5));
        const timeline = timelineText(state, Object.assign({}, opts, { duration }));
        const soundscape = normalizeOverallSoundscape(state.overall_soundscape, opts.langState);
        const music = cleanText(state.non_diegetic_music) || 'N/A';
        if (mode === MODE_REF2VA) {
            const inventory = inventoryFromOptions(opts);
            const subjects = cleanText(state.subject_definitions)
                || defaultReferenceSubjects(inventory, opts.langState);
            const summary = cleanText(state.summary) || defaultReferenceSummary(inventory);
            const retention = cleanText(state.retention_analysis) || referenceRetention(inventory, opts.langState);
            return [
                `subject_definitions: ${subjects}`,
                `summary: ${summary}`,
                `retention_analysis: ${retention}`,
                `detailed_description: ${timeline}`,
                `overall_soundscape: ${soundscape}`,
                `non_diegetic_music: ${music}`
            ].join('\n\n');
        }
        const sections = [
            `integrated_multimodal_description: ${timeline}`,
            `overall_soundscape: ${soundscape}`,
            `non_diegetic_music: ${music}`
        ].join('\n\n');
        const alignment = alignmentLine(mode, duration);
        return alignment ? `${alignment}\n\n${sections}` : sections;
    }

    function statusText(value, options, source) {
        const state = normalize(value, options);
        const duration = Math.max(0.3, finiteNumber(options?.duration, 5));
        const mode = normalizeMode(state.mode || options?.mode, options);
        const path = state.optimize ? t('LLM', 'LLM \u4f18\u5316', source) : t('Direct', '\u76f4\u63a5\u5199\u5165', source);
        return `${mode} · ${state.shots.length} ${t('shots', '\u955c\u5934', source)} · ${duration.toFixed(1)}s · ${H3_FPS} FPS · ${path}`;
    }

    function storyboardTargetLabel(target, lang) {
        if (!target || typeof target !== 'object') return t('No field selected', '\u672a\u9009\u62e9\u683c\u5b50', lang);
        const shotLabels = {
            description: t('Scene / action', '\u753b\u9762 / \u52a8\u4f5c', lang),
            camera: t('Camera', '\u8fd0\u955c', lang),
            dialogue: t('Dialogue / text', '\u5bf9\u767d / \u753b\u9762\u6587\u5b57', lang),
            sound: t('Sound', '\u58f0\u97f3', lang)
        };
        const globalLabels = {
            subject_definitions: t('Subject definitions', '\u4e3b\u4f53\u5b9a\u4e49', lang),
            summary: t('Summary', '\u4efb\u52a1\u6458\u8981', lang),
            retention_analysis: t('Retention analysis', '\u4fdd\u7559\u5206\u6790', lang),
            overall_soundscape: t('Overall soundscape', '\u6574\u4f53\u73af\u5883\u58f0', lang),
            non_diegetic_music: t('Non-diegetic music', '\u975e\u53d9\u4e8b\u97f3\u4e50', lang)
        };
        if (target.scope === 'shot') {
            return `Shot ${Number(target.index || 0) + 1} · ${shotLabels[target.field] || target.field || ''}`;
        }
        return globalLabels[target.key] || target.key || t('Selected field', '\u5f53\u524d\u683c', lang);
    }

    function storyboardFieldPlaceholder(field, lang) {
        const placeholders = {
            description: t(
                'Subject + pose + action + setting; e.g. <Subject 1> / <Picture 1>, dancing by a lake.',
                '\u4eba\u7269 + \u59ff\u6001 + \u52a8\u4f5c + \u73af\u5883\uff1b\u4f8b\uff1a<Subject 1> \u5bf9\u5e94 <Picture 1>\uff0c\u6e56\u8fb9\u8d77\u821e',
                lang
            ),
            camera: t(
                'Shot size + movement + amplitude + speed; e.g. medium shot, slow push-in.',
                '\u666f\u522b + \u8fd0\u52a8 + \u5e45\u5ea6 + \u901f\u5ea6\uff1b\u4f8b\uff1a\u4e2d\u666f\uff0c\u7f13\u6162\u63a8\u8fd1',
                lang
            ),
            dialogue: t(
                'Dialogue or visible text; e.g. None, or the exact spoken line.',
                '\u5199\u5bf9\u767d\u6216\u753b\u9762\u6587\u5b57\uff1b\u6ca1\u6709\u53ef\u586b\u201c\u65e0\u201d',
                lang
            ),
            sound: t(
                'Synchronized sound; e.g. Silence, footsteps, or cloth movement.',
                '\u5199\u540c\u6b65\u58f0\u97f3\uff1b\u6ca1\u6709\u53ef\u586b\u201c\u9759\u97f3\u201d',
                lang
            ),
            subject_definitions: t(
                'One subject per picture; e.g. <Subject 1> (<Picture 1>): appearance, hair, and clothing.',
                '\u6bcf\u5f20\u56fe\u5b9a\u4e49\u4e00\u4e2a\u89d2\u8272\uff1b\u4f8b\uff1a<Subject 1> (<Picture 1>): \u5916\u8c8c\u3001\u53d1\u578b\u3001\u670d\u88c5',
                lang
            ),
            summary: t(
                'Task and reference roles; e.g. reference generation + audio reference.',
                '\u5199\u4efb\u52a1\u548c\u53c2\u8003\u7528\u9014\uff1b\u4f8b\uff1areference generation + audio reference',
                lang
            ),
            retention_analysis: t(
                'One line per reference; e.g. <Picture 1>: fully_preserved.',
                '\u9010\u9879\u5199\u4fdd\u7559\u65b9\u5f0f\uff1b\u4f8b\uff1a<Picture 1>: fully_preserved',
                lang
            ),
            overall_soundscape: t(
                'Ambient and synchronized sound; e.g. wind, room tone, and footsteps.',
                '\u5199\u73af\u5883\u58f0\u548c\u540c\u6b65\u58f0\uff1b\u4f8b\uff1a\u98ce\u58f0\u3001\u5ba4\u5185\u5e95\u566a\u3001\u811a\u6b65\u58f0',
                lang
            ),
            non_diegetic_music: t(
                'Audience-only score; e.g. N/A or soft strings.',
                '\u5199\u975e\u53d9\u4e8b\u914d\u4e50\uff1b\u6ca1\u6709\u53ef\u586b N/A',
                lang
            )
        };
        return placeholders[field] || '';
    }

    function storyboardShotDescriptionPlaceholder(lang, mode) {
        if (normalizeMode(mode) === MODE_REF2VA) {
            return t(
                'Describe the shot action, setting, and visible details.',
                '\u586b\u5199\u955c\u5934\u7684\u52a8\u4f5c\u3001\u73af\u5883\u548c\u53ef\u89c1\u7ec6\u8282\u3002',
                lang
            );
        }
        return storyboardFieldPlaceholder('description', lang);
    }

    function storyboardTargetValue(state, target) {
        if (target?.scope === 'shot') return cleanText(state.shots?.[target.index]?.[target.field] || '');
        if (target?.scope === 'global') return cleanText(state?.[target.key] || '');
        return '';
    }

    function setStoryboardTargetValue(state, target, value) {
        if (target?.scope === 'shot' && state.shots?.[target.index]) {
            state.shots[target.index][target.field] = target.field === 'description'
                ? mergeShotDescription(state.shots[target.index].description, value)
                : cleanText(value);
            return true;
        }
        if (target?.scope === 'global' && target.key) {
            state[target.key] = cleanText(value);
            return true;
        }
        return false;
    }

    function cleanCellOptimizationText(value, target, lang) {
        let textValue = cleanText(value)
            .replace(/^```(?:text|prompt)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .replace(/^(?:Camera|Dialogue and visible text|Synchronized sound|\u753b\u9762\s*[\/\uff0f]\s*\u52a8\u4f5c|\u753b\u9762\u52a8\u4f5c|\u8fd0\u955c|\u5bf9\u767d\s*[\/\uff0f]\s*\u753b\u9762\u6587\u5b57|\u5bf9\u767d\u4e0e\u753b\u9762\u6587\u5b57|\u58f0\u97f3)\s*[:\uff1a]\s*/i, '')
            .trim();
        if ((textValue.startsWith('"') && textValue.endsWith('"')) || (textValue.startsWith('“') && textValue.endsWith('”'))) {
            textValue = textValue.slice(1, -1).trim();
        }
        if (!textValue && target?.field === 'dialogue') return t('None', '\u65e0', lang);
        if (!textValue && target?.field === 'sound') return t('Silence', '\u9759\u97f3', lang);
        return textValue;
    }

    function mergeOptimizedStoryboard(previousValue, optimizedValue, options, lang) {
        const previous = normalize(previousValue, options);
        const optimized = normalize(optimizedValue, options);
        const dialogueFallback = t('None', '\u65e0', lang);
        const soundFallback = t('Silence', '\u9759\u97f3', lang);
        const starts = defaultShotStarts(options?.duration);
        const shots = previous.shots.map((previousShot, index) => {
            const optimizedShot = optimized.shots[index] || {};
            const optimizedDescription = cleanText(optimizedShot.description);
            const description = optimizedDescription
                ? sanitizeOptimizedSubjectLanguage(optimizedDescription)
                : cleanText(previousShot.description);
            return normalizeShot({
                start: index === 0 ? 0 : finiteNumber(optimizedShot.start, previousShot.start),
                description: preserveFieldReferenceBindings(
                    previousShot.description,
                    description,
                    options
                ),
                camera: preserveFieldReferenceBindings(
                    previousShot.camera,
                    cleanText(optimizedShot.camera) || cleanText(previousShot.camera),
                    options
                ),
                dialogue: preserveFieldReferenceBindings(
                    previousShot.dialogue,
                    cleanText(optimizedShot.dialogue) || cleanText(previousShot.dialogue) || dialogueFallback,
                    options
                ),
                sound: preserveFieldReferenceBindings(
                    previousShot.sound,
                    cleanText(optimizedShot.sound) || cleanText(previousShot.sound) || soundFallback,
                    options
                )
            }, index, starts);
        });
        return applyRef2VADefaultBindings(Object.assign(previous, {
            mode: previous.mode,
            optimize: true,
            shots,
            overall_soundscape: preserveStoryboardReferenceTokens(
                previous.overall_soundscape,
                cleanText(optimized.overall_soundscape) || cleanText(previous.overall_soundscape) || soundFallback,
                options
            ),
            non_diegetic_music: preserveStoryboardReferenceTokens(
                previous.non_diegetic_music,
                cleanText(optimized.non_diegetic_music) || cleanText(previous.non_diegetic_music) || 'N/A',
                options
            ),
            subject_definitions: preserveStoryboardReferenceTokens(
                previous.subject_definitions,
                cleanText(optimized.subject_definitions) || cleanText(previous.subject_definitions),
                options
            ),
            summary: preserveStoryboardReferenceTokens(
                previous.summary,
                cleanText(optimized.summary) || cleanText(previous.summary),
                options
            ),
            retention_analysis: preserveStoryboardReferenceTokens(
                previous.retention_analysis,
                cleanText(optimized.retention_analysis) || cleanText(previous.retention_analysis),
                options
            ),
            prompt_snapshot: cleanText(optimized.prompt_snapshot)
        }), options);
    }

    function storyboardCellOptimizationRequest(state, target, userInstruction, options, lang) {
        const label = storyboardTargetLabel(target, lang);
        const currentValue = storyboardTargetValue(state, target);
        const prompt = formatPrompt(state, options);
        const instruction = cleanText(userInstruction) || t(
            'Improve this field so it fits the current storyboard.',
            '\u6839\u636e\u5f53\u524d\u5206\u955c\u4f18\u5316\u8fd9\u4e2a\u683c\u5b50\u3002',
            lang
        );
        const requestInstruction = isEnglish(lang)
            ? 'Edit exactly one MiniMax H3 storyboard field. Return only the replacement field content, without a field name, quotes, markdown, explanation, or changes to any other field. For a Camera field, invent a suitable camera movement when unspecified. For Dialogue / text with no requested dialogue or visible text, return None. For Sound with no requested sound, return Silence.'
            : '\u53ea\u4fee\u6539 MiniMax H3 \u5206\u955c\u8868\u7684\u4e00\u4e2a\u683c\u5b50\u3002\u53ea\u8f93\u51fa\u8be5\u683c\u7684\u65b0\u5185\u5bb9\uff0c\u4e0d\u8981\u8f93\u51fa\u5b57\u6bb5\u540d\u3001\u5f15\u53f7\u3001Markdown\u3001\u89e3\u91ca\u6216\u5176\u4ed6\u683c\u5b50\u3002\u8fd0\u955c\u672a\u6307\u5b9a\u65f6\u53ef\u4ee5\u6839\u636e\u52a8\u4f5c\u5408\u7406\u53d1\u6325\u3002\u7528\u6237\u6ca1\u6709\u8981\u6c42\u5bf9\u767d\u6216\u753b\u9762\u6587\u5b57\u65f6\u8f93\u51fa\u201c\u65e0\u201d\uff1b\u6ca1\u6709\u8981\u6c42\u58f0\u97f3\u65f6\u8f93\u51fa\u201c\u9759\u97f3\u201d\u3002';
        const input = isEnglish(lang)
            ? `Target field: ${label}\nCurrent content: ${currentValue || '(empty)'}\nUser revision: ${instruction}\n\nFull storyboard context:\n${prompt}`
            : `\u76ee\u6807\u683c\uff1a${label}\n\u5f53\u524d\u5185\u5bb9\uff1a${currentValue || '\u7a7a'}\n\u4fee\u6539\u8981\u6c42\uff1a${instruction}\n\n\u5b8c\u6574\u5206\u955c\u4e0a\u4e0b\u6587\uff1a\n${prompt}`;
        return {
            kind: 'cell',
            target: Object.assign({}, target, { label, current_value: currentValue }),
            input,
            instruction: requestInstruction,
            user_instruction: instruction,
            prompt,
            state: normalize(state, options),
            storyboard_state: serialize(state, options),
            mode: state.mode
        };
    }

    function gradioRoot() {
        if (typeof document === 'undefined') return null;
        return typeof root.gradioApp === 'function' ? root.gradioApp() : document;
    }

    function findById(id) {
        const app = gradioRoot();
        return app?.getElementById?.(id) || (typeof document !== 'undefined' ? document.getElementById(id) : null);
    }

    function bridgeInput(id) {
        const host = findById(id);
        return host?.matches?.('input,textarea') ? host : host?.querySelector?.('input,textarea');
    }

    function readBridgeValue(id) {
        return String(bridgeInput(id)?.value || '');
    }

    function setNativeValue(input, value) {
        if (!input) return false;
        input.value = String(value ?? '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function fieldNumber(id, fallback) {
        return finiteNumber(bridgeInput(id)?.value, fallback);
    }

    function positivePromptField() {
        return bridgeInput('positive_prompt');
    }

    function directorModeEnabled() {
        return !!findById('scene_director_enabled')?.querySelector?.('input[type="checkbox"]')?.checked;
    }

    function activeDirectorPromptField() {
        if (!directorModeEnabled()) return null;
        const editor = findById('scene_director_editor_root');
        return editor?.querySelector?.('.scene-director-shot.is-active-shot [data-scene-director-field="prompt"]')
            || editor?.querySelector?.('[data-scene-director-shot][aria-current="true"] [data-scene-director-field="prompt"]')
            || null;
    }

    function currentPromptField() {
        return activeDirectorPromptField() || positivePromptField();
    }

    function themeValue(source, key, fallback) {
        const state = languageState(source);
        const scene = state.scene_frontend && typeof state.scene_frontend === 'object' ? state.scene_frontend : {};
        const theme = String(state.__scene_theme || state.scene_theme || '').trim();
        const raw = scene[key];
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            if (theme && Object.prototype.hasOwnProperty.call(raw, theme)) return raw[theme];
            const firstKey = Object.keys(raw).find((item) => raw[item] !== undefined && raw[item] !== null && raw[item] !== '');
            return firstKey ? raw[firstKey] : fallback;
        }
        return raw !== undefined ? raw : fallback;
    }

    function sceneModeFromSource(source, inventory, extraHint) {
        const state = languageState(source);
        const scene = state.scene_frontend && typeof state.scene_frontend === 'object' ? state.scene_frontend : {};
        const hints = [
            themeValue(state, 'prompt_compiler', ''),
            themeValue(state, 'task_method', ''),
            state.__preset,
            state.preset,
            state.task_method,
            scene.theme_title,
            extraHint
        ].filter(Boolean).join(' ');
        return normalizeMode(hints, { inventory });
    }

    function validMediaSource(value) {
        const source = String(value || '').trim();
        if (!source || source === 'about:blank' || source === 'data:,') return '';
        if (/welcome|placeholder|transparent\.gif/i.test(source)) return '';
        return source;
    }

    function mediaSourceFromHost(host, selector) {
        const mediaItems = Array.from(host?.querySelectorAll?.(selector) || []);
        for (const media of mediaItems) {
            const source = validMediaSource(media?.currentSrc || media?.src || media?.getAttribute?.('src'));
            if (source) return source;
        }
        const sourceItems = Array.from(host?.querySelectorAll?.(`${selector} source`) || []);
        for (const sourceItem of sourceItems) {
            const source = validMediaSource(sourceItem?.src || sourceItem?.getAttribute?.('src'));
            if (source) return source;
        }
        const file = Array.from(host?.querySelectorAll?.('input[type="file"]') || [])
            .flatMap((input) => Array.from(input.files || []))[0];
        return file ? `file:${file.name || 'selected'}` : '';
    }

    function audioSourceFromHost(host) {
        const source = mediaSourceFromHost(host, 'audio');
        if (source) return source;
        const waveform = host?.querySelector?.('[data-testid^="waveform-"]');
        if (!waveform) return '';
        const uploadButton = Array.from(waveform.querySelectorAll?.('button') || []).find((button) => {
            const label = `${button?.getAttribute?.('aria-label') || ''} ${button?.textContent || ''}`.toLowerCase();
            return /upload|\u4e0a\u4f20/.test(label);
        });
        return uploadButton ? '' : 'waveform:audio';
    }

    function sceneCanvasMediaInfo() {
        const host = findById('scene_canvas');
        if (!host) return { available: false, preview: '' };
        try {
            const sketch = root.SimpAISketch?.get?.(host)
                || root.SimpAISketch?.get?.(host.querySelector?.('[data-simpai-sketch="1"],.simpai-custom-sketch-source'));
            if (sketch?.hasImage?.()) {
                const value = sketch.getValue?.();
                return { available: true, preview: validMediaSource(value?.image) };
            }
        } catch (error) {}
        const parsed = parseJsonObject(bridgeInput('scene_canvas')?.value || '');
        const payloadImage = validMediaSource(parsed?.image || parsed?.background || parsed?.composite || '');
        if (payloadImage) return { available: true, preview: payloadImage };
        const preview = mediaSourceFromHost(host, 'img');
        return { available: !!preview, preview: preview.startsWith('file:') ? '' : preview };
    }

    function sceneMediaInfo(id, selector) {
        const host = findById(id);
        const source = selector === 'audio'
            ? audioSourceFromHost(host)
            : mediaSourceFromHost(host, selector);
        return { available: !!source, preview: source.startsWith('file:') ? '' : source };
    }

    function sceneHiddenSlots(source) {
        const state = languageState(source);
        const scene = state.scene_frontend && typeof state.scene_frontend === 'object' ? state.scene_frontend : {};
        const hasResolvedHidden = Object.prototype.hasOwnProperty.call(state, '__scene_disvisible');
        const raw = hasResolvedHidden
            ? state.__scene_disvisible
            : scene.disvisible;
        const hidden = new Set((Array.isArray(raw) ? raw : String(raw || '').split(','))
            .map((item) => String(item || '').trim())
            .filter(Boolean));
        if (!hasResolvedHidden) {
            const enabled = new Set(Array.isArray(scene.divisible) ? scene.divisible.map(String) : []);
            ['scene_input_image3', 'scene_input_image4'].forEach((slot) => {
                if (!hidden.has(slot) && !enabled.has(slot)) hidden.add(slot);
            });
        }
        return hidden;
    }

    function currentSceneInventory(source) {
        const hidden = sceneHiddenSlots(source);
        const imageSlots = [
            { id: 'scene_canvas', slot: 'scene_canvas_image', label_en: 'Upload and canvas (1)', label_cn: '\u4e0a\u4f20\u548c\u753b\u5e03 (1)', info: sceneCanvasMediaInfo },
            { id: 'scene_input_image1', slot: 'scene_input_image1', label_en: 'Prompt image (2)', label_cn: '\u63d0\u793a\u56fe (2)' },
            { id: 'scene_input_image2', slot: 'scene_input_image2', label_en: 'Prompt image (3)', label_cn: '\u63d0\u793a\u56fe (3)' },
            { id: 'scene_input_image3', slot: 'scene_input_image3', label_en: 'Prompt image (4)', label_cn: '\u63d0\u793a\u56fe (4)' },
            { id: 'scene_input_image4', slot: 'scene_input_image4', label_en: 'Prompt image (5)', label_cn: '\u63d0\u793a\u56fe (5)' }
        ];
        const videoSlots = [
            { id: 'scene_video', slot: 'scene_video', label_en: 'Video', label_cn: '\u89c6\u9891' },
            { id: 'scene_reference_video', slot: 'scene_reference_video', label_en: 'Reference video', label_cn: '\u53c2\u8003\u89c6\u9891' }
        ];
        const imageRefs = imageSlots.flatMap((item) => {
            if (hidden.has(item.slot)) return [];
            const info = item.info ? item.info() : sceneMediaInfo(item.id, 'img');
            return info.available ? [Object.assign({}, item, { preview: info.preview })] : [];
        });
        const videoRefs = videoSlots.flatMap((item) => {
            if (hidden.has(item.slot)) return [];
            const info = sceneMediaInfo(item.id, 'video');
            return info.available ? [Object.assign({}, item, { preview: info.preview })] : [];
        });
        const audioInfo = hidden.has('scene_audio') ? { available: false } : sceneMediaInfo('scene_audio', 'audio');
        const audioRefs = audioInfo.available ? [{
            id: 'scene_audio',
            slot: 'scene_audio',
            label_en: 'Audio',
            label_cn: '\u97f3\u9891',
            preview: ''
        }] : [];
        return inventoryFromOptions({ inventory: {
            image_refs: imageRefs,
            video_refs: videoRefs,
            audio_refs: audioRefs
        } });
    }

    function currentSceneOptions(source) {
        const inventory = currentSceneInventory(source);
        const sceneThemeText = cleanText(findById('scene_theme')?.textContent || '');
        return {
            mode: sceneModeFromSource(source, inventory, sceneThemeText),
            duration: Math.max(0.3, fieldNumber('scene_video_duration', 5)),
            inventory,
            langState: languageState(source)
        };
    }

    function sceneStateFromPrompt(source) {
        const options = currentSceneOptions(source);
        const prompt = cleanText(currentPromptField()?.value || '');
        const stored = normalize(readBridgeValue('minimax_h3_storyboard_scene_state'), options);
        if (prompt && stored.prompt_snapshot !== prompt) {
            return parsePrompt(prompt, Object.assign({}, options, { optimize: stored.optimize }));
        }
        return prompt || readBridgeValue('minimax_h3_storyboard_scene_state') ? stored : defaultState(options);
    }

    function syncSceneControl(source) {
        const host = findById('minimax_h3_storyboard_scene_control');
        if (!host) return false;
        const options = currentSceneOptions(source);
        const state = sceneStateFromPrompt(source);
        const status = host.querySelector('[data-h3-storyboard-scene-status]');
        const label = host.querySelector('[data-h3-storyboard-scene-label]');
        const button = host.querySelector('[data-h3-storyboard-scene-open]');
        if (status) status.textContent = statusText(state, options, source);
        if (label) label.textContent = t('H3 Storyboard', 'H3 \u5206\u955c\u8868', source);
        if (button) button.title = t('Edit MiniMax H3 storyboard', '\u7f16\u8f91 MiniMax H3 \u5206\u955c\u8868', source);
        return true;
    }

    function injectStyles() {
        if (typeof document === 'undefined' || document.getElementById('simpai_h3_storyboard_editor_styles')) return;
        const style = document.createElement('style');
        style.id = 'simpai_h3_storyboard_editor_styles';
        style.textContent = `
.sai-h3sb-retention-editor{grid-column:1/-1;display:grid;gap:8px;min-width:0;padding-top:2px;border-top:1px solid var(--border-color-primary,#3f3f46)}.sai-h3sb-retention-head{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--body-text-color-subdued,#aab4c8);font-size:11px;font-weight:700}.sai-h3sb-retention-head span:first-child{display:flex;align-items:center;gap:6px;color:inherit;font-size:12px;font-weight:800}.sai-h3sb-retention-head i{color:var(--sai-h3sb-accent)}.sai-h3sb-retention-rows{display:grid;gap:6px;min-width:0}.sai-h3sb-retention-row{display:grid;grid-template-columns:minmax(112px,.55fr) minmax(128px,.7fr) minmax(150px,1fr) minmax(170px,1.2fr);align-items:end;gap:7px;min-width:0;padding:6px 0;border-bottom:1px solid color-mix(in srgb,var(--border-color-primary,#3f3f46) 72%,transparent)}.sai-h3sb-retention-row label{display:grid;gap:3px;min-width:0;color:var(--body-text-color-subdued,#aab4c8);font-size:10px;font-weight:700}.sai-h3sb-retention-row select,.sai-h3sb-retention-row input,.sai-h3sb-retention-output textarea{width:100%;min-width:0;box-sizing:border-box;color:inherit;background:var(--input-background-fill,#111318);border:1px solid var(--border-color-primary,#52525b);border-radius:5px;font:inherit;letter-spacing:0}.sai-h3sb-retention-row select,.sai-h3sb-retention-row input{height:32px;padding:0 7px;font-size:11px}.sai-h3sb-retention-row select:focus,.sai-h3sb-retention-row input:focus,.sai-h3sb-retention-output textarea:focus{border-color:var(--sai-h3sb-accent);outline:none}.sai-h3sb-retention-ref{display:flex;align-items:center;gap:7px;min-width:0;height:32px}.sai-h3sb-retention-ref code{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:800}.sai-h3sb-retention-media{width:28px;height:28px;display:grid;place-items:center;flex:0 0 28px;overflow:hidden;border:1px solid var(--border-color-primary,#52525b);border-radius:4px;background:var(--input-background-fill,#111318);color:var(--body-text-color-subdued,#aab4c8)}.sai-h3sb-retention-media img{width:100%;height:100%;object-fit:cover}.sai-h3sb-retention-output{display:grid;gap:4px;min-width:0;color:var(--body-text-color-subdued,#aab4c8);font-size:10px;font-weight:700}.sai-h3sb-retention-output textarea{min-height:66px;padding:7px;resize:vertical;font-size:11px;line-height:1.35}.sai-h3sb-retention-empty{display:flex;align-items:center;gap:7px;min-height:34px;color:var(--body-text-color-subdued,#aab4c8);font-size:11px}.sai-h3sb-retention-empty i{color:var(--sai-h3sb-accent)}
@media(max-width:760px){.sai-h3sb-retention-row{grid-template-columns:minmax(100px,.7fr) minmax(120px,1fr)}.sai-h3sb-retention-ref{grid-column:1/-1}.sai-h3sb-retention-row [data-h3sb-retention-custom]{grid-column:1/-1}}
.sai-h3sb-timeline-thumbnails{display:flex;align-items:center;gap:2px;flex:0 1 auto;min-width:0;max-width:52%;overflow:hidden}.sai-h3sb-timeline-thumbnail{width:20px;height:20px;display:grid;place-items:center;flex:0 0 20px;overflow:hidden;border:1px solid color-mix(in srgb,var(--sai-h3sb-accent) 48%,var(--border-color-primary,#52525b));border-radius:3px;background:var(--input-background-fill,#111318);color:var(--body-text-color-subdued,#aab4c8);font-size:10px}.sai-h3sb-timeline-thumbnail img{width:100%;height:100%;object-fit:cover}.sai-h3sb-timeline-thumbnail i{font-size:10px}
.sai-h3sb-backdrop{position:fixed;inset:0;z-index:99984;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,10,14,.68);backdrop-filter:blur(5px);overscroll-behavior:contain}
.sai-h3sb-modal{--sai-h3sb-accent:#f97316;--sai-h3sb-accent-hover:#ea580c;width:min(1180px,calc(100vw - 24px));max-height:calc(100vh - 28px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;min-width:0;color:var(--body-text-color,#f4f4f5);background:var(--body-background-fill,#18181b);border:1px solid var(--border-color-primary,#4b5563);border-radius:8px;box-shadow:0 24px 72px rgba(0,0,0,.44);overflow:hidden;letter-spacing:0}
.sai-h3sb-header,.sai-h3sb-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:var(--block-background-fill,#24262b)}
.sai-h3sb-header{border-bottom:1px solid var(--border-color-primary,#3f3f46)}.sai-h3sb-header-actions{display:flex;align-items:center;gap:6px}
.sai-h3sb-footer{border-top:1px solid var(--border-color-primary,#3f3f46)}
.sai-h3sb-title{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:800}.sai-h3sb-title i{color:var(--sai-h3sb-accent)}
.sai-h3sb-close,.sai-h3sb-icon{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border-color-primary,#52525b);border-radius:6px;background:var(--secondary-button-background-fill,#303238);color:inherit;cursor:pointer}
.sai-h3sb-body{min-width:0;min-height:0;overflow:auto;padding:14px;display:grid;gap:12px}
.sai-h3sb-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.sai-h3sb-badge{padding:5px 8px;border:1px solid var(--border-color-primary,#52525b);border-radius:6px;background:var(--block-background-fill,#24262b);font-size:12px;font-weight:800}.sai-h3sb-template-control{height:36px;display:inline-flex;align-items:center;gap:6px;padding:0 8px;border:1px solid var(--border-color-primary,#52525b);border-radius:6px;background:var(--secondary-button-background-fill,#303238);color:inherit}.sai-h3sb-template-control i{color:var(--sai-h3sb-accent)}.sai-h3sb-template-control select{max-width:170px;height:30px;border:0;background:transparent;color:inherit;font:inherit;font-weight:800;outline:none}.sai-h3sb-template-control option{color:#18181b}
.sai-h3sb-add{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 11px;border:1px solid var(--border-color-primary,#52525b);border-radius:6px;background:var(--secondary-button-background-fill,#303238);color:inherit;font-weight:700;cursor:pointer}
.sai-h3sb-timeline{display:grid;gap:7px;padding:10px 0;border-top:1px solid var(--border-color-primary,#3f3f46);border-bottom:1px solid var(--border-color-primary,#3f3f46)}.sai-h3sb-timeline-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;font-weight:800}.sai-h3sb-timeline-head span:last-child{color:var(--body-text-color-subdued,#aab4c8);font-weight:600}.sai-h3sb-timeline-track{position:relative;min-height:58px;overflow:visible;border:1px solid var(--border-color-primary,#52525b);border-radius:6px;background:var(--input-background-fill,#111318)}.sai-h3sb-timeline-segment{position:absolute;top:15px;height:28px;left:var(--sai-h3sb-left);width:var(--sai-h3sb-width);min-width:3px;overflow:hidden;border:1px solid color-mix(in srgb,var(--sai-h3sb-accent) 72%,var(--border-color-primary,#52525b));border-radius:5px;background:color-mix(in srgb,var(--sai-h3sb-accent) 22%,var(--block-background-fill,#24262b));box-sizing:border-box}.sai-h3sb-timeline-segment button{width:100%;height:100%;padding:0 7px;overflow:hidden;border:0;background:transparent;color:inherit;text-align:left;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:800;cursor:pointer}.sai-h3sb-timeline-segment button:hover,.sai-h3sb-timeline-segment button:focus-visible{background:color-mix(in srgb,var(--sai-h3sb-accent) 20%,transparent);outline:none}.sai-h3sb-timeline-boundary{position:absolute;top:7px;left:var(--sai-h3sb-left);width:10px;height:44px;transform:translateX(-50%);border:0;border-left:2px solid var(--sai-h3sb-accent);border-right:2px solid var(--sai-h3sb-accent);border-radius:3px;background:transparent;cursor:ew-resize;z-index:2}.sai-h3sb-timeline-boundary:hover,.sai-h3sb-timeline-boundary:focus-visible{background:color-mix(in srgb,var(--sai-h3sb-accent) 20%,transparent);outline:none}.sai-h3sb-timeline-ruler{display:flex;justify-content:space-between;color:var(--body-text-color-subdued,#aab4c8);font-size:11px}.sai-h3sb-time-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.sai-h3sb-time-fields label{display:grid;gap:3px;min-width:0;color:var(--body-text-color-subdued,#aab4c8);font-size:10px;font-weight:700}.sai-h3sb-time-fields input,.sai-h3sb-time-fields output{width:100%;min-width:0;box-sizing:border-box;color:inherit;background:var(--input-background-fill,#111318);border:1px solid var(--border-color-primary,#52525b);border-radius:5px;font:inherit;letter-spacing:0}.sai-h3sb-time-fields input{height:31px;padding:0 5px}.sai-h3sb-time-fields output{display:flex;align-items:center;height:31px;padding:0 5px;overflow:hidden;white-space:nowrap}.sai-h3sb-time-fields input:focus{border-color:var(--sai-h3sb-accent);outline:none}.sai-h3sb-time-fields input:disabled{opacity:.72}
.sai-h3sb-time-fields{grid-template-columns:1fr;gap:4px}.sai-h3sb-time-range{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:3px;min-width:0}.sai-h3sb-time-duration-line{display:grid;grid-template-columns:max-content minmax(0,1fr);align-items:center;gap:5px;min-width:0}.sai-h3sb-time-caption{color:var(--body-text-color-subdued,#aab4c8);font-size:10px;font-weight:700;white-space:nowrap}.sai-h3sb-time-separator{color:var(--body-text-color-subdued,#aab4c8);font-size:11px;text-align:center}.sai-h3sb-time-fields input,.sai-h3sb-time-fields output{height:28px;padding:0 4px;font-size:11px}.sai-h3sb-time-fields input{min-width:0}
.sai-h3sb-timeline-track{min-height:70px}.sai-h3sb-timeline-segment{top:10px;height:48px}.sai-h3sb-timeline-segment button{display:grid;grid-template-rows:auto auto auto;align-content:center;gap:2px;padding:4px 7px;text-align:left;white-space:normal}.sai-h3sb-timeline-segment.is-active{z-index:3;box-shadow:0 0 0 2px color-mix(in srgb,var(--sai-h3sb-accent) 68%,transparent)}.sai-h3sb-timeline-segment[data-h3sb-shot-state="ready"]{--sai-h3sb-status:#22c55e;border-color:color-mix(in srgb,var(--sai-h3sb-status) 72%,var(--border-color-primary,#52525b));background:color-mix(in srgb,var(--sai-h3sb-status) 18%,var(--block-background-fill,#24262b))}.sai-h3sb-timeline-segment[data-h3sb-shot-state="needs-description"]{--sai-h3sb-status:#f59e0b;border-color:color-mix(in srgb,var(--sai-h3sb-status) 76%,var(--border-color-primary,#52525b));background:color-mix(in srgb,var(--sai-h3sb-status) 18%,var(--block-background-fill,#24262b))}.sai-h3sb-timeline-segment[data-h3sb-shot-state="empty"]{--sai-h3sb-status:#64748b;border-color:color-mix(in srgb,var(--sai-h3sb-status) 72%,var(--border-color-primary,#52525b));background:color-mix(in srgb,var(--sai-h3sb-status) 16%,var(--block-background-fill,#24262b))}.sai-h3sb-timeline-shot-line{display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden;color:inherit;font-size:11px;font-weight:800;line-height:1.1}.sai-h3sb-timeline-shot-name,.sai-h3sb-timeline-shot-meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sai-h3sb-timeline-shot-meta{color:var(--body-text-color-subdued,#aab4c8);font-size:10px;font-weight:700}.sai-h3sb-timeline-binding{flex:0 0 auto;color:var(--sai-h3sb-accent);font-size:10px;font-weight:800}.sai-h3sb-timeline-fields{display:flex;align-items:center;gap:4px;color:var(--body-text-color-subdued,#aab4c8);font-size:9px;line-height:1}.sai-h3sb-timeline-fields i{opacity:.45}.sai-h3sb-timeline-fields i.is-filled{color:var(--sai-h3sb-status,var(--sai-h3sb-accent));opacity:1}.sai-h3sb-table tbody tr.is-active-shot>td{background:color-mix(in srgb,var(--sai-h3sb-accent) 8%,transparent)}.sai-h3sb-table tbody tr.is-active-shot>td:first-child{box-shadow:inset 3px 0 0 var(--sai-h3sb-accent)}
.sai-h3sb-ai-edit{display:grid;grid-template-columns:minmax(0,max-content) minmax(0,1fr) max-content;align-items:center;gap:8px;min-width:0;padding:9px 0;border-top:1px solid var(--border-color-primary,#3f3f46);border-bottom:1px solid var(--border-color-primary,#3f3f46)}.sai-h3sb-ai-target{max-width:240px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:6px 9px;border:1px solid color-mix(in srgb,var(--sai-h3sb-accent) 58%,var(--border-color-primary,#52525b));border-radius:6px;background:color-mix(in srgb,var(--block-background-fill,#24262b) 86%,var(--sai-h3sb-accent));font-size:12px;font-weight:800}.sai-h3sb-ai-edit input{width:100%;min-width:0;height:36px;box-sizing:border-box;padding:0 10px;color:inherit;background:var(--input-background-fill,#111318);border:1px solid var(--border-color-primary,#52525b);border-radius:6px;font:inherit;letter-spacing:0}.sai-h3sb-ai-edit input:focus{border-color:var(--sai-h3sb-accent);outline:none}.sai-h3sb-button.is-cell-optimize{border-color:var(--sai-h3sb-accent);background:#2b211c;color:#fed7aa}.sai-h3sb-button.is-cell-optimize:hover,.sai-h3sb-button.is-cell-optimize:focus-visible{border-color:#fb923c;background:#38271e;outline:none}.sai-h3sb-button.is-cell-optimize i{color:var(--sai-h3sb-accent)}
.sai-h3sb-references{display:grid;gap:9px;padding:10px 0;border-top:1px solid var(--border-color-primary,#3f3f46);border-bottom:1px solid var(--border-color-primary,#3f3f46)}.sai-h3sb-reference-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.sai-h3sb-reference-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800}.sai-h3sb-reference-title i{color:var(--sai-h3sb-accent)}
.sai-h3sb-reference-list{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.sai-h3sb-reference-chip{min-height:38px;display:inline-flex;align-items:center;gap:7px;padding:4px 9px 4px 5px;border:1px solid var(--border-color-primary,#52525b);border-radius:6px;background:var(--secondary-button-background-fill,#303238);color:inherit;cursor:pointer}.sai-h3sb-reference-chip:hover,.sai-h3sb-reference-chip:focus-visible{border-color:var(--sai-h3sb-accent);outline:none}.sai-h3sb-reference-chip code{font-size:12px;font-weight:800}.sai-h3sb-reference-chip small{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--body-text-color-subdued,#aab4c8)}
.sai-h3sb-reference-media{width:28px;height:28px;display:grid;place-items:center;overflow:hidden;border-radius:4px;background:var(--block-background-fill,#24262b);color:var(--body-text-color-subdued,#aab4c8)}.sai-h3sb-reference-media img{width:100%;height:100%;object-fit:cover}.sai-h3sb-reference-empty{display:flex;align-items:center;gap:8px;min-height:38px;color:var(--body-text-color-subdued,#aab4c8);font-size:12px}.sai-h3sb-reference-add{width:34px;height:34px;display:grid;place-items:center;padding:0;border:1px solid var(--border-color-primary,#52525b);border-radius:6px;background:var(--secondary-button-background-fill,#303238);color:inherit;cursor:pointer}
.sai-h3sb-table-wrap{height:clamp(280px,42vh,430px);min-width:0;overflow:auto;border:1px solid var(--border-color-primary,#3f3f46);border-radius:6px}.sai-h3sb-table{width:100%;min-width:0;border-collapse:collapse;table-layout:fixed}.sai-h3sb-table th,.sai-h3sb-table td{padding:8px;border-right:1px solid var(--border-color-primary,#3f3f46);border-bottom:1px solid var(--border-color-primary,#3f3f46);vertical-align:top;overflow:hidden}.sai-h3sb-table th:last-child,.sai-h3sb-table td:last-child{border-right:0}.sai-h3sb-table tr:last-child td{border-bottom:0}.sai-h3sb-table th{font-size:12px;text-align:left;background:var(--block-background-fill,#24262b);white-space:normal;overflow-wrap:anywhere}
.sai-h3sb-table textarea,.sai-h3sb-table input,.sai-h3sb-global textarea{width:100%;box-sizing:border-box;color:inherit;background:var(--input-background-fill,#111318);border:1px solid var(--border-color-primary,#52525b);border-radius:5px;font:inherit;letter-spacing:0}.sai-h3sb-table textarea{min-height:78px;padding:8px;resize:vertical}.sai-h3sb-table input{height:36px;padding:0 8px}.sai-h3sb-table input:disabled{opacity:.72}.sai-h3sb-shot-label{display:flex;align-items:flex-start;gap:7px;min-width:0;font-weight:800}.sai-h3sb-shot-label>span{display:flex;align-items:center;gap:5px;min-width:0;white-space:normal;overflow-wrap:anywhere;line-height:1.25}.sai-h3sb-drag-handle{width:24px;height:28px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;padding:0;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--body-text-color-subdued,#aab4c8);cursor:grab}.sai-h3sb-drag-handle:hover,.sai-h3sb-drag-handle:focus-visible{border-color:var(--sai-h3sb-accent);background:color-mix(in srgb,var(--sai-h3sb-accent) 16%,transparent);color:inherit;outline:none}.sai-h3sb-drag-handle:active{cursor:grabbing}.sai-h3sb-table tbody tr.is-dragging{opacity:.48}.sai-h3sb-table tbody tr.is-drop-before td{box-shadow:inset 0 2px 0 var(--sai-h3sb-accent)}.sai-h3sb-table tbody tr.is-drop-after td{box-shadow:inset 0 -2px 0 var(--sai-h3sb-accent)}.sai-h3sb-shot-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;justify-items:stretch}.sai-h3sb-shot-actions .sai-h3sb-icon{width:100%;min-width:0;box-sizing:border-box}.sai-h3sb-dialogue-cell{display:grid;gap:5px}.sai-h3sb-dialogue-meta{display:flex;align-items:flex-start;gap:5px;min-height:16px;color:var(--body-text-color-subdued,#aab4c8);font-size:10px;line-height:1.35}.sai-h3sb-dialogue-meta i{padding-top:1px;color:var(--body-text-color-subdued,#aab4c8)}.sai-h3sb-dialogue-meta[data-tone="success"] i{color:#86efac}.sai-h3sb-dialogue-meta[data-tone="warning"] i{color:#fbbf24}.sai-h3sb-dialogue-meta[data-tone="error"] i{color:#fca5a5}.sai-h3sb-dialogue-meta span{min-width:0;overflow-wrap:anywhere}
.sai-h3sb-shot-label{position:relative;display:block;min-height:44px}.sai-h3sb-shot-label>.sai-h3sb-shot-number{width:100%;display:grid!important;grid-template-rows:auto auto;align-items:start;justify-items:center;gap:1px;min-width:0;text-align:center;line-height:1.05;white-space:nowrap}.sai-h3sb-shot-number .sai-h3sb-shot-kicker{display:block;font-size:11px;line-height:1.1}.sai-h3sb-shot-number strong{display:block;padding-left:0;font-size:15px;line-height:1;font-variant-numeric:tabular-nums}.sai-h3sb-drag-handle{position:absolute;left:0;top:0;width:18px;height:22px;z-index:1}
.sai-h3sb-shot-cell{position:relative!important;padding:8px 4px!important;text-align:center!important;vertical-align:middle!important}.sai-h3sb-shot-cell .sai-h3sb-shot-label{width:100%;display:grid;place-items:center;min-height:44px}.sai-h3sb-shot-cell .sai-h3sb-shot-number{width:100%;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:1px;margin:0;text-align:center}.sai-h3sb-shot-cell .sai-h3sb-drag-handle{left:0;top:0}.sai-h3sb-description-cell{display:grid;gap:5px;min-width:0}.sai-h3sb-camera-cell{display:grid;gap:5px;min-width:0}.sai-h3sb-camera-cell textarea{min-height:48px}.sai-h3sb-camera-preset{width:100%;min-width:0;height:28px;box-sizing:border-box;padding:0 6px;color:inherit;background:var(--input-background-fill,#111318);border:1px solid var(--border-color-primary,#52525b);border-radius:5px;font:inherit;font-size:10px;letter-spacing:0}.sai-h3sb-camera-preset:focus{border-color:var(--sai-h3sb-accent);outline:none}.sai-h3sb-camera-preset option{color:#18181b}
.sai-h3sb-table textarea::placeholder,.sai-h3sb-global textarea::placeholder{color:var(--body-text-color-subdued,#aab4c8);opacity:.58}
.sai-h3sb-table textarea:placeholder-shown,.sai-h3sb-global textarea:placeholder-shown{overflow:hidden}
.sai-h3sb-table textarea.is-ai-target,.sai-h3sb-global textarea.is-ai-target{border-color:var(--sai-h3sb-accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--sai-h3sb-accent) 48%,transparent);outline:none}
.sai-h3sb-global{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sai-h3sb-global.is-reference{grid-template-columns:repeat(3,minmax(0,1fr))}.sai-h3sb-global label{display:grid;gap:6px;font-size:12px;font-weight:700}.sai-h3sb-global textarea{min-height:82px;padding:9px;resize:vertical}
.sai-h3sb-message{min-height:20px;color:#fca5a5;font-size:12px}.sai-h3sb-message[data-tone="success"]{color:#fdba74}.sai-h3sb-message[data-tone="warning"]{color:#fbbf24}.sai-h3sb-message[data-tone="info"]{color:var(--body-text-color-subdued,#aab4c8)}.sai-h3sb-footer-actions{display:flex;align-items:center;gap:8px}.sai-h3sb-button{min-height:36px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 13px;border:1px solid var(--border-color-primary,#52525b);border-radius:6px;background:var(--secondary-button-background-fill,#303238);color:inherit;font-weight:800;cursor:pointer}.sai-h3sb-button.is-optimize{margin-left:auto;border-color:var(--sai-h3sb-accent);background:#2b211c;color:#fed7aa}.sai-h3sb-button.is-optimize:hover,.sai-h3sb-button.is-optimize:focus-visible{border-color:#fb923c;background:#38271e;outline:none}.sai-h3sb-button.is-optimize i{color:var(--sai-h3sb-accent)}.sai-h3sb-button.is-primary{border-color:var(--sai-h3sb-accent);background:var(--sai-h3sb-accent);color:#fff}.sai-h3sb-button.is-primary:hover,.sai-h3sb-button.is-primary:focus-visible{border-color:var(--sai-h3sb-accent-hover);background:var(--sai-h3sb-accent-hover);outline:none}.sai-h3sb-button:disabled,.sai-h3sb-icon:disabled,.sai-h3sb-add:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:760px){.sai-h3sb-backdrop{padding:6px}.sai-h3sb-modal{width:calc(100vw - 12px);max-height:calc(100vh - 12px)}.sai-h3sb-body{padding:10px}.sai-h3sb-button.is-optimize{margin-left:0}.sai-h3sb-ai-edit{grid-template-columns:1fr}.sai-h3sb-ai-target{max-width:none}.sai-h3sb-global,.sai-h3sb-global.is-reference{grid-template-columns:1fr}.sai-h3sb-footer{align-items:flex-start;flex-direction:column}.sai-h3sb-footer-actions{width:100%;justify-content:flex-end}}
.sai-h3sb-template-control select,.sai-h3sb-camera-preset{color-scheme:dark}.sai-h3sb-template-control option,.sai-h3sb-camera-preset option{color:#f4f4f5;background:#24262b}
`;
        document.head.appendChild(style);
    }

    function cameraPresetSelectHtml(shot, lang) {
        const selection = cameraPresetSelection(shot?.camera);
        const optionsHtml = [
            `<option value="">${escapeHtml(t('Custom camera movement', '\u81ea\u5b9a\u4e49\u8fd0\u955c', lang))}</option>`,
            ...CAMERA_PRESETS.map((preset) => `<option value="${escapeHtml(preset.id)}" ${selection === preset.id ? 'selected' : ''}>${escapeHtml(t(preset.label_en, preset.label_cn, lang))}</option>`)
        ].join('');
        return `<select class="sai-h3sb-camera-preset" data-h3sb-camera-preset aria-label="${escapeHtml(t('Camera quick choices', '\u8fd0\u955c\u5feb\u6377\u9009\u9879', lang))}" title="${escapeHtml(t('Choose a camera movement, then edit the text below when needed.', '\u9009\u62e9\u8fd0\u955c\u540e\u4ecd\u53ef\u7ee7\u7eed\u4fee\u6539\u4e0b\u65b9\u6587\u672c\u3002', lang))}">${optionsHtml}</select>`;
    }

    function shotRowHtml(shot, index, state, lang, options) {
        const interval = timelineIntervals(state, options)[index] || { start: 0, end: finiteNumber(options?.duration, 5), duration: 0 };
        const dialogue = dialogueTiming(shot.dialogue, interval.duration, options);
        const total = Math.max(MIN_SHOT_DURATION, finiteNumber(options?.duration, 5));
        const descriptionValue = state.mode === MODE_REF2VA ? shotDescriptionForEditor(shot.description) : shot.description;
        return `<tr data-h3sb-shot-row="${index}">
  <td class="sai-h3sb-shot-cell"><div class="sai-h3sb-shot-label"><button type="button" class="sai-h3sb-drag-handle" draggable="true" data-h3sb-row-drag aria-label="${escapeHtml(t(`Reorder shot ${index + 1}`, `\u8c03\u6574\u955c\u5934 ${index + 1} \u987a\u5e8f`, lang))}" title="${escapeHtml(t('Drag to reorder', '\u62d6\u52a8\u8c03\u6574\u987a\u5e8f', lang))}"><i class="fa-solid fa-grip-lines"></i></button><span class="sai-h3sb-shot-number"><span class="sai-h3sb-shot-kicker">${escapeHtml(t('Shot', '\u955c\u5934', lang))}</span><strong>${String(index + 1).padStart(2, '0')}</strong></span></div></td>
  <td><div class="sai-h3sb-time-fields"><div class="sai-h3sb-time-range"><input type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(formatPromptSeconds(interval.start))}" data-h3sb-shot-field="start" aria-label="${escapeHtml(t('Shot start time', '\u955c\u5934\u5f00\u59cb\u65f6\u95f4', lang))}" ${index === 0 ? 'disabled' : ''}><span class="sai-h3sb-time-separator">-</span><output data-h3sb-time-view="end">${escapeHtml(formatPromptSeconds(interval.end))}</output></div><label class="sai-h3sb-time-duration-line"><span class="sai-h3sb-time-caption">${escapeHtml(t('Duration', '\u65f6\u957f', lang))}</span><input type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(formatPromptSeconds(interval.duration))}" data-h3sb-shot-field="duration" aria-label="${escapeHtml(t('Shot duration', '\u955c\u5934\u65f6\u957f', lang))}"></label></div></td>
  <td><div class="sai-h3sb-description-cell"><textarea data-h3sb-shot-field="description" placeholder="${escapeHtml(storyboardShotDescriptionPlaceholder(lang, state.mode))}">${escapeHtml(descriptionValue)}</textarea></div></td>
  <td><div class="sai-h3sb-camera-cell">${cameraPresetSelectHtml(shot, lang)}<textarea data-h3sb-shot-field="camera" placeholder="${escapeHtml(storyboardFieldPlaceholder('camera', lang))}">${escapeHtml(shot.camera)}</textarea></div></td>
  <td><div class="sai-h3sb-dialogue-cell"><textarea data-h3sb-shot-field="dialogue" placeholder="${escapeHtml(storyboardFieldPlaceholder('dialogue', lang))}">${escapeHtml(shot.dialogue)}</textarea><div class="sai-h3sb-dialogue-meta" data-h3sb-dialogue-meta data-tone="${dialogueTimingTone(dialogue)}"><i class="fa-solid fa-comments"></i><span>${escapeHtml(dialogueTimingLabel(dialogue, lang))}</span></div></div></td>
  <td><textarea data-h3sb-shot-field="sound" placeholder="${escapeHtml(storyboardFieldPlaceholder('sound', lang))}">${escapeHtml(shot.sound)}</textarea></td>
  <td><div class="sai-h3sb-shot-actions"><button type="button" class="sai-h3sb-icon" data-h3sb-row-action="up" title="${escapeHtml(t('Move up', '\u4e0a\u79fb', lang))}" ${index === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="sai-h3sb-icon" data-h3sb-row-action="down" title="${escapeHtml(t('Move down', '\u4e0b\u79fb', lang))}" ${index === state.shots.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button><button type="button" class="sai-h3sb-icon" data-h3sb-row-action="copy" title="${escapeHtml(t('Duplicate shot', '\u590d\u5236\u955c\u5934', lang))}" ${state.shots.length >= MAX_SHOTS ? 'disabled' : ''}><i class="fa-solid fa-copy"></i></button><button type="button" class="sai-h3sb-icon" data-h3sb-row-action="split" title="${escapeHtml(t('Split shot', '\u62c6\u5206\u955c\u5934', lang))}" ${interval.duration < MIN_SHOT_DURATION * 2 || state.shots.length >= MAX_SHOTS ? 'disabled' : ''}><i class="fa-solid fa-code-branch"></i></button><button type="button" class="sai-h3sb-icon" data-h3sb-row-action="merge" title="${escapeHtml(t('Merge with next shot', '\u4e0e\u4e0b\u4e00\u4e2a\u955c\u5934\u5408\u5e76', lang))}" ${index >= state.shots.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-object-group"></i></button><button type="button" class="sai-h3sb-icon" data-h3sb-row-action="fit-dialogue" title="${escapeHtml(t('Give dialogue enough time', '\u6309\u5bf9\u767d\u5efa\u8bae\u9884\u7559\u65f6\u957f', lang))}" ${dialogue.estimated > 0 ? '' : 'disabled'}><i class="fa-solid fa-comments"></i></button><button type="button" class="sai-h3sb-icon" data-h3sb-row-action="delete" title="${escapeHtml(t('Delete shot', '\u5220\u9664\u955c\u5934', lang))}" ${state.shots.length <= 1 ? 'disabled' : ''}><i class="fa-solid fa-trash"></i></button></div></td>
 </tr>`;
    }

    function shotTemplateSelectHtml(lang) {
        const options = shotTemplateDefinitions().map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(t(template.label_en, template.label_cn, lang))}</option>`).join('');
        return `<label class="sai-h3sb-template-control" title="${escapeHtml(t('Apply a shot structure template', '\u5e94\u7528\u955c\u5934\u7ed3\u6784\u6a21\u677f', lang))}"><i class="fa-solid fa-layer-group"></i><select data-h3sb-template aria-label="${escapeHtml(t('Shot structure template', '\u955c\u5934\u7ed3\u6784\u6a21\u677f', lang))}"><option value="">${escapeHtml(t('Structure template', '\u955c\u5934\u7ed3\u6784', lang))}</option>${options}</select></label>`;
    }

    function referenceIcon(kind) {
        if (kind === 'image') return 'fa-image';
        if (kind === 'video') return 'fa-film';
        return 'fa-wave-square';
    }

    function referencePanelHtml(inventory, mode, lang, options) {
        if (mode === MODE_T2VA) return '';
        const refs = [...inventory.image_refs, ...inventory.video_refs, ...inventory.audio_refs];
        const canChoose = options?.context === 'scene_preset' || typeof options?.onRequestMedia === 'function';
        const chooseButton = canChoose
            ? `<button type="button" class="sai-h3sb-reference-add" data-h3sb-action="choose-reference" title="${escapeHtml(t('Add reference media', '\u6dfb\u52a0\u53c2\u8003\u5a92\u4f53', lang))}"><i class="fa-solid fa-plus"></i></button>`
            : '';
        const content = refs.length
            ? `<div class="sai-h3sb-reference-list">${refs.map((item) => {
                const label = t(item.label_en, item.label_cn, lang);
                const preview = item.kind === 'image' && validMediaSource(item.preview)
                    ? `<img src="${escapeHtml(item.preview)}" alt="">`
                    : `<i class="fa-solid ${referenceIcon(item.kind)}"></i>`;
                return `<button type="button" class="sai-h3sb-reference-chip" data-h3sb-reference-token="${escapeHtml(item.token)}" title="${escapeHtml(t(`Insert ${item.token} into the active field`, `\u5c06 ${item.token} \u63d2\u5165\u5f53\u524d\u8f93\u5165\u6846`, lang))}"><span class="sai-h3sb-reference-media">${preview}</span><code>${escapeHtml(item.token)}</code><small>${escapeHtml(label)}</small></button>`;
            }).join('')}</div>`
            : `<div class="sai-h3sb-reference-empty"><i class="fa-solid fa-circle-exclamation"></i><span>${escapeHtml(t('No reference media detected', '\u672a\u68c0\u6d4b\u5230\u53c2\u8003\u5a92\u4f53', lang))}</span></div>`;
        return `<section class="sai-h3sb-references"><div class="sai-h3sb-reference-head"><span class="sai-h3sb-reference-title"><i class="fa-solid fa-paperclip"></i>${escapeHtml(t('Reference media · insert into active field', '\u53c2\u8003\u5a92\u4f53 \u00b7 \u63d2\u5165\u5f53\u524d\u8f93\u5165\u6846', lang))}</span>${chooseButton}</div>${content}</section>`;
    }

    function insertReferenceToken(target, token) {
        if (!target || !target.matches?.('textarea')) return false;
        const value = String(target.value || '');
        const start = Number.isFinite(target.selectionStart) ? target.selectionStart : value.length;
        const end = Number.isFinite(target.selectionEnd) ? target.selectionEnd : start;
        const before = value.slice(0, start);
        const after = value.slice(end);
        const leftSpace = before && !/\s$/.test(before) ? ' ' : '';
        const rightSpace = after && !/^\s/.test(after) ? ' ' : '';
        const inserted = `${leftSpace}${token}${rightSpace}`;
        target.value = `${before}${inserted}${after}`;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.focus();
        const cursor = before.length + inserted.length;
        target.setSelectionRange?.(cursor, cursor);
        return true;
    }

    function requestReferenceMedia(options) {
        if (typeof options?.onRequestMedia === 'function') {
            close();
            options.onRequestMedia();
            return true;
        }
        if (options?.context !== 'scene_preset') return false;
        close();
        root.setTimeout?.(() => {
            const host = findById('scene_canvas') || findById('scene_input_image1');
            if (!host) return;
            host.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            const input = host.querySelector?.('input[type="file"]');
            if (input) input.click();
            else host.focus?.();
        }, 50);
        return true;
    }

    function close() {
        if (!activeModal) return false;
        activeModal.remove();
        activeModal = null;
        activeOptions = null;
        if (typeof document !== 'undefined') document.documentElement.classList.remove('sai-h3sb-modal-open');
        return true;
    }

    function closeScenePreset() {
        if (activeOptions?.context && activeOptions.context !== 'scene_preset') return false;
        return close();
    }

    function open(options) {
        if (typeof document === 'undefined') return null;
        const opts = options && typeof options === 'object' ? options : {};
        close();
        injectStyles();
        const lang = languageState(opts.langState);
        const editorOptions = {
            mode: normalizeMode(opts.mode, opts),
            duration: Math.max(0.3, finiteNumber(opts.duration, 5)),
            inventory: inventoryFromOptions(opts),
            langState: lang,
            context: opts.context || ''
        };
        let state = normalize(opts.storyboardState ?? opts.state ?? opts.value ?? opts.prompt ?? '', editorOptions);
        if (opts.prompt && state.prompt_snapshot !== cleanText(opts.prompt) && !parseJsonObject(opts.storyboardState)) {
            state = parsePrompt(opts.prompt, Object.assign({}, editorOptions, { optimize: state.optimize }));
        }
        state.mode = editorOptions.mode;
        const backdrop = document.createElement('div');
        backdrop.className = 'sai-h3sb-backdrop';
        const initialSnapToFrames = boolValue(opts.snapToFrames, false);
        let snapToFrames = initialSnapToFrames;
        let timelineDrag = null;
        let shotReorderDrag = null;
        const referenceFields = state.mode === MODE_REF2VA ? `<div class="sai-h3sb-global is-reference" data-h3sb-reference-fields>
  <label><span>${escapeHtml(t('Subject definitions', '\u4e3b\u4f53\u5b9a\u4e49', lang))}</span><textarea data-h3sb-global="subject_definitions" placeholder="${escapeHtml(storyboardFieldPlaceholder('subject_definitions', lang))}">${escapeHtml(state.subject_definitions)}</textarea></label>
  <label><span>${escapeHtml(t('Summary', '\u4efb\u52a1\u6458\u8981', lang))}</span><textarea data-h3sb-global="summary" placeholder="${escapeHtml(storyboardFieldPlaceholder('summary', lang))}">${escapeHtml(state.summary)}</textarea></label>
  <section class="sai-h3sb-retention-editor" data-h3sb-retention-editor><div class="sai-h3sb-retention-head"><span><i class="fa-solid fa-list-check"></i>${escapeHtml(t('Retention analysis', '\u4fdd\u7559\u5206\u6790', lang))}</span><span>${escapeHtml(t('Reference mapping', '\u53c2\u8003\u6620\u5c04', lang))}</span></div><div class="sai-h3sb-retention-rows" data-h3sb-retention-rows></div><label class="sai-h3sb-retention-output"><span>${escapeHtml(t('Prompt output', 'Prompt \u8f93\u51fa', lang))}</span><textarea data-h3sb-global="retention_analysis" readonly aria-readonly="true" placeholder="${escapeHtml(storyboardFieldPlaceholder('retention_analysis', lang))}">${escapeHtml(state.retention_analysis)}</textarea></label></section>
</div>` : '';
        const referencePanel = referencePanelHtml(editorOptions.inventory, state.mode, lang, opts);
        backdrop.innerHTML = `<section class="sai-h3sb-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('MiniMax H3 Storyboard', 'MiniMax H3 \u5206\u955c\u8868', lang))}">
  <header class="sai-h3sb-header"><div class="sai-h3sb-title"><i class="fa-solid fa-table-list"></i><span>${escapeHtml(t('MiniMax H3 Storyboard', 'MiniMax H3 \u5206\u955c\u8868', lang))}</span></div><div class="sai-h3sb-header-actions"><button type="button" class="sai-h3sb-icon" data-h3sb-action="undo" aria-label="${escapeHtml(t('Undo', '\u64a4\u9500', lang))}" title="${escapeHtml(t('Undo', '\u64a4\u9500', lang))}" disabled><i class="fa-solid fa-rotate-left"></i></button><button type="button" class="sai-h3sb-icon" data-h3sb-action="redo" aria-label="${escapeHtml(t('Redo', '\u91cd\u505a', lang))}" title="${escapeHtml(t('Redo', '\u91cd\u505a', lang))}" disabled><i class="fa-solid fa-rotate-right"></i></button><button type="button" class="sai-h3sb-close" data-h3sb-action="close" title="${escapeHtml(t('Close', '\u5173\u95ed', lang))}"><i class="fa-solid fa-xmark"></i></button></div></header>
   <div class="sai-h3sb-body">
     <div class="sai-h3sb-toolbar"><span class="sai-h3sb-badge">${escapeHtml(state.mode)}</span><span class="sai-h3sb-badge" data-h3sb-duration-summary>${escapeHtml(`${editorOptions.duration.toFixed(1)}s`)}</span><span class="sai-h3sb-badge">${H3_FPS} FPS</span><button type="button" class="sai-h3sb-add" data-h3sb-action="add" ${state.shots.length >= MAX_SHOTS ? 'disabled' : ''}><i class="fa-solid fa-plus"></i><span>${escapeHtml(t('Add shot', '\u6dfb\u52a0\u955c\u5934', lang))}</span></button>${shotTemplateSelectHtml(lang)}<button type="button" class="sai-h3sb-button" data-h3sb-action="redistribute" title="${escapeHtml(t('Distribute shots evenly across the total duration', '\u6309\u603b\u65f6\u957f\u5e73\u5747\u5206\u914d\u955c\u5934', lang))}"><i class="fa-solid fa-arrows-left-right"></i><span>${escapeHtml(t('Even timing', '\u5e73\u5747\u5206\u914d', lang))}</span></button><button type="button" class="sai-h3sb-button" data-h3sb-action="dialogue-timing" title="${escapeHtml(t('Allocate timing from estimated dialogue length', '\u6309\u9884\u8ba1\u5bf9\u767d\u957f\u5ea6\u5206\u914d\u955c\u5934', lang))}"><i class="fa-solid fa-comments"></i><span>${escapeHtml(t('Dialogue timing', '\u6309\u5bf9\u767d\u5206\u914d', lang))}</span></button><button type="button" class="sai-h3sb-button" data-h3sb-action="toggle-snap" title="${escapeHtml(t('Snap time boundaries to 24 FPS frames', '\u6309 24 FPS \u5e27\u5bf9\u9f50\u65f6\u95f4\u8fb9\u754c', lang))}"><i class="fa-solid fa-magnet"></i><span data-h3sb-snap-label>${escapeHtml(t(initialSnapToFrames ? 'Frame snap on' : 'Frame snap off', initialSnapToFrames ? '\u6309\u5e27\u5bf9\u9f50\u5df2\u5f00\u542f' : '\u6309\u5e27\u5bf9\u9f50\u5df2\u5173\u95ed', lang))}</span></button><button type="button" class="sai-h3sb-button is-optimize" data-h3sb-action="optimize"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(t('Optimize with LLM', 'LLM \u4f18\u5316', lang))}</span></button></div>
    <section class="sai-h3sb-timeline" data-h3sb-timeline><div class="sai-h3sb-timeline-head"><span>${escapeHtml(t('Timeline / shot duration', '\u65f6\u95f4\u8f74 / \u955c\u5934\u65f6\u957f', lang))}</span><span data-h3sb-timeline-summary>${escapeHtml(t(`H3 range: ${H3_MIN_DURATION}-${H3_MAX_DURATION}s`, `H3 \u65f6\u957f\uff1a${H3_MIN_DURATION}-${H3_MAX_DURATION} \u79d2`, lang))}</span></div><div class="sai-h3sb-timeline-track" data-h3sb-timeline-track></div><div class="sai-h3sb-timeline-ruler"><span data-h3sb-timeline-start>0s</span><span data-h3sb-timeline-end>${escapeHtml(`${editorOptions.duration.toFixed(1)}s`)}</span></div></section>
    <div class="sai-h3sb-ai-edit"><span class="sai-h3sb-ai-target" data-h3sb-ai-target></span><input type="text" data-h3sb-ai-instruction placeholder="${escapeHtml(t('Revision for the selected field', '\u8f93\u5165\u5f53\u524d\u683c\u7684\u4fee\u6539\u8981\u6c42', lang))}"><button type="button" class="sai-h3sb-button is-cell-optimize" data-h3sb-action="optimize-cell"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(t('Edit selected field', '\u4fee\u6539\u5f53\u524d\u683c', lang))}</span></button></div>
    ${referencePanel}
    <div class="sai-h3sb-table-wrap"><table class="sai-h3sb-table"><colgroup><col style="width:88px"><col style="width:142px"><col style="width:200px"><col style="width:160px"><col style="width:180px"><col style="width:180px"><col style="width:130px"></colgroup><thead><tr><th>${escapeHtml(t('Shot', '\u955c\u5934', lang))}</th><th>${escapeHtml(t('Timing', '\u65f6\u95f4', lang))}</th><th>${escapeHtml(t('Scene / action', '\u753b\u9762 / \u52a8\u4f5c', lang))}</th><th>${escapeHtml(t('Camera', '\u8fd0\u955c', lang))}</th><th>${escapeHtml(t('Dialogue / text', '\u5bf9\u767d / \u753b\u9762\u6587\u5b57', lang))}</th><th>${escapeHtml(t('Sound', '\u58f0\u97f3', lang))}</th><th>${escapeHtml(t('Actions', '\u64cd\u4f5c', lang))}</th></tr></thead><tbody data-h3sb-rows></tbody></table></div>
    ${referenceFields}
    <div class="sai-h3sb-global"><label><span>${escapeHtml(t('Overall soundscape', '\u6574\u4f53\u73af\u5883\u58f0', lang))}</span><textarea data-h3sb-global="overall_soundscape" placeholder="${escapeHtml(storyboardFieldPlaceholder('overall_soundscape', lang))}">${escapeHtml(state.overall_soundscape)}</textarea></label><label><span>${escapeHtml(t('Non-diegetic music', '\u975e\u53d9\u4e8b\u97f3\u4e50', lang))}</span><textarea data-h3sb-global="non_diegetic_music" placeholder="${escapeHtml(storyboardFieldPlaceholder('non_diegetic_music', lang))}">${escapeHtml(state.non_diegetic_music)}</textarea></label></div>
  </div>
  <footer class="sai-h3sb-footer"><span class="sai-h3sb-message" data-h3sb-message data-tone="info" aria-live="polite"></span><div class="sai-h3sb-footer-actions"><button type="button" class="sai-h3sb-button" data-h3sb-action="reset" title="${escapeHtml(t('Reset storyboard', '\u91cd\u7f6e\u5206\u955c\u8868', lang))}"><i class="fa-solid fa-arrow-rotate-left"></i></button><button type="button" class="sai-h3sb-button" data-h3sb-action="cancel">${escapeHtml(t('Cancel', '\u53d6\u6d88', lang))}</button><button type="button" class="sai-h3sb-button is-primary" data-h3sb-action="apply"><i class="fa-solid fa-check"></i><span>${escapeHtml(t('Apply to Prompt', '\u5199\u5165 Prompt', lang))}</span></button></div></footer>
        </section>`;
        let activeTextTarget = null;
        let aiTarget = { scope: 'shot', index: 0, field: 'description' };
        let activeShotIndex = 0;

        const aiTargetControl = () => {
            if (aiTarget?.scope === 'shot') {
                return backdrop.querySelector(`[data-h3sb-shot-row="${aiTarget.index}"] [data-h3sb-shot-field="${aiTarget.field}"]`);
            }
            if (aiTarget?.scope === 'global') {
                return backdrop.querySelector(`[data-h3sb-global="${aiTarget.key}"]`);
            }
            return null;
        };
        const renderAiTarget = () => {
            backdrop.querySelectorAll('textarea.is-ai-target').forEach((control) => control.classList.remove('is-ai-target'));
            const control = aiTargetControl();
            if (control) control.classList.add('is-ai-target');
            const label = backdrop.querySelector('[data-h3sb-ai-target]');
            if (label) label.textContent = storyboardTargetLabel(aiTarget, lang);
        };
        const setAiTargetFromControl = (control) => {
            const row = control?.closest?.('[data-h3sb-shot-row]');
            const field = control?.getAttribute?.('data-h3sb-shot-field');
            const globalKey = control?.getAttribute?.('data-h3sb-global');
            if (row && field && !['start', 'end', 'duration'].includes(field)) {
                aiTarget = { scope: 'shot', index: Number(row.getAttribute('data-h3sb-shot-row')), field };
            } else if (globalKey) {
                aiTarget = { scope: 'global', key: globalKey };
            } else {
                return;
            }
            renderAiTarget();
        };
        const history = createHistory();
        let pendingTextEdit = null;
        let pendingRetentionEdit = null;
        const stateSnapshot = () => serialize(state, editorOptions);
        const updateHistoryControls = () => {
            const undo = backdrop.querySelector('[data-h3sb-action="undo"]');
            const redo = backdrop.querySelector('[data-h3sb-action="redo"]');
            if (undo) undo.disabled = !history.canUndo();
            if (redo) redo.disabled = !history.canRedo();
        };
        const recordStateChange = (before) => {
            const changed = history.record(before, stateSnapshot());
            updateHistoryControls();
            return changed;
        };
        const isStoryboardTextControl = (control) => control?.matches?.('textarea[data-h3sb-shot-field],textarea[data-h3sb-global]');
        const beginTextEdit = (target) => {
            if (!isStoryboardTextControl(target)) return;
            if (pendingTextEdit?.target === target) return;
            if (pendingTextEdit) {
                const previous = pendingTextEdit;
                pendingTextEdit = null;
                recordStateChange(previous.before);
            }
            pendingTextEdit = { target, before: stateSnapshot() };
        };
        const commitTextEdit = (target) => {
            if (!pendingTextEdit || (target && pendingTextEdit.target !== target)) return false;
            const previous = pendingTextEdit;
            pendingTextEdit = null;
            return recordStateChange(previous.before);
        };
        const beginRetentionEdit = (target) => {
            if (!target?.matches?.('[data-h3sb-retention-custom]')) return;
            if (pendingRetentionEdit?.target === target) return;
            if (pendingRetentionEdit) {
                const previous = pendingRetentionEdit;
                pendingRetentionEdit = null;
                recordStateChange(previous.before);
            }
            pendingRetentionEdit = { target, before: stateSnapshot() };
        };
        const commitRetentionEdit = (target) => {
            if (!pendingRetentionEdit || (target && pendingRetentionEdit.target !== target)) return false;
            const previous = pendingRetentionEdit;
            pendingRetentionEdit = null;
            return recordStateChange(previous.before);
        };
        const commitPendingTextEdit = () => {
            const textChanged = commitTextEdit();
            const retentionChanged = commitRetentionEdit();
            return textChanged || retentionChanged;
        };
        const restoreState = (snapshot) => {
            state = normalize(snapshot, editorOptions);
            state.mode = editorOptions.mode;
        };
        const undoState = () => {
            commitPendingTextEdit();
            const snapshot = history.takeUndo(stateSnapshot());
            if (snapshot === null) return false;
            pendingTextEdit = null;
            restoreState(snapshot);
            renderState();
            setMessage(t('Undid the last storyboard edit.', '\u5df2\u64a4\u9500\u4e0a\u4e00\u6b21\u5206\u955c\u7f16\u8f91\u3002', lang), 'info');
            return true;
        };
        const redoState = () => {
            commitPendingTextEdit();
            const snapshot = history.takeRedo(stateSnapshot());
            if (snapshot === null) return false;
            pendingTextEdit = null;
            restoreState(snapshot);
            renderState();
            setMessage(t('Redid the last storyboard edit.', '\u5df2\u91cd\u505a\u4e0a\u4e00\u6b21\u5206\u955c\u7f16\u8f91\u3002', lang), 'info');
            return true;
        };

        const renderActiveShot = () => {
            if (state.shots.length) activeShotIndex = Math.min(Math.max(0, activeShotIndex), state.shots.length - 1);
            backdrop.querySelectorAll('[data-h3sb-shot-row]').forEach((row) => {
                const index = Number(row.getAttribute('data-h3sb-shot-row'));
                const active = index === activeShotIndex;
                row.classList.toggle('is-active-shot', active);
                row.setAttribute('aria-current', active ? 'true' : 'false');
            });
            backdrop.querySelectorAll('[data-h3sb-timeline-segment]').forEach((segment) => {
                const index = Number(segment.getAttribute('data-h3sb-timeline-shot'));
                segment.classList.toggle('is-active', index === activeShotIndex);
            });
        };
        const setActiveShot = (index) => {
            if (!Number.isInteger(index) || index < 0 || index >= state.shots.length) return false;
            activeShotIndex = index;
            renderActiveShot();
            return true;
        };

        const renderTimeViews = () => {
            const intervals = timelineIntervals(state, editorOptions);
            backdrop.querySelectorAll('[data-h3sb-shot-row]').forEach((row, index) => {
                const interval = intervals[index];
                if (!interval) return;
                const start = row.querySelector('[data-h3sb-shot-field="start"]');
                const duration = row.querySelector('[data-h3sb-shot-field="duration"]');
                const end = row.querySelector('[data-h3sb-time-view="end"]');
                if (start && document.activeElement !== start) start.value = formatPromptSeconds(interval.start);
                if (duration && document.activeElement !== duration) duration.value = formatPromptSeconds(interval.duration);
                if (end) end.textContent = formatPromptSeconds(interval.end);
            });
        };
        const renderDialogueViews = () => {
            const intervals = timelineIntervals(state, editorOptions);
            backdrop.querySelectorAll('[data-h3sb-shot-row]').forEach((row, index) => {
                const shot = state.shots[index];
                if (!shot) return;
                const timing = dialogueTiming(shot.dialogue, intervals[index]?.duration, editorOptions);
                const meta = row.querySelector('[data-h3sb-dialogue-meta]');
                if (meta) {
                    meta.dataset.tone = dialogueTimingTone(timing);
                    const label = meta.querySelector('span');
                    if (label) label.textContent = dialogueTimingLabel(timing, lang);
                }
                const fitButton = row.querySelector('[data-h3sb-row-action="fit-dialogue"]');
                if (fitButton) fitButton.disabled = timing.estimated <= 0;
            });
        };
        const renderTimeline = () => {
            const timeline = backdrop.querySelector('[data-h3sb-timeline]');
            const track = timeline?.querySelector('[data-h3sb-timeline-track]');
            if (!timeline || !track) return;
            const intervals = timelineIntervals(state, editorOptions);
            const total = Math.max(MIN_SHOT_DURATION, finiteNumber(editorOptions.duration, 5));
            const fieldDescriptors = [
                { key: 'description', icon: 'fa-image', en: 'Scene / action', cn: '画面 / 动作' },
                { key: 'camera', icon: 'fa-camera', en: 'Camera', cn: '运镜' },
                { key: 'dialogue', icon: 'fa-comments', en: 'Dialogue / text', cn: '对白 / 文字' },
                { key: 'sound', icon: 'fa-wave-square', en: 'Synchronized sound', cn: '同步声音' }
            ];
            const segmentButtonHtml = (shot, index, interval) => {
                const status = timelineShotStatus(shot, state.mode);
                const binding = timelineBindingInfo(shot, index, state, editorOptions, lang);
                const pictureRefs = timelinePictureReferences(shot, index, state, editorOptions);
                const pictureLabel = pictureRefs.map((item) => item.token).join(', ');
                const pictureThumbnails = pictureRefs.length
                    ? `<span class="sai-h3sb-timeline-thumbnails" data-h3sb-timeline-picture-count="${pictureRefs.length}" aria-label="${escapeHtml(pictureLabel)}" title="${escapeHtml(pictureLabel)}">${pictureRefs.map((item) => {
                        const preview = validMediaSource(item.preview)
                            ? `<img src="${escapeHtml(item.preview)}" alt="" loading="lazy">`
                            : '<i class="fa-solid fa-image" aria-hidden="true"></i>';
                        return `<span class="sai-h3sb-timeline-thumbnail" data-h3sb-timeline-picture="${item.index}" title="${escapeHtml(item.token)}">${preview}</span>`;
                    }).join('')}</span>`
                    : '';
                const statusLabel = status.state === 'ready'
                    ? t('Scene ready', '画面已填', lang)
                    : (status.state === 'needs-description'
                        ? t('Needs scene / action', '待填画面 / 动作', lang)
                        : t('Empty shot', '空镜头', lang));
                const timeLabel = `${formatPromptSeconds(interval.start)}-${formatPromptSeconds(interval.end)}s`;
                const fieldIcons = fieldDescriptors.map((field) => {
                    const filled = Boolean(status.fields[field.key]);
                    const label = t(field.en, field.cn, lang);
                    return `<i class="fa-solid ${field.icon}${filled ? ' is-filled' : ''}" title="${escapeHtml(`${label}: ${filled ? t('filled', '已填写', lang) : t('empty', '未填写', lang)}`)}" aria-hidden="true"></i>`;
                }).join('');
                const accessibleLabel = [
                    t(`Shot ${index + 1}`, `镜头 ${index + 1}`, lang),
                    timeLabel,
                    binding.full || pictureLabel,
                    `${status.filled_count}/${status.total_count}`,
                    statusLabel
                ].filter(Boolean).join(' · ');
                return `<button type="button" aria-label="${escapeHtml(accessibleLabel)}" title="${escapeHtml(accessibleLabel)}"><span class="sai-h3sb-timeline-shot-line"><span class="sai-h3sb-timeline-shot-name">${escapeHtml(t(`Shot ${index + 1}`, `镜头 ${index + 1}`, lang))}</span><span class="sai-h3sb-timeline-shot-meta">${escapeHtml(timeLabel)}</span></span><span class="sai-h3sb-timeline-shot-line">${pictureThumbnails}<span class="sai-h3sb-timeline-binding">${escapeHtml(binding.short || t('No binding', '不绑定', lang))}</span><span class="sai-h3sb-timeline-shot-meta">${escapeHtml(`${status.filled_count}/${status.total_count} · ${statusLabel}`)}</span></span><span class="sai-h3sb-timeline-fields" aria-hidden="true">${fieldIcons}</span></button>`;
            };
            const segmentCount = track.querySelectorAll('[data-h3sb-timeline-segment]').length;
            const boundaryCount = track.querySelectorAll('[data-h3sb-timeline-boundary]').length;
            if (segmentCount !== intervals.length || boundaryCount !== Math.max(0, intervals.length - 1)) {
                track.innerHTML = intervals.map(((_interval, index) => `<div class="sai-h3sb-timeline-segment" data-h3sb-timeline-segment data-h3sb-timeline-shot="${index}"><button type="button"></button></div>`)).join('') + intervals.slice(1).map((_interval, index) => `<button type="button" class="sai-h3sb-timeline-boundary" data-h3sb-timeline-boundary data-h3sb-timeline-boundary-index="${index + 1}" title="${escapeHtml(t(`Drag boundary before shot ${index + 2}`, `\u62d6\u52a8\u955c\u5934 ${index + 2} \u4e4b\u524d\u7684\u65f6\u95f4\u8fb9\u754c`, lang))}"></button>`).join('');
            }
            track.querySelectorAll('[data-h3sb-timeline-segment]').forEach((segment, index) => {
                const interval = intervals[index];
                const shot = state.shots[index];
                if (!interval || !shot) return;
                segment.style.setProperty('--sai-h3sb-left', `${(interval.start / total) * 100}%`);
                segment.style.setProperty('--sai-h3sb-width', `${Math.max(0.4, (interval.duration / total) * 100)}%`);
                const status = timelineShotStatus(shot, state.mode);
                segment.dataset.h3sbShotState = status.state;
                const button = segment.querySelector('button');
                if (button) button.outerHTML = segmentButtonHtml(shot, index, interval);
            });
            track.querySelectorAll('[data-h3sb-timeline-boundary]').forEach((boundary) => {
                const index = Number(boundary.getAttribute('data-h3sb-timeline-boundary-index'));
                const interval = intervals[index];
                if (interval) boundary.style.setProperty('--sai-h3sb-left', `${(interval.start / total) * 100}%`);
            });
            const summary = timeline.querySelector('[data-h3sb-timeline-summary]');
            const durationSummary = backdrop.querySelector('[data-h3sb-duration-summary]');
            const durationText = `${editorOptions.duration.toFixed(1)}s`;
            const readyCount = state.shots.filter((shot) => timelineShotStatus(shot, state.mode).state === 'ready').length;
            if (summary) {
                const durationCheck = validateDuration(editorOptions);
                summary.textContent = durationCheck.ok
                    ? t(`${durationText} total · ${readyCount}/${state.shots.length} scenes ready · drag boundaries`, `${durationText} 总时长 · ${readyCount}/${state.shots.length} 个镜头已有画面 · 可拖动边界`, lang)
                    : t(`${durationText} total · ${readyCount}/${state.shots.length} scenes ready · H3 allows ${H3_MIN_DURATION}-${H3_MAX_DURATION}s`, `${durationText} 总时长 · ${readyCount}/${state.shots.length} 个镜头已有画面 · H3 支持 ${H3_MIN_DURATION}-${H3_MAX_DURATION} 秒`, lang);
            }
            if (durationSummary) durationSummary.textContent = durationText;
            const startLabel = timeline.querySelector('[data-h3sb-timeline-start]');
            const endLabel = timeline.querySelector('[data-h3sb-timeline-end]');
            if (startLabel) startLabel.textContent = '0s';
            if (endLabel) endLabel.textContent = durationText;
            const snapLabel = backdrop.querySelector('[data-h3sb-snap-label]');
            if (snapLabel) snapLabel.textContent = t(snapToFrames ? 'Frame snap on' : 'Frame snap off', snapToFrames ? '\u6309\u5e27\u5bf9\u9f50\u5df2\u5f00\u542f' : '\u6309\u5e27\u5bf9\u9f50\u5df2\u5173\u95ed', lang);
            renderActiveShot();
        };
        const renderRows = () => {
            const rows = backdrop.querySelector('[data-h3sb-rows]');
            if (rows) rows.innerHTML = state.shots.map((shot, index) => shotRowHtml(shot, index, state, lang, editorOptions)).join('');
            const add = backdrop.querySelector('[data-h3sb-action="add"]');
            if (add) add.disabled = state.shots.length >= MAX_SHOTS;
        };
        const syncRetentionRow = (row) => {
            if (!row) return;
            const content = row.querySelector('[data-h3sb-retention-content]')?.value || '';
            const custom = row.querySelector('[data-h3sb-retention-custom]');
            if (!custom) return;
            const visible = content === 'custom';
            custom.hidden = !visible;
            custom.disabled = !visible;
        };
        const renderRetentionEditor = () => {
            const editor = backdrop.querySelector('[data-h3sb-retention-editor]');
            const rows = editor?.querySelector('[data-h3sb-retention-rows]');
            if (!editor || !rows) return;
            rows.innerHTML = retentionEditorRowsHtml(state.retention_analysis, editorOptions.inventory, lang);
            editor.querySelectorAll('[data-h3sb-retention-row]').forEach(syncRetentionRow);
            const output = editor.querySelector('[data-h3sb-global="retention_analysis"]');
            if (output && output.value !== state.retention_analysis) output.value = state.retention_analysis;
        };
        const syncRetentionEditor = () => {
            const editor = backdrop.querySelector('[data-h3sb-retention-editor]');
            if (!editor) return '';
            editor.querySelectorAll('[data-h3sb-retention-row]').forEach(syncRetentionRow);
            const value = retentionAnalysisFromControls(editor, editorOptions.inventory, lang);
            state.retention_analysis = value;
            const output = editor.querySelector('[data-h3sb-global="retention_analysis"]');
            if (output && output.value !== value) output.value = value;
            return value;
        };
        const renderState = () => {
            renderRows();
            renderRetentionEditor();
            renderTimeViews();
            renderDialogueViews();
            renderTimeline();
            backdrop.querySelectorAll('[data-h3sb-global]').forEach((control) => {
                const key = control.getAttribute('data-h3sb-global');
                const value = String(state[key] ?? '');
                if (control.value !== value) control.value = value;
            });
            activeTextTarget = aiTargetControl();
            renderAiTarget();
            updateHistoryControls();
        };
        const setMessage = (message, tone) => {
            const output = backdrop.querySelector('[data-h3sb-message]');
            if (!output) return;
            output.textContent = String(message || '');
            output.dataset.tone = tone || 'error';
        };
        const setBusy = (busy) => {
            backdrop.querySelectorAll('button,input,textarea').forEach((control) => {
                if (control.matches('[data-h3sb-action="close"],[data-h3sb-action="cancel"]')) return;
                if (busy) {
                    control.dataset.h3sbDisabledBeforeBusy = control.disabled ? '1' : '0';
                    control.disabled = true;
                } else {
                    if (!Object.prototype.hasOwnProperty.call(control.dataset, 'h3sbDisabledBeforeBusy')) return;
                    control.disabled = control.dataset.h3sbDisabledBeforeBusy === '1';
                    delete control.dataset.h3sbDisabledBeforeBusy;
                }
            });
        };

        const clearShotReorderDrag = () => {
            backdrop.querySelectorAll('[data-h3sb-shot-row]').forEach((row) => {
                row.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after');
            });
            shotReorderDrag = null;
        };

        const commitTimeInput = (target) => {
            const row = target?.closest?.('[data-h3sb-shot-row]');
            const field = target?.getAttribute?.('data-h3sb-shot-field');
            if (!row || !['start', 'duration'].includes(field)) return false;
            const index = Number(row.getAttribute('data-h3sb-shot-row'));
            if (!state.shots[index]) return false;
            const before = stateSnapshot();
            const result = field === 'start'
                ? applyShotStart(state, index, target.value, editorOptions.duration, snapToFrames)
                : applyShotDuration(state, index, target.value, editorOptions.duration, snapToFrames);
            recordStateChange(before);
            renderTimeViews();
            renderDialogueViews();
            renderTimeline();
            if (result.clamped) {
                setMessage(
                    t('Timing was adjusted to keep the storyboard inside the total duration.', '\u65f6\u95f4\u5df2\u81ea\u52a8\u8c03\u6574\uff0c\u4ee5\u4fdd\u6301\u5206\u955c\u4e0d\u8d85\u51fa\u603b\u65f6\u957f\u3002', lang),
                    'warning'
                );
            }
            return true;
        };

        backdrop.addEventListener('input', (event) => {
            const target = event.target;
            if (target.matches?.('[data-h3sb-retention-custom]')) {
                beginRetentionEdit(target);
                syncRetentionEditor();
                return;
            }
            const globalKey = target.getAttribute?.('data-h3sb-global');
            if (globalKey) {
                beginTextEdit(target);
                state[globalKey] = target.value;
                return;
            }
            const row = target.closest?.('[data-h3sb-shot-row]');
            const field = target.getAttribute?.('data-h3sb-shot-field');
            if (!row || !field) return;
            const index = Number(row.getAttribute('data-h3sb-shot-row'));
            if (!state.shots[index]) return;
            if (field === 'start' || field === 'duration') return;
            beginTextEdit(target);
            state.shots[index][field] = field === 'description' && state.mode === MODE_REF2VA
                ? mergeShotDescription(state.shots[index].description, target.value)
                : target.value;
            if (field === 'camera') {
                const preset = row.querySelector('[data-h3sb-camera-preset]');
                if (preset) preset.value = '';
            }
            if (field === 'dialogue') renderDialogueViews();
            renderTimeline();
        });
        backdrop.addEventListener('change', (event) => {
            const target = event.target;
            if (target.matches?.('[data-h3sb-retention-level],[data-h3sb-retention-content]')) {
                commitPendingTextEdit();
                const before = stateSnapshot();
                syncRetentionEditor();
                recordStateChange(before);
                return;
            }
            if (target.matches?.('[data-h3sb-retention-custom]')) {
                const hadPending = !!pendingRetentionEdit;
                const before = stateSnapshot();
                syncRetentionEditor();
                if (hadPending) commitRetentionEdit(target);
                else recordStateChange(before);
                return;
            }
            if (target?.matches?.('[data-h3sb-camera-preset]')) {
                const row = target.closest('[data-h3sb-shot-row]');
                const index = Number(row?.getAttribute('data-h3sb-shot-row'));
                if (!row || !Number.isInteger(index) || !state.shots[index]) return;
                setActiveShot(index);
                commitPendingTextEdit();
                const value = cameraPresetText(target.value, lang);
                if (!value) return;
                const before = stateSnapshot();
                state.shots[index].camera = value;
                const field = row.querySelector('[data-h3sb-shot-field="camera"]');
                if (field) field.value = value;
                recordStateChange(before);
                renderTimeline();
                renderAiTarget();
                return;
            }
            if (target?.matches?.('[data-h3sb-template]')) {
                const templateId = target.value;
                target.value = '';
                if (!templateId) return;
                commitPendingTextEdit();
                const before = stateSnapshot();
                const result = applyShotTemplateIntoState(state, templateId, editorOptions);
                state = result.state;
                recordStateChange(before);
                renderState();
                setMessage(
                    t('Shot structure template applied.', '\u5df2\u5e94\u7528\u955c\u5934\u7ed3\u6784\u6a21\u677f\u3002', lang),
                    'success'
                );
            } else if (target?.matches?.('[data-h3sb-shot-field="start"],[data-h3sb-shot-field="duration"]')) {
                commitTimeInput(target);
            } else if (isStoryboardTextControl(target)) {
                commitTextEdit(target);
            }
        });
        backdrop.addEventListener('focusout', (event) => {
            if (event.target?.matches?.('[data-h3sb-retention-custom]')) {
                syncRetentionEditor();
                commitRetentionEdit(event.target);
                return;
            }
            if (isStoryboardTextControl(event.target)) commitTextEdit(event.target);
        });
        backdrop.addEventListener('dragstart', (event) => {
            const handle = event.target.closest?.('[data-h3sb-row-drag]');
            const row = handle?.closest?.('[data-h3sb-shot-row]');
            const index = Number(row?.getAttribute('data-h3sb-shot-row'));
            if (!handle || !row || !Number.isInteger(index)) return;
            commitPendingTextEdit();
            shotReorderDrag = { from: index, row };
            event.dataTransfer?.setData('text/plain', String(index));
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.dropEffect = 'move';
            }
            row.classList.add('is-dragging');
        });
        backdrop.addEventListener('dragover', (event) => {
            if (!shotReorderDrag) return;
            const row = event.target.closest?.('[data-h3sb-shot-row]');
            if (!row) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            const targetIndex = Number(row.getAttribute('data-h3sb-shot-row'));
            const rect = row.getBoundingClientRect();
            const before = event.clientY < rect.top + rect.height / 2;
            backdrop.querySelectorAll('[data-h3sb-shot-row]').forEach((item) => item.classList.remove('is-drop-before', 'is-drop-after'));
            if (targetIndex !== shotReorderDrag.from) row.classList.add(before ? 'is-drop-before' : 'is-drop-after');
        });
        backdrop.addEventListener('drop', (event) => {
            if (!shotReorderDrag) return;
            const row = event.target.closest?.('[data-h3sb-shot-row]');
            if (!row) {
                clearShotReorderDrag();
                return;
            }
            event.preventDefault();
            const drag = shotReorderDrag;
            const targetIndex = Number(row.getAttribute('data-h3sb-shot-row'));
            const rect = row.getBoundingClientRect();
            const before = event.clientY < rect.top + rect.height / 2;
            clearShotReorderDrag();
            if (!Number.isInteger(targetIndex) || drag.from === targetIndex) return;
            let destination = before ? targetIndex : targetIndex + 1;
            if (drag.from < destination) destination -= 1;
            const beforeState = stateSnapshot();
            const result = moveShotIntoState(state, drag.from, destination);
            if (!result.moved) return;
            recordStateChange(beforeState);
            renderState();
            setMessage(t('Shot order updated.', '\u5df2\u66f4\u65b0\u955c\u5934\u987a\u5e8f\u3002', lang), 'success');
        });
        backdrop.addEventListener('dragend', () => {
            if (shotReorderDrag) clearShotReorderDrag();
        });
        backdrop.addEventListener('pointerdown', (event) => {
            const boundary = event.target.closest?.('[data-h3sb-timeline-boundary]');
            if (!boundary) return;
            const track = boundary.closest('[data-h3sb-timeline-track]');
            const index = Number(boundary.getAttribute('data-h3sb-timeline-boundary-index'));
            if (!track || !Number.isInteger(index)) return;
            event.preventDefault();
            setActiveShot(index);
            commitPendingTextEdit();
            timelineDrag = { index, pointerId: event.pointerId, track, before: stateSnapshot() };
            boundary.setPointerCapture?.(event.pointerId);
        });
        backdrop.addEventListener('pointermove', (event) => {
            if (!timelineDrag || timelineDrag.pointerId !== event.pointerId) return;
            const rect = timelineDrag.track.getBoundingClientRect();
            if (!rect.width) return;
            const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            applyShotStart(state, timelineDrag.index, ratio * editorOptions.duration, editorOptions.duration, snapToFrames);
            renderTimeViews();
            renderDialogueViews();
            renderTimeline();
        });
        backdrop.addEventListener('pointerup', (event) => {
            if (timelineDrag?.pointerId === event.pointerId) {
                const drag = timelineDrag;
                timelineDrag = null;
                recordStateChange(drag.before);
            }
        });
        backdrop.addEventListener('pointercancel', (event) => {
            if (timelineDrag?.pointerId === event.pointerId) {
                const drag = timelineDrag;
                timelineDrag = null;
                recordStateChange(drag.before);
            }
        });
        backdrop.addEventListener('focusin', (event) => {
            if (event.target?.matches?.('[data-h3sb-retention-custom]')) {
                beginRetentionEdit(event.target);
                return;
            }
            const row = event.target.closest?.('[data-h3sb-shot-row]');
            if (row) setActiveShot(Number(row.getAttribute('data-h3sb-shot-row')));
            if (event.target?.matches?.('textarea')) {
                commitPendingTextEdit();
                beginTextEdit(event.target);
                activeTextTarget = event.target;
                setAiTargetFromControl(event.target);
            }
        });
        backdrop.addEventListener('click', async (event) => {
            if (event.target === backdrop) return;
            const referenceToken = event.target.closest?.('[data-h3sb-reference-token]')?.getAttribute?.('data-h3sb-reference-token');
            if (referenceToken) {
                const target = activeTextTarget?.isConnected
                    ? activeTextTarget
                    : backdrop.querySelector('[data-h3sb-shot-field="description"]');
                insertReferenceToken(target, referenceToken);
                return;
            }
            const timelineShot = event.target.closest?.('[data-h3sb-timeline-shot]');
            if (timelineShot) {
                const index = Number(timelineShot.getAttribute('data-h3sb-timeline-shot'));
                setActiveShot(index);
                const target = backdrop.querySelector(`[data-h3sb-shot-row="${index}"] [data-h3sb-shot-field="description"]`);
                if (target) {
                    activeTextTarget = target;
                    setAiTargetFromControl(target);
                    target.focus();
                    target.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                }
                return;
            }
            const rowAction = event.target.closest?.('[data-h3sb-row-action]');
            if (rowAction) {
                const row = rowAction.closest('[data-h3sb-shot-row]');
                const index = Number(row?.getAttribute('data-h3sb-shot-row'));
                setActiveShot(index);
                const action = rowAction.getAttribute('data-h3sb-row-action');
                commitPendingTextEdit();
                const starts = state.shots.map((shot) => shot.start);
                if (action === 'copy' || action === 'split') {
                    const before = stateSnapshot();
                    const result = action === 'copy'
                        ? duplicateShotIntoState(state, index, editorOptions.duration, snapToFrames)
                        : splitShotIntoState(state, index, editorOptions.duration, snapToFrames);
                    if (!result.inserted) {
                        setMessage(
                            t('There is not enough room for another shot here.', '\u5f53\u524d\u955c\u5934\u65f6\u95f4\u4e0d\u8db3\u4ee5\u65b0\u589e\u955c\u5934\u3002', lang),
                            'warning'
                        );
                    } else {
                        recordStateChange(before);
                        renderState();
                        setMessage(
                            action === 'copy'
                                ? t('The shot was duplicated and its interval was divided.', '\u5df2\u590d\u5236\u955c\u5934\uff0c\u5e76\u5e73\u5206\u539f\u955c\u5934\u65f6\u95f4\u533a\u95f4\u3002', lang)
                                : t('The shot was split; fill in the new second half.', '\u5df2\u62c6\u5206\u955c\u5934\uff0c\u8bf7\u586b\u5199\u65b0\u589e\u7684\u540e\u534a\u955c\u5934\u3002', lang),
                            'success'
                        );
                    }
                    return;
                }
                if (action === 'merge') {
                    const before = stateSnapshot();
                    const result = mergeShotIntoState(state, index);
                    if (result.merged) {
                        recordStateChange(before);
                        renderState();
                        setMessage(t('The shot was merged with the next shot.', '\u5df2\u4e0e\u4e0b\u4e00\u4e2a\u955c\u5934\u5408\u5e76\u3002', lang), 'success');
                    }
                    return;
                }
                if (action === 'fit-dialogue') {
                    const before = stateSnapshot();
                    const interval = timelineIntervals(state, editorOptions)[index];
                    const timing = dialogueTiming(state.shots[index]?.dialogue, interval?.duration, editorOptions);
                    if (timing.estimated > 0) {
                        const result = applyShotDuration(
                            state,
                            index,
                            Math.max(interval?.duration || 0, timing.recommended),
                            editorOptions.duration,
                            snapToFrames
                        );
                        recordStateChange(before);
                        renderTimeViews();
                        renderDialogueViews();
                        renderTimeline();
                        setMessage(
                            result.clamped
                                ? t('The available timeline could not provide the full dialogue reserve.', '\u5f53\u524d\u65f6\u95f4\u8f74\u65e0\u6cd5\u5b8c\u5168\u9884\u7559\u5bf9\u767d\u5efa\u8bae\u65f6\u957f\u3002', lang)
                                : t('This shot now has the suggested dialogue reserve.', '\u5df2\u6309\u5bf9\u767d\u5efa\u8bae\u9884\u7559\u65f6\u957f\u3002', lang),
                            result.clamped ? 'warning' : 'success'
                        );
                    }
                    return;
                }
                const before = stateSnapshot();
                if (action === 'delete' && state.shots.length > 1) state.shots.splice(index, 1);
                if (action === 'up' && index > 0) [state.shots[index - 1], state.shots[index]] = [state.shots[index], state.shots[index - 1]];
                if (action === 'down' && index >= 0 && index < state.shots.length - 1) [state.shots[index], state.shots[index + 1]] = [state.shots[index + 1], state.shots[index]];
                if (action === 'up' || action === 'down') state.shots.forEach((shot, rowIndex) => { shot.start = starts[rowIndex]; });
                state.shots[0].start = 0;
                recordStateChange(before);
                renderState();
                return;
            }
            const action = event.target.closest?.('[data-h3sb-action]')?.getAttribute('data-h3sb-action');
            if (!action) return;
            if (action === 'close' || action === 'cancel') {
                close();
                return;
            }
            if (action === 'undo') {
                undoState();
                return;
            }
            if (action === 'redo') {
                redoState();
                return;
            }
            if (action === 'choose-reference') {
                requestReferenceMedia(opts);
                return;
            }
            if (action === 'toggle-snap') {
                snapToFrames = !snapToFrames;
                renderTimeline();
                setMessage(
                    t(
                        snapToFrames ? 'Frame snapping is on for new timing edits.' : 'Frame snapping is off; timing uses milliseconds.',
                        snapToFrames ? '\u65b0\u7684\u65f6\u95f4\u8c03\u6574\u5df2\u6309\u5e27\u5bf9\u9f50\u3002' : '\u5df2\u5173\u95ed\u6309\u5e27\u5bf9\u9f50\uff0c\u65f6\u95f4\u6309\u6beb\u79d2\u8c03\u6574\u3002',
                        lang
                    ),
                    'info'
                );
                return;
            }
            if (action === 'redistribute') {
                commitPendingTextEdit();
                const before = stateSnapshot();
                const starts = defaultShotStarts(editorOptions.duration, state.shots.length);
                state.shots.forEach((shot, index) => { shot.start = starts[index]; });
                recordStateChange(before);
                renderState();
                setMessage(t('Shots distributed evenly across the total duration.', '\u5df2\u6309\u603b\u65f6\u957f\u5e73\u5747\u5206\u914d\u955c\u5934\u3002', lang), 'success');
                return;
            }
            if (action === 'dialogue-timing') {
                commitPendingTextEdit();
                const before = stateSnapshot();
                const result = distributeDialogueTiming(state, Object.assign({}, editorOptions, { snapToFrames }));
                state = result.state;
                recordStateChange(before);
                renderState();
                setMessage(t('Timing distributed from estimated dialogue length.', '\u5df2\u6309\u9884\u8ba1\u5bf9\u767d\u957f\u5ea6\u5206\u914d\u955c\u5934\u65f6\u957f\u3002', lang), 'success');
                return;
            }
            if (action === 'optimize-cell') {
                commitPendingTextEdit();
                const before = stateSnapshot();
                setMessage('');
                if (typeof opts.onOptimize !== 'function') {
                    setMessage(t('LLM editing is unavailable in this view.', '\u5f53\u524d\u89c6\u56fe\u6ca1\u6709\u53ef\u7528\u7684 LLM \u7f16\u8f91\u670d\u52a1\u3002', lang), 'error');
                    return;
                }
                state = normalize(state, editorOptions);
                const instructionInput = backdrop.querySelector('[data-h3sb-ai-instruction]');
                const request = storyboardCellOptimizationRequest(
                    state,
                    aiTarget,
                    instructionInput?.value || '',
                    editorOptions,
                    lang
                );
                setBusy(true);
                setMessage(t('Editing selected field with LLM...', '\u6b63\u5728\u4fee\u6539\u5f53\u524d\u683c...', lang), 'info');
                try {
                    const result = await opts.onOptimize(request);
                    if (result && typeof result === 'object' && result.ok === false) {
                        throw new Error(result.error || t('LLM editing failed.', 'LLM \u4fee\u6539\u5931\u8d25\u3002', lang));
                    }
                    const rawOutput = cleanText(typeof result === 'string' ? result : (result?.cell ?? result?.text ?? result?.prompt ?? ''));
                    let replacement = rawOutput;
                    if (/\[Shot\s+\d+\]/i.test(rawOutput)) {
                        replacement = storyboardTargetValue(parsePrompt(rawOutput, editorOptions), aiTarget);
                    }
                    replacement = cleanCellOptimizationText(replacement, aiTarget, lang);
                    replacement = preserveReferenceTokens(request.target?.current_value, replacement, editorOptions);
                    if (!replacement) throw new Error(t('LLM returned an empty field.', 'LLM \u8fd4\u56de\u4e86\u7a7a\u5185\u5bb9\u3002', lang));
                    if (!setStoryboardTargetValue(state, aiTarget, replacement)) {
                        throw new Error(t('The selected field is unavailable.', '\u5f53\u524d\u683c\u5df2\u4e0d\u53ef\u7528\u3002', lang));
                    }
                    state.optimize = true;
                    recordStateChange(before);
                    setBusy(false);
                    renderState();
                    if (instructionInput) instructionInput.value = '';
                    setMessage(t('Selected field updated; you can continue revising it.', '\u5f53\u524d\u683c\u5df2\u66f4\u65b0\uff0c\u53ef\u4ee5\u7ee7\u7eed\u4fee\u6539\u3002', lang), 'success');
                } catch (error) {
                    setBusy(false);
                    setMessage(error?.message || String(error), 'error');
                }
                return;
            }
            if (action === 'add' && state.shots.length < MAX_SHOTS) {
                commitPendingTextEdit();
                const before = stateSnapshot();
                const result = insertShotIntoState(state, editorOptions.duration, snapToFrames);
                if (!result.inserted) {
                    setMessage(t('There is not enough time to add another shot.', '\u5f53\u524d\u65f6\u95f4\u4e0d\u8db3\u4ee5\u65b0\u589e\u955c\u5934\u3002', lang), 'warning');
                    return;
                }
                recordStateChange(before);
                renderState();
                return;
            }
            if (action === 'reset') {
                commitPendingTextEdit();
                const before = stateSnapshot();
                state = applyRef2VADefaultBindings(defaultState(editorOptions), editorOptions);
                state.mode = editorOptions.mode;
                recordStateChange(before);
                renderState();
                setMessage(t('Storyboard reset. You can undo this change.', '\u5206\u955c\u8868\u5df2\u91cd\u7f6e\uff0c\u53ef\u64a4\u9500\u8be5\u64cd\u4f5c\u3002', lang), 'info');
                return;
            }
            if (action === 'optimize') {
                commitPendingTextEdit();
                const before = stateSnapshot();
                setMessage('');
                if (typeof opts.onOptimize !== 'function') {
                    setMessage(t('LLM optimization is unavailable in this view.', '\u5f53\u524d\u89c6\u56fe\u6ca1\u6709\u53ef\u7528\u7684 LLM \u4f18\u5316\u670d\u52a1\u3002', lang), 'error');
                    return;
                }
                state = normalize(state, editorOptions);
                const previousState = normalize(state, editorOptions);
                const prompt = formatPrompt(state, editorOptions);
                const request = {
                    kind: 'storyboard',
                    state: normalize(state, editorOptions),
                    storyboard_state: serialize(state, editorOptions),
                    prompt,
                    mode: state.mode
                };
                setBusy(true);
                setMessage(t('Optimizing storyboard with LLM...', '\u6b63\u5728\u901a\u8fc7 LLM \u4f18\u5316\u5206\u955c\u8868...', lang), 'info');
                try {
                    const result = await opts.onOptimize(request);
                    if (result && typeof result === 'object' && result.ok === false) {
                        throw new Error(result.error || t('LLM optimization failed.', 'LLM \u4f18\u5316\u5931\u8d25\u3002', lang));
                    }
                    const optimizedPrompt = cleanText(typeof result === 'string' ? result : (result?.prompt ?? result?.text ?? ''));
                    if (!optimizedPrompt) throw new Error(t('LLM returned an empty prompt.', 'LLM \u8fd4\u56de\u4e86\u7a7a Prompt\u3002', lang));
                    const optimizedState = parsePrompt(optimizedPrompt, Object.assign({}, editorOptions, { optimize: true }));
                    optimizedState.mode = editorOptions.mode;
                    state = mergeOptimizedStoryboard(previousState, optimizedState, editorOptions, lang);
                    recordStateChange(before);
                    const optimizedCheck = validate(state, editorOptions);
                    const agentWarning = cleanText(result?.warning);
                    setBusy(false);
                    renderState();
                    setMessage(
                        agentWarning || !optimizedCheck.ok
                            ? t('LLM optimization complete. Reference roles or some fields may need review; Prompt can still be applied.', 'LLM \u4f18\u5316\u5df2\u5b8c\u6210\u3002\u53c2\u8003\u5a92\u4f53\u4f5c\u7528\u6216\u90e8\u5206\u683c\u5b50\u53ef\u80fd\u9700\u8981\u8c03\u6574\uff0c\u4ecd\u53ef\u5199\u5165 Prompt\u3002', lang)
                            : t('LLM optimization complete; not yet applied to Prompt', 'LLM \u4f18\u5316\u5df2\u5b8c\u6210\uff0c\u5c1a\u672a\u5199\u5165 Prompt', lang),
                        agentWarning || !optimizedCheck.ok ? 'warning' : 'success'
                    );
                } catch (error) {
                    setBusy(false);
                    setMessage(error?.message || String(error), 'error');
                }
                return;
            }
            if (action !== 'apply') return;
            commitPendingTextEdit();
            setMessage('');
            backdrop.querySelectorAll('[data-h3sb-shot-field="start"],[data-h3sb-shot-field="duration"]').forEach((control) => {
                commitTimeInput(control);
            });
            const checked = validate(state, editorOptions);
            state = checked.state || normalize(state, editorOptions);
            const prompt = formatPrompt(state, editorOptions);
            state.prompt_snapshot = prompt;
            const response = {
                state: normalize(state, editorOptions),
                storyboard_state: serialize(state, editorOptions),
                prompt,
                mode: state.mode,
                validation: checked
            };
            if (typeof opts.onConfirm !== 'function') {
                close();
                return;
            }
            try {
                const result = opts.onConfirm(response);
                if (result && typeof result.then === 'function') {
                    setBusy(true);
                    const resolved = await result;
                    if (resolved === false) {
                        setBusy(false);
                        return;
                    }
                } else if (result === false) {
                    return;
                }
                close();
            } catch (error) {
                setBusy(false);
                setMessage(error?.message || String(error), 'error');
            }
        });
        backdrop.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
                return;
            }
            const key = String(event.key || '').toLowerCase();
            if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
                const changed = key === 'y' || event.shiftKey ? redoState() : undoState();
                if (changed) event.preventDefault();
            }
        });

        activeModal = backdrop;
        activeOptions = opts;
        const mount = opts.modalMount?.appendChild ? opts.modalMount : document.body;
        mount.appendChild(backdrop);
        document.documentElement.classList.add('sai-h3sb-modal-open');
        renderState();
        backdrop.querySelector('[data-h3sb-action="close"]')?.focus();
        return backdrop;
    }

    function openScenePreset() {
        const source = languageState();
        const options = currentSceneOptions(source);
        const promptField = currentPromptField();
        const currentPrompt = cleanText(promptField?.value || '');
        const state = sceneStateFromPrompt(source);
        return open(Object.assign({}, options, {
            context: 'scene_preset',
            prompt: currentPrompt,
            storyboardState: state,
            onOptimize: async (response) => {
                if (typeof root.runSimpleAIPromptActionDirect !== 'function') {
                    return { ok: false, error: t('LLM optimization service is not ready.', 'LLM \u4f18\u5316\u670d\u52a1\u5c1a\u672a\u5c31\u7eea\u3002', source) };
                }
                const language = isEnglish(source) ? 'en' : 'cn';
                const expectedGenerationImageSlots = Array.isArray(options.inventory?.image_refs)
                    ? options.inventory.image_refs.map((item) => cleanText(item?.slot)).filter(Boolean)
                    : [];
                const preferredVideoSlot = preferredStoryboardVideoSlot(response?.state, options.inventory);
                if (response?.kind === 'cell') {
                    return root.runSimpleAIPromptActionDirect('smart_expand', response.input, {
                        language,
                        target_kind: 'natural',
                        instruction: response.instruction,
                        use_scene_agent_prompt: false,
                        use_video: !!preferredVideoSlot,
                        preferred_video_slot: preferredVideoSlot,
                        skip_prompt_compiler_validation: true,
                        expected_generation_image_slots: expectedGenerationImageSlots
                    });
                }
                return root.runSimpleAIPromptActionDirect('smart_expand', response.prompt, {
                    language,
                    h3_storyboard_form: true,
                    use_video: !!preferredVideoSlot,
                    preferred_video_slot: preferredVideoSlot,
                    expected_generation_image_slots: expectedGenerationImageSlots
                });
            },
            onConfirm: (response) => {
                const nextState = Object.assign({}, response.state, { prompt_snapshot: response.prompt });
                setNativeValue(promptField, response.prompt);
                setNativeValue(bridgeInput('minimax_h3_storyboard_scene_state'), serialize(nextState, options));
                syncSceneControl(source);
                return true;
            }
        }));
    }

    const api = {
        createHistory,
        MODE_T2VA,
        MODE_I2VA,
        MODE_FL2VA,
        MODE_L2VA,
        MODE_REF2VA,
        H3_FPS,
        H3_MIN_DURATION,
        H3_MAX_DURATION,
        MIN_SHOT_DURATION,
        estimateDialogueDuration,
        dialogueTiming,
        dialogueTimingLabel,
        distributeDialogueTiming,
        timelineShotStatus,
        timelinePictureNumbers,
        timelinePictureReferences,
        cameraPresetDefinitions,
        cameraPresetText,
        cameraPresetSelection,
        inventoryFromOptions,
        referenceRetention,
        retentionAnalysisEntries,
        preferredStoryboardVideoSlot,
        normalizeMode,
        sceneModeFromSource,
        currentSceneInventory,
        normalize,
        parse: normalize,
        parsePrompt,
        serialize,
        timelineIntervals,
        resizeShot,
        insertShot,
        duplicateShot,
        splitShot,
        mergeShot,
        shotTemplateDefinitions,
        applyShotTemplate,
        moveShot,
        validateDuration,
        validate,
        validateReferences,
        storyboardFieldPlaceholder,
        preserveReferenceTokens,
        mergeOptimizedStoryboard,
        formatPrompt,
        statusText,
        open,
        openScenePreset,
        close,
        closeScenePreset,
        syncSceneControl
    };
    root.SimpAIH3StoryboardEditor = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    if (typeof document !== 'undefined') {
        document.addEventListener('click', (event) => {
            const target = event.target.closest?.('[data-h3-storyboard-scene-open]');
            if (!target) return;
            event.preventDefault();
            openScenePreset();
        });
        document.addEventListener('keydown', (event) => {
            const target = event.target.closest?.('[data-h3-storyboard-scene-open]');
            if (!target || !['Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            openScenePreset();
        });
        document.addEventListener('input', (event) => {
            if (event.target === positivePromptField()
                    || event.target?.matches?.('[data-scene-director-field="prompt"]')
                    || event.target === bridgeInput('minimax_h3_storyboard_scene_state')
                    || event.target?.closest?.('#scene_canvas,#scene_input_image1,#scene_input_image2,#scene_input_image3,#scene_input_image4,#scene_video,#scene_reference_video,#scene_audio')) {
                syncSceneControl(languageState());
            }
        });
        document.addEventListener('change', (event) => {
            if (event.target?.closest?.('#scene_canvas,#scene_input_image1,#scene_input_image2,#scene_input_image3,#scene_input_image4,#scene_video,#scene_reference_video,#scene_audio')) {
                syncSceneControl(languageState());
            }
        });
        root.setTimeout(() => syncSceneControl(languageState()), 0);
    }
})(typeof window !== 'undefined' ? window : globalThis);
