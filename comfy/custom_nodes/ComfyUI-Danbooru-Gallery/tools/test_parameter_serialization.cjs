const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

function reactive(value, cache = new WeakMap()) {
    if (!value || typeof value !== 'object') return value;
    if (cache.has(value)) return cache.get(value);
    const proxy = new Proxy(value, {
        get(target, key, receiver) {
            return reactive(Reflect.get(target, key, receiver), cache);
        },
    });
    cache.set(value, proxy);
    return proxy;
}

function loadSerializeHook(moduleName, previous) {
    const filename = path.join(__dirname, '..', 'js', moduleName, `${moduleName}.js`);
    const source = fs.readFileSync(filename, 'utf8');
    const marker = 'nodeType.prototype.onSerialize = function (info) {';
    const start = source.indexOf(marker);
    assert.notEqual(start, -1);
    const end = source.indexOf('\n        };', start);
    assert.notEqual(end, -1);
    return new Function('nodeType', 'onSerialize', 'logger',
        `${source.slice(start, end + '\n        };'.length)}
        return nodeType.prototype.onSerialize;`
    )({ prototype: {} }, previous, { info() {} });
}

const parameter = {
    id: 'param_1',
    name: 'strength',
    type: 'float',
    value: 0,
    config: { min: 0, max: 1, options: ['a', 'b'], enabled: false, empty: '', nullable: null },
};

for (const [moduleName, properties, arrayKey] of [
    ['parameter_break', {
        paramStructure: [parameter],
        lastSync: 123,
        outputIdMap: { 0: 'param_1', 31: 'param_32' },
    }, 'paramStructure'],
    ['parameter_control_panel', {
        parameters: [parameter],
        currentPreset: 'saved-preset',
    }, 'parameters'],
]) {
    for (const useProxy of [false, true]) {
        test(`${moduleName}: ${useProxy ? 'reactive' : 'plain'} data survives structuredClone`, () => {
            const original = structuredClone(properties);
            const node = { properties: useProxy ? reactive(original) : original };
            let previousCalls = 0;
            const hook = loadSerializeHook(moduleName, function (info) {
                assert.equal(this, node);
                previousCalls++;
                info.previousExtension = { retained: true };
            });
            if (useProxy) {
                assert.throws(() => structuredClone(node.properties[arrayKey]), { name: 'DataCloneError' });
            }
            const info = {};
            hook.call(node, info);
            assert.equal(previousCalls, 1);
            assert.deepEqual(structuredClone(info), {
                previousExtension: { retained: true },
                ...properties,
            });
            info[arrayKey][0].config.options.push('snapshot-only');
            assert.deepEqual(original, properties);
            original[arrayKey][0].value = 1;
            assert.equal(info[arrayKey][0].value, 0);
        });
    }

    test(`${moduleName}: uninitialized properties have cloneable defaults`, () => {
        const info = {};
        loadSerializeHook(moduleName).call({ properties: reactive({}) }, info);
        assert.deepEqual(structuredClone(info)[arrayKey], []);
        if (moduleName === 'parameter_break') assert.deepEqual(info.outputIdMap, {});
    });
}
