export function describeError(error: unknown): string {
  if (error == null) {
    return ''
  }

  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }

  try {
    return JSON.stringify(error)
  } catch (jsonError) {
    return String(jsonError)
  }
}
