#include "lexer.h"
#include <stdio.h>
#include <string.h>

// NOTE: MESSING WITH THESE REQUIRES MANUAL ASM DICTIONARY CONSTRUCTION (via lexer.emcc.js base64 decoding)
static const char16_t XPORT[] = { 'x', 'p', 'o', 'r', 't' };
static const char16_t MPORT[] = { 'm', 'p', 'o', 'r', 't' };
static const char16_t LASS[] = { 'l', 'a', 's', 's' };
static const char16_t ROM[] = { 'r', 'o', 'm' };
static const char16_t ETA[] = { 'e', 't', 'a' };
static const char16_t SSERT[] = { 's', 's', 'e', 'r', 't' };
static const char16_t VO[] = { 'v', 'o' };
static const char16_t YIE[] = { 'y', 'i', 'e' };
static const char16_t DELE[] = { 'd', 'e', 'l', 'e' };
static const char16_t INSTAN[] = { 'i', 'n', 's', 't', 'a', 'n' };
static const char16_t TY[] = { 't', 'y' };
static const char16_t RETUR[] = { 'r', 'e', 't', 'u', 'r' };
static const char16_t DEBUGGE[] = { 'd', 'e', 'b', 'u', 'g', 'g', 'e' };
static const char16_t AWAI[] = { 'a', 'w', 'a', 'i' };
static const char16_t THR[] = { 't', 'h', 'r' };
static const char16_t WHILE[] = { 'w', 'h', 'i', 'l', 'e' };
static const char16_t FOR[] = { 'f', 'o', 'r' };
static const char16_t IF[] = { 'i', 'f' };
static const char16_t CATC[] = { 'c', 'a', 't', 'c' };
static const char16_t FINALL[] = { 'f', 'i', 'n', 'a', 'l', 'l' };
static const char16_t ELS[] = { 'e', 'l', 's' };
static const char16_t BREA[] = { 'b', 'r', 'e', 'a' };
static const char16_t CONTIN[] = { 'c', 'o', 'n', 't', 'i', 'n' };
static const char16_t SYNC[] = {'s', 'y', 'n', 'c'};
static const char16_t UNCTION[] = {'u', 'n', 'c', 't', 'i', 'o', 'n'};
static const char16_t ONST[] = {'o', 'n', 's', 't'};
static const char16_t ET[] = {'e', 't'};
static const char16_t AR[] = {'a', 'r'};

// Note: parsing is based on the _assumption_ that the source is already valid
bool parse () {
  // stack allocations
  // these are done here to avoid data section \0\0\0 repetition bloat
  // (while gzip fixes this, still better to have ~10KiB ungzipped over ~20KiB)
  OpenToken openTokenStack_[1024];

  openTokenDepth = 0;
  lastTokenPos = (char16_t*)EMPTY_CHAR;
  lastSlashWasDivision = false;
  parse_error = 0;
  has_error = false;
  nextBraceOrParenDestructures = false;
  openTokenStack = &openTokenStack_[0];
  nextBraceIsClass = false;

  pos = (char16_t*)(source - 1);
  char16_t ch = '\0';
  end = pos + sourceLen;

  while (pos++ < end) {
    ch = *pos;

    if (ch == 32 || ch < 14 && ch > 8)
      continue;

    switch (ch) {
      case 'i':
        if (isKeyword(MPORT, 5)) {
          nextBraceOrParenDestructures = true;
        }
        break;
      case 'l':
        if (isKeyword(ET, 2)) {
          nextBraceOrParenDestructures = true;
        }
        break;
      case 'v':
        if (isKeyword(AR, 2)) {
          nextBraceOrParenDestructures = true;
        }
        break;
      case 'c':
        if (isKeyword(ONST, 4)) {
          nextBraceOrParenDestructures = true;
        } else if (isKeyword(LASS, 5)) {
          nextBraceIsClass = true;
        }
        break;
      case '=':
        nextBraceOrParenDestructures = false;
        break;
      case '[':
        openTokenStack[openTokenDepth].token = nextBraceOrParenDestructures ? DestructuringBracket : AnyBracket;
        openTokenStack[openTokenDepth++].pos = lastTokenPos;
        nextBraceOrParenDestructures = false;
        break;
      case ']':
        if (openTokenDepth == 0)
          return syntaxError(), false;
        openTokenDepth--;
        break;
      case '{':
        openTokenStack[openTokenDepth].token =
          nextBraceIsClass
          ? ClassBrace
          : nextBraceOrParenDestructures || *lastTokenPos == '(' || (openTokenDepth > 0 && (openTokenStack[openTokenDepth - 1].token == DestructuringBrace || openTokenStack[openTokenDepth - 1].token == DestructuringBracket))
          ? DestructuringBrace
          : AnyBrace;
        openTokenStack[openTokenDepth++].pos = lastTokenPos;
        nextBraceIsClass = false;
        break;
      case '}':
        if (openTokenDepth == 0)
          return syntaxError(), false;
        switch (openTokenStack[--openTokenDepth].token) {
          case TemplateBrace:
            templateString();
            break;
          case AnyBrace:
            addBlock(openTokenStack[openTokenDepth].pos, pos, ParenBlock);
            break;
          default:
            break;
        }
        break;
      case '\'':
        stringLiteral(ch);
        break;
      case '"':
        stringLiteral(ch);
        break;
      case '/': {
        char16_t next_ch = *(pos + 1);
        if (next_ch == '/') {
          lineComment();
          // dont update lastToken
          continue;
        }
        else if (next_ch == '*') {
          blockComment(true);
          // dont update lastToken
          continue;
        }
        else {
          // Division / regex ambiguity handling based on checking backtrack analysis of:
          // - what token came previously (lastToken)
          // - if a closing brace or paren, what token came before the corresponding
          //   opening brace or paren (lastOpenTokenIndex)
          char16_t lastToken = *lastTokenPos;
          if (isExpressionPunctuator(lastToken) &&
              !(lastToken == '.' && (*(lastTokenPos - 1) >= '0' && *(lastTokenPos - 1) <= '9')) &&
              !(lastToken == '+' && *(lastTokenPos - 1) == '+') && !(lastToken == '-' && *(lastTokenPos - 1) == '-') ||
              lastToken == ')' && isParenKeyword(openTokenStack[openTokenDepth].pos) ||
              lastToken == '}' && (isExpressionTerminator(openTokenStack[openTokenDepth].pos) || openTokenStack[openTokenDepth].token == ClassBrace) ||
              isExpressionKeyword(lastTokenPos) ||
              lastToken == '/' && lastSlashWasDivision ||
              !lastToken) {
            regularExpression();
            lastSlashWasDivision = false;
          }
          else {
            // Final check - if the last token was "break x" or "continue x"
            while (lastTokenPos > source && !isBrOrWsOrPunctuatorNotDot(*(--lastTokenPos)));
            if (isWsNotBr(*lastTokenPos)) {
              while (lastTokenPos > source && isWsNotBr(*(--lastTokenPos)));
              if (isBreakOrContinue(lastTokenPos)) {
                regularExpression();
                lastSlashWasDivision = false;
                break;
              }
            }
            lastSlashWasDivision = true;
          }
        }
        break;
      }
      case '`':
        openTokenStack[openTokenDepth].pos = lastTokenPos;
        openTokenStack[openTokenDepth++].token = Template;
        templateString();
        break;
    }
    lastTokenPos = pos;
  }

  if (openTokenDepth || has_error)
    return false;

  // succeess
  return true;
}

char16_t commentWhitespace (bool br) {
  char16_t ch;
  do {
    ch = *pos;
    if (ch == '/') {
      char16_t next_ch = *(pos + 1);
      if (next_ch == '/')
        lineComment();
      else if (next_ch == '*')
        blockComment(br);
      else
        return ch;
    }
    else if (br ? !isBrOrWs(ch) : !isWsNotBr(ch)) {
      return ch;
    }
  } while (pos++ < end);
  return ch;
}

void templateString () {
  while (pos++ < end) {
    char16_t ch = *pos;
    if (ch == '$' && *(pos + 1) == '{') {
      pos++;
      openTokenStack[openTokenDepth].token = TemplateBrace;
      openTokenStack[openTokenDepth++].pos = pos;
      return;
    }
    if (ch == '`') {
      if (openTokenStack[--openTokenDepth].token != Template)
        syntaxError();
      return;
    }
    if (ch == '\\')
      pos++;
  }
  syntaxError();
}

void blockComment (bool br) {
  pos++;
  while (pos++ < end) {
    char16_t ch = *pos;
    if (!br && isBr(ch))
      return;
    if (ch == '*' && *(pos + 1) == '/') {
      pos++;
      return;
    }
  }
}

void lineComment () {
  while (pos++ < end) {
    char16_t ch = *pos;
    if (ch == '\n' || ch == '\r')
      return;
  }
}

void stringLiteral (char16_t quote) {
  while (pos++ < end) {
    char16_t ch = *pos;
    if (ch == quote)
      return;
    if (ch == '\\') {
      ch = *++pos;
      if (ch == '\r' && *(pos + 1) == '\n')
        pos++;
    }
    else if (isBr(ch))
      break;
  }
  syntaxError();
}

char16_t regexCharacterClass () {
  while (pos++ < end) {
    char16_t ch = *pos;
    if (ch == ']')
      return ch;
    if (ch == '\\')
      pos++;
    else if (ch == '\n' || ch == '\r')
      break;
  }
  syntaxError();
  return '\0';
}

void regularExpression () {
  while (pos++ < end) {
    char16_t ch = *pos;
    if (ch == '/')
      return;
    if (ch == '[')
      ch = regexCharacterClass();
    else if (ch == '\\')
      pos++;
    else if (ch == '\n' || ch == '\r')
      break;
  }
  syntaxError();
}

char16_t readToWsOrPunctuator (char16_t ch) {
  do {
    if (isBrOrWs(ch) || isPunctuator(ch))
      return ch;
  } while (ch = *(++pos));
  return ch;
}

// Note: non-asii BR and whitespace checks omitted for perf / footprint
// if there is a significant user need this can be reconsidered
bool isBr (char16_t c) {
  return c == '\r' || c == '\n';
}

bool isWsNotBr (char16_t c) {
  return c == 9 || c == 11 || c == 12 || c == 32 || c == 160;
}

bool isBrOrWs (char16_t c) {
  return c > 8 && c < 14 || c == 32 || c == 160;
}

bool isBrOrWsOrPunctuatorNotDot (char16_t c) {
  return c > 8 && c < 14 || c == 32 || c == 160 || isPunctuator(c) && c != '.';
}

bool isBrOrWsOrPunctuatorOrSpreadNotDot (char16_t* c) {
  return *c > 8 && *c < 14 || *c == 32 || *c == 160 || isPunctuator(*c) && (isSpread(c) || *c != '.');
}

bool isSpread (char16_t* c) {
  return *c == '.' && *(c - 1) == '.' && *(c - 2) == '.';
}

bool isQuote (char16_t ch) {
  return ch == '\'' || ch == '"';
}

bool keywordStart (char16_t* pos) {
  return pos == source || isBrOrWsOrPunctuatorOrSpreadNotDot(pos - 1);
}

bool readPrecedingKeyword1 (char16_t* pos, char16_t c1) {
  if (pos < source) return false;
  return *pos == c1 && (pos == source || isBrOrWsOrPunctuatorNotDot(*(pos - 1)));
}

bool readPrecedingKeywordn (char16_t* pos, const char16_t* compare, size_t n) {
  if (pos - n + 1 < source) return false;
  return memcmp(pos - n + 1, compare, n * 2) == 0 && (pos - n + 1 == source || isBrOrWsOrPunctuatorOrSpreadNotDot(pos - n));
}

// Detects one of case, debugger, delete, do, else, in, instanceof, new,
//   return, throw, typeof, void, yield ,await
bool isExpressionKeyword (char16_t* pos) {
  switch (*pos) {
    case 'd':
      switch (*(pos - 1)) {
        case 'i':
          // void
          return readPrecedingKeywordn(pos - 2, &VO[0], 2);
        case 'l':
          // yield
          return readPrecedingKeywordn(pos - 2, &YIE[0], 3);
        default:
          return false;
      }
    case 'e':
      switch (*(pos - 1)) {
        case 's':
          switch (*(pos - 2)) {
            case 'l':
              // else
              return readPrecedingKeyword1(pos - 3, 'e');
            case 'a':
              // case
              return readPrecedingKeyword1(pos - 3, 'c');
            default:
              return false;
          }
        case 't':
          // delete
          return readPrecedingKeywordn(pos - 2, &DELE[0], 4);
        case 'u':
          // continue
          return readPrecedingKeywordn(pos - 2, &CONTIN[0], 6);
        default:
          return false;
      }
    case 'f':
      if (*(pos - 1) != 'o' || *(pos - 2) != 'e')
        return false;
      switch (*(pos - 3)) {
        case 'c':
          // instanceof
          return readPrecedingKeywordn(pos - 4, &INSTAN[0], 6);
        case 'p':
          // typeof
          return readPrecedingKeywordn(pos - 4, &TY[0], 2);
        default:
          return false;
      }
    case 'k':
      // break
      return readPrecedingKeywordn(pos - 1, &BREA[0], 4);
    case 'n':
      // in, return
      return readPrecedingKeyword1(pos - 1, 'i') || readPrecedingKeywordn(pos - 1, &RETUR[0], 5);
    case 'o':
      // do
      return readPrecedingKeyword1(pos - 1, 'd');
    case 'r':
      // debugger
      return readPrecedingKeywordn(pos - 1, &DEBUGGE[0], 7);
    case 't':
      // await
      return readPrecedingKeywordn(pos - 1, &AWAI[0], 4);
    case 'w':
      switch (*(pos - 1)) {
        case 'e':
          // new
          return readPrecedingKeyword1(pos - 2, 'n');
        case 'o':
          // throw
          return readPrecedingKeywordn(pos - 2, &THR[0], 3);
        default:
          return false;
      }
  }
  return false;
}

bool isParenKeyword (char16_t* curPos) {
  return readPrecedingKeywordn(curPos, &WHILE[0], 5) ||
      readPrecedingKeywordn(curPos, &FOR[0], 3) ||
      readPrecedingKeywordn(curPos, &IF[0], 2);
}

bool isPunctuator (char16_t ch) {
  // 23 possible punctuator endings: !%&()*+,-./:;<=>?[]^{}|~
  return ch == '!' || ch == '%' || ch == '&' ||
    ch > 39 && ch < 48 || ch > 57 && ch < 64 ||
    ch == '[' || ch == ']' || ch == '^' ||
    ch > 122 && ch < 127;
}

bool isExpressionPunctuator (char16_t ch) {
  // 20 possible expression endings: !%&(*+,-.:;<=>?[^{|~
  return ch == '!' || ch == '%' || ch == '&' ||
    ch > 39 && ch < 47 && ch != 41 || ch > 57 && ch < 64 ||
    ch == '[' || ch == '^' || ch > 122 && ch < 127 && ch != '}';
}

bool isBreakOrContinue (char16_t* curPos) {
  switch (*curPos) {
    case 'k':
      return readPrecedingKeywordn(curPos - 1, &BREA[0], 4);
    case 'e':
      if (*(curPos - 1) == 'u')
        return readPrecedingKeywordn(curPos - 2, &CONTIN[0], 6);
  }
  return false;
}

bool isExpressionTerminator (char16_t* curPos) {
  // detects:
  // => ; ) finally catch else class X
  // as all of these followed by a { will indicate a statement brace
  switch (*curPos) {
    case '>':
      return *(curPos - 1) == '=';
    case ';':
    case ')':
      return true;
    case 'h':
      return readPrecedingKeywordn(curPos - 1, &CATC[0], 4);
    case 'y':
      return readPrecedingKeywordn(curPos - 1, &FINALL[0], 6);
    case 'e':
      return readPrecedingKeywordn(curPos - 1, &ELS[0], 3);
  }
  return false;
}

// if the keyword is pointed to by `pos`, advances the position that amount and returns true
bool isKeyword(const char16_t* suffix, size_t suffix_len) {
  if (keywordStart(pos) && memcmp(pos + 1, suffix, suffix_len * 2) == 0) {
    pos += suffix_len; // suffix_len instead of suffix_len - 1 since the parse loop will have cheked the prefix letter
    return true;
  }

  return false;
}

void bail (uint32_t error) {
  has_error = true;
  parse_error = error;
  pos = end + 1;
}

void syntaxError () {
  has_error = true;
  parse_error = pos - source;
  pos = end + 1;
}
