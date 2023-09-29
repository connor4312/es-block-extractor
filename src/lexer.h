#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

typedef unsigned short char16_t;
extern unsigned char __heap_base;

const char16_t __empty_char = '\0';
const char16_t* EMPTY_CHAR = &__empty_char;
const char16_t* source = (void*)&__heap_base;

void setSource (void* ptr) {
  source = ptr;
}

enum BlockKind {
  ParenBlock,
  CurlyBlock,
};

struct Block {
  const char16_t *start;
  const char16_t *end;
  enum BlockKind kind;
  struct Block *next;
};
typedef struct Block Block;

// Paren = odd, Brace = even
enum OpenTokenState {
  AnyParen = 1, // (
  AnyBrace = 2, // {
  Template = 3, // `
  TemplateBrace = 4, // ${
  ImportParen = 5, // import(),
  ClassBrace = 6,
  AnyBracket = 7, // [
  DestructuringBracket = 8, // [ that destructures
  DestructuringBrace = 9, // { that destructures
};

struct OpenToken {
  enum OpenTokenState token;
  char16_t* pos;
};
typedef struct OpenToken OpenToken;

struct Export {
  const char16_t* start;
  const char16_t* end;
  const char16_t* local_start;
  const char16_t* local_end;
  struct Export* next;
};
typedef struct Export Export;

Block *first_block = NULL;
Block *block_read_head = NULL;
Block *block_write_head = NULL;
Block *block_write_head_last = NULL;
uint32_t block_count = 0;
void *analysis_base;
void *analysis_head;
bool nextBraceOrParenDestructures;

bool lastSlashWasDivision;
bool inDeclarationStatement;
uint16_t openTokenDepth;
char16_t *lastTokenPos;
char16_t *pos;
char16_t *end;
OpenToken *openTokenStack;
bool nextBraceIsClass;

// Memory Structure:
// -> source
// -> analysis starts after source
uint32_t parse_error;
bool has_error = false;
uint32_t sourceLen = 0;

void bail (uint32_t err);

// allocateSource
const char16_t* sa (uint32_t utf16Len) {
  sourceLen = utf16Len;
  const char16_t *sourceEnd = source + utf16Len + 1;
  // ensure source is null terminated
  *(char16_t *)(source + utf16Len) = '\0';
  analysis_base = (void *)sourceEnd;
  analysis_head = analysis_base;
  first_block = NULL;
  block_write_head = NULL;
  block_read_head = NULL;
  block_count = 0;
  return source;
}

void addBlock(const char16_t *start, const char16_t *end, enum BlockKind kind) {
  Block *import = (Block *)(analysis_head);
  analysis_head = analysis_head + sizeof(Block);
  if (block_write_head == NULL)
    first_block = import;
  else
    block_write_head->next = import;
  block_write_head_last = block_write_head;
  block_write_head = import;
  import->start = start;
  import->end = end;
  import->kind = kind;
  import->next = NULL;
  block_count++;
}

// getErr
uint32_t e() { return parse_error; }

// getBlockCount
uint32_t bc() { return block_count; }
// getBlockStart
uint32_t bs() { return block_read_head->start - source; }
// getBlockEnd
uint32_t be() { return block_read_head->end - source; }
// getBlockEnd
uint32_t bk() { return (uint32_t)block_read_head->kind ; }
// readBlock
bool rb () {
  if (block_read_head == NULL)
    block_read_head = first_block;
  else
    block_read_head = block_read_head->next;
  if (block_read_head == NULL)
    return false;
  return true;
}

bool parse();

void tryParseImportStatement ();
void tryParseExportStatement ();

void readImportString (const char16_t* ss, char16_t ch);
char16_t readExportAs (char16_t* startPos, char16_t* endPos);
bool isKeyword(const char16_t* suffix, size_t suffix_len);

char16_t commentWhitespace (bool br);
void regularExpression ();
void templateString ();
void blockComment (bool br);
void lineComment ();
void stringLiteral (char16_t quote);

char16_t readToWsOrPunctuator (char16_t ch);

bool isQuote (char16_t ch);

bool isBr (char16_t c);
bool isWsNotBr (char16_t c);
bool isBrOrWs (char16_t c);
bool isBrOrWsOrPunctuator (char16_t c);
bool isSpread (char16_t* c);
bool isBrOrWsOrPunctuatorNotDot (char16_t c);

bool readPrecedingKeyword1(char16_t* pos, char16_t c1);
bool readPrecedingKeywordn(char16_t* pos, const char16_t* compare, size_t n);

bool isBreakOrContinue (char16_t* curPos);

bool keywordStart (char16_t* pos);
bool isExpressionKeyword (char16_t* pos);
bool isParenKeyword (char16_t* pos);
bool isPunctuator (char16_t charCode);
bool isExpressionPunctuator (char16_t charCode);
bool isExpressionTerminator (char16_t* pos);

void nextChar (char16_t ch);
void nextCharSurrogate (char16_t ch);
char16_t readChar ();

void syntaxError ();
