import fs from 'fs';
const file = 'tokens.json';
const [,, key, valueRaw] = process.argv;
if (!key || valueRaw === undefined) {
  console.error('Usage: node tokens-set.mjs <key> <value>');
  process.exit(1);
}
if (!fs.existsSync(file)) { console.error('tokens.json not found'); process.exit(1); }
const json = JSON.parse(fs.readFileSync(file, 'utf8'));
let value = valueRaw;

// auto-coerce numbers when possible
if (!isNaN(Number(valueRaw)) && !/^0x/i.test(valueRaw)) value = Number(valueRaw);

// basic hex color guard
if (/(blue|lilac)/.test(key) && !/^#([0-9a-f]{3,8})$/i.test(value)) {
  console.error('Color must be hex like #AABBCC'); process.exit(1);
}
json[key] = value;
fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
console.log('OK:', key, '→', value);
