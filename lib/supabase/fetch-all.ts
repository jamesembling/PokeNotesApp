const DEFAULT_PAGE_SIZE = 1000;

type SelectPageResult<T> = {
  data: T[] | null;
  error: unknown;
};

// Supabase caps select() responses at 1000 rows by default, so catalog-style
// reads need pagination to avoid silently dropping entries near the end.
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<SelectPageResult<T>>,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw error;
    }

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}
