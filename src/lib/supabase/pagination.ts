/**
 * Supabase PostgREST pagination & batching utilities.
 *
 * PostgREST enforces a default max-rows limit of 1,000 per request.
 * These helpers transparently paginate large tables while preserving
 * a single-query fast path when rows < pageSize and degrading gracefully
 * for Jest mocks that omit `.range()`.
 */

export interface PaginatedResult<T> {
  data: T[];
  error: unknown;
}

/**
 * Fetches all rows from a Supabase query builder factory up to `maxRows`.
 * - Single-query fast path when the first page returns fewer than `pageSize` rows.
 * - Parallel 3-page waves thereafter to avoid sequential N-roundtrip latency.
 * - Safe fallback when Jest mocks do not implement `.range()`.
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: () => any,
  pageSize = 1000,
  maxRows = 30000
): Promise<PaginatedResult<T>> {
  const safePageSize = Math.max(1, Math.min(pageSize, 1000));
  const firstQuery = buildQuery();

  if (!firstQuery || typeof firstQuery.range !== 'function') {
    const res = await firstQuery;
    return {
      data: Array.isArray(res?.data) ? (res.data as T[]) : [],
      error: res?.error ?? null,
    };
  }

  const firstRes = await firstQuery.range(0, safePageSize - 1);
  if (firstRes?.error) {
    return { data: [], error: firstRes.error };
  }

  const firstPage = Array.isArray(firstRes?.data) ? (firstRes.data as T[]) : [];
  if (firstPage.length < safePageSize || firstPage.length >= maxRows) {
    return {
      data: firstPage.length > maxRows ? firstPage.slice(0, maxRows) : firstPage,
      error: null,
    };
  }

  const allRows: T[] = [...firstPage];
  let offset = safePageSize;
  const waveSize = 3;

  while (offset < maxRows) {
    const waveQueries: Promise<{ data?: T[]; error?: unknown }>[] = [];
    for (let i = 0; i < waveSize && offset < maxRows; i++) {
      const start = offset;
      const end = Math.min(offset + safePageSize - 1, maxRows - 1);
      offset += safePageSize;
      waveQueries.push(buildQuery().range(start, end));
    }

    const waveResults = await Promise.all(waveQueries);
    let done = false;

    for (const res of waveResults) {
      if (res?.error) {
        return { data: allRows, error: res.error };
      }
      const page = Array.isArray(res?.data) ? (res.data as T[]) : [];
      if (page.length > 0) {
        allRows.push(...page);
      }
      if (page.length < safePageSize) {
        done = true;
        break;
      }
    }

    if (done || allRows.length >= maxRows) {
      break;
    }
  }

  return {
    data: allRows.length > maxRows ? allRows.slice(0, maxRows) : allRows,
    error: null,
  };
}

/**
 * Splits an array into fixed-size chunks to prevent oversized SQL `IN (...)`
 * lists or PostgREST URL length overflow.
 */
export function chunkArray<T>(items: readonly T[], size = 200): T[][] {
  if (!items || items.length === 0) return [];
  const chunkSize = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}
