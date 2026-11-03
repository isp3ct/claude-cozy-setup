#!/usr/bin/env node
// Instala a barra de status e os atalhos do Claude Code em ~/.claude.
// Uso:  node install.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const here = __dirname;
const claudeDir = path.join(os.homedir(), '.claude');
fs.mkdirSync(claudeDir, { recursive: true });

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const backup = (file) => {
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
};

// 1) barra de status
const statuslineDest = path.join(claudeDir, 'statusline.js');
fs.copyFileSync(path.join(here, 'statusline', 'statusline.js'), statuslineDest);

const settingsFile = path.join(claudeDir, 'settings.json');
backup(settingsFile);
const settings = readJson(settingsFile, {});
settings.statusLine = {
  type: 'command',
  command: `node "${statuslineDest.split(path.sep).join('/')}"`,
};
fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
console.log('✔ barra de status instalada');

// 2) atalhos (junta com o que você já tem)
const keysFile = path.join(claudeDir, 'keybindings.json');
backup(keysFile);
const mine = readJson(path.join(here, 'keybindings', 'keybindings.json'), { bindings: [] });
const keys = readJson(keysFile, { bindings: [] });
if (!Array.isArray(keys.bindings)) keys.bindings = [];
keys.$schema = keys.$schema || mine.$schema;
keys.$docs = keys.$docs || mine.$docs;
for (const block of mine.bindings) {
  const existing = keys.bindings.find((b) => b.context === block.context);
  if (existing) existing.bindings = { ...existing.bindings, ...block.bindings };
  else keys.bindings.push(block);
}
fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2));
console.log('✔ atalhos instalados (Shift+Enter e Ctrl+Z)');

// 3) o que sobra é manual
console.log(`
Faltam passos manuais:

1) Só no Windows Terminal: mescle windows-terminal/settings-snippet.json no
   settings.json do terminal (Shift+Enter para pular linha).

2) Plugin do preview de imagens, dentro do Claude Code:
   /plugin install voidpeek --marketplace isp3ct/claude-cozy-setup

Abra um "claude" novo para ver a barra.
`);
