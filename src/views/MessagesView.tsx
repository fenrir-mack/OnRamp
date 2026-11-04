import "../styles/messages.css"
import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import type { AuthenticatedEmployee } from "../components/Login"
import EmployeeAvatar from "../components/EmployeeAvatar"
import { Icon } from "../components/shared"
import MessageHistory, {
  type MessageHistoryItem,
} from "../components/MessageHistory"

type Conversation = {
  conversationId: number
  issueId: number
  employeeId: number
  employeeName: string
  employeeEmail: string
  employeeJobTitle: string | null
  employeeDepartment: string | null
  taskTitle: string
  stageName: string
  ownerEmployeeId: number | null
  ownerName: string | null
  issueDescription: string
  status: "open" | "pending_confirmation" | "resolved"
  resolutionRequestedByEmployeeId: number | null
  resolutionRespondentEmployeeId: number | null
  resolutionRequestedByName: string | null
  resolutionRespondentName: string | null
  resolutionRequestedAt: string | null
  resolutionDueAt: string | null
  createdAt: string
  lastMessageAt: string
  expiresAt: string
  lastMessage: string
  lastSenderId: number | null
}
type ConversationMessage = {
  id: number
  senderId: number | null
  senderName: string
  body: string
  sentAt: string
}
type ConversationDetail = {
  conversation: Conversation
  messages: ConversationMessage[]
}
type Filter = "open" | "all" | "resolved"
type SupportRequestConversation = {
  id: number
  employeeId: number
  employeeName: string
  employeeDepartment: string | null
  subject: string
  description: string
  status: "open" | "in_progress" | "resolved"
  submittedAt: string
  hasChat: boolean
  lastMessage: string
  lastMessageAt: string
}
type SupportRequestChatMessage = {
  id: number
  senderEmployeeId: number
  senderName: string
  body: string
  sentAt: string
  isMine: boolean
}

function MessagesView({
  employee,
  onUnreadCountChange,
  requestedSupportRequestId,
  onSupportRequestOpened,
}: {
  employee: AuthenticatedEmployee
  onUnreadCountChange: (count: number) => void
  requestedSupportRequestId: number | null
  onSupportRequestOpened: () => void
}) {
  const [showRequestChats, setShowRequestChats] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [filter, setFilter] = useState<Filter>("open")
  const [draft, setDraft] = useState("")
  const [showRejectionForm, setShowRejectionForm] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [now, setNow] = useState(Date.now())
  const historyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (requestedSupportRequestId !== null) setShowRequestChats(true)
  }, [requestedSupportRequestId])

  async function loadConversations(signal?: AbortSignal) {
    const response = await fetch("/api/support/conversations", { signal })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.error ?? "Não foi possível carregar as conversas.")
    const rows = result as Conversation[]
    setConversations(rows)
    setSelectedId((current) =>
      current && rows.some(({ conversationId }) => conversationId === current)
        ? current
        : (rows.find(({ status }) => status !== "resolved")?.conversationId ??
          rows[0]?.conversationId ??
          null),
    )
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError("")
    loadConversations(controller.signal)
      .catch((loadError: unknown) => {
        if (
          !(
            loadError instanceof DOMException && loadError.name === "AbortError"
          )
        )
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar as conversas.",
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [employee.id])

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null)
      return
    }
    const controller = new AbortController()
    setError("")
    loadDetail(selectedId, controller.signal).catch((loadError: unknown) => {
      if (
        !(loadError instanceof DOMException && loadError.name === "AbortError")
      )
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível abrir a conversa.",
        )
    })
    return () => controller.abort()
  }, [selectedId, onUnreadCountChange])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now())
      void loadConversations().catch(() => undefined)
      if (selectedId !== null)
        void loadDetail(selectedId).catch(() => undefined)
    }, 30_000)
    return () => window.clearInterval(interval)
  }, [selectedId, employee.id])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const history = historyRef.current
      if (history)
        history.scrollTo({ top: history.scrollHeight, behavior: "smooth" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [detail?.conversation.conversationId, detail?.messages.length])

  const filteredConversations = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          filter === "all" ||
          (filter === "resolved"
            ? conversation.status === "resolved"
            : conversation.status !== "resolved"),
      ),
    [conversations, filter],
  )
  const openCount = conversations.filter(
    ({ status }) => status !== "resolved",
  ).length
  function changeFilter(nextFilter: Filter) {
    setFilter(nextFilter)
    const nextRows = conversations.filter(
      (conversation) =>
        nextFilter === "all" ||
        (nextFilter === "resolved"
          ? conversation.status === "resolved"
          : conversation.status !== "resolved"),
    )
    if (!nextRows.some(({ conversationId }) => conversationId === selectedId))
      setSelectedId(nextRows[0]?.conversationId ?? null)
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedId || !draft.trim()) return
    setSaving(true)
    setError("")
    try {
      const response = await fetch(
        `/api/support/conversations/${selectedId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: draft }),
        },
      )
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error ?? "Não foi possível enviar a mensagem.")
      setDraft("")
      await Promise.all([loadConversations(), loadDetail(selectedId)])
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Não foi possível enviar a mensagem.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function loadDetail(conversationId: number, signal?: AbortSignal) {
    const response = await fetch(
      `/api/support/conversations/${conversationId}`,
      { signal },
    )
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.error ?? "Não foi possível atualizar a conversa.")
    const loaded = result as ConversationDetail
    setDetail(loaded)
    const lastMessage = loaded.messages[loaded.messages.length - 1]
    if (lastMessage) {
      const readResponse = await fetch(
        `/api/support/conversations/${conversationId}/read`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastReadMessageId: lastMessage.id }),
          signal,
        },
      )
      const readResult = await readResponse.json()
      if (readResponse.ok) onUnreadCountChange(readResult.unreadCount as number)
    }
  }

  async function updateStatus() {
    if (!detail) return
    setSaving(true)
    setError("")
    try {
      const response = await fetch(
        `/api/support/conversations/${detail.conversation.conversationId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "open" }),
        },
      )
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error ?? "Não foi possível atualizar o status.")
      await Promise.all([
        loadConversations(),
        loadDetail(detail.conversation.conversationId),
      ])
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Não foi possível atualizar o status.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function requestResolution() {
    if (!selectedId) return
    setSaving(true)
    setError("")
    try {
      const response = await fetch(
        `/api/support/conversations/${selectedId}/resolution-request`,
        { method: "POST" },
      )
      const result = await response.json()
      if (!response.ok)
        throw new Error(
          result.error ?? "Não foi possível solicitar a confirmação.",
        )
      await Promise.all([loadConversations(), loadDetail(selectedId)])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível solicitar a confirmação.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function respondToResolution(action: "confirm" | "reject") {
    if (!selectedId || (action === "reject" && !rejectionReason.trim())) return
    setSaving(true)
    setError("")
    try {
      const response = await fetch(
        `/api/support/conversations/${selectedId}/resolution-response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason: rejectionReason }),
        },
      )
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error ?? "Não foi possível registrar a decisão.")
      setShowRejectionForm(false)
      setRejectionReason("")
      await Promise.all([loadConversations(), loadDetail(selectedId)])
    } catch (responseError) {
      setError(
        responseError instanceof Error
          ? responseError.message
          : "Não foi possível registrar a decisão.",
      )
    } finally {
      setSaving(false)
    }
  }

  function expirationLabel(expiresAt: string) {
    const expiry = new Date(expiresAt)
    const days = Math.max(0, Math.ceil((expiry.getTime() - now) / 86_400_000))
    const date = expiry.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    return { days, date }
  }

  const selected = detail?.conversation ?? null
  const canRespondToResolution = Boolean(
    selected &&
      selected.status === "pending_confirmation" &&
      selected.resolutionRequestedByEmployeeId !== employee.id &&
      (selected.resolutionRespondentEmployeeId === employee.id ||
        employee.isHrAdmin),
  )
  const resolutionDueLabel = selected?.resolutionDueAt
    ? new Date(selected.resolutionDueAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""
  const selectedContact = selected
    ? getConversationContact(employee, selected)
    : null

  if (showRequestChats) {
    return (
      <SupportRequestMessages
        employee={employee}
        initialRequestId={requestedSupportRequestId}
        onInitialRequestOpened={onSupportRequestOpened}
        onBack={() => setShowRequestChats(false)}
      />
    )
  }

  return (
    <section className="messages-page">
      <div
        className="mb-4 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Tipo de conversa"
      >
        <button
          className="rounded-xl bg-[#5556d8] px-4 py-2.5 text-xs font-extrabold text-white"
          role="tab"
          aria-selected="true"
          type="button"
        >
          Problemas da jornada
        </button>
        <button
          className="rounded-xl border border-[#e5e5ee] bg-white px-4 py-2.5 text-xs font-extrabold text-[#5556d8]"
          role="tab"
          aria-selected="false"
          onClick={() => setShowRequestChats(true)}
          type="button"
        >
          Pedidos de suporte
        </button>
      </div>
      {error && (
        <p className="messages-page__error" role="alert">
          {error}
        </p>
      )}
      <div className="messages-layout">
        <aside
          className="messages-inbox"
          aria-label="Caixa de entrada de conversas"
        >
          <div className="messages-inbox__heading">
            <strong>Caixa de entrada</strong>
            <span>
              {conversations.length}{" "}
              {conversations.length === 1 ? "caso" : "casos"}
            </span>
          </div>
          <div className="messages-filters" aria-label="Filtrar conversas">
            <button
              className={filter === "open" ? "is-active" : ""}
              onClick={() => changeFilter("open")}
              type="button"
            >
              Abertos <span>{openCount}</span>
            </button>
            <button
              className={filter === "all" ? "is-active" : ""}
              onClick={() => changeFilter("all")}
              type="button"
            >
              Todos
            </button>
            <button
              className={filter === "resolved" ? "is-active" : ""}
              onClick={() => changeFilter("resolved")}
              type="button"
            >
              Resolvidos
            </button>
          </div>
          {loading ? (
            <p className="messages-inbox__empty">Carregando conversas...</p>
          ) : filteredConversations.length ? (
            <div className="messages-thread-list">
              {filteredConversations.map((conversation) => {
                const contact = getConversationContact(employee, conversation)
                return (
                  <button
                    className={`messages-thread ${
                      selectedId === conversation.conversationId
                        ? "messages-thread--active"
                        : ""
                    }`}
                    key={conversation.conversationId}
                    onClick={() => setSelectedId(conversation.conversationId)}
                    type="button"
                    aria-current={
                      selectedId === conversation.conversationId
                        ? "true"
                        : undefined
                    }
                  >
                    <MessagesAvatar
                      employeeId={contact.employeeId}
                      name={contact.name}
                    />
                    <span className="messages-thread__body">
                      <span className="messages-thread__top">
                        <strong>{contact.name}</strong>
                        <small>{formatDate(conversation.lastMessageAt)}</small>
                      </span>
                      <span className="messages-thread__subject">
                        {conversation.taskTitle}
                      </span>
                      <span className="messages-thread__preview">
                        {conversation.lastMessage}
                      </span>
                      <span className="messages-thread__bottom">
                        <span
                          className={`messages-status messages-status--${conversation.status}`}
                        >
                          {conversationStatusLabel(conversation.status)}
                        </span>
                        <small>
                          {employee.isHrAdmin
                            ? (conversation.employeeDepartment ?? "Funcionário")
                            : conversation.stageName}
                        </small>
                        <small>
                          Expira em{" "}
                          {expirationLabel(conversation.expiresAt).days} d
                        </small>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="messages-inbox__empty">
              {filter === "resolved"
                ? "Nenhuma conversa resolvida."
                : filter === "open"
                  ? "Nenhum caso em andamento ou aguardando confirmação."
                  : "As conversas de suporte aparecerão aqui quando um problema for informado."}
            </p>
          )}
        </aside>

        {selected && detail ? (
          <article className="messages-case">
            <header className="messages-case__header">
              <div className="messages-person">
                <MessagesAvatar
                  employeeId={selectedContact?.employeeId ?? null}
                  name={selectedContact?.name ?? "Equipe de suporte"}
                />
                <div>
                  <strong>{selectedContact?.name}</strong>
                  <small>{selectedContact?.subtitle}</small>
                </div>
              </div>
              <div className="messages-case__actions">
                <span
                  className={`messages-status messages-status--${selected.status}`}
                >
                  {conversationStatusLabel(selected.status)}
                </span>
                {selected.status === "open" && (
                  <button
                    onClick={() => void requestResolution()}
                    disabled={saving}
                    type="button"
                  >
                    Solicitar confirmação
                  </button>
                )}
                {selected.status === "pending_confirmation" &&
                  canRespondToResolution && (
                    <>
                      <button
                        onClick={() => void respondToResolution("confirm")}
                        disabled={saving}
                        type="button"
                      >
                        Confirmar resolução
                      </button>
                      <button
                        onClick={() => setShowRejectionForm(true)}
                        disabled={saving}
                        type="button"
                      >
                        Rejeitar
                      </button>
                    </>
                  )}
                {selected.status === "pending_confirmation" &&
                  !canRespondToResolution && (
                    <small className="messages-resolution-waiting">
                      Aguardando confirmação até {resolutionDueLabel}
                    </small>
                  )}
                {selected.status === "resolved" && (
                  <button
                    onClick={() => void updateStatus()}
                    disabled={saving}
                    type="button"
                  >
                    Reabrir
                  </button>
                )}
              </div>
            </header>
            <section
              className="messages-case__context"
              aria-label="Contexto do problema"
            >
              <div>
                <span className="messages-case__eyebrow">
                  Problema da jornada
                </span>
                <h2>{selected.taskTitle}</h2>
                <div className="messages-case__meta">
                  <span>
                    Etapa: <strong>{selected.stageName}</strong>
                  </span>
                  <span>
                    {employee.isHrAdmin || selected.employeeId !== employee.id
                      ? "Funcionário"
                      : "Responsável"}
                    : <strong>{selectedContact?.name}</strong>
                  </span>
                </div>
              </div>
              <div className="messages-expiry">
                <span>
                  <Icon name="clock" size={14} /> Retenção da conversa
                </span>
                <strong>
                  Expira em {expirationLabel(selected.expiresAt).days} dias
                </strong>
                <small>
                  {expirationLabel(selected.expiresAt).date} · prazo reinicia
                  com cada mensagem
                </small>
              </div>
            </section>
            {selected.status === "pending_confirmation" && (
              <p className="messages-resolution-notice" role="status">
                {canRespondToResolution
                  ? `${selected.resolutionRequestedByName ?? "A outra pessoa"} solicitou a confirmação. Confirme ou rejeite até ${resolutionDueLabel}.`
                  : `Aguardando ${selected.resolutionRespondentName ?? "a outra pessoa"} confirmar ou rejeitar até ${resolutionDueLabel}.`}
              </p>
            )}
            <MessageHistory
              historyRef={historyRef}
              messages={detail?.messages ?? []}
              currentEmployeeId={employee.id}
              reporterEmployeeId={selected.employeeId}
              intro={
                <p className="messages-history__started">
                  Problema informado em {formatDateTime(selected.createdAt)}
                </p>
              }
            />
            {showRejectionForm &&
              selected.status === "pending_confirmation" &&
              canRespondToResolution && (
                <form
                  className="messages-rejection"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void respondToResolution("reject")
                  }}
                >
                  <label htmlFor="resolution-reason">
                    Justificativa para rejeitar a resolução
                  </label>
                  <textarea
                    id="resolution-reason"
                    maxLength={2000}
                    required
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    placeholder="Explique o que ainda precisa ser resolvido..."
                  />
                  <div>
                    <button
                      className="messages-rejection__cancel"
                      onClick={() => {
                        setShowRejectionForm(false)
                        setRejectionReason("")
                      }}
                      type="button"
                    >
                      Cancelar
                    </button>
                    <button
                      className="messages-rejection__submit"
                      disabled={saving || !rejectionReason.trim()}
                      type="submit"
                    >
                      {saving ? "Enviando..." : "Enviar justificativa"}
                    </button>
                  </div>
                </form>
              )}
            <form className="messages-reply" onSubmit={sendMessage}>
              <label htmlFor="support-reply">
                Responder a {selectedContact?.name}
              </label>
              <textarea
                id="support-reply"
                maxLength={4000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Escreva uma atualização ou peça mais informações..."
              />
              <div className="messages-reply__footer">
                <small>
                  Esta conversa é privada entre o funcionário e a equipe
                  responsável.
                </small>
                <button disabled={saving || !draft.trim()} type="submit">
                  <Icon name="chat" size={15} />{" "}
                  {saving ? "Enviando..." : "Enviar mensagem"}
                </button>
              </div>
            </form>
          </article>
        ) : (
          <div className="messages-case messages-case--empty">
            <span className="messages-empty-icon">
              <Icon name="chat" size={24} />
            </span>
            <h2>
              {loading ? "Carregando conversas" : "Selecione uma conversa"}
            </h2>
            <p>
              {loading
                ? "Buscando os casos disponíveis."
                : "Os problemas reportados na jornada ficam reunidos aqui para acompanhamento."}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}

function conversationStatusLabel(status: Conversation["status"]) {
  if (status === "pending_confirmation") return "Aguardando confirmação"
  return status === "resolved" ? "Resolvido" : "Em andamento"
}

function getConversationContact(
  employee: AuthenticatedEmployee,
  conversation: Conversation,
) {
  const isReporter = employee.id === conversation.employeeId
  const isTaskOwner = employee.id === conversation.ownerEmployeeId
  if (employee.isHrAdmin || (isTaskOwner && !isReporter)) {
    return {
      name: conversation.employeeName,
      employeeId: conversation.employeeId,
      subtitle: employee.isHrAdmin
        ? `${conversation.employeeJobTitle ?? "Funcionário"} · ${conversation.employeeDepartment ?? conversation.employeeEmail}`
        : "Funcionário que informou o problema",
    }
  }
  if (isReporter && conversation.ownerEmployeeId && conversation.ownerName) {
    return {
      name: conversation.ownerName,
      employeeId: conversation.ownerEmployeeId,
      subtitle: "Responsável pela tarefa",
    }
  }
  return {
    name: "Equipe de suporte",
    employeeId: null,
    subtitle: "Equipe responsável pelo atendimento",
  }
}

function MessagesAvatar({
  employeeId,
  name,
  className = "",
}: {
  employeeId: number | null
  name: string
  className?: string
}) {
  const avatarClassName = `messages-avatar ${className}`.trim()
  return employeeId ? (
    <EmployeeAvatar
      employeeId={employeeId}
      name={name}
      className={avatarClassName}
    />
  ) : (
    <span className={avatarClassName}>{initials(name)}</span>
  )
}

function SupportRequestMessages({
  employee,
  initialRequestId,
  onInitialRequestOpened,
  onBack,
}: {
  employee: AuthenticatedEmployee
  initialRequestId: number | null
  onInitialRequestOpened: () => void
  onBack: () => void
}) {
  const [conversations, setConversations] =
    useState<SupportRequestConversation[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(initialRequestId)
  const [messages, setMessages] = useState<SupportRequestChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const historyRef = useRef<HTMLDivElement>(null)
  const historyMessages: MessageHistoryItem[] = useMemo(
    () =>
      messages.map((message) => ({
        id: message.id,
        senderId: message.senderEmployeeId,
        senderName: message.senderName,
        body: message.body,
        sentAt: message.sentAt,
      })),
    [messages],
  )

  async function loadConversations(signal?: AbortSignal) {
    const response = await fetch("/api/support/requests/conversations", {
      signal,
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(
        result.error ?? "Não foi possível carregar os pedidos de suporte.",
      )
    const rows = result.conversations as SupportRequestConversation[]
    setConversations(rows)
    setSelectedId((current) =>
      current && rows.some((item) => item.id === current)
        ? current
        : (rows.find((item) => item.status !== "resolved")?.id ??
          rows[0]?.id ??
          null),
    )
  }

  async function loadMessages(requestId: number, signal?: AbortSignal) {
    const response = await fetch(
      `/api/support/requests/${requestId}/messages`,
      { signal },
    )
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.error ?? "Não foi possível carregar o chat.")
    setMessages(result.messages as SupportRequestChatMessage[])
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    loadConversations(controller.signal)
      .then(() => {
        if (initialRequestId !== null) {
          setSelectedId(initialRequestId)
          onInitialRequestOpened()
        }
      })
      .catch((loadError: unknown) => {
        if (
          !(
            loadError instanceof DOMException && loadError.name === "AbortError"
          )
        )
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os pedidos de suporte.",
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [employee.id])

  useEffect(() => {
    if (selectedId === null) {
      setMessages([])
      return
    }
    let active = true
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/support/requests/${selectedId}/messages`,
        )
        const result = await response.json()
        if (!response.ok)
          throw new Error(result.error ?? "Não foi possível carregar o chat.")
        if (active) setMessages(result.messages as SupportRequestChatMessage[])
      } catch (loadError) {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar o chat.",
          )
      }
    }
    void refresh()
    const interval = window.setInterval(() => {
      void refresh()
      void loadConversations().catch(() => undefined)
    }, 5000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [selectedId])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const history = historyRef.current
      if (history)
        history.scrollTo({ top: history.scrollHeight, behavior: "smooth" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messages.length])

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedId === null || !draft.trim()) return
    setSaving(true)
    setError("")
    try {
      const response = await fetch(
        `/api/support/requests/${selectedId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: draft }),
        },
      )
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error ?? "Não foi possível enviar a mensagem.")
      setDraft("")
      await Promise.all([loadConversations(), loadMessages(selectedId)])
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Não foi possível enviar a mensagem.",
      )
    } finally {
      setSaving(false)
    }
  }

  const selected = conversations.find((item) => item.id === selectedId) ?? null

  return (
    <section className="messages-page">
      <div
        className="mb-4 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Tipo de conversa"
      >
        <button
          className="rounded-xl border border-[#e5e5ee] bg-white px-4 py-2.5 text-xs font-extrabold text-[#5556d8]"
          role="tab"
          aria-selected="false"
          onClick={onBack}
          type="button"
        >
          Problemas da jornada
        </button>
        <button
          className="rounded-xl bg-[#5556d8] px-4 py-2.5 text-xs font-extrabold text-white"
          role="tab"
          aria-selected="true"
          type="button"
        >
          Pedidos de suporte
        </button>
      </div>
      {error && (
        <p className="messages-page__error" role="alert">
          {error}
        </p>
      )}
      <div className="messages-layout">
        <aside
          className="messages-inbox"
          aria-label="Caixa de entrada de pedidos de suporte"
        >
          <div className="messages-inbox__heading">
            <strong>Pedidos de suporte</strong>
            <span>
              {conversations.length}{" "}
              {conversations.length === 1 ? "conversa" : "conversas"}
            </span>
          </div>
          {loading ? (
            <p className="messages-inbox__empty">Carregando conversas...</p>
          ) : conversations.length ? (
            <div className="messages-thread-list">
              {conversations.map((item) => {
                const contactName = employee.isHrAdmin
                  ? item.employeeName
                  : "Equipe de RH"
                return (
                  <button
                    className={`messages-thread ${
                      selectedId === item.id ? "messages-thread--active" : ""
                    }`}
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    type="button"
                    aria-current={selectedId === item.id ? "true" : undefined}
                  >
                    <MessagesAvatar
                      employeeId={employee.isHrAdmin ? item.employeeId : null}
                      name={contactName}
                    />
                    <span className="messages-thread__body">
                      <span className="messages-thread__top">
                        <strong>{contactName}</strong>
                        <small>{formatDate(item.lastMessageAt)}</small>
                      </span>
                      <span className="messages-thread__subject">
                        {item.subject}
                      </span>
                      <span className="messages-thread__preview">
                        {item.lastMessage}
                      </span>
                      <span className="messages-thread__bottom">
                        <span
                          className={`messages-status messages-status--${
                            item.status === "resolved" ? "resolved" : "open"
                          }`}
                        >
                          {item.status === "resolved"
                            ? "Concluído"
                            : item.hasChat
                              ? "Em conversa"
                              : "Aguardando início"}
                        </span>
                        <small>
                          {employee.isHrAdmin
                            ? (item.employeeDepartment ?? "Funcionário")
                            : "Onboarding"}
                        </small>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="messages-inbox__empty">
              {employee.isHrAdmin
                ? "Os pedidos gerais aparecerão aqui para iniciar ou continuar uma conversa."
                : "As conversas iniciadas pelo RH aparecerão aqui."}
            </p>
          )}
        </aside>
        {selected ? (
          <article className="messages-case">
            <header className="messages-case__header">
              <div className="messages-person">
                <MessagesAvatar
                  employeeId={employee.isHrAdmin ? selected.employeeId : null}
                  name={
                    employee.isHrAdmin ? selected.employeeName : "Equipe de RH"
                  }
                />
                <div>
                  <strong>
                    {employee.isHrAdmin
                      ? selected.employeeName
                      : "Equipe de RH"}
                  </strong>
                  <small>{selected.subject}</small>
                </div>
              </div>
              <div className="messages-case__actions">
                <span
                  className={`messages-status messages-status--${
                    selected.status === "resolved" ? "resolved" : "open"
                  }`}
                >
                  {selected.status === "resolved"
                    ? "Concluído"
                    : selected.hasChat
                      ? "Em conversa"
                      : "Novo pedido"}
                </span>
              </div>
            </header>
            <section className="messages-case__context">
              <div>
                <span className="messages-case__eyebrow">
                  Pedido geral de suporte
                </span>
                <h2>{selected.subject}</h2>
                <div className="messages-case__meta">
                  <span>{selected.description}</span>
                </div>
              </div>
            </section>
            <MessageHistory
              historyRef={historyRef}
              messages={historyMessages}
              currentEmployeeId={employee.id}
              emptyMessage="Envie a primeira mensagem para iniciar o chat sobre este pedido."
            />
            <form className="messages-reply" onSubmit={sendMessage}>
              <label htmlFor="support-request-reply">
                Responder sobre este pedido
              </label>
              <textarea
                id="support-request-reply"
                maxLength={4000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Escreva uma mensagem..."
              />
              <div className="messages-reply__footer">
                <small>Conversa vinculada ao pedido de suporte</small>
                <button disabled={saving || !draft.trim()} type="submit">
                  {saving
                    ? "Enviando..."
                    : messages.length
                      ? "Enviar mensagem"
                      : "Iniciar chat"}
                </button>
              </div>
            </form>
          </article>
        ) : (
          <article className="messages-case messages-case--empty">
            <div className="messages-empty-icon">
              <Icon name="chat" size={23} />
            </div>
            <h2>Escolha um pedido de suporte</h2>
            <p>
              As conversas gerais com funcionários ficam nesta caixa de entrada.
            </p>
          </article>
        )}
      </div>
    </section>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  })
}
function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default MessagesView
