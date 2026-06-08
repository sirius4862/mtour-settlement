const isDev = process.env.NODE_ENV === 'development'

export async function timed<T>(label: string, task: () => PromiseLike<T>): Promise<T> {
  if (!isDev) return await task()

  const start = performance.now()
  try {
    return await task()
  } finally {
    const elapsed = Math.round(performance.now() - start)
    console.info(`[perf] ${label}: ${elapsed}ms`)
  }
}
