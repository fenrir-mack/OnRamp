import "../styles/auth.css";
import { useState } from "react";
import type { FormEvent } from "react";
import { Brand, Icon } from "./shared";

function Login({ onLogin }: { onLogin: () => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    window.setTimeout(onLogin, 450);
  }

  return (
    <main className="min-h-screen bg-[#f8f8fc] p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1440px] overflow-hidden rounded-[28px] bg-white shadow-[0_20px_70px_rgba(38,40,82,0.1)] sm:min-h-[calc(100vh-2.5rem)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-[#5556d8] p-14 text-white lg:flex lg:flex-col">
          <div className="absolute -right-36 -top-28 size-[450px] rounded-full border-[80px] border-white/5" />
          <div className="absolute -bottom-44 -left-36 size-[500px] rounded-full bg-[#7475ed]/50 blur-sm" />
          <Brand light />
          <div className="relative z-10 my-auto max-w-xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold">
              <Icon name="sparkle" size={16} />
              Sua jornada começa aqui
            </div>
            <h1 className="text-5xl font-extrabold leading-[1.12] tracking-[-0.04em]">
              Tudo que você precisa para começar bem.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-indigo-100">
              Informações, pessoas e próximos passos reunidos em um só lugar para uma chegada mais leve e conectada.
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-[440px]">
            <div className="mb-12 lg:hidden"><Brand /></div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-[#5b5ce2]">Bem-vindo</p>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#20223a] sm:text-4xl">Acesse a plataforma</h2>
            <p className="mt-3 text-[#70738e]">Entre com seu e-mail corporativo para começar sua jornada de onboarding.</p>
            <form className="auth-form mt-9 space-y-5" onSubmit={submit}>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-[#34364e]">E-mail corporativo</span>
                <div className="auth-form__field">
                  <Icon name="mail" size={19} />
                  <input required defaultValue="ana.silva@empresa.com" type="email" aria-label="E-mail corporativo" />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-[#34364e]">Senha</span>
                <div className="auth-form__field">
                  <Icon name="lock" size={19} />
                  <input required defaultValue="boasvindas" type={showPassword ? "text" : "password"} aria-label="Senha" />
                  <button className="text-xs font-bold text-[#5b5ce2]" onClick={() => setShowPassword(!showPassword)} type="button">
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </label>
              <div className="flex items-center justify-between gap-4">
                <label className="flex cursor-pointer items-center gap-3 text-sm text-[#60637c]">
                  <input className="size-4 accent-[#5b5ce2]" type="checkbox" defaultChecked />
                  Manter-me conectado
                </label>
                <button className="text-sm font-bold text-[#5b5ce2] hover:text-[#4546bd]" type="button">Esqueci minha senha</button>
              </div>
              <button className="button-primary w-full" disabled={loading} type="submit">
                {loading ? "Entrando..." : "Entrar na plataforma"}
                {!loading && <Icon name="arrow" size={19} />}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

export default Login;
