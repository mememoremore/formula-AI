export function useToast() {
  const message = useState('toast-message', () => '')
  const timestamp = useState('toast-timestamp', () => 0)
  function showToast(text: string) {
    message.value = text
    timestamp.value = Date.now()
  }
  return { message, timestamp, showToast }
}
