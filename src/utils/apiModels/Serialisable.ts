// https://stackoverflow.com/questions/54427218/parsing-complex-json-objects-with-inheritance
// a Serializable class has a no-arg constructor and an instance property
// named className
type Serialisable = new () => { readonly className: string }

// store a registry of Serializable classes
const registry: Record<string, Serialisable> = {};

// a decorator that adds classes to the registry
export function serializable<T extends Serialisable>(constructor: T) {
  registry[(new constructor()).className] = constructor;
  return constructor;
}

// Keys that must never be copied from a parsed body onto an instance.
//
// JSON.parse gives `{"__proto__": {...}}` a real own property — it does not
// invoke the setter — but Object.assign below copies with [[Set]], which does.
// Assigning it re-prototypes the command instance being built, so a request
// body could hand a command a prototype of its own choosing and have the
// engine call methods off it. It only ever reaches the one object (this is
// not global prototype pollution), but /api/game/command deserialises raw
// request bodies, and nothing legitimate is called any of these.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// The own, safe properties of a parsed JSON object — what gets copied onto a
// rehydrated instance.
function safeProperties(value: object): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    for (const [key, property] of Object.entries(value)) {
        if (!UNSAFE_KEYS.has(key)) {
            safe[key] = property;
        }
    }
    return safe;
}

// a custom JSON parser... if the parsed value has a className property
// and is in the registry, create a new instance of the class and copy
// the properties of the value into the new instance.
const reviver = (k: string, v: any) =>
    ((typeof v === "object") && (v !== null) && ("className" in v) && (v.className in registry)) ?
      Object.assign(new registry[v.className](), safeProperties(v)) : v;
  
// use this to deserialize JSON instead of plain JSON.parse
export function deserializeJSON(json: string) {
    return JSON.parse(json, reviver);
}

// The class names currently registered as serialisable. Useful for asserting
// (e.g. in tests) that every @serializable class has actually been loaded and
// registered — an unregistered command/game-type cannot be rehydrated from
// commandHistory and would fail to replay or execute.
export function registeredClassNames(): string[] {
    return Object.keys(registry);
}
