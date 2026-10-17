// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readStoredValue, useStoredValue, writeStoredValue } from './useStoredValue';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let roots: Root[];
let scope = 0;

beforeEach(() => {
    roots = [];
    scope++;
    window.localStorage.clear();
});

afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    vi.restoreAllMocks();
});

it('disables direct reads and writes with a null key', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    writeStoredValue(null, 'anonymous');
    expect(readStoredValue(null)).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
});

it('can gain and lose a storage scope without enabling an old disabled setter', async () => {
    let current!: ReturnType<typeof useStoredValue>;
    function Harness({ storageKey }: { storageKey: string | null }) {
        current = useStoredValue(storageKey);
        return null;
    }
    const root = createRoot(document.createElement('div'));
    roots.push(root);
    const render = (storageKey: string | null) => act(async () => { root.render(createElement(Harness, { storageKey })); });
    await render(null);
    const disabledSetter = current[1];
    await act(async () => disabledSetter('anonymous'));
    expect(current[0]).toBeNull();
    expect(window.localStorage.length).toBe(0);

    const key = `stored-value-test:${scope}:user_a`;
    await render(key);
    await act(async () => current[1]('remembered'));
    expect(current[0]).toBe('remembered');
    expect(window.localStorage.getItem(key)).toBe('remembered');
    await act(async () => disabledSetter('wrong account'));
    expect(current[0]).toBe('remembered');
    expect(window.localStorage.length).toBe(1);

    await render(null);
    await act(async () => current[1]('anonymous again'));
    expect(current[0]).toBeNull();
    expect(window.localStorage.length).toBe(1);
    await render(key);
    expect(current[0]).toBe('remembered');
});
