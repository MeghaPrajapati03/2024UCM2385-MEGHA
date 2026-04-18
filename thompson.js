/**
 * thompson.js
 * Full Thompson's Construction implementation.
 * Parses regex → AST → ε-NFA with detailed step tracking.
 */

'use strict';

/* ═══════════════════════════════════════════════════
   LEXER / TOKENIZER
═══════════════════════════════════════════════════ */
const TokenType = {
  LITERAL: 'LITERAL',
  UNION: 'UNION',       // |
  STAR: 'STAR',         // *
  PLUS: 'PLUS',         // +
  QUES: 'QUES',         // ?
  LPAREN: 'LPAREN',     // (
  RPAREN: 'RPAREN',     // )
  CONCAT: 'CONCAT',     // implicit
  EPSILON: 'EPSILON',   // ε
  EOF: 'EOF',
};

function tokenize(regex) {
  const tokens = [];
  const chars = [...regex];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === '|') tokens.push({ type: TokenType.UNION });
    else if (c === '*') tokens.push({ type: TokenType.STAR });
    else if (c === '+') tokens.push({ type: TokenType.PLUS });
    else if (c === '?') tokens.push({ type: TokenType.QUES });
    else if (c === '(') tokens.push({ type: TokenType.LPAREN });
    else if (c === ')') tokens.push({ type: TokenType.RPAREN });
    else if (c === 'ε' || c === '\\e') tokens.push({ type: TokenType.EPSILON });
    else if (c === '\\') {
      // escape
      i++;
      if (i < chars.length) tokens.push({ type: TokenType.LITERAL, value: chars[i] });
    } else {
      tokens.push({ type: TokenType.LITERAL, value: c });
    }
  }
  tokens.push({ type: TokenType.EOF });
  return tokens;
}

/* Insert explicit concat operators between adjacent tokens */
function insertConcat(tokens) {
  const result = [];
  const canPrecede = [TokenType.LITERAL, TokenType.RPAREN, TokenType.STAR, TokenType.PLUS, TokenType.QUES, TokenType.EPSILON];
  const canFollow  = [TokenType.LITERAL, TokenType.LPAREN, TokenType.EPSILON];

  for (let i = 0; i < tokens.length - 1; i++) {
    result.push(tokens[i]);
    const cur  = tokens[i].type;
    const next = tokens[i + 1].type;
    if (canPrecede.includes(cur) && canFollow.includes(next)) {
      result.push({ type: TokenType.CONCAT });
    }
  }
  result.push(tokens[tokens.length - 1]);
  return result;
}

/* ═══════════════════════════════════════════════════
   RECURSIVE DESCENT PARSER → AST
   Grammar:
     expr   := term ('|' term)*
     term   := factor (CONCAT factor)*
     factor := atom ('*' | '+' | '?')*
     atom   := LITERAL | EPSILON | '(' expr ')'
═══════════════════════════════════════════════════ */
class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }
  peek() { return this.tokens[this.pos]; }
  consume(type) {
    const tok = this.tokens[this.pos++];
    if (type && tok.type !== type) throw new Error(`Expected ${type}, got ${tok.type}`);
    return tok;
  }
  parse() {
    const node = this.parseExpr();
    this.consume(TokenType.EOF);
    return node;
  }
  parseExpr() {
    let node = this.parseTerm();
    while (this.peek().type === TokenType.UNION) {
      this.consume(TokenType.UNION);
      const right = this.parseTerm();
      node = { type: 'union', left: node, right };
    }
    return node;
  }
  parseTerm() {
    let node = this.parseFactor();
    while (this.peek().type === TokenType.CONCAT) {
      this.consume(TokenType.CONCAT);
      const right = this.parseFactor();
      node = { type: 'concat', left: node, right };
    }
    return node;
  }
  parseFactor() {
    let node = this.parseAtom();
    while ([TokenType.STAR, TokenType.PLUS, TokenType.QUES].includes(this.peek().type)) {
      const op = this.consume().type;
      if (op === TokenType.STAR) node = { type: 'star', child: node };
      else if (op === TokenType.PLUS) node = { type: 'plus', child: node };
      else node = { type: 'ques', child: node };
    }
    return node;
  }
  parseAtom() {
    const tok = this.peek();
    if (tok.type === TokenType.LITERAL) {
      this.consume();
      return { type: 'literal', value: tok.value };
    }
    if (tok.type === TokenType.EPSILON) {
      this.consume();
      return { type: 'epsilon' };
    }
    if (tok.type === TokenType.LPAREN) {
      this.consume(TokenType.LPAREN);
      const node = this.parseExpr();
      this.consume(TokenType.RPAREN);
      return node;
    }
    throw new Error(`Unexpected token: ${tok.type} at position ${this.pos}`);
  }
}

/* ═══════════════════════════════════════════════════
   NFA DATA STRUCTURES
═══════════════════════════════════════════════════ */
class NFA {
  constructor() {
    this.states = [];    // [{ id, start, accept, x, y }]
    this.transitions = []; // [{ from, to, label }]  label='ε' or char
    this.startState = null;
    this.acceptState = null;
    this._counter = 0;
  }
  newState(start = false, accept = false) {
    const id = this._counter++;
    const state = { id, start, accept, x: 0, y: 0 };
    this.states.push(state);
    return state;
  }
  addTransition(from, to, label) {
    this.transitions.push({ from: from.id, to: to.id, label });
  }
  getAlphabet() {
    return [...new Set(
      this.transitions.filter(t => t.label !== 'ε').map(t => t.label)
    )].sort();
  }
}

/* ═══════════════════════════════════════════════════
   THOMPSON'S CONSTRUCTION
═══════════════════════════════════════════════════ */
const buildSteps = [];

function thompsonBuild(node, nfa) {
  switch (node.type) {

    case 'literal': {
      const s0 = nfa.newState();
      const s1 = nfa.newState();
      nfa.addTransition(s0, s1, node.value);
      buildSteps.push({
        type: 'literal',
        desc: `Literal "${node.value}": create states q${s0.id}→q${s1.id}`,
        start: s0.id, accept: s1.id
      });
      return { start: s0, accept: s1 };
    }

    case 'epsilon': {
      const s0 = nfa.newState();
      const s1 = nfa.newState();
      nfa.addTransition(s0, s1, 'ε');
      buildSteps.push({
        type: 'literal',
        desc: `Epsilon: create states q${s0.id}→(ε)→q${s1.id}`,
        start: s0.id, accept: s1.id
      });
      return { start: s0, accept: s1 };
    }

    case 'union': {
      const left  = thompsonBuild(node.left,  nfa);
      const right = thompsonBuild(node.right, nfa);
      const s0 = nfa.newState();
      const s1 = nfa.newState();
      nfa.addTransition(s0, left.start,   'ε');
      nfa.addTransition(s0, right.start,  'ε');
      nfa.addTransition(left.accept,  s1, 'ε');
      nfa.addTransition(right.accept, s1, 'ε');
      buildSteps.push({
        type: 'union',
        desc: `Union (|): new start q${s0.id} with ε to q${left.start.id} & q${right.start.id}; accept q${s1.id}`,
        start: s0.id, accept: s1.id
      });
      return { start: s0, accept: s1 };
    }

    case 'concat': {
      const left  = thompsonBuild(node.left,  nfa);
      const right = thompsonBuild(node.right, nfa);
      // merge left.accept into right.start via ε
      nfa.addTransition(left.accept, right.start, 'ε');
      buildSteps.push({
        type: 'concat',
        desc: `Concat: ε-link q${left.accept.id}→q${right.start.id}`,
        start: left.start.id, accept: right.accept.id
      });
      return { start: left.start, accept: right.accept };
    }

    case 'star': {
      const inner = thompsonBuild(node.child, nfa);
      const s0 = nfa.newState();
      const s1 = nfa.newState();
      nfa.addTransition(s0, inner.start, 'ε');
      nfa.addTransition(s0, s1, 'ε');
      nfa.addTransition(inner.accept, inner.start, 'ε');
      nfa.addTransition(inner.accept, s1, 'ε');
      buildSteps.push({
        type: 'star',
        desc: `Kleene*: wrap q${inner.start.id}–q${inner.accept.id} with loop+bypass`,
        start: s0.id, accept: s1.id
      });
      return { start: s0, accept: s1 };
    }

    case 'plus': {
      // a+ = aa*
      const inner1 = thompsonBuild(node.child, nfa);
      const inner2 = thompsonBuild(node.child, nfa);
      // Connect inner1.accept → inner2.start
      nfa.addTransition(inner1.accept, inner2.start, 'ε');
      // Star wrap on inner2
      const s0 = nfa.newState();
      const s1 = nfa.newState();
      nfa.addTransition(s0, inner2.start, 'ε');
      nfa.addTransition(inner2.accept, inner2.start, 'ε');
      nfa.addTransition(inner2.accept, s1, 'ε');
      nfa.addTransition(inner1.start, inner2.start, 'ε');
      buildSteps.push({
        type: 'star',
        desc: `Plus (+): one or more — expand as aa*`,
        start: inner1.start.id, accept: s1.id
      });
      return { start: inner1.start, accept: s1 };
    }

    case 'ques': {
      // a? = a|ε
      const inner = thompsonBuild(node.child, nfa);
      const s0 = nfa.newState();
      const s1 = nfa.newState();
      nfa.addTransition(s0, inner.start, 'ε');
      nfa.addTransition(s0, s1, 'ε');
      nfa.addTransition(inner.accept, s1, 'ε');
      buildSteps.push({
        type: 'union',
        desc: `Optional (?): bypass or take q${inner.start.id}–q${inner.accept.id}`,
        start: s0.id, accept: s1.id
      });
      return { start: s0, accept: s1 };
    }

    default:
      throw new Error('Unknown AST node: ' + node.type);
  }
}

/* ═══════════════════════════════════════════════════
   MAIN ENTRY: regexToNFA
═══════════════════════════════════════════════════ */
function regexToNFA(regex) {
  if (!regex || !regex.trim()) throw new Error('Empty regular expression');

  buildSteps.length = 0;

  // Tokenize + insert explicit concat
  let tokens = tokenize(regex.trim());
  tokens = insertConcat(tokens);

  // Parse to AST
  const parser = new Parser(tokens);
  const ast = parser.parse();

  // Build NFA
  const nfa = new NFA();
  const { start, accept } = thompsonBuild(ast, nfa);

  // Mark start/accept states
  nfa.states.forEach(s => { s.start = false; s.accept = false; });
  start.start  = true;
  accept.accept = true;
  nfa.startState = start.id;
  nfa.acceptState = accept.id;

  return { nfa, steps: [...buildSteps], ast };
}

/* ═══════════════════════════════════════════════════
   ε-CLOSURE & MOVE (for simulation)
═══════════════════════════════════════════════════ */
function epsilonClosure(nfa, stateIds) {
  const closure = new Set(stateIds);
  const stack = [...stateIds];
  while (stack.length) {
    const sid = stack.pop();
    nfa.transitions
      .filter(t => t.from === sid && t.label === 'ε')
      .forEach(t => {
        if (!closure.has(t.to)) {
          closure.add(t.to);
          stack.push(t.to);
        }
      });
  }
  return [...closure].sort((a,b) => a-b);
}

function move(nfa, stateIds, symbol) {
  const result = new Set();
  stateIds.forEach(sid => {
    nfa.transitions
      .filter(t => t.from === sid && t.label === symbol)
      .forEach(t => result.add(t.to));
  });
  return [...result];
}

function simulateNFA(nfa, input) {
  const trace = [];
  let current = epsilonClosure(nfa, [nfa.startState]);
  trace.push({ sym: '—', states: [...current], label: 'start' });

  for (const ch of input) {
    const moved   = move(nfa, current, ch);
    const closed  = epsilonClosure(nfa, moved);
    trace.push({ sym: ch, states: closed });
    current = closed;
  }

  const accepted = current.includes(nfa.acceptState);
  return { accepted, trace };
}

/* Export globals */
window.RegexEngine = {
  regexToNFA,
  epsilonClosure,
  move,
  simulateNFA,
  buildSteps,
};
