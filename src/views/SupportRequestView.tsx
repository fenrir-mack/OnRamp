import { useEffect, useState, type FormEvent } from "react";

type SupportRequest = { id: number; category: "question" | "support"; subject: string; description: string; status: "open" | "in_progress" | "resolved"; followUpNote: string | null; submittedAt: string; hasChat: boolean };

function SupportRequestView({ onOpenChat }: { onOpenChat: (requestId: number) => void }) {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [category, setCategory] = useState<"question" | "support">("support");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function loadRequests() {
    const response = await fetch("/api/me/support-requests");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar seus pedidos.");
    setRequests(result.requests as SupportRequest[]);
  }
  useEffect(() => { loadRequests().catch((loadError) => setError(loadError.message)).finally(() => setLoading(false)); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess(false);
    try {
      const response = await fetch("/api/me/support-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, subject, description }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível enviar seu pedido.");
      setRequests((current) => [result as SupportRequest, ...current]); setSubject(""); setDescription(""); setSuccess(true);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível enviar seu pedido."); }
    finally { setSaving(false); }
  }

  return <section className="space-y-7">
    <header><p className="eyebrow">Suporte ao onboarding</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Pedir suporte</h1><p className="mt-2 text-[#777a91]">Envie uma dúvida ou peça ajuda sobre qualquer assunto do seu onboarding.</p></header>
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}{success && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">Seu pedido foi enviado ao RH.</p>}
    <form className="max-w-3xl space-y-4 rounded-2xl border border-[#ececf3] bg-white p-5 shadow-sm sm:p-7" onSubmit={submit}>
      <h2 className="text-lg font-extrabold">Como podemos ajudar?</h2>
      <div className="grid gap-3 sm:grid-cols-2"><label className={`cursor-pointer rounded-xl border p-4 ${category === "support" ? "border-[#7778e8] bg-[#f5f5ff]" : "border-[#e6e6ef]"}`}><input className="mr-2 accent-[#5556d8]" type="radio" checked={category === "support"} onChange={() => setCategory("support")} /><strong className="text-sm">Preciso de ajuda</strong><span className="mt-1 block pl-6 text-xs text-[#777a91]">Algo está impedindo ou dificultando meu onboarding.</span></label><label className={`cursor-pointer rounded-xl border p-4 ${category === "question" ? "border-[#7778e8] bg-[#f5f5ff]" : "border-[#e6e6ef]"}`}><input className="mr-2 accent-[#5556d8]" type="radio" checked={category === "question"} onChange={() => setCategory("question")} /><strong className="text-sm">Tenho uma dúvida</strong><span className="mt-1 block pl-6 text-xs text-[#777a91]">Quero esclarecer algo geral, sem vínculo com uma tarefa.</span></label></div>
      <label className="block text-sm font-bold text-[#55576d]">Assunto<input required maxLength={180} className="mt-2 w-full rounded-xl border border-[#dedee8] p-3 font-normal outline-none focus:border-[#7778e8]" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ex.: acesso às ferramentas" /></label>
      <label className="block text-sm font-bold text-[#55576d]">Detalhes<textarea required maxLength={2000} className="mt-2 min-h-32 w-full resize-y rounded-xl border border-[#dedee8] p-3 font-normal outline-none focus:border-[#7778e8]" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Conte o que aconteceu ou qual é sua dúvida..." /></label>
      <button className="rounded-xl bg-[#5556d8] px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60" disabled={saving} type="submit">{saving ? "Enviando..." : "Enviar pedido"}</button>
    </form>
    <div className="max-w-3xl"><h2 className="text-lg font-extrabold">Seus pedidos</h2>{loading ? <p className="mt-3 text-sm text-[#777a91]">Carregando...</p> : requests.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-[#dedee8] bg-white p-5 text-sm text-[#777a91]">Você ainda não enviou pedidos.</p> : <div className="mt-3 space-y-3">{requests.map((item) => <article className="rounded-xl border border-[#ececf3] bg-white p-4" key={item.id}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-extrabold uppercase tracking-wide text-[#7778d9]">{item.category === "question" ? "Dúvida" : "Pedido de ajuda"}</span><span className="rounded-full bg-[#f3f3f8] px-3 py-1 text-xs font-bold text-[#67697d]">{statusLabel(item.status)}</span></div><h3 className="mt-2 font-extrabold">{item.subject}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-[#777a91]">{item.description}</p>{item.followUpNote && <p className="mt-3 rounded-lg bg-[#f7f7ff] p-3 text-sm text-[#55576d]"><strong>Retorno do RH:</strong> {item.followUpNote}</p>}<button className="mt-3 rounded-lg bg-[#5556d8] px-3 py-2 text-xs font-bold text-white" onClick={() => onOpenChat(item.id)} type="button">{item.hasChat ? "Abrir chat com o RH" : "Conversar com o RH"}</button><small className="mt-3 block text-xs text-[#999bad]">{dateLabel(item.submittedAt)}</small></article>)}</div>}</div>
  </section>;
}

function statusLabel(status: SupportRequest["status"]) { return status === "open" ? "Aguardando RH" : status === "in_progress" ? "Em acompanhamento" : "Concluído"; }
function dateLabel(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
export default SupportRequestView;
