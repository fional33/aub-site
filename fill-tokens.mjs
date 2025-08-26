import fs from 'fs';
const TOK = JSON.parse(fs.readFileSync('tokens.json','utf8'));

// map of simple variable replacements inside :root{...}
const varReplacements = [
  [/--blue:\s*#[0-9A-Fa-f]{3,8}/g,         `--blue: ${TOK.blue}`],
  [/--lilac:\s*#[0-9A-Fa-f]{3,8}/g,        `--lilac: ${TOK.lilac}`],
  [/--scan-op:\s*[0-9.]+/g,                `--scan-op: ${TOK.scan}`], // some files use --scan-op
  [/--scan:\s*[0-9.]+/g,                   `--scan: ${TOK.scan}`],    // some files use --scan
  [/--maxw:\s*[0-9.]+px/g,                 `--maxw: ${TOK.maxw}px`],
  [/--lh:\s*[0-9.]+/g,                     `--lh: ${TOK.lh}`]
];

// gradients (H1/H2/H3) — replace the rgba(..., <opacity>) numbers only
function setOpacity(block, target, newOp) {
  // two color stops per block (blue and lilac); keep colors, change trailing .xx
  return block
    .replace(/rgba\(125,?\s*211,?\s*252,?\s*0?\.[0-9]+\)/g, `rgba(125,211,252,${newOp})`)
    .replace(/rgba\(192,?\s*132,?\s*252,?\s*0?\.[0-9]+\)/g, `rgba(192,132,252,${newOp})`);
}

function processFile(path) {
  if (!fs.existsSync(path)) return;
  let s = fs.readFileSync(path, 'utf8');

  // 1) root variables
  for (const [re, rep] of varReplacements) s = s.replace(re, rep);

  // 2) heading hologram intensities
  s = s.replace(/h1\s*\{[^}]*\}/g, m => setOpacity(m, 'h1', TOK.h1_opacity));
  s = s.replace(/h2\s*\{[^}]*\}/g, m => setOpacity(m, 'h2', TOK.h2_opacity));
  s = s.replace(/h3\s*\{[^}]*\}/g, m => setOpacity(m, 'h3', TOK.h3_opacity));

  fs.writeFileSync(path, s);
  console.log('Filled tokens →', path);
}

processFile('legal/index.html');
processFile('terms/index.html');
