// Uploads every PNG in ../emojis as an application emoji of your bot and prints the value for the ChessEmojis variable.
// Application emojis work in any server the bot is in, no emoji server needed (limit: 2000 per app).
// Usage (Node 18+):  node tools/upload-emojis.mjs YOUR_BOT_TOKEN
// The token only goes to discord.com. Emojis that already exist (same name) are reused, so running it twice is safe.
import { readdir, readFile } from 'node:fs/promises';

const token = process.argv[2] || process.env.DISCORD_TOKEN;
if (!token) { console.error('usage: node tools/upload-emojis.mjs <bot token>'); process.exit(1); }

async function api(path, opt = {}) {
  const r = await fetch('https://discord.com/api/v10' + path, { ...opt, headers: { Authorization: 'Bot ' + token, 'Content-Type': 'application/json' } });
  if (r.status === 429) { const { retry_after } = await r.json(); await new Promise((ok) => setTimeout(ok, retry_after * 1000 + 100)); return api(path, opt); }
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

const app = await api('/applications/@me');
// Emojis are uploaded as mnsa_<name> (mnsa_1k, mnsa_vc…) so they never clash with other emojis of your bot.
// Existing mnsa_ emojis are reused, nothing gets renamed or duplicated. ChessEmojis keeps the short name: the ID is what renders
const PREFIX = 'mnsa_';
const ids = new Map((await api(`/applications/${app.id}/emojis`)).items.filter((e) => e.name.startsWith(PREFIX)).map((e) => [e.name.slice(PREFIX.length), e.id]));
const dir = new URL('../emojis/', import.meta.url);
const names = (await readdir(dir)).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4));
for (const name of names) {
  if (ids.has(name)) continue;
  const image = 'data:image/png;base64,' + (await readFile(new URL(name + '.png', dir))).toString('base64');
  const e = await api(`/applications/${app.id}/emojis`, { method: 'POST', body: JSON.stringify({ name: PREFIX + name, image }) });
  ids.set(name, e.id);
  console.error('uploaded', name);
}
console.error(`\n${names.length} chess emojis ready. Paste the line below as the default value of ChessEmojis:\n`);
// name and ID pairs separated by spaces: 1k 123… 1q 456…
console.log(names.map((n) => `${n} ${ids.get(n)}`).join(' '));
