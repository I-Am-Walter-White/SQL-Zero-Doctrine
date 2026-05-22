# SQL Formatter — Zero Doctrine

A VS Code extension that formats T-SQL stored procedures and queries using a strict, opinionated ruleset. No compromises.

---

## Installation

Install the `.vsix` directly via **Extensions → Install from VSIX**.

Activates automatically on `.sql` files (including `tsql`, `mssql`, `sql-ms` language modes).

---

## Usage

### Format entire file
- **Right-click** in the editor → **SQL Zero Doctrine: Format Document**
- Keyboard: `Ctrl+Shift+Alt+F`
- Command Palette: `SQL Zero Doctrine: Format Document`
- Status bar: click the `ZD` button (appears when a `.sql` file is open)

### Format selection
- Select any SQL text, then **right-click** → **SQL Zero Doctrine: Format Selection**
- Keyboard: `Ctrl+Shift+Alt+G`

Both commands show a **diff preview** before applying — you can review the change and choose Apply or Discard.

`Shift+Alt+F` (VS Code's built-in format shortcut) applies formatting directly without a preview.

---

## The Zero Doctrine Rules

| Rule | Detail |
|------|--------|
| UPPERCASE keywords | All SQL keywords and datatypes are uppercased |
| `dbo.` prefix | All bare table names get a `dbo.` prefix automatically |
| Zero-based column numbering | SELECT columns are commented `--  0`, `--  1`, ..., `-- 10` |
| Aligned column comments | Comment numbers are right-aligned to the widest normal column |
| No `AS` anywhere | Columns use `[Alias]`, tables use `[alias]` — no AS keyword |
| Parenthesized WHERE conditions | Every condition group wrapped in `( )` |
| Multi-line CASE WHEN | WHEN / THEN / ELSE each on their own line, never flattened |
| Inline subqueries formatted | Subqueries inside SELECT, WHERE, functions — fully formatted recursively |
| OVER clause expansion | Window functions with PARTITION BY / ROWS BETWEEN expand to multiple lines |
| TRY / CATCH blocks | BEGIN TRY ... END TRY / BEGIN CATCH ... END CATCH fully structured |
| Modification header | `--***...` block added/updated at the top of every file with original comments preserved and a `Modified by` line |
| Tabs for indentation | Always. No spaces pretending to be tabs. |
| No emotional SQL | Clean, mechanical, consistent. |

---

## What Gets Formatted

- `SELECT` — column alignment, alias extraction, CASE WHEN, window functions, inline subqueries
- `FROM` / `JOIN` — JOIN type alignment, ON condition formatting
- `WHERE` / `HAVING` — condition grouping with `AND` / `OR`, `IN` lists, `EXISTS`, `NOT IN`
- `GROUP BY` / `ORDER BY` / `OFFSET` / `FETCH` — one item per line
- `INSERT INTO` / `VALUES` — one value per line
- `UPDATE` / `SET` — one assignment per line
- `DELETE FROM` — table name preserved correctly
- `MERGE` — full `USING` / `ON` / `WHEN MATCHED` / `WHEN NOT MATCHED` structure
- `IF` / `ELSE IF` / `ELSE` — recursive formatting for chained conditions
- `WHILE` — body formatted as a full proc body, `BREAK` / `CONTINUE` supported
- `BEGIN TRY` / `BEGIN CATCH` — properly nested and indented
- `WITH` (CTE) — each CTE in its own block, column numbers applied inside
- `CREATE TABLE` / `ALTER TABLE` — column definitions one per line
- `DECLARE` — including `@TableVar TABLE (col list)` expanded
- `CREATE` / `ALTER` / `CREATE OR ALTER PROCEDURE` — parameter blocks, proc body
- `EXEC` — 3+ parameters break to one per line
- `SET`, `PRINT`, `RAISERROR`, `THROW` — inline statement formatting
- `USE`, `TRUNCATE`, `GRANT`, `REVOKE`, `WAITFOR`, `CHECKPOINT` — clean passthrough
- Multi-batch files separated by `GO`

---

## Settings

These can be changed per workspace or globally via **File → Preferences → Settings → SQL Zero Doctrine**.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sqlZeroDoctrine.userName` | string | `""` | Your name for the modification header (e.g. `Harsh Sugandhi`). Leave blank to disable the header entirely |
| `sqlZeroDoctrine.inListBreakAt` | number | `4` | Number of items in an `IN(...)` list before it breaks to multiple lines |
| `sqlZeroDoctrine.maxInlineColLen` | number | `80` | Column length threshold before switching to long-column treatment |
| `sqlZeroDoctrine.reorderJoinOn` | boolean | `false` | When `true`, rewrites `ON` conditions so the joined table appears on the left side |

---

## Modification Header

When `sqlZeroDoctrine.userName` is set, every format operation automatically adds or updates a `--***` header block at the top of the file.

**If the file already has header comments** (created by, dated, etc.) they are preserved exactly as written, and a `Modified by` line is appended:

```sql
--***************************************************
--Created by : Saylee
--Dated      : 2-Sep-2022
-- Modified by:     Harsh Sugandhi on 21st May 2026 for Formatting
--***************************************************
```

**If the file has no existing comments**, only the `Modified by` line is added:

```sql
--***************************************************
-- Modified by:     Harsh Sugandhi on 21st May 2026 for Formatting
--***************************************************
```

**Formatting the same file multiple times** is safe — the `Modified by` line updates to today's date but never stacks. The original creation comments are never touched.

**Leave `userName` blank** to disable this behaviour entirely — the formatter runs without adding any header.

---

## Reporting a Bug or Requesting a Feature

Use the built-in feedback command — it opens a pre-filled GitHub issue in your browser with your VS Code version, OS, and extension version already populated.

- **Right-click** in the editor → **SQL Zero Doctrine: Report Bug / Request Feature**
- Keyboard: `Ctrl+Shift+Alt+R`
- Status bar: click the `$(feedback) ZD` button

You can optionally include the SQL that caused the issue. Screenshots can be dragged directly into the GitHub issue.

---

## Architecture

```
extension.js        VS Code command registration + document editing
feedback.js         Feedback command — builds pre-filled GitHub issue URL
formatter.js        Pure formatting logic (no VS Code dependency)
  ├── tokenize()          Lexer — produces typed token stream
  ├── splitIntoClauses()  Groups tokens into clause objects by keyword
  ├── formatClause()      Dispatches each clause to its dedicated formatter
  ├── formatBatch()       Handles a single GO-separated batch
  └── formatSQL()         Entry point — accepts options, splits batches, joins output
```

Zero runtime dependencies. Works completely offline. No network requests, no API calls, no telemetry.

## Version

`1.0.0` — Publisher: **Harsh**