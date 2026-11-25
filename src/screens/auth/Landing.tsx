import { Mascot } from "../../ui/Mascot.tsx";

const appFacts = [
  { k: "Pix ou 12x", v: "Pague como já paga no Brasil." },
  { k: "Caução de volta", v: "O valor retorna quando a loja confirma a devolução." },
  { k: "No endereço", v: "O mapa mostra quem entrega até a obra." },
];

const gear = [
  { src: "/img/eq/betoneira.webp", name: "Betoneira", note: "Concreto", wide: true },
  { src: "/img/eq/andaime.webp", name: "Andaime", note: "Altura" },
  { src: "/img/eq/gerador.webp", name: "Gerador", note: "Energia" },
  { src: "/img/eq/compactador.webp", name: "Compactador", note: "Solo" },
  { src: "/img/eq/plataforma.webp", name: "Plataforma", note: "Elevação" },
  { src: "/img/eq/serra.webp", name: "Serra", note: "Corte" },
];

function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Landing({ onSignUp, onSignIn }: { onSignUp: () => void; onSignIn: () => void }) {
  return (
    <main className="absolute inset-0 overflow-y-auto bg-[#f4f1ea] text-[#14161c]">
      <header className="sticky top-0 z-20 flex items-center gap-6 border-b border-transparent bg-[#f4f1ea]/85 px-8 py-3.5 backdrop-blur-xl xl:px-14">
        <button type="button" onClick={() => jump("topo")} className="flex cursor-pointer items-center gap-2">
          <Mascot mood="wave" size={42} />
          <span className="text-[20px] font-bold tracking-[-0.04em]">Obi Ágil</span>
        </button>
        <nav className="ml-4 hidden items-center gap-6 text-[15px] font-semibold text-[#5c616b] xl:flex">
          <button type="button" className="cursor-pointer hover:text-[#14161c]" onClick={() => jump("como")}>
            Como funciona
          </button>
          <button type="button" className="cursor-pointer hover:text-[#14161c]" onClick={() => jump("estoque")}>
            Equipamentos
          </button>
          <button type="button" className="cursor-pointer hover:text-[#14161c]" onClick={() => jump("lojas")}>
            Para locadoras
          </button>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onSignIn} className="h-11 cursor-pointer rounded-full px-4 text-[15px] font-semibold text-[#0a66e0]">
            Entrar
          </button>
          <button type="button" onClick={onSignUp} className="h-11 cursor-pointer rounded-full bg-[#0a66e0] px-5 text-[15px] font-semibold text-white">
            Criar conta
          </button>
        </div>
      </header>

      <section id="topo" className="grid items-center gap-10 px-8 pt-8 pb-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:px-14 xl:pt-6">
        <div>
          <p className="text-[13px] font-bold tracking-[0.16em] text-[#0a66e0] uppercase">Perto da obra</p>
          <h1 className="mt-3 max-w-[11ch] text-[clamp(56px,5.5vw,92px)] leading-[0.9] font-bold tracking-[-0.055em]">
            Diga o endereço. O Obi acha.
          </h1>
          <p className="mt-6 max-w-[38ch] text-[19px] leading-7 text-[#5c616b]">
            Alugue equipamento, contrate um serviço ou anuncie o que você tem. A locadora recebe o pedido no app. Você paga com Pix ou cartão em até 12x.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={onSignUp} className="h-[52px] cursor-pointer rounded-full bg-[#0a66e0] px-6 text-[17px] font-semibold text-white">
              Quero alugar
            </button>
            <button
              type="button"
              onClick={onSignUp}
              className="h-[52px] cursor-pointer rounded-full bg-white px-6 text-[17px] font-semibold shadow-[inset_0_0_0_1px_rgb(20_22_28/0.12)]"
            >
              Anunciar meu estoque
            </button>
          </div>
          <dl className="mt-10 grid max-w-[560px] grid-cols-3 gap-4 border-t border-[#14161c]/10 pt-6">
            {appFacts.map((fact) => (
              <div key={fact.k}>
                <dt className="text-[15px] font-bold tracking-[-0.02em]">{fact.k}</dt>
                <dd className="mt-1 text-[13px] leading-5 text-[#5c616b]">{fact.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative pb-16">
          <div className="relative h-[min(620px,68vh)] overflow-hidden rounded-[40px] bg-[#bfe3f2]">
            <img src="/img/hero.webp" alt="Canteiro de obra com equipamentos" className="size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#12141a]/55 via-transparent to-[#12141a]/10" />
            <p className="absolute bottom-6 left-6 max-w-[16ch] text-[28px] leading-8 font-bold tracking-[-0.04em] text-white">
              Locadoras que entregam até você.
            </p>
          </div>
          <article className="absolute top-8 -right-3 w-[210px] overflow-hidden rounded-[24px] bg-white shadow-[0_24px_50px_-24px_rgb(16_19_26/0.55)] xl:-right-6">
            <img src="/img/eq/betoneira.webp" alt="" className="aspect-[4/3] w-full object-cover" />
            <div className="px-3.5 py-3">
              <p className="text-[15px] font-semibold tracking-[-0.02em]">Betoneira 400 L</p>
              <p className="text-[13px] text-[#5c616b]">R$ 89 por dia · perto da obra</p>
            </div>
          </article>
          <div className="absolute -bottom-2 -left-2 flex items-end xl:-left-8">
            <Mascot mood="wave" size={196} className="mascot-enter shrink-0" />
            <div className="mb-[78px] -ml-1 max-w-[230px] rounded-[22px] rounded-bl-[6px] bg-white px-4 py-3 shadow-[0_18px_40px_-20px_rgb(16_19_26/0.45)]">
              <p className="text-[17px] font-semibold tracking-[-0.02em]">Oi! Eu sou o Obi.</p>
              <p className="mt-0.5 text-[14px] leading-5 text-[#5c616b]">Eu fico de olho no que está livre perto do endereço.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="como" className="scroll-mt-20 px-8 pb-8 xl:px-14">
        <div className="flex items-end justify-between gap-6">
          <h2 className="max-w-[14ch] text-[clamp(36px,3.6vw,60px)] leading-[0.95] font-bold tracking-[-0.045em]">Três passos. Sem cotação por telefone.</h2>
          <Mascot mood="think" size={92} className="hidden shrink-0 xl:block" />
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <article className="rounded-[32px] bg-white p-6">
            <p className="text-[13px] font-bold tracking-[0.14em] text-[#0a66e0]">01</p>
            <h3 className="mt-6 text-[28px] leading-8 font-bold tracking-[-0.04em]">O endereço da obra</h3>
            <p className="mt-3 text-[16px] leading-6 text-[#5c616b]">O mapa mostra locadoras que entregam até você, não uma lista do Brasil inteiro.</p>
          </article>
          <article className="rounded-[32px] bg-[#0a66e0] p-6 text-white">
            <p className="text-[13px] font-bold tracking-[0.14em] text-white/70">02</p>
            <h3 className="mt-6 text-[28px] leading-8 font-bold tracking-[-0.04em]">O equipamento</h3>
            <p className="mt-3 text-[16px] leading-6 text-white/80">Betoneira, andaime, gerador, compactador. Você vê o que está livre e o valor do período.</p>
          </article>
          <article className="rounded-[32px] bg-[#ffc400] p-6">
            <p className="text-[13px] font-bold tracking-[0.14em] text-[#6a4b00]">03</p>
            <h3 className="mt-6 text-[28px] leading-8 font-bold tracking-[-0.04em]">O pagamento</h3>
            <p className="mt-3 text-[16px] leading-6 text-[#3d3420]">Pix ou cartão em até 12x. A caução volta quando a loja confirma a devolução.</p>
          </article>
        </div>
      </section>

      <section className="grid gap-4 px-8 py-8 lg:grid-cols-2 xl:px-14">
        <a
          href="#topo"
          onClick={(event) => {
            event.preventDefault();
            onSignUp();
          }}
          className="group relative block min-h-[420px] overflow-hidden rounded-[36px]"
        >
          <img src="/img/role-cliente.webp" alt="" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#12141a]/80 via-[#12141a]/15 to-transparent" />
          <div className="absolute right-7 bottom-7 left-7 text-white">
            <p className="text-[13px] font-bold tracking-[0.14em] text-white/70 uppercase">Para quem aluga</p>
            <h2 className="mt-2 max-w-[16ch] text-[40px] leading-[1.02] font-bold tracking-[-0.045em]">Peça perto da obra e acompanhe no app.</h2>
          </div>
        </a>
        <a
          href="#lojas"
          onClick={(event) => {
            event.preventDefault();
            jump("lojas");
          }}
          className="group relative block min-h-[420px] overflow-hidden rounded-[36px]"
        >
          <img src="/img/role-empresa.webp" alt="" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#12141a]/80 via-[#12141a]/15 to-transparent" />
          <div className="absolute right-7 bottom-7 left-7 text-white">
            <p className="text-[13px] font-bold tracking-[0.14em] text-white/70 uppercase">Para a locadora</p>
            <h2 className="mt-2 max-w-[16ch] text-[40px] leading-[1.02] font-bold tracking-[-0.045em]">O estoque fica visível. O pedido chega pronto.</h2>
          </div>
        </a>
      </section>

      <section id="estoque" className="scroll-mt-20 px-8 py-10 xl:px-14">
        <p className="text-[13px] font-bold tracking-[0.16em] text-[#0a66e0] uppercase">O que a obra pede</p>
        <h2 className="mt-2 max-w-[16ch] text-[clamp(36px,3.6vw,60px)] leading-[0.95] font-bold tracking-[-0.045em]">O mesmo estoque do app, em tamanho de mesa.</h2>
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:grid-rows-2">
          {gear.map((item) => (
            <figure key={item.name} className={`relative overflow-hidden rounded-[28px] bg-[#e7e2d6] ${item.wide ? "col-span-2 row-span-2 min-h-[280px]" : "min-h-[180px]"}`}>
              <img src={item.src} alt="" className="absolute inset-0 size-full object-cover" />
              <figcaption className="absolute right-3 bottom-3 left-3 flex items-end justify-between rounded-2xl bg-white/92 px-3 py-2 backdrop-blur-md">
                <span className="text-[16px] font-semibold tracking-[-0.02em]">{item.name}</span>
                <span className="text-[13px] text-[#5c616b]">{item.note}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="lojas" className="scroll-mt-20 px-8 py-8 xl:px-14">
        <div className="grid items-center gap-8 overflow-hidden rounded-[40px] bg-[#10131a] px-8 py-10 text-white lg:grid-cols-[1.1fr_0.9fr] lg:px-12 lg:py-14">
          <div>
            <p className="text-[13px] font-bold tracking-[0.16em] text-[#ffc400] uppercase">Painel da loja</p>
            <h2 className="mt-3 max-w-[16ch] text-[clamp(36px,3.4vw,58px)] leading-[0.95] font-bold tracking-[-0.045em]">A locadora para de esperar o telefone.</h2>
            <ul className="mt-8 grid gap-5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {[
                ["Estoque", "Cadastre o que está livre. Foto, preço por dia e caução."],
                ["Pedidos", "Aceite, recuse e converse com quem alugou, no mesmo lugar."],
                ["Balanço", "A taxa fica com a Obi Ágil. O aluguel cai na sua conta."],
              ].map(([title, text]) => (
                <li key={title}>
                  <p className="text-[17px] font-semibold">{title}</p>
                  <p className="mt-1 text-[14px] leading-5 text-white/65">{text}</p>
                </li>
              ))}
            </ul>
            <button type="button" onClick={onSignUp} className="mt-8 h-[52px] cursor-pointer rounded-full bg-[#ffc400] px-6 text-[17px] font-semibold text-[#14161c]">
              Abrir minha loja
            </button>
          </div>
          <div className="relative grid min-h-[320px] place-items-center">
            <div className="absolute size-[280px] rounded-full bg-[#ffc400]/90" />
            <Mascot mood="celebrate" size={250} />
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-end justify-between gap-8 px-8 pt-12 pb-16 xl:px-14">
        <h2 className="max-w-[12ch] text-[clamp(44px,4.6vw,76px)] leading-[0.92] font-bold tracking-[-0.05em]">A obra não espera a cotação.</h2>
        <div className="flex items-end gap-4">
          <Mascot mood="wave" size={120} />
          <button type="button" onClick={onSignIn} className="mb-4 h-[52px] cursor-pointer rounded-full bg-[#14161c] px-6 text-[17px] font-semibold text-white">
            Entrar
          </button>
        </div>
      </section>

      <footer className="flex items-center justify-between gap-4 border-t border-[#14161c]/10 px-8 py-6 text-[14px] text-[#5c616b] xl:px-14">
        <strong className="font-semibold text-[#14161c]">Obi Ágil</strong>
        <p>Aluguel de equipamentos de obra.</p>
      </footer>
    </main>
  );
}

export function AuthShowcase({ onHome }: { onHome: () => void }) {
  return (
    <div className="relative flex min-h-0 flex-col justify-between overflow-hidden bg-[#f4f1ea] px-12 py-10">
      <button type="button" onClick={onHome} className="flex w-fit cursor-pointer items-center gap-2">
        <Mascot mood="wave" size={44} />
        <span className="text-[20px] font-bold tracking-[-0.04em]">Obi Ágil</span>
      </button>
      <div className="relative z-10 max-w-[460px]">
        <Mascot mood="wave" size={150} />
        <h2 className="mt-2 max-w-[12ch] text-[52px] leading-[0.92] font-bold tracking-[-0.05em]">A obra não espera.</h2>
        <p className="mt-4 max-w-[36ch] text-[18px] leading-7 text-[#5c616b]">
          Entre para alugar perto do endereço ou para receber pedidos da sua locadora.
        </p>
      </div>
      <p className="relative z-10 text-[14px] text-[#5c616b]">Pix ou cartão em até 12x. A caução volta na devolução.</p>
      <img src="/img/hero.webp" alt="" className="pointer-events-none absolute -right-10 bottom-0 h-[46%] w-[58%] rounded-tl-[40px] object-cover opacity-90" />
    </div>
  );
}
