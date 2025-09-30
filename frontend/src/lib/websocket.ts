export type CloseCodeMessages = Partial<Record<number, string>>

export function describeCloseEvent(
  event: CloseEvent | null | undefined,
  overrides?: CloseCodeMessages,
): string {
  if (!event) {
    return ''
  }

  if (event.reason) {
    return `${event.reason} (code: ${event.code})`
  }

  if (overrides && overrides[event.code]) {
    return overrides[event.code] as string
  }

  switch (event.code) {
    case 1000:
      return '正常に切断されました (code: 1000)'
    case 1001:
      return '相手側によって切断されました (code: 1001)'
    case 1006:
      return 'ネットワークまたはサーバーとの通信が途絶しました (code: 1006)'
    default:
      return `接続が終了しました (code: ${event.code})`
  }
}
