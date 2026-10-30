const DIAS_REPORT = 60;

const form = document.getElementById("form-report");
const feedback = document.getElementById("form-feedback");
const btnEnviar = document.getElementById("btn-enviar");
const feed = document.getElementById("feed");
const feedVazio = document.getElementById("feed-vazio");

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

  return `
    <article class="post">
      ${foto}
      <div class="corpo">
        <span class="tag report">Manutenção</span>
        <div class="campo"><strong>${escapar(r.titulo)}</strong></div>
        <div class="campo">${escapar(r.descricao)}</div>
        <div class="rodape">Reportada em ${fmtDataBR(r.criadoEm)} — excluída em ${fmtDataBR(expira.toISOString())}</div>
      </div>
    </article>`;
}

async function carregarFeed() {
  try {
    const data = await apiGet({ action: "listarReports" });
    const reports = data.reports || [];
    feedVazio.hidden = reports.length > 0;
    feed.innerHTML = reports.map(renderReport).join("");
  } catch {
    feed.innerHTML = `<p class="vazio">Não foi possível carregar as reportadas.</p>`;
  }
}

carregarFeed();
