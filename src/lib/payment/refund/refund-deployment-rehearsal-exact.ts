import { types as nodeTypes } from "node:util";

export function exactRehearsalRecord(
  value: unknown,
  expectedKeys?: readonly string[],
  allowProcessEnvironment = false,
): Record<string, unknown> | null {
  if (!exactRecordContainer(value, allowProcessEnvironment)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const stringKeys = exactStringKeys(descriptors);
  if (!stringKeys) return null;
  if (expectedKeys && !sameKeys(stringKeys, expectedKeys)) return null;
  const entries = exactEnumerableDataEntries(descriptors, stringKeys);
  if (!entries) return null;
  return Object.fromEntries(entries);
}

export function exactRehearsalArray(
  value: unknown,
  expectedLength?: number,
): unknown[] | null {
  if (!exactArrayContainer(value)) return null;
  const stringKeys = exactStringKeys(value);
  if (!stringKeys) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length = exactArrayLength(lengthDescriptor);
  if (length === null) return null;
  if (expectedLength !== undefined && length !== expectedLength) return null;
  const expectedKeys = [
    ...Array.from({ length }, (_unused, index) => String(index)),
    "length",
  ];
  if (!sameKeys(stringKeys, expectedKeys)) return null;
  return exactArrayValues(value, expectedKeys.slice(0, -1));
}

function exactArrayValues(value: unknown[], keys: readonly string[]): unknown[] | null {
  const entries = exactEnumerableDataEntries(Object.getOwnPropertyDescriptors(value), keys);
  return entries === null ? null : entries.map((entry) => entry[1]);
}

function exactRecordContainer(
  value: unknown,
  allowProcessEnvironment: boolean,
): value is object {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || nodeTypes.isProxy(value)) return false;
  return Reflect.getPrototypeOf(value) === Object.prototype
    || (allowProcessEnvironment && value === process.env);
}

function exactArrayContainer(value: unknown): value is unknown[] {
  return value !== null && typeof value === "object" && Array.isArray(value)
    && !nodeTypes.isProxy(value) && Reflect.getPrototypeOf(value) === Array.prototype;
}

function exactStringKeys(value: object): string[] | null {
  const keys = Reflect.ownKeys(value);
  return keys.every((key) => typeof key === "string")
    ? keys.filter((key): key is string => typeof key === "string")
    : null;
}

function exactEnumerableDataEntries(
  descriptors: Readonly<Record<string, PropertyDescriptor>>,
  keys: readonly string[],
): Array<readonly [string, unknown]> | null {
  const entries: Array<readonly [string, unknown]> = [];
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || descriptor.enumerable !== true
      || !Object.prototype.hasOwnProperty.call(descriptor, "value")) return null;
    entries.push([key, descriptorValue(descriptor)]);
  }
  return entries;
}

function exactArrayLength(descriptor: PropertyDescriptor | undefined): number | null {
  if (!descriptor || descriptor.enumerable !== false
    || !Object.prototype.hasOwnProperty.call(descriptor, "value")) return null;
  const value = descriptorValue(descriptor);
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function descriptorValue(descriptor: { readonly value?: unknown }): unknown {
  return descriptor.value;
}

function sameKeys(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && actual.every((key) => expected.includes(key))
    && expected.every((key) => actual.includes(key));
}
