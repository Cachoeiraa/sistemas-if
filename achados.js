const DIAS_POST = 5;
const EMOJIS = ["🍅", "😂", "😭", "🤡", "👏", "😱"];

const form = document.getElementById("form-post");
const tipoInput = document.getElementById("tipo");
const btnAchado = document.getElementById("btn-achado");
const btnPerdido = document.getElementById("btn-perdido");
const camposAchado = document.getElementById("campos-achado");
const campoDescricao = document.getElementById("campo-descricao");
const descOpcional = document.getElementById("desc-opcional");
const descricaoInput = form.elements.descricao;
const feedback = document.getElementById("form-feedback");
const btnEnviar = document.getElementById("btn-enviar");
const feed = document.getElementById("feed");
const feedVazio = document.getElementById("feed-vazio");

function definirTipo(tipo) {
  tipoInput.value = tipo;
  const ehAchado = tipo === "achado";

  btnAchado.classList.toggle("ativo", ehAchado);
  btnPerdido.classList.toggle("ativo", !ehAchado);
  btnPerdido.classList.toggle("perdido", !ehAchado);

  // achado: ondeAchou/ondeDeixou obrigatórios, descrição opcional
  // perdido: descrição obrigatória, campos de lugar escondidos
  camposAchado.hidden = !ehAchado;
  form.elements.ondeAchou.required = ehAchado;
  form.elements.ondeAchou.disabled = !ehAchado;
  form.elements.ondeDeixou.required = ehAchado;
  form.elements.ondeDeixou.disabled = !ehAchado;

  descricaoInput.required = !ehAchado;
  descOpcional.hidden = !ehAchado;
  campoDescricao.firstChild.textContent = ehAchado ? "Descrição " : "Descrição * ";
}

btnAchado.addEventListener("click", () => definirTipo("achado"));
btnPerdido.addEventListener("click", () => definirTipo("perdido"));
definirTipo("achado");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  btnEnviar.disabled = true;
  btnEnviar.textContent = "Postando...";
  feedback.hidden = true;

  const dados = Object.fromEntries(new FormData(form).entries());
  delete dados.foto;
  dados.action = "postar";
  dados.foto = await fotoBase64(form.elements.foto.files[0]);

  try {
    await apiPost(dados);
    feedback.className = "feedback ok";
    feedback.textContent = "Postado!";
    feedback.hidden = false;
    form.reset();
    definirTipo("achado");
    setTimeout(carregarFeed, 1500);
  } catch {
    feedback.className = "feedback erro";
    feedback.textContent = "Não deu pra postar. Tenta de novo.";
    feedback.hidden = false;
  }

  btnEnviar.disabled = false;
  btnEnviar.textContent = "Postar";
});

function renderPost(p) {
  const criado = new Date(p.criadoEm);
  const expira = new Date(criado.getTime() + DIAS_POST * 86400000);
  const foto = p.foto ? `<img src="${escapar(p.foto)}" loading="lazy" alt="Foto do item">` : "";

  const linhas =
    p.tipo === "achado"
      ? `
        <div class="campo"><strong>Achado por:</strong> ${escapar(p.nome)}</div>
        <div class="campo"><strong>Onde achou:</strong> ${escapar(p.ondeAchou)}</div>
        <div class="campo"><strong>Onde deixou:</strong> ${escapar(p.ondeDeixou)}</div>
        ${p.descricao ? `<div class="campo"><strong>Descrição:</strong> ${escapar(p.descricao)}</div>` : ""}`
      : `
        <div class="campo"><strong>${escapar(p.nome)}</strong> perdeu:</div>
        <div class="campo">${escapar(p.descricao)}</div>`;

  return `
    <article class="post">
      ${foto}
      <div class="corpo">
        <span class="tag ${p.tipo}">${p.tipo === "achado" ? "Achado" : "Perdido"}</span>
        ${linhas}
        ${renderReacoes(p)}
        <div class="rodape">Postado em ${fmtDataBR(p.criadoEm)} — some em ${fmtDataBR(expira.toISOString())}</div>
      </div>
    </article>`;
}

function renderReacoes(p) {
  let reacoes = {};
  try { reacoes = JSON.parse(p.reacoes || "{}"); } catch {}
  const botoes = EMOJIS.map((emoji) => {
    const n = reacoes[emoji] || 0;
    const reagiu = localStorage.getItem("reagiu_" + p.id + "_" + emoji);
    return `<button type="button" class="reacao${reagiu ? " reagiu" : ""}" data-id="${escapar(p.id)}" data-emoji="${emoji}">${emoji}<span>${n || ""}</span></button>`;
  }).join("");
  return `<div class="reacoes">${botoes}</div>`;
}

feed.addEventListener("click", async (e) => {
  const btn = e.target.closest("button.reacao");
  if (!btn || btn.classList.contains("reagiu")) return;
  const { id, emoji } = btn.dataset;

  // marca na hora e já soma +1 (otimista), sem esperar o servidor
  btn.classList.add("reagiu");
  localStorage.setItem("reagiu_" + id + "_" + emoji, "1");
  const span = btn.querySelector("span");
  span.textContent = (parseInt(span.textContent) || 0) + 1;

  try {
    await apiPost({ action: "reagir", id, emoji });
  } catch {}
});

async function carregarFeed() {
  try {
    const data = await apiGet({ action: "listarPosts" });
    const posts = data.posts || [];
    feedVazio.hidden = posts.length > 0;
    feed.innerHTML = posts.map(renderPost).join("");
  } catch {
    feed.innerHTML = `<p class="vazio">Não foi possível carregar os posts.</p>`;
  }
}

carregarFeed();
