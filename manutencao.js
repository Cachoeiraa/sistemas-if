const DIAS_REPORT = 60;
const PAGINA = "reclamacoes"; // identifica os avisos desta página na planilha

const form = document.getElementById("form-report");
const feedback = document.getElementById("form-feedback");
const btnEnviar = document.getElementById("btn-enviar");
const feed = document.getElementById("feed");
const feedVazio = document.getElementById("feed-vazio");

const modalSenha = document.getElementById("modal-senha");
const formSenha = document.getElementById("form-senha");
const senhaFeedback = document.getElementById("senha-feedback");
const adminPanel = document.getElementById("admin-panel");
const listaAdmin = document.getElementById("lista-admin");
const adminVazio = document.getElementById("admin-vazio");

const CLASSE_TAG = {
  "Manutenção": "report",
  "Reclamação": "perdido",
  "Outro": "achado",
};

let reportsCache = [];

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  btnEnviar.disabled = true;
  btnEnviar.textContent = "Enviando...";
  feedback.hidden = true;

  const dados = Object.fromEntries(new FormData(form).entries());
  delete dados.foto;
  dados.action = "reportar";
  dados.foto = await fotoBase64(form.elements.foto.files[0]);

  try {
    await apiPost(dados);
    feedback.className = "feedback ok";
    feedback.textContent = "Reportada registrada!";
    feedback.hidden = false;
    form.reset();
    setTimeout(carregarFeed, 1500);
  } catch {
    feedback.className = "feedback erro";
    feedback.textContent = "Não deu pra enviar. Tenta de novo.";
    feedback.hidden = false;
  }

  btnEnviar.disabled = false;
  btnEnviar.textContent = "Reportar";
});

function renderReport(r) {
  const criado = new Date(r.criadoEm);
  const expira = new Date(criado.getTime() + DIAS_REPORT * 86400000);
  const foto = r.foto ? `<img src="${escapar(r.foto)}" loading="lazy" alt="Foto do problema">` : "";
  const tipo = r.tipo || "Manutenção";

  return `
    <article class="post">
      ${foto}
      <div class="corpo">
        <span class="tag ${CLASSE_TAG[tipo] || "report"}">${escapar(tipo)}</span>
        <div class="campo"><strong>${escapar(r.titulo)}</strong></div>
        <div class="campo">${escapar(r.descricao)}</div>
        <div class="rodape">Reportada em ${fmtDataBR(r.criadoEm)} — excluída em ${fmtDataBR(expira.toISOString())}</div>
      </div>
    </article>`;
}

async function carregarFeed() {
  try {
    const data = await apiGet({ action: "listarReports" });
    reportsCache = data.reports || [];
    feedVazio.hidden = reportsCache.length > 0;
    feed.innerHTML = reportsCache.map(renderReport).join("");
    if (!adminPanel.hidden) renderAdmin();
  } catch {
    feed.innerHTML = `<p class="vazio">Não foi possível carregar as reportadas.</p>`;
  }
}

// ---- Admin ----

function senhaSalva() {
  return sessionStorage.getItem("senhaAdmin") || "";
}

document.getElementById("btn-admin").addEventListener("click", () => {
  if (senhaSalva()) {
    adminPanel.hidden = false;
    renderAdmin();
    adminPanel.scrollIntoView({ behavior: "smooth" });
  } else {
    senhaFeedback.hidden = true;
    modalSenha.showModal();
  }
});

document.getElementById("btn-senha-cancelar").addEventListener("click", () => modalSenha.close());

formSenha.addEventListener("submit", async (e) => {
  e.preventDefault();
  const senha = formSenha.elements.senha.value;
  try {
    const data = await apiGet({ action: "verificarSenha", senha });
    if (!data.ok) {
      senhaFeedback.className = "feedback erro";
      senhaFeedback.textContent = "Senha incorreta.";
      senhaFeedback.hidden = false;
      return;
    }
    sessionStorage.setItem("senhaAdmin", senha);
    modalSenha.close();
    adminPanel.hidden = false;
    renderAdmin();
  } catch {
    senhaFeedback.className = "feedback erro";
    senhaFeedback.textContent = "Erro ao conectar.";
    senhaFeedback.hidden = false;
  }
});

function renderAdmin() {
  renderAvisosAdmin(PAGINA);
  adminVazio.hidden = reportsCache.length > 0;
  listaAdmin.innerHTML = reportsCache
    .map(
      (r) => `
      <div class="admin-item">
        <div class="info">
          <strong>${escapar(r.titulo)}</strong> — ${escapar(r.tipo || "Manutenção")}
          <small>${fmtDataBR(r.criadoEm)} · ${escapar(r.descricao).slice(0, 80)}${r.descricao && r.descricao.length > 80 ? "…" : ""}</small>
        </div>
        <div class="botoes">
          <button class="btn-perigo btn-mini" data-id="${escapar(r.id)}">Excluir</button>
        </div>
      </div>`
    )
    .join("");
}

listaAdmin.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  if (!confirm("Excluir essa reportada?")) return;
  btn.disabled = true;
  try {
    await apiPost({ action: "excluirReport", id: btn.dataset.id, senha: senhaSalva() });
    setTimeout(carregarFeed, 1200);
  } catch {
    btn.disabled = false;
  }
});

carregarAvisos(PAGINA);
initAvisosAdmin(PAGINA, senhaSalva);
carregarFeed();
