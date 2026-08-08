export interface Notification {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  readAt: Date | null
  createdAt: Date
}
