// Data access. The CrazyGames build embeds every data file in index.html as
// <script type="application/json" data-path="..."> blocks, so the game needs no extra
// requests; the development build (and tests) fetch the same files over HTTP.
const cache = new Map();
export async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const el = document.querySelector(`script[type="application/json"][data-path="${path}"]`);
  let v;
  if (el) v = JSON.parse(el.textContent);
  else { const r = await fetch(path); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); v = await r.json(); }
  cache.set(path, v);
  return v;
}
