# claude-cozy-setup

Meu setup do **Claude Code** (Windows e Linux): uma barra de status com uso de contexto e limites, atalhos que funcionam do jeito que a gente espera e um plugin que mostra as imagens coladas acima do prompt.

```
✦ Sonnet 5.5 │ ctx ▰▰▱▱▱▱▱▱▱▱ 17% 167k/1.0M │ 5h ▰▱▱▱▱▱▱▱▱▱ 13% ↻ 2h01m │ 7d ▰▱▱▱▱▱▱▱▱▱ 10% ↻ 14h31m
```

## O que tem aqui

| Pasta | O que faz |
| --- | --- |
| `statusline/` | Barra de status: contexto (`ctx`), janela de 5 horas (`5h`) e de 7 dias (`7d`), com gradiente violeta → índigo → azul e o tempo até renovar (`↻`). |
| `keybindings/` | `Shift+Enter` pula linha e `Ctrl+Z` desfaz no prompt. |
| `windows-terminal/` | Trechos para o Windows Terminal: faz o `Shift+Enter` chegar ao Claude Code e deixa o `Ctrl+V` colar imagem. |
| `plugins/voidpeek/` | Plugin: uma faixa acima do prompt para cada imagem colada, com tamanho e botão **Abrir**. |
| `plugins/git-changes/` | Plugin: painel de Source Control e Run and Debug no estilo VS Code (veja abaixo). |

## Requisitos

- **Windows 11** com Windows Terminal, ou **Linux** (testado no Ubuntu 24.04 via WSL). No macOS deve funcionar, mas **não foi testado**.
- **Claude Code** recente (o plugin usa o suporte a "mods"; desenvolvi e testei na 2.1.317)
- **Node.js** (a barra de status é um script Node)

## Instalação

### 1. Barra de status e atalhos

```powershell
git clone https://github.com/isp3ct/claude-cozy-setup
cd claude-cozy-setup
node install.js
```

O instalador copia a barra para `~/.claude/statusline.js`, ativa ela no `settings.json` e junta os atalhos com o seu `keybindings.json`. Antes de mexer ele salva uma cópia `.bak` de cada arquivo.

Abra um `claude` novo e a barra aparece em **todos os projetos**.

> A barra de uso (`5h` e `7d`) só aparece para quem tem plano com limites de uso. Sem isso ela mostra `—`.

### 2. Terminal

**Linux:** pule esta parte do Windows Terminal. A barra, os atalhos e o plugin funcionam do mesmo jeito. O `Shift+Enter` depende do terminal: kitty, Ghostty e WezTerm costumam repassar sozinhos, e nos outros o `/terminal-setup` do Claude Code pode resolver. A colagem de imagem usa o atalho padrão do Claude Code.

**Windows Terminal:** abra **Configurações → Abrir arquivo JSON** e junte o conteúdo de [`windows-terminal/settings-snippet.json`](windows-terminal/settings-snippet.json) nas listas `actions` e `keybindings` que já existem.

- **`Shift+Enter`** envia o mesmo sinal do `Ctrl+J`, que o Claude Code entende como "nova linha". Sem isso o Windows Terminal manda `Enter` puro.
- **`Ctrl+V`** passa a ser entregue ao Claude Code, que cola a imagem (`chat:imagePaste`, já incluído no `keybindings.json`). O Windows Terminal, sozinho, não entrega imagem. Para colar **texto** no terminal, use `Ctrl+Shift+V`.

Se você usa outro terminal (Cursor, VS Code), o `/terminal-setup` do Claude Code pode resolver o `Shift+Enter`.

### 3. Plugin `voidpeek`

Dentro do `claude`:

```
/plugin install voidpeek --marketplace isp3ct/claude-cozy-setup
```

Ou, do terminal:

```
claude plugin install voidpeek --marketplace isp3ct/claude-cozy-setup
```

## Como usar o `voidpeek`

1. Copie uma imagem (um print, por exemplo) e cole no prompt com `Ctrl+V` (ou `Alt+V`, o atalho padrão do Claude Code).
2. Acima do prompt aparece uma linha por imagem: `✦ Imagem #1  1207×738 · 68 KB  🔍 Abrir`.
3. Clique em **Abrir**, ou digite `/peek 1`, para ver a imagem em **tamanho real** no visualizador padrão do sistema (Windows: o programa padrão de imagens; Linux: `xdg-open`; macOS: `open`). Sem número, `/peek` abre a última.

Comportamento:

- Ele **não gasta créditos**. Roda tudo na sua máquina e não chama modelo nenhum.
- Ele lê as imagens da pasta temporária do Claude Code: `%TEMP%\claude\<projeto>\<sessão>\images\` no Windows e `/tmp/claude-<uid>/<projeto>/<sessão>/images/` no Linux.
- No **`/clear`**, ele apaga as imagens da sessão que está saindo. Em `/exit` elas ficam.
- As dimensões (`1207×738`) só aparecem em PNG. Em outros formatos aparece só o tamanho do arquivo.

### 4. Plugin `git-changes`

```
/plugin install git-changes --marketplace isp3ct/claude-cozy-setup
```

Painel no estilo VS Code com branch, ahead/behind, *Staged Changes* e *Changes* de cada pasta do `.code-workspace` (ou do repo atual). Clique num arquivo para ver o diff. Cada arquivo tem stage, unstage, discard e *Reveal in File Explorer*. Há também uma faixa *Run and Debug* com launch configs, tasks e scripts do `package.json`. Atualiza a cada 4 s e faz fetch a cada 3 min. Abre com 144 colunas ou mais, ou com `/git-changes`.

## Personalizar

Tudo está no `statusline/statusline.js`:

- **Cores:** o array `stops` define o gradiente, e `DIM`, `TEXT` e `MUTED` definem o resto.
- **Largura da barra:** a constante `CELLS`.
- **O que aparece:** as linhas `parts.push(...)` no final do arquivo.

## Limites conhecidos

- No **Windows** a barra, os atalhos, o snippet do Windows Terminal e o plugin foram usados de verdade, no Windows Terminal com o cmd. O `install.js` eu só rodei no Linux (WSL), com um `HOME` de teste.
- No **Linux** (Ubuntu 24.04 no WSL) eu só confirmei que o plugin carrega e que o `/peek 1` acha a imagem e manda abrir. **Não testei** a faixa visual acima do prompt, o clique no botão, o `xdg-open` abrindo uma janela de verdade nem o apagar no `/clear`.
- Em outros terminais o `Shift+Enter` e o `Ctrl+V` podem precisar de outro ajuste.
- O clique no botão **Abrir** depende de o terminal repassar o mouse. Se não funcionar, use `/peek`.
- O tamanho da letra é do terminal e não dá para mudar pela barra de status.

## Desinstalar

- Barra de status: apague a chave `statusLine` do `~/.claude/settings.json`.
- Atalhos: apague as linhas `shift+enter` e `ctrl+z` do `~/.claude/keybindings.json`.
- Plugins: `/plugin uninstall voidpeek` e `/plugin uninstall git-changes`.
- Windows Terminal: remova a ação e a tecla `shift+enter` que você colou.

Os arquivos `.bak` que o instalador criou guardam como estava antes.

## Contribuir

Este projeto é meu e a `main` é protegida: **ninguém altera o repositório direto**. Para sugerir uma mudança, faça um fork, crie uma branch e abra um **Pull Request**. Eu reviso e decido se entra.

## Licença

[MIT](LICENSE) © 2026 João (isp3ct). Você pode usar, copiar e modificar, mantendo o aviso de copyright.
