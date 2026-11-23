#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <ctype.h>
#include <errno.h>
#include <stdarg.h>
#include "constantfilenames.h"

#define DEFAULT_OUTPUT_FILE "./updatedArmor.json"
#define LINE_BUFFER_SIZE 1024
#define MAX_ENTRIES 64   /* key/value pairs per armor block (largest block in armor.ini has ~25) */
#define MAX_TOKEN 64     /* longest key or value we accept */
#define MAX_NAME 128     /* longest armor block name we accept */

typedef struct {
    char key[MAX_TOKEN];
    char value[MAX_TOKEN];
} Entry;

typedef struct {
    char name[MAX_NAME]; 
    Entry entries[MAX_ENTRIES];
    int count;
} ArmorBlock;

static int warningCount = 0;

static void fatalError(const char* format, ...);
static void warn(int lineNumber, const char* format, ...);
static FILE* errorCheckedFopen(const char* filename, const char* mode);
static char* trim(char* s);
static void stripComment(char* s);
static int nextToken(const char** cursor, char* out, size_t outSize);
static void addEntry(ArmorBlock* block, const char* key, const char* value, int lineNumber);
static void writeJsonString(FILE* out, const char* s);
static void writeBlock(FILE* out, const ArmorBlock* block, int* firstBlock);

/*
    * Updates armor data of units by reading through an armor.ini file and writing it out as a JSON array.
    *
    * The parser is content based rather than offset based. Anything outside of an "Armor <Name>" ... "End"
    * block (header comments, "//----" separators, blank lines) is ignored, so edits to the top of the file
    * or between blocks can no longer break parsing.
    *
    * The output is written to "<outputPath>.tmp" first and renamed over the real file only after the whole
    * run succeeded, so a failed run never leaves a half written or stale-tailed JSON file behind.
    *
    * @param const char* inputPath - path to armor.ini
    * @param const char* outputPath - path of the JSON file to produce
    * @return int - number of armor blocks written. Fatal problems (cannot open/write a file) print an error and exit
*/
int updateArmor(const char* inputPath, const char* outputPath) {
    char tmpPath[1024];
    if (snprintf(tmpPath, sizeof(tmpPath), "%s.tmp", outputPath) >= (int)sizeof(tmpPath)) {
        fatalError("Output path is too long: %s", outputPath);
    }

    FILE* in = errorCheckedFopen(inputPath, "r");
    FILE* out = errorCheckedFopen(tmpPath, "w"); /* "w" truncates, so no stale bytes from earlier runs */

    char raw[LINE_BUFFER_SIZE];
    ArmorBlock block;
    int inBlock = 0;
    int firstBlock = 1;
    int blocksWritten = 0;
    int lineNumber = 0;

    block.count = 0;
    fputs("[\n", out);

    while (fgets(raw, sizeof(raw), in) != NULL) {
        lineNumber++;

        size_t length = strlen(raw);
        if (length == sizeof(raw) - 1 && raw[length - 1] != '\n' && !feof(in)) {
            int c;
            while ((c = fgetc(in)) != '\n' && c != EOF) { } /* discard the rest of the oversized line */
            warn(lineNumber, "line longer than %d characters, skipped", LINE_BUFFER_SIZE - 1);
            continue;
        }

        stripComment(raw);        /* ';' and '//' comments, including the "UNDEFINED 1% ; 0%" style */
        char* line = trim(raw);   /* also removes the \r of CRLF files and tabs/spaces on either side */
        if (*line == '\0') {
            continue;
        }

        char* equals = strchr(line, '=');

        if (equals == NULL) {
            if (strcasecmp(line, "End") == 0) {
                if (inBlock) {
                    writeBlock(out, &block, &firstBlock);
                    blocksWritten++;
                    inBlock = 0;
                } else {
                    warn(lineNumber, "'End' with no open Armor block, ignored");
                }
                continue;
            }

            if (strncasecmp(line, "Armor", 5) == 0 && isspace((unsigned char)line[5])) {
                if (inBlock) {
                    warn(lineNumber, "block '%s' had no 'End' before the next Armor header, closing it", block.name);
                    writeBlock(out, &block, &firstBlock);
                    blocksWritten++;
                    inBlock = 0;
                }
                const char* cursor = line + 5;
                char name[MAX_NAME];
                int status = nextToken(&cursor, name, sizeof(name));
                if (status != 1) {
                    warn(lineNumber, "Armor header without a usable name, block skipped");
                    continue;
                }
                strcpy(block.name, name);
                block.count = 0;
                inBlock = 1;
                continue;
            }

            warn(lineNumber, "unrecognized line ignored: %s", line);
            continue;
        }

        /* From here on the line looks like "Key = Value" */
        if (!inBlock) {
            warn(lineNumber, "key/value line outside of an Armor block, ignored: %s", line);
            continue;
        }

        *equals = '\0';
        char* key = trim(line);
        char* rest = trim(equals + 1);

        if (strcasecmp(key, "Armor") == 0) {
            /* "Armor = DAMAGETYPE  100%" -> key DAMAGETYPE, value "100%" */
            const char* cursor = rest;
            char damageType[MAX_TOKEN];
            char percent[MAX_TOKEN];
            if (nextToken(&cursor, damageType, sizeof(damageType)) != 1 ||
                nextToken(&cursor, percent, sizeof(percent)) != 1) {
                warn(lineNumber, "malformed Armor line in '%s' ignored: %s = %s", block.name, key, rest);
                continue;
            }
            for (char* p = damageType; *p; p++) {
                *p = (char)toupper((unsigned char)*p); /* "Flame" and "FLAME" are the same damage type */
            }
            addEntry(&block, damageType, percent, lineNumber);
        } else {
            /* Other per-block settings such as "DamageScalar = 75%" or "FlankedPenalty = 1.5" */
            if (*key == '\0' || *rest == '\0' || strlen(key) >= MAX_TOKEN || strlen(rest) >= MAX_TOKEN) {
                warn(lineNumber, "malformed setting in '%s' ignored: %s = %s", block.name, key, rest);
                continue;
            }
            addEntry(&block, key, rest, lineNumber);
        }
    }

    if (ferror(in)) {
        fatalError("Read error on %s: %s", inputPath, strerror(errno));
    }
    if (inBlock) {
        warn(lineNumber, "file ended inside block '%s' (missing 'End'), keeping it", block.name);
        writeBlock(out, &block, &firstBlock);
        blocksWritten++;
    }

    fputs("\n]\n", out);
    fclose(in);

    if (fflush(out) != 0 || ferror(out) || fclose(out) != 0) {
        fatalError("Failed while writing %s", tmpPath);
    }
    if (rename(tmpPath, outputPath) != 0) {
        fatalError("Failed to move %s to %s: %s", tmpPath, outputPath, strerror(errno));
    }

    printf("[INFO] Wrote %d armor blocks to %s (%d warnings)\n", blocksWritten, outputPath, warningCount);
    return blocksWritten;
}


/*
    * Adds a key/value pair to a block. If the key already exists (case-insensitive) the later value replaces
    * the earlier one and a warning is printed, since the same damage type listed twice is almost always a copy/paste slip.
    * @param ArmorBlock* block - the block being built
    * @param const char* key - the key, already length checked
    * @param const char* value - the value, already length checked
    * @param int lineNumber - line in the source file, used for warnings
*/
static void addEntry(ArmorBlock* block, const char* key, const char* value, int lineNumber) {
    for (int i = 0; i < block->count; i++) {
        if (strcasecmp(block->entries[i].key, key) == 0) {
            warn(lineNumber, "duplicate '%s' in '%s' (%s -> %s), last one wins", key, block->name, block->entries[i].value, value);
            strcpy(block->entries[i].value, value);
            return;
        }
    }
    if (block->count >= MAX_ENTRIES) {
        warn(lineNumber, "block '%s' has more than %d entries, '%s' dropped", block->name, MAX_ENTRIES, key);
        return;
    }
    strcpy(block->entries[block->count].key, key);
    strcpy(block->entries[block->count].value, value);
    block->count++;
}

/*
    * Writes one block as a JSON object, adding the separating comma before every block except the first.
    * Doing it this way replaces the old lseek(-2) trick for removing trailing commas.
*/
static void writeBlock(FILE* out, const ArmorBlock* block, int* firstBlock) {
    if (!*firstBlock) {
        fputs(",\n", out);
    }
    *firstBlock = 0;

    fputs("  {\n    \"name\": ", out);
    writeJsonString(out, block->name);
    for (int i = 0; i < block->count; i++) {
        fputs(",\n    ", out);
        writeJsonString(out, block->entries[i].key);
        fputs(": ", out);
        writeJsonString(out, block->entries[i].value);
    }
    fputs("\n  }", out);
}

/*
    * Writes a C string as a quoted JSON string, escaping quotes, backslashes and control characters
*/
static void writeJsonString(FILE* out, const char* s) {
    fputc('"', out);
    for (; *s; s++) {
        unsigned char c = (unsigned char)*s;
        if (c == '"' || c == '\\') {
            fputc('\\', out);
            fputc(c, out);
        } else if (c < 0x20) {
            fprintf(out, "\\u%04x", c);
        } else {
            fputc(c, out);
        }
    }
    fputc('"', out);
}

/*
    * Removes leading and trailing whitespace (spaces, tabs, \r, \n) in place
    * @return char* - pointer to the first non-whitespace character inside the same buffer
*/
static char* trim(char* s) {
    while (isspace((unsigned char)*s)) {
        s++;
    }
    char* end = s + strlen(s);
    while (end > s && isspace((unsigned char)end[-1])) {
        end--;
    }
    *end = '\0';
    return s;
}

/*
    * Cuts a line at the first ';' or '//' comment marker, in place
*/
static void stripComment(char* s) {
    for (; *s; s++) {
        if (*s == ';' || (s[0] == '/' && s[1] == '/')) {
            *s = '\0';
            return;
        }
    }
}

/*
    * Copies the next whitespace-delimited token starting at *cursor into out and advances the cursor.
    * @return int - 1 if a token was read, 0 if there are no more tokens, -1 if the token did not fit (it is truncated)
*/
static int nextToken(const char** cursor, char* out, size_t outSize) {
    const char* p = *cursor;
    size_t length = 0;
    int truncated = 0;

    while (isspace((unsigned char)*p)) {
        p++;
    }
    if (*p == '\0') {
        *cursor = p;
        out[0] = '\0';
        return 0;
    }
    while (*p != '\0' && !isspace((unsigned char)*p)) {
        if (length + 1 < outSize) {
            out[length++] = *p;
        } else {
            truncated = 1;
        }
        p++;
    }
    out[length] = '\0';
    *cursor = p;
    return truncated ? -1 : 1;
}

/*
    * Utility function for opening a file. If the file fails to open, it prints an error message and exits the program
*/
static FILE* errorCheckedFopen(const char* filename, const char* mode) {
    FILE* f = fopen(filename, mode);
    if (f == NULL) {
        fatalError("Failed to open file: %s (%s)", filename, strerror(errno));
    }
    return f;
}

/*
    * Prints a printf-style warning with the source line number to stderr and counts it
*/
static void warn(int lineNumber, const char* format, ...) {
    va_list args;
    warningCount++;
    fprintf(stderr, "[WARN] line %d: ", lineNumber);
    va_start(args, format);
    vfprintf(stderr, format, args);
    va_end(args);
    fputc('\n', stderr);
}

/*
    * Prints a printf-style error message to stderr and exits the program
*/
static void fatalError(const char* format, ...) {
    va_list args;
    fprintf(stderr, "[ERROR] ");
    va_start(args, format);
    vfprintf(stderr, format, args);
    va_end(args);
    fputc('\n', stderr);
    exit(1);
}

/*
    * Usage: updatedata [path/to/armor.ini [path/to/output.json]]
    * With no arguments it uses ARMORFILE from constantfilenames.h and ./updatedArmor.json
*/
int main(int argc, char** argv) {
    const char* inputPath = (argc > 1) ? argv[1] : ARMORFILE;
    const char* outputPath = (argc > 2) ? argv[2] : DEFAULT_OUTPUT_FILE;

    printf("[INFO] Starting armor data update from %s\n", inputPath);
    updateArmor(inputPath, outputPath);
    printf("[INFO] Updating armor database\n");
    return 0;
}