# AutomataLab — RegEx → Finite Automaton Visualizer

> An interactive web tool that converts regular expressions into ε-NFA and DFA using **Thompson's Construction** and **Subset (Powerset) Construction**, with live canvas visualization.

---

## 📸 Features

- **Thompson's Construction** — Parses regex to AST, builds ε-NFA step-by-step
- **Subset Construction** — Converts ε-NFA → DFA automatically
- **Force-directed graph layout** with BFS layering + physics simulation
- **Pan & zoom** (mouse drag, scroll wheel, pinch-to-zoom on touch)
- **String simulation** — test input strings with step-by-step state trace
- **Batch testing** — paste multiple strings, get ACCEPT/REJECT for all
- **Transition tables** — full ε-NFA and DFA tables side-by-side
- **Construction step log** — see each union/concat/star/literal operation

---

## 🚀 Getting Started

No build step. No server. No dependencies.

```bash
# Just open the file in any modern browser
open index.html
```

Or double-click `index.html` directly.

---

## 📁 Project Structure

```
regex-automata/
├── index.html              ← Main app shell & layout
├── css/
│   └── style.css           ← Dark sci-fi UI theme (CSS variables, animations)
└── js/
    ├── thompson.js         ← Lexer, Parser, Thompson's Construction engine
    ├── subset.js           ← Subset (Powerset) NFA→DFA + DFA layout
    ├── renderer.js         ← Canvas renderer (force layout, pan/zoom, drawing)
    └── app.js              ← Main controller (wires all modules together)
```

---

## 🔣 Supported Regex Syntax

| Operator | Symbol | Example | Meaning |
|----------|--------|---------|---------|
| Literal | `a` | `a` | Match character `a` |
| Concatenation | (implicit) | `ab` | Match `a` then `b` |
| Union | `\|` | `a\|b` | Match `a` or `b` |
| Kleene Star | `*` | `a*` | Zero or more `a` |
| Plus | `+` | `a+` | One or more `a` |
| Optional | `?` | `a?` | Zero or one `a` |
| Grouping | `()` | `(ab)*` | Group sub-expression |
| Epsilon | `ε` | `ε` | Empty string |

### Preset Examples

| Regex | Language Description |
|-------|----------------------|
| `(a\|b)*abb` | Strings over {a,b} ending in `abb` |
| `a(b\|c)*d` | Starts with `a`, ends with `d` |
| `(0\|1)*00` | Binary strings ending in `00` |
| `a+b?c*` | One or more `a`, optional `b`, any `c` |
| `(ab\|cd)*e` | Alternating `ab`/`cd` blocks ending in `e` |

---

## 🧠 How It Works

### 1. Lexer & Parser
The regex string is tokenized, explicit concatenation operators are inserted, then parsed into an Abstract Syntax Tree (AST) using a recursive descent parser.

```
Grammar:
  expr   := term ('|' term)*
  term   := factor (CONCAT factor)*
  factor := atom ('*' | '+' | '?')*
  atom   := LITERAL | EPSILON | '(' expr ')'
```

### 2. Thompson's Construction (ε-NFA)
Each AST node is recursively converted to a small NFA fragment using Thompson's rules:

- **Literal** `a` → two states with a single `a`-transition
- **Concatenation** `AB` → ε-link accept of A to start of B
- **Union** `A|B` → new start with ε to both, new accept from both
- **Kleene Star** `A*` → loop back + bypass via ε-transitions
- **Plus** `A+` → expanded as `AA*`
- **Optional** `A?` → expanded as `A|ε`

### 3. Subset Construction (DFA)
The ε-NFA is converted to a DFA by tracking sets of NFA states:

1. Compute **ε-closure** of start state → first DFA state
2. For each DFA state and input symbol, compute **move** then **ε-closure**
3. Repeat until no new DFA states are created

### 4. Simulation
- **NFA simulation** uses ε-closure + move at each step
- **DFA simulation** follows single transitions deterministically
- Both produce a step-by-step state trace for visualization

---

## 🎛️ UI Guide

### Tabs

| Tab | Description |
|-----|-------------|
| **ε-NFA** | View ε-NFA graph, state info, and construction steps |
| **DFA** | View converted DFA with NFA→DFA state mapping |
| **Simulate** | Test strings one-by-one or in batch |
| **Tables** | See full ε-NFA and DFA transition tables |

### Canvas Controls

| Control | Action |
|---------|--------|
| Drag | Pan the graph |
| Scroll wheel | Zoom in/out |
| `+` / `−` buttons | Zoom in/out |
| `⊡` button | Fit all states into view |
| `↺` button | Re-run force layout |

### Visual Legend

| Element | Meaning |
|---------|---------|
| **Amber border** circle | Start state (`→`) |
| **Green double** circle | Accept state (`*`) |
| **Cyan border** circle | Normal state |
| **Dashed purple** arrow | ε-transition (animated) |
| **Solid cyan** arrow | Literal transition |
| **Gold glow** | Currently highlighted states (during simulation) |

---

## 📊 Complexity Notes

| Property | ε-NFA | DFA (worst case) |
|----------|-------|------------------|
| States | O(n) where n = regex length | O(2ⁿ) NFA states |
| Transitions | O(n) | O(2ⁿ · \|Σ\|) |
| Construction | O(n) | O(2ⁿ) |
| Simulation | O(n · \|Q\|) | O(n) |

In practice, DFA state explosion is rare for typical academic regexes.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | Vanilla HTML5 + CSS3 |
| Rendering | HTML5 Canvas 2D API |
| Logic | Vanilla JavaScript (ES6+) |
| Fonts | JetBrains Mono, Syne (Google Fonts) |
| Build | None — zero dependencies |

---

## 📚 References

- Hopcroft, J., Motwani, R., Ullman, J. — *Introduction to Automata Theory, Languages, and Computation*
- Thompson, K. (1968) — *Regular Expression Search Algorithm*, CACM
- Dragon Book — Aho, Lam, Sethi, Ullman — *Compilers: Principles, Techniques, and Tools*

---

## 📝 License

MIT — free for academic and personal use.

---

*Built as a Computer Science Theory visualization project demonstrating the equivalence between Regular Expressions and Finite Automata.*
