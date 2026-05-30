export function compactMap<T, U>(
  values: readonly T[],
  mapValue: (value: T, index: number, array: readonly T[]) => U | false | null | undefined | ""
) {
  const results: NonNullable<U>[] = [];

  values.forEach((value, index, array) => {
    const mappedValue = mapValue(value, index, array);

    if (mappedValue) {
      results.push(mappedValue as NonNullable<U>);
    }
  });

  return results;
}
