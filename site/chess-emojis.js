// Sobe os emojis do xadrez como "application emojis" do bot de quem pediu e devolve o valor da variável ChessEmojis
// (pares nome e ID separados por espaço: "1k 123 1q 456 ..."). Usado pela rota POST /bdfd-api/chess-emojis do site-bot.
// O token só existe na memória durante o pedido: não é gravado, não vai pra log e não aparece em mensagem de erro.
// Os limites de envio do Discord contam no token da pessoa; o que protege o NOSSO IP é o limite por IP lá no site-bot
// (a Cloudflare do Discord bloqueia IP com muitos pedidos inválidos, tipo token errado em massa).
const fs = require('fs'), path = require('path');

const DIR = process.env.CHESS_EMOJIS_DIR || path.join(__dirname, '../emojis'); // os 143 PNGs do repositório
const API = 'https://discord.com/api/v10';
// No bot, cada emoji sobe como mnsa_<nome> (mnsa_1k, mnsa_vc…): não colide com emoji de outro projeto chamado 1k ou vc.
// Se mnsa_<nome> já existe, é reaproveitado (nada é renomeado nem duplicado). Na ChessEmojis o nome continua curto: quem mostra é o ID
const PREFIXO = 'mnsa_';
const NOMES = fs.readdirSync(DIR).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort();

// formato de token de bot: três partes separadas por ponto
const tokenValido = (t) => typeof t === 'string' && /^[\w-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(t.trim());

async function api(token, rota, opt = {}, tentativas = 5) {
  const r = await fetch(API + rota, { ...opt, headers: { Authorization: 'Bot ' + token, 'Content-Type': 'application/json' } });
  if (r.status === 429 && tentativas > 0) {
    const { retry_after = 1 } = await r.json().catch(() => ({}));
    await new Promise((ok) => setTimeout(ok, retry_after * 1000 + 250));
    return api(token, rota, opt, tentativas - 1);
  }
  if (r.status === 401) throw Object.assign(new Error('token'), { publico: 'token' });
  if (!r.ok) {
    // a mensagem do Discord vai pra pessoa (ex.: "Maximum number of emojis reached (2000)"); não tem token nela
    const corpo = await r.json().catch(() => ({}));
    const detalhe = [corpo.message, corpo.errors && JSON.stringify(corpo.errors)].filter(Boolean).join(' ').slice(0, 300);
    throw Object.assign(new Error('discord ' + r.status), { publico: 'discord', status: r.status, detalhe });
  }
  return r.json();
}

// passo(evento) recebe { tipo: 'inicio'|'subiu'|'pronto', ... } pra página mostrar o progresso
async function subir(token, passo) {
  token = token.trim();
  const app = await api(token, '/applications/@me');
  const ids = new Map((await api(token, `/applications/${app.id}/emojis`)).items.filter((e) => e.name.startsWith(PREFIXO)).map((e) => [e.name.slice(PREFIXO.length), e.id]));
  const faltam = NOMES.filter((n) => !ids.has(n));
  passo({ tipo: 'inicio', bot: app.name, total: NOMES.length, faltam: faltam.length });
  for (const [k, nome] of faltam.entries()) {
    const image = 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, nome + '.png')).toString('base64');
    const e = await api(token, `/applications/${app.id}/emojis`, { method: 'POST', body: JSON.stringify({ name: PREFIXO + nome, image }) });
    ids.set(nome, e.id);
    passo({ tipo: 'subiu', nome, feitos: NOMES.length - faltam.length + k + 1 });
  }
  passo({ tipo: 'pronto', valor: NOMES.map((n) => `${n} ${ids.get(n)}`).join(' ') });
}

module.exports = { subir, tokenValido, NOMES };
