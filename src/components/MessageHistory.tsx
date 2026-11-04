import { useMemo, type ReactNode, type RefObject } from "react"
import EmployeeAvatar from "./EmployeeAvatar"

export type MessageHistoryItem = {
  id: number
  senderId: number | null
  senderName: string
  body: string
  sentAt: string
}

type MessageGroup = {
  senderId: number | null
  senderName: string
  messages: MessageHistoryItem[]
}

type MessageHistoryProps = {
  messages: MessageHistoryItem[]
  currentEmployeeId: number
  reporterEmployeeId?: number | null
  historyRef?: RefObject<HTMLDivElement | null>
  intro?: ReactNode
  emptyMessage?: string
}

function MessageHistory({
  messages,
  currentEmployeeId,
  reporterEmployeeId,
  historyRef,
  intro,
  emptyMessage,
}: MessageHistoryProps) {
  const groups = useMemo(() => groupMessages(messages), [messages])
  return (
    <div
      ref={historyRef}
      className="messages-history"
      aria-label="Histórico da conversa"
      aria-live="polite"
    >
      {intro}
      {groups.length ? (
        groups.map((group) => {
          if (group.senderId === null)
            return (
              <div
                className="messages-history__event"
                key={group.messages[0].id}
              >
                {group.messages.map((message) => (
                  <p key={message.id}>
                    {message.body}
                    <small>{formatDateTime(message.sentAt)}</small>
                  </p>
                ))}
              </div>
            )
          const isCurrentEmployee = group.senderId === currentEmployeeId
          const isReporter = group.senderId === reporterEmployeeId
          const firstMessage = group.messages[0]
          return (
            <div
              className={`messages-bubble-row ${
                isCurrentEmployee ? "messages-bubble-row--mine" : ""
              }`}
              key={firstMessage.id}
            >
              {group.senderId ? (
                <EmployeeAvatar
                  employeeId={group.senderId}
                  name={group.senderName}
                  className={`messages-avatar ${
                    isCurrentEmployee ? "messages-avatar--mine" : ""
                  }`}
                />
              ) : (
                <span className="messages-avatar">
                  {initials(group.senderName)}
                </span>
              )}
              <div className="messages-bubble-wrap">
                <div className="messages-bubble__sender">
                  {isCurrentEmployee ? "Você" : group.senderName}
                  {isReporter && !isCurrentEmployee && <span>Funcionário</span>}
                </div>
                <div className="messages-bubble-stack">
                  {group.messages.map((message) => (
                    <p className="messages-bubble" key={message.id}>
                      {message.body}
                    </p>
                  ))}
                </div>
                <small className="messages-bubble__time">
                  {formatDateTime(firstMessage.sentAt)}
                </small>
              </div>
            </div>
          )
        })
      ) : emptyMessage ? (
        <p className="messages-history__started">{emptyMessage}</p>
      ) : null}
    </div>
  )
}

function groupMessages(messages: MessageHistoryItem[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  for (const message of messages) {
    const currentGroup = groups[groups.length - 1]
    const previousMessage =
      currentGroup?.messages[currentGroup.messages.length - 1]
    const elapsedSincePrevious = previousMessage
      ? new Date(message.sentAt).getTime() -
        new Date(previousMessage.sentAt).getTime()
      : Number.POSITIVE_INFINITY
    if (
      currentGroup &&
      currentGroup.senderId !== null &&
      currentGroup.senderId === message.senderId &&
      elapsedSincePrevious >= 0 &&
      elapsedSincePrevious <= 3 * 60 * 1000
    ) {
      currentGroup.messages.push(message)
    } else {
      groups.push({
        senderId: message.senderId,
        senderName: message.senderName,
        messages: [message],
      })
    }
  }
  return groups
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}
function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default MessageHistory
