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

// a custom JSON parser... if the parsed value has a className property
// and is in the registry, create a new instance of the class and copy
// the properties of the value into the new instance.
const reviver = (k: string, v: any) =>
    ((typeof v === "object") && (v !== null) && ("className" in v) && (v.className in registry)) ?
      Object.assign(new registry[v.className](), v) : v;
  
// use this to deserialize JSON instead of plain JSON.parse        
export function deserializeJSON(json: string) {
    return JSON.parse(json, reviver);
}
