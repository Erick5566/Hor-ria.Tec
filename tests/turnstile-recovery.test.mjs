import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync('components/turnstile.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function harness(withApi = true) {
  const states = [], effects = [], widgets = [], tokens = [], removed = [], timers = [];
  let cursor = 0, effectCursor = 0, script = null;
  const api = { render: (_, options) => { widgets.push(options); return String(widgets.length); }, remove: id => removed.push(id) };
  const window = withApi ? { turnstile: api } : {};
  const exports = {};
  const onToken = token => tokens.push(token);
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(code, {
    exports, window, console: { error() {} },
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {},
    document: {
      querySelector: () => script,
      createElement: () => ({ dataset: {}, addEventListener() {}, removeEventListener() {}, remove() { script = null; } }),
      head: { appendChild: value => { script = value; } },
    },
    ResizeObserver: class { observe() {} disconnect() {} },
    require: name => name === 'react' ? {
      useRef: () => ({ current: { clientWidth: 260 } }),
      useState: initial => {
        const i = cursor++;
        if (!(i in states)) states[i] = initial;
        return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
      },
      useEffect: (fn, deps) => {
        const i = effectCursor++;
        if (effects[i] && deps.every((d, j) => d === effects[i].deps[j])) return;
        effects[i]?.cleanup?.();
        effects[i] = { deps, cleanup: fn() };
      },
    } : { jsx, jsxs: jsx },
  });
  const render = () => { cursor = effectCursor = 0; return exports.default({ siteKey: 'test', onToken }); };
  return { render, states, widgets, tokens, removed, timers, window, api, unmount: () => effects.forEach(e => e.cleanup?.()) };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test('challenge failure clears token; retry replaces only widget; stale callbacks are ignored', async () => {
  const h = harness(); h.render(); await flush();
  h.widgets[0].callback('valid');
  h.widgets[0]['error-callback']('200500');
  assert.equal(h.tokens.at(-1), '');
  const tree = h.render();
  const feedback = tree.props.children[1];
  assert.equal(feedback.props.children[0].props.role, 'alert');
  const retry = feedback.props.children[1];
  assert.equal(retry.props.type, 'button');
  retry.props.onClick(); h.render(); await flush();
  assert.deepEqual(h.removed, ['1']);
  assert.equal(h.widgets.length, 2);
  h.widgets[0].callback('stale');
  assert.equal(h.tokens.at(-1), '');
  h.widgets[1].callback('fresh');
  assert.equal(h.tokens.at(-1), 'fresh');
  assert.equal(h.states[0], '');
  h.widgets[1]['timeout-callback']();
  assert.equal(h.tokens.at(-1), '');
  h.widgets[1]['error-callback']('110200');
  assert.match(h.states[0], /este endereço/);
  h.unmount();
});

test('stalled script times out and a manual retry can recover', async () => {
  const h = harness(false); h.render();
  h.timers[0](); await flush();
  assert.match(h.states[0], /carregar/);
  const tree = h.render();
  h.window.turnstile = h.api;
  tree.props.children[1].props.children[1].props.onClick();
  h.render(); await flush();
  assert.equal(h.widgets.length, 1);
  h.widgets[0].callback('fresh');
  assert.equal(h.tokens.at(-1), 'fresh');
  h.unmount();
});
