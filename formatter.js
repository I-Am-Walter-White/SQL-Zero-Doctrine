'use strict';

const INDENT = '\t';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// KEYWORDS & DATATYPES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const KEYWORDS = new Set([
	'ADD','ALL','ALTER','AND','ANY','AS','ASC','AUTHORIZATION',
	'BACKUP','BEGIN','BETWEEN','BREAK','BROWSE','BULK','BY',
	'CASCADE','CASE','CHECK','CHECKPOINT','CLOSE','CLUSTERED','COALESCE',
	'COLLATE','COLUMN','COMMIT','COMPUTE','CONSTRAINT','CONTAINS',
	'CONTINUE','CONVERT','CREATE','CROSS','CURRENT','CURSOR',
	'DATABASE','DBCC','DEALLOCATE','DECLARE','DEFAULT','DELETE','DENY',
	'DESC','DISK','DISTINCT','DISTRIBUTED','DROP',
	'ELSE','END','ENCRYPTION','ERRLVL','ESCAPE','EXCEPT','EXEC','EXECUTE','EXISTS','EXIT',
	'FETCH','FILE','FILLFACTOR','FOR','FOREIGN','FROM','FULL','FUNCTION',
	'GOTO','GRANT','GROUP',
	'HAVING','HOLDLOCK',
	'IDENTITY','IF','IN','INDEX','INNER','INSERT','INTERSECT','INTO','IS',
	'JOIN',
	'KEY','KILL',
	'LEFT','LIKE','LOAD',
	'MERGE',
	'NOT','NULL','NULLIF',
	'OF','OFF','ON','OPEN','OPENQUERY','OPENROWSET','OPENXML','OPTION','OR','ORDER','OUTER','OVER',
	'PARTITION','PERCENT','PIVOT','PLAN','PRIMARY','PRINT','PROC','PROCEDURE',
	'RAISERROR','READ','RECOMPILE','REFERENCES','REPLICATION','RESTORE','RETURN','REVOKE','RIGHT','ROLLBACK',
	'SAVE','SCHEMA','SELECT','SET','SHUTDOWN','SOME',
	'TABLE','THEN','TO','TOP','TRAN','TRANSACTION','TRIGGER','TRUNCATE',
	'UNION','UNIQUE','UNPIVOT','UPDATE','USE',
	'VALUES','VIEW',
	'WAITFOR','WHEN','WHERE','WHILE','WITH',
	'ROW_NUMBER','RANK','DENSE_RANK','NTILE','FIRST_VALUE','LAST_VALUE','LAG','LEAD',
	'CAST','ISNULL','IIF','CHOOSE',
	'COUNT','SUM','AVG','MIN','MAX','STDEV','VAR',
	'GETDATE','GETUTCDATE','SYSDATETIME','DATEADD','DATEDIFF','DATENAME','DATEPART','EOMONTH',
	'LEN','SUBSTRING','CHARINDEX','PATINDEX','STUFF','REPLACE',
	'UPPER','LOWER','LTRIM','RTRIM','TRIM','FORMAT','CONCAT','STRING_AGG',
	'ABS','CEILING','FLOOR','ROUND','POWER','SQRT',
	'NEWID','OBJECT_ID','OBJECT_NAME','SCHEMA_NAME',
	'NOLOCK','UPDLOCK','ROWLOCK','TABLOCK','READPAST','READUNCOMMITTED',
	'ROWS','RANGE','PRECEDING','FOLLOWING','ONLY','OFFSET','NEXT',
	'APPLY','OUTPUT',
	'THROW','TRY','CATCH',
	'STRING_SPLIT','OPENJSON',
]);

const DATATYPES = new Set([
	'BIGINT','BINARY','BIT','CHAR','DATE','DATETIME','DATETIME2','DATETIMEOFFSET',
	'DECIMAL','FLOAT','GEOGRAPHY','GEOMETRY','HIERARCHYID','IMAGE','INT','INTEGER',
	'MONEY','NCHAR','NTEXT','NUMERIC','NVARCHAR','REAL','ROWVERSION','SMALLDATETIME',
	'SMALLINT','SMALLMONEY','SQL_VARIANT','TEXT','TIME','TIMESTAMP','TINYINT',
	'UNIQUEIDENTIFIER','VARBINARY','VARCHAR','XML','TABLE','CURSOR',
]);

// TVFs that must NOT receive dbo. prefix
const TVF_NAMES = new Set([
	'STRING_SPLIT','OPENJSON','OPENROWSET','OPENQUERY','OPENXML',
	'FREETEXTTABLE','CONTAINSTABLE','CHANGETABLE',
]);

// Keywords that make a SELECT column "long" (multi-line treatment)
const LONG_COL_KWS = new Set([
	'CASE','CAST','CONVERT','ISNULL','COALESCE','OVER',
	'ROW_NUMBER','RANK','DENSE_RANK','FIRST_VALUE','LAST_VALUE','LAG','LEAD',
]);

const MAX_INLINE_COL_LEN = 80; // columns longer than this get long-column treatment
const IN_LIST_BREAK_AT   = 4;  // IN (...) lists with this many items or more go multi-line

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TOKENIZER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function tokenize(sql) {
	const tokens = [];
	let i = 0;
	const n = sql.length;

	while (i < n) {
		// Newlines — preserve so inline comments don't bleed across lines
		if (sql[i] === '\n') { tokens.push({ t: 'NL', v: '\n' }); i++; continue; }
		if (/[ \t\r]/.test(sql[i])) { i++; continue; }

		// -- line comment: keep as COMMENT token including its text
		if (sql[i] === '-' && sql[i + 1] === '-') {
			let j = i;
			while (j < n && sql[j] !== '\n') j++;
			tokens.push({ t: 'COMMENT', v: sql.slice(i, j) });
			i = j;
			continue;
		}

		// /* block comment */
		if (sql[i] === '/' && sql[i + 1] === '*') {
			let j = i + 2;
			while (j < n - 1 && !(sql[j] === '*' && sql[j + 1] === '/')) j++;
			tokens.push({ t: 'COMMENT', v: sql.slice(i, j + 2) });
			i = j + 2;
			continue;
		}

		// N'string' or 'string'
		if (sql[i] === "'" || (sql[i] === 'N' && sql[i + 1] === "'")) {
			let pfx = '';
			if (sql[i] === 'N') { pfx = 'N'; i++; }
			let j = i + 1;
			while (j < n) {
				if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
				if (sql[j] === "'") { j++; break; }
				j++;
			}
			tokens.push({ t: 'STR', v: pfx + sql.slice(i, j) });
			i = j;
			continue;
		}

		// [bracketed identifier]
		if (sql[i] === '[') {
			let j = i + 1;
			while (j < n && sql[j] !== ']') j++;
			tokens.push({ t: 'BID', v: sql.slice(i, j + 1) });
			i = j + 1;
			continue;
		}

		// @variable
		if (sql[i] === '@') {
			let j = i + 1;
			while (j < n && /\w/.test(sql[j])) j++;
			tokens.push({ t: 'VAR', v: sql.slice(i, j) });
			i = j;
			continue;
		}

		// number â€” merge preceding unary minus when context is clearly unary
		if (/\d/.test(sql[i])) {
			let j = i;
			let hasDot = false;
			while (j < n) {
				if (/\d/.test(sql[j])) { j++; }
				else if (sql[j] === '.' && !hasDot) { hasDot = true; j++; }
				else break;
			}
			const last = tokens[tokens.length - 1];
			if (last && last.t === 'OP' && last.v === '-') {
				const prev2 = tokens[tokens.length - 2];
				const isUnary = !prev2 || prev2.t === 'OP' || prev2.t === 'KW' || prev2.t === 'COMMA';
				if (isUnary) {
					tokens.pop();
					tokens.push({ t: 'NUM', v: '-' + sql.slice(i, j) });
					i = j; continue;
				}
			}
			tokens.push({ t: 'NUM', v: sql.slice(i, j) });
			i = j;
			continue;
		}

		// identifier or keyword
		if (/[a-zA-Z_#$]/.test(sql[i])) {
			let j = i;
			while (j < n && /[\w#$]/.test(sql[j])) j++;
			const raw = sql.slice(i, j);
			const up = raw.toUpperCase();
			if (up === 'GO') {
				// GO is a batch separator â€” emit as its own passthrough token
				tokens.push({ t: 'GO', v: 'GO' });
			} else if (DATATYPES.has(up)) {
				tokens.push({ t: 'DT', v: up });
			} else if (KEYWORDS.has(up)) {
				tokens.push({ t: 'KW', v: up });
			} else {
				tokens.push({ t: 'ID', v: raw });
			}
			i = j;
			continue;
		}

		// two-char operators
		const two = sql.slice(i, i + 2);
		if (['<>', '<=', '>=', '!=', '+=', '-=', '*=', '/='].includes(two)) {
			tokens.push({ t: 'OP', v: two });
			i += 2;
			continue;
		}

		// single-char
		const ch = sql[i];
		const map = { ',': 'COMMA', '(': 'LP', ')': 'RP', ';': 'SEMI', '.': 'DOT', '*': 'STAR' };
		tokens.push({ t: map[ch] || 'OP', v: ch });
		i++;
	}

	return tokens;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TOKEN UTILITIES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// findLastIndex polyfill — Array.prototype.findLastIndex added in Node 18 / Chrome 97
function findLastIdx(arr, fn) {
	for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i])) return i;
	return -1;
}

function tokStr(tokens) {
	let out = '';
	for (let i = 0; i < tokens.length; i++) {
		const cur = tokens[i];
		const prev = tokens[i - 1];
		if (!cur || cur.t === 'NL') continue;
		if (i === 0) { out += cur.v; continue; }
		if (cur.t === 'COMMENT') { out += ' ' + cur.v; continue; }
		if (cur.t === 'DOT' || (prev && prev.t === 'DOT')) { out += cur.v; continue; }
		if (cur.t === 'RP') { out += cur.v; continue; }
		if (prev && prev.t === 'LP') { out += cur.v; continue; }
		if (cur.t === 'COMMA') { out += cur.v; continue; }
		if (prev && prev.t === 'COMMA') { out += ' ' + cur.v; continue; }
		// Space before ( always â€” expected output shows CAST (x), DATEDIFF (x, y), etc.
		out += ' ' + cur.v;
	}
	return out;
}

// Rule 17: col 0-9 â†’ "--  N", col 10+ â†’ "-- N"
function colComment(idx) {
	return idx < 10 ? `--  ${idx}` : `-- ${idx}`;
}

function splitAtCommas(tokens) {
	const groups = [];
	let cur = [];
	let depth = 0;
	let justSplit = false; // true immediately after a depth-0 COMMA
	for (const tok of tokens) {
		if (tok.t === 'NL') continue; // strip newlines â€” they cause comment bleeding
		if (tok.t === 'LP') { depth++; cur.push(tok); justSplit = false; }
		else if (tok.t === 'RP') { depth--; cur.push(tok); justSplit = false; }
		else if (tok.t === 'COMMA' && depth === 0) {
			groups.push(cur); cur = []; justSplit = true;
		} else if (tok.t === 'COMMENT' && justSplit && groups.length) {
			// Trailing comment after a comma â€” belongs to the PREVIOUS group
			groups[groups.length - 1].push(tok);
		} else {
			cur.push(tok); justSplit = false;
		}
	}
	if (cur.length) groups.push(cur);
	return groups;
}

function splitAtTopKws(tokens, kwSet) {
	const groups = [];
	let cur = { kw: null, tokens: [] };
	let depth = 0;
	let caseD = 0;
	for (const tok of tokens) {
		if (tok.t === 'LP') depth++;
		else if (tok.t === 'RP') depth--;
		if (tok.t === 'KW' && tok.v === 'CASE') caseD++;
		else if (tok.t === 'KW' && tok.v === 'END' && caseD > 0) caseD--;

		if (depth === 0 && caseD === 0 && tok.t === 'KW' && kwSet.has(tok.v)) {
			groups.push(cur);
			cur = { kw: tok.v, tokens: [] };
		} else {
			cur.tokens.push(tok);
		}
	}
	groups.push(cur);
	return groups;
}

function findMatchingParen(tokens, openIdx) {
	let depth = 0;
	for (let i = openIdx; i < tokens.length; i++) {
		if (tokens[i].t === 'LP') depth++;
		if (tokens[i].t === 'RP') { depth--; if (depth === 0) return i; }
	}
	return tokens.length - 1;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CLAUSE SPLITTER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// NOTE: END and ELSE intentionally excluded â€” handled by depth tracking
// NOTE: BEGIN excluded â€” stays inside its owning clause (IF/WHILE body)
const TOP_CLAUSE_KWS = new Set([
	'SELECT','FROM','WHERE','ORDER','GROUP','HAVING',
	'UNION','INTERSECT','EXCEPT',
	'INSERT','UPDATE','DELETE','MERGE',
	'CREATE','ALTER','DROP',
	'DECLARE','SET','IF','WHILE',
	'RETURN','EXEC','EXECUTE','PRINT','RAISERROR','THROW',
]);

function splitIntoClauses(tokens) {
	const clauses = [];
	let cur = null;
	let parenDepth = 0;
	let caseDepth = 0;
	let beginDepth = 0;  // tracks BEGIN...END so IF body stays inside IF clause

	for (const tok of tokens) {
		if (tok.t === 'NL' || tok.t === 'GO') continue; // skip batch separators
		if (tok.t === 'LP') parenDepth++;
		else if (tok.t === 'RP') parenDepth--;
		if (tok.t === 'KW' && tok.v === 'CASE') caseDepth++;

		const inBlock = parenDepth > 0 || caseDepth > 0 || beginDepth > 0;

		if (!inBlock && tok.t === 'KW' && TOP_CLAUSE_KWS.has(tok.v)) {
			const lastTok = cur?.tokens[cur.tokens.length - 1];
			const isElseIf = tok.v === 'IF' && lastTok?.t === 'KW' && lastTok?.v === 'ELSE';
			if (isElseIf) {
				cur.tokens.push(tok); // keep IF inside the enclosing IF clause for ELSE IF chains
			} else {
				if (cur) clauses.push(cur);
				cur = { type: tok.v, tokens: [] };
			}
		} else if (cur) {
			cur.tokens.push(tok);
			// Track depths AFTER pushing into current clause
			if (tok.t === 'KW' && tok.v === 'BEGIN') beginDepth++;
			else if (tok.t === 'KW' && tok.v === 'END') {
				if (caseDepth > 0) caseDepth--;
				else if (beginDepth > 0) beginDepth--;
			}
		} else {
			// Token before any clause keyword â€” wrap in passthrough
			cur = { type: '_', tokens: [tok] };
		}
	}
	if (cur) clauses.push(cur);
	return clauses;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ALIAS EXTRACTION â€” strips AS per Rule 1 (except in DECLARE where AS is kept)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function extractAlias(tokens) {
	// Strip AS keyword: [..., AS, alias]
	const asIdx = findLastIdx(tokens, t => t.t === 'KW' && t.v === 'AS');
	if (asIdx >= 0 && asIdx === tokens.length - 2) {
		const aliasToken = tokens[asIdx + 1];
		const alias = (aliasToken.t === 'BID') ? aliasToken.v : `[${aliasToken.v}]`;
		return { expr: tokens.slice(0, asIdx), alias };
	}
	// Implicit alias: last token is [bracketed] and prev is not DOT/LP/KW
	const last = tokens[tokens.length - 1];
	const prev = tokens[tokens.length - 2];
	if ((last?.t === 'BID' || last?.t === 'ID') && prev && prev.t !== 'DOT' && prev.t !== 'LP' && prev.t !== 'KW') {
		return { expr: tokens.slice(0, -1), alias: last.v };
	}
	return { expr: tokens, alias: null };
}

function bracketAlias(raw) {
	if (!raw) return null;
	if (raw.startsWith('[')) return raw;
	return `[${raw}]`;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RULE 4 â€” SELECT CLAUSE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatSelectClause(clauseTokens, noColumnNumbers) {
	// Strip NL tokens
	clauseTokens = clauseTokens.filter(t => t.t !== 'NL');
	let i = 0;
	let modifiers = '';

	if (clauseTokens[i]?.t === 'KW' && clauseTokens[i]?.v === 'TOP') {
		i++;
		modifiers += 'TOP ' + (clauseTokens[i++]?.v || '') + ' ';
	}
	if (clauseTokens[i]?.t === 'KW' && clauseTokens[i]?.v === 'DISTINCT') {
		i++;
		modifiers += 'DISTINCT ';
	}

	const remaining = clauseTokens.slice(i);

	if (remaining.length === 1 && remaining[0].t === 'STAR') {
		return 'SELECT\t' + modifiers + '*';
	}

	const colGroups = splitAtCommas(remaining);
	if (!colGroups.length) return 'SELECT\t*';

	const parsed = colGroups.map((toks, idx) => parseSelectColumn(toks, idx));

	const firstPrefix = 'SELECT\t' + modifiers;
	const contPrefix = INDENT + INDENT + ', ';

	const normalLengths = parsed.map((col, idx) => {
		if (col.isMultiLine || col.isLong) return 0;
		const prefix = idx === 0 ? firstPrefix : contPrefix;
		return (prefix + col.mainLine).length;
	});
	const alignAt = normalLengths.reduce((a, b) => (b > a ? b : a), 0);

	const lines = [];
	for (let idx = 0; idx < parsed.length; idx++) {
		const col = parsed[idx];
		const prefix = idx === 0 ? firstPrefix : contPrefix;
		const comment = noColumnNumbers ? '' : ('  ' + colComment(idx));

		if (col.isMultiLine) {
			const adjusted = [...col.lines];
			if (idx === 0) {
				adjusted[0] = adjusted[0].replace(/^\t\t, \(/, INDENT + INDENT + '  (');
			}
			adjusted[adjusted.length - 1] = adjusted[adjusted.length - 1] + comment;
			lines.push(...adjusted);
		} else if (col.isLong) {
			lines.push(prefix + col.mainLine + comment);
		} else {
			const full = prefix + col.mainLine;
			const pad = alignAt > full.length ? ' '.repeat(alignAt - full.length + 1) : '  ';
			lines.push(full + (noColumnNumbers ? '' : (pad + colComment(idx))));
		}
	}

	return lines.join('\n');
}

function parseSelectColumn(tokens, idx) {
	// Strip NL and trailing source comments (--00, --06 etc) â€” formatter adds its own
	tokens = tokens.filter(t => t.t !== 'NL');
	while (tokens.length && tokens[tokens.length - 1].t === 'COMMENT') tokens = tokens.slice(0, -1);

	if (tokens[0]?.t === 'KW' && tokens[0]?.v === 'CASE') return formatCaseColumn(tokens, idx, false);
	if (tokens[0]?.t === 'LP' && tokens[1]?.t === 'KW' && tokens[1]?.v === 'CASE') return formatCaseColumn(tokens, idx, true);
	if (tokens[0]?.t === 'LP' && tokens[1]?.t === 'KW' && tokens[1]?.v === 'SELECT') return formatSubqueryColumn(tokens, idx);

	const hasOver = tokens.some(t => t.t === 'KW' && t.v === 'OVER');
	const { expr, alias } = extractAlias(tokens);
	const exprStr = tokStr(expr);
	const aliasStr = alias ? bracketAlias(alias) : null;
	const mainLine = aliasStr ? exprStr + ' ' + aliasStr : exprStr;

	const isLong = hasOver || mainLine.length > MAX_INLINE_COL_LEN || tokens.some(t => LONG_COL_KWS.has(t.v));

	return { isMultiLine: false, isLong, mainLine };
}

// Rule 10 â€” CASE column
function formatCaseColumn(tokens, idx, hasOuterParens) {
	tokens = tokens.filter(t => t.t !== 'NL');
	let caseTokens = tokens;
	let alias = null;

	if (hasOuterParens) {
		const parenEnd = findMatchingParen(tokens, 0);
		caseTokens = tokens.slice(1, parenEnd);
		const afterParen = tokens.slice(parenEnd + 1).filter(t => !(t.t === 'KW' && t.v === 'AS'));
		if (afterParen.length) alias = afterParen[afterParen.length - 1].v;
	} else {
		const endIdx = findLastIdx(tokens, t => t.v === 'END');
		if (endIdx >= 0) {
			const rest = tokens.slice(endIdx + 1).filter(t => !(t.t === 'KW' && t.v === 'AS'));
			if (rest.length) alias = rest[rest.length - 1].v;
			caseTokens = tokens.slice(0, endIdx + 1);
		}
	}

	const aliasStr = alias ? bracketAlias(alias) : '';
	const lines = [];
	lines.push(INDENT + INDENT + ', (');
	lines.push(...emitCaseLines(caseTokens, INDENT + INDENT + INDENT));
	lines.push(INDENT + INDENT + ') ' + aliasStr);
	return { isMultiLine: true, isLong: false, lines };
}

function emitCaseLines(tokens, indent) {
	tokens = tokens.filter(t => t.t !== 'NL');
	const lines = [];
	let i = 0;
	if (tokens[i]?.v === 'CASE') i++;

	let simpleExpr = null;
	if (tokens[i] && tokens[i].v !== 'WHEN') {
		const exprToks = [];
		while (i < tokens.length && tokens[i].v !== 'WHEN') exprToks.push(tokens[i++]);
		simpleExpr = tokStr(exprToks);
	}
	lines.push(indent + 'CASE' + (simpleExpr ? ' ' + simpleExpr : ''));

	while (i < tokens.length) {
		const tok = tokens[i];
		if (tok.v === 'WHEN') {
			i++;
			const whenToks = [];
			while (i < tokens.length && tokens[i].v !== 'THEN') whenToks.push(tokens[i++]);
			lines.push(indent + INDENT + 'WHEN ' + tokStr(whenToks));
			if (tokens[i]?.v === 'THEN') i++;
			const thenToks = [];
			while (i < tokens.length && !['WHEN','ELSE','END'].includes(tokens[i].v)) {
				if (tokens[i].v === 'CASE') {
					const cnt = collectCaseBlock(tokens, i);
					lines.push(...emitCaseLines(tokens.slice(i, i + cnt), indent + INDENT + INDENT));
					i += cnt;
				} else { thenToks.push(tokens[i++]); }
			}
			if (thenToks.length) lines.push(indent + INDENT + INDENT + 'THEN ' + tokStr(thenToks));
		} else if (tok.v === 'ELSE') {
			i++;
			const elseToks = [];
			while (i < tokens.length && tokens[i].v !== 'END') elseToks.push(tokens[i++]);
			lines.push(indent + INDENT + 'ELSE ' + tokStr(elseToks));
		} else if (tok.v === 'END') {
			i++;
		} else { i++; }
	}
	lines.push(indent + 'END');
	return lines;
}

function collectCaseBlock(tokens, idx) {
	let depth = 0, i = idx;
	while (i < tokens.length) {
		if (tokens[i].v === 'CASE') depth++;
		if (tokens[i].v === 'END') { depth--; if (depth === 0) return i - idx + 1; }
		i++;
	}
	return i - idx;
}

// Rule 11 â€” inline subquery column
function formatSubqueryColumn(tokens, idx) {
	tokens = tokens.filter(t => t.t !== 'NL');
	const parenEnd = findMatchingParen(tokens, 0);
	const innerTokens = tokens.slice(1, parenEnd);
	const afterParen = tokens.slice(parenEnd + 1);
	let alias = null;
	if (afterParen.length) {
		const aft = afterParen.filter(t => !(t.t === 'KW' && t.v === 'AS'));
		if (aft.length) alias = aft[aft.length - 1].v;
	}
	const aliasStr = alias ? bracketAlias(alias) : '';
	const innerFormatted = formatSelectStatement(innerTokens, true);
	const lines = [];
	lines.push(INDENT + INDENT + ', (');
	innerFormatted.split('\n').forEach(l => lines.push(INDENT + INDENT + INDENT + l));
	lines.push(INDENT + INDENT + ') ' + aliasStr);
	return { isMultiLine: true, isLong: false, lines };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RULE 5 â€” FROM + JOIN
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const JOIN_START_KWS = new Set(['JOIN','INNER','LEFT','RIGHT','FULL','CROSS','OUTER','APPLY']);

function formatFromClause(clauseTokens) {
	clauseTokens = clauseTokens.filter(t => t.t !== 'NL');
	const blocks = splitFromBlocks(clauseTokens);
	if (!blocks.length) return 'FROM';

	const lines = [];
	const [main, ...joins] = blocks;
	lines.push('FROM\t' + formatTableRef(main.tokens));

	for (const block of joins) {
		const onIdx = block.tokens.findIndex(t => t.t === 'KW' && t.v === 'ON');
		const tableToks = onIdx >= 0 ? block.tokens.slice(0, onIdx) : block.tokens;
		const onToks = onIdx >= 0 ? block.tokens.slice(onIdx + 1) : [];

		lines.push(INDENT + INDENT + block.joinType + ' ' + formatTableRef(tableToks));

		if (onToks.length) {
			const conditions = splitAtTopKws(onToks, new Set(['AND', 'OR']));
			conditions.forEach(({ kw, tokens: ct }, ci) => {
				if (!ct.length) return;
				lines.push(ci === 0
					? INDENT + INDENT + INDENT + 'ON' + INDENT + tokStr(ct)
					: INDENT + INDENT + INDENT + kw + INDENT + tokStr(ct));
			});
		}
	}
	return lines.join('\n');
}

function splitFromBlocks(tokens) {
	const blocks = [];
	let cur = { joinType: null, tokens: [] };
	let depth = 0, i = 0;
	while (i < tokens.length) {
		const tok = tokens[i];
		if (tok.t === 'LP') { depth++; cur.tokens.push(tok); i++; continue; }
		if (tok.t === 'RP') { depth--; cur.tokens.push(tok); i++; continue; }
		if (depth === 0 && tok.t === 'KW' && JOIN_START_KWS.has(tok.v)) {
			blocks.push(cur);
			let jt = tok.v; i++;
			while (i < tokens.length && tokens[i].t === 'KW' &&
				JOIN_START_KWS.has(tokens[i].v)) {
				jt += ' ' + tokens[i].v; i++;
			}
			cur = { joinType: jt, tokens: [] };
			continue;
		}
		cur.tokens.push(tok); i++;
	}
	blocks.push(cur);
	return blocks.filter(b => b.tokens.length > 0 || b.joinType);
}

function formatTableRef(tokens) {
	tokens = tokens.filter(t => t.t !== 'NL');
	if (!tokens.length) return '';

	// Derived table
	if (tokens[0]?.t === 'LP') {
		const parenEnd = findMatchingParen(tokens, 0);
		const inner = tokens.slice(1, parenEnd);
		const after = tokens.slice(parenEnd + 1);
		let alias = '';
		if (after.length) {
			const aft = after.filter(t => !(t.t === 'KW' && t.v === 'AS'));
			if (aft.length) alias = ' ' + bracketAlias(aft[aft.length - 1].v);
		}
		const innerFmt = formatSelectStatement(inner, true);
		return '(\n' + innerFmt.split('\n').map(l => INDENT + INDENT + INDENT + INDENT + l).join('\n') + '\n' + INDENT + INDENT + ')' + alias;
	}

	// Strip table hints WITH (NOLOCK) etc.
	let mainTokens = tokens;
	const withIdx = tokens.findIndex(t => t.t === 'KW' && t.v === 'WITH');
	let hintStr = '';
	if (withIdx >= 0 && tokens[withIdx + 1]?.t === 'LP') {
		mainTokens = tokens.slice(0, withIdx);
		const hintEnd = findMatchingParen(tokens, withIdx + 1);
		hintStr = ' WITH (' + tokStr(tokens.slice(withIdx + 2, hintEnd)) + ')';
	}

	const { expr, alias } = extractAlias(mainTokens);
	let tableStr = tokStr(expr);

	// Add dbo. only to bare plain table names (not @vars, #temps, TVFs, keywords)
	const noSchema = !tableStr.includes('.');
	const notSpecial = !/^[@#]/.test(tableStr);
	const notFn = !expr.some(t => t.t === 'LP');
	const notTVF = !TVF_NAMES.has(tableStr.toUpperCase());
	const notKw = !KEYWORDS.has(tableStr.toUpperCase()) || DATATYPES.has(tableStr.toUpperCase());
	if (noSchema && notSpecial && notFn && notTVF && notKw) tableStr = 'dbo.' + tableStr;

	const aliasPart = alias ? ' ' + bracketAlias(alias) : '';
	return tableStr + aliasPart + hintStr;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RULE 6 â€” WHERE CLAUSE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatWhereClause(clauseTokens) {
	clauseTokens = clauseTokens.filter(t => t.t !== 'NL');
	const segments = splitAtTopKws(clauseTokens, new Set(['AND', 'OR']));
	const validSegs = segments.filter(s => s.tokens.length > 0);
	const lines = [];

	validSegs.forEach(({ kw, tokens: gt }, i) => {
		const condLines = formatConditionGroup(gt);
		if (i === 0) {
			lines.push(INDENT + 'WHERE' + INDENT + '(');
			condLines.forEach(cl => lines.push(INDENT + INDENT + INDENT + cl));
			lines.push(INDENT + INDENT + ')');
		} else {
			lines.push(INDENT + INDENT + kw);
			lines.push(INDENT + INDENT + '(');
			condLines.forEach(cl => lines.push(INDENT + INDENT + INDENT + cl));
			lines.push(INDENT + INDENT + ')');
		}
	});
	return lines.join('\n');
}

function formatConditionGroup(tokens) {
	tokens = tokens.filter(t => t.t !== 'NL');
	if (!tokens.length) return [];

	// Strip outer parens if the ENTIRE condition is wrapped: ( ... )
	if (tokens[0]?.t === 'LP' && findMatchingParen(tokens, 0) === tokens.length - 1) {
		tokens = tokens.slice(1, -1);
	}

	// EXISTS / NOT EXISTS
	const firstKw = tokens[0]?.v;
	if (firstKw === 'EXISTS' || (firstKw === 'NOT' && tokens[1]?.v === 'EXISTS')) {
		const isNot = firstKw === 'NOT';
		const prefix = isNot ? 'NOT EXISTS' : 'EXISTS';
		const skip = isNot ? 2 : 1;
		if (tokens[skip]?.t === 'LP') {
			const parenEnd = findMatchingParen(tokens, skip);
			const inner = tokens.slice(skip + 1, parenEnd);
			const innerFmt = formatSelectStatement(inner, true);
			return [prefix + ' (', ...innerFmt.split('\n').map(l => INDENT + l), ')'];
		}
	}

	// NOT IN / IN  
	const notIdx = tokens.findIndex(t => t.v === 'NOT');
	const inIdx = tokens.findIndex(t => t.t === 'KW' && t.v === 'IN');
	// Scan past any comment tokens between NOT and IN
	let nextAfterNot = notIdx + 1;
	while (nextAfterNot < tokens.length && tokens[nextAfterNot].t === 'COMMENT') nextAfterNot++;
	const effectiveNotIn = (notIdx >= 0 && tokens[nextAfterNot]?.v === 'IN') ? notIdx : -1;
	const effectiveIn = effectiveNotIn >= 0 ? effectiveNotIn : inIdx;

	if (effectiveIn >= 0) {
		const isNotIn = effectiveNotIn >= 0;
		const inKwIdx = isNotIn ? effectiveIn + 1 : effectiveIn;
		if (tokens[inKwIdx + 1]?.t === 'LP') {
			const colStr = tokStr(tokens.slice(0, effectiveIn));
			const listEnd = findMatchingParen(tokens, inKwIdx + 1);
			const listToks = tokens.slice(inKwIdx + 2, listEnd);
			const inOp = isNotIn ? 'NOT IN' : 'IN';

			if (listToks[0]?.t === 'KW' && listToks[0]?.v === 'SELECT') {
				const inner = formatSelectStatement(listToks, true);
				return [colStr + ' ' + inOp + ' (', ...inner.split('\n').map(l => INDENT + l), ')'];
			}
			const items = splitAtCommas(listToks);
			if (items.length >= IN_LIST_BREAK_AT) {
				const out = [colStr + ' ' + inOp + ' ('];
				items.forEach((it, ii) => out.push((ii === 0 ? INDENT + INDENT : INDENT + INDENT + ', ') + tokStr(it)));
				out.push(')');
				return out;
			}
		}
	}

	return [tokStr(tokens)];
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RULES 7, 8, 9 â€” GROUP BY / ORDER BY / OFFSET FETCH
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatGroupByClause(clauseTokens) {
	clauseTokens = clauseTokens.filter(t => t.t !== 'NL');
	const toks = clauseTokens[0]?.v === 'BY' ? clauseTokens.slice(1) : clauseTokens;
	const cols = splitAtCommas(toks);
	const lines = ['GROUP BY'];
	cols.forEach((ct, i) => lines.push((i === 0 ? INDENT + INDENT : INDENT + INDENT + ', ') + tokStr(ct)));
	return lines.join('\n');
}

function formatOrderByClause(clauseTokens) {
	clauseTokens = clauseTokens.filter(t => t.t !== 'NL');
	let toks = clauseTokens[0]?.v === 'BY' ? clauseTokens.slice(1) : clauseTokens;
	const offsetIdx = toks.findIndex(t => t.t === 'KW' && t.v === 'OFFSET');
	const pagToks = offsetIdx >= 0 ? toks.slice(offsetIdx) : [];
	toks = offsetIdx >= 0 ? toks.slice(0, offsetIdx) : toks;
	const cols = splitAtCommas(toks);
	const lines = ['ORDER BY'];
	cols.forEach((ct, i) => lines.push((i === 0 ? INDENT + INDENT : INDENT + INDENT + ', ') + tokStr(ct)));
	if (pagToks.length) {
		const fetchIdx = pagToks.findIndex(t => t.v === 'FETCH');
		if (fetchIdx >= 0) {
			lines.push(INDENT + INDENT + tokStr(pagToks.slice(0, fetchIdx)));
			lines.push(INDENT + INDENT + tokStr(pagToks.slice(fetchIdx)));
		} else {
			lines.push(INDENT + INDENT + tokStr(pagToks));
		}
	}
	return lines.join('\n');
}

function formatHavingClause(clauseTokens) {
	clauseTokens = clauseTokens.filter(t => t.t !== 'NL');
	const segments = splitAtTopKws(clauseTokens, new Set(['AND', 'OR']));
	const lines = [];
	segments.filter(s => s.tokens.length).forEach(({ kw, tokens: gt }, i) => {
		const condLines = formatConditionGroup(gt);
		if (i === 0) {
			lines.push(INDENT + 'HAVING' + INDENT + '(');
			condLines.forEach(cl => lines.push(INDENT + INDENT + INDENT + cl));
			lines.push(INDENT + INDENT + ')');
		} else {
			lines.push(INDENT + INDENT + kw);
			lines.push(INDENT + INDENT + '(');
			condLines.forEach(cl => lines.push(INDENT + INDENT + INDENT + cl));
			lines.push(INDENT + INDENT + ')');
		}
	});
	return lines.join('\n');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RULES 3, 15 â€” DECLARE / SET
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatDeclareClause(clauseTokens) {
	// Keep AS in DECLARE (e.g. DECLARE @x AS XML) â€” matches expected output
	clauseTokens = clauseTokens.filter(t => t.t !== 'NL');
	return 'DECLARE ' + tokStr(clauseTokens);
}

function formatSetClause(clauseTokens) {
	clauseTokens = clauseTokens.filter(t => t.t !== 'NL');
	const eqIdx = clauseTokens.findIndex(t => t.t === 'OP' && t.v === '=');
	if (eqIdx >= 0) {
		const lhs = tokStr(clauseTokens.slice(0, eqIdx));
		let rhs = clauseTokens.slice(eqIdx + 1);

		// Strip outer parens from rhs if fully wrapped
		if (rhs[0]?.t === 'LP' && findMatchingParen(rhs, 0) === rhs.length - 1) {
			rhs = rhs.slice(1, -1);
		}

		if (rhs[0]?.v === 'CASE') {
			const caseLines = emitCaseLines(rhs, INDENT);
			return ['SET ' + lhs + ' = (', ...caseLines, ')'].join('\n');
		}
		if (rhs[0]?.v === 'SELECT') {
			const inner = formatSelectStatement(rhs, true);
			return ['SET ' + lhs + ' = (', ...inner.split('\n').map(l => INDENT + l), ')'].join('\n');
		}
	}

	// Preserve all inline comments on the same line
	if (clauseTokens.some(t => t.t === 'COMMENT')) {
		const main     = clauseTokens.filter(t => t.t !== 'COMMENT');
		const comments = clauseTokens.filter(t => t.t === 'COMMENT').map(t => t.v).join(' ');
		return 'SET ' + tokStr(main) + ' ' + comments;
	}

	return 'SET ' + tokStr(clauseTokens);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RULE 14 â€” IF / WHILE blocks
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatIfClause(clauseTokens, indent, keyword = 'IF') {
	clauseTokens = clauseTokens.filter(t => t.t !== 'NL');
	const lines = [];
	let i = 0;

	// Collect condition (everything before BEGIN)
	const condToks = [];
	while (i < clauseTokens.length && clauseTokens[i]?.v !== 'BEGIN') {
		condToks.push(clauseTokens[i++]);
	}
	lines.push(keyword + ' ' + tokStr(condToks));

	if (clauseTokens[i]?.v === 'BEGIN') {
		i++;
		lines.push('BEGIN');
		lines.push('');

		// Collect body up to matching END
		const bodyToks = [];
		let depth = 1, caseD = 0;
		while (i < clauseTokens.length) {
			const tok = clauseTokens[i];
			if (tok.t === 'KW' && tok.v === 'CASE') caseD++;
			if (tok.t === 'KW' && tok.v === 'BEGIN') depth++;
			if (tok.t === 'KW' && tok.v === 'END') {
				if (caseD > 0) { caseD--; }
				else { depth--; if (depth === 0) { i++; break; } }
			}
			bodyToks.push(tok); i++;
		}

		formatProcBody(bodyToks, indent + INDENT).forEach(l => lines.push(l === '' ? '' : INDENT + l));
		lines.push('');
		lines.push('END');
	}

	// ELSE / ELSE IF
	if (i < clauseTokens.length && clauseTokens[i]?.v === 'ELSE') {
		i++;
		if (clauseTokens[i]?.v === 'IF') {
			i++; // skip IF â€” recurse with ELSE IF keyword so chains work naturally
			formatIfClause(clauseTokens.slice(i), indent, 'ELSE IF').split('\n').forEach(l => lines.push(l));
		} else {
			lines.push('ELSE');
			if (clauseTokens[i]?.v === 'BEGIN') {
				i++;
				lines.push('BEGIN');
				lines.push('');
				const elseToks = [];
				let depth = 1, caseD = 0;
				while (i < clauseTokens.length) {
					const tok = clauseTokens[i];
					if (tok.t === 'KW' && tok.v === 'CASE') caseD++;
					if (tok.t === 'KW' && tok.v === 'BEGIN') depth++;
					if (tok.t === 'KW' && tok.v === 'END') {
						if (caseD > 0) { caseD--; }
						else { depth--; if (depth === 0) break; }
					}
					elseToks.push(tok); i++;
				}
				formatProcBody(elseToks, indent + INDENT).forEach(l => lines.push(l === '' ? '' : INDENT + l));
				lines.push('');
				lines.push('END');
			}
		}
	}

	return lines.join('\n');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RULE 2 â€” STORED PROCEDURE BODY FORMATTER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatWhileClause(clauseTokens, indent) {
	clauseTokens = clauseTokens.filter(t => t.t !== 'NL');
	const lines = [];
	let i = 0;

	const condToks = [];
	while (i < clauseTokens.length && clauseTokens[i]?.v !== 'BEGIN') {
		condToks.push(clauseTokens[i++]);
	}
	lines.push('WHILE ' + tokStr(condToks));

	if (clauseTokens[i]?.v === 'BEGIN') {
		i++;
		lines.push('BEGIN');
		lines.push('');
		const bodyToks = [];
		let depth = 1, caseD = 0;
		while (i < clauseTokens.length) {
			const tok = clauseTokens[i];
			if (tok.t === 'KW' && tok.v === 'CASE') caseD++;
			if (tok.t === 'KW' && tok.v === 'BEGIN') depth++;
			if (tok.t === 'KW' && tok.v === 'END') {
				if (caseD > 0) { caseD--; }
				else { depth--; if (depth === 0) { i++; break; } }
			}
			bodyToks.push(tok); i++;
		}
		formatProcBody(bodyToks, indent + INDENT).forEach(l => lines.push(l === '' ? '' : INDENT + l));
		lines.push('');
		lines.push('END');
	}

	return lines.join('\n');
}

function formatProcBody(tokens, indent = INDENT) {
	tokens = tokens.filter(t => t.t !== 'NL');
	const clauses = splitIntoClauses(tokens);
	const lines = [];

	// Rule 2: group only the LEADING DECLARE block, then leading SET block,
	// then emit rest in original order (preserving mid-body DECLAREs in place).
	let ci = 0;
	while (ci < clauses.length && clauses[ci].type === 'DECLARE') ci++;
	const leadDeclares = clauses.slice(0, ci);
	let si = ci;
	while (si < clauses.length && clauses[si].type === 'SET') si++;
	const leadSets = clauses.slice(ci, si);
	const rest = clauses.slice(si);

	if (leadDeclares.length) {
		leadDeclares.forEach(d => lines.push(formatDeclareClause(d.tokens)));
		lines.push('');
	}
	if (leadSets.length) {
		leadSets.forEach(s => {
			const fmt = formatSetClause(s.tokens);
			fmt.split('\n').forEach(l => lines.push(l));
		});
		lines.push('');
	}

	rest.forEach(c => {
		if (c.type === 'RETURN') {
			lines.push('RETURN');
			return;
		}
		if (c.type === 'IF') {
			const fmt = formatIfClause(c.tokens, indent);
			fmt.split('\n').forEach(l => lines.push(l));
			lines.push('');
			return;
		}
		if (c.type === 'WHILE') {
			const fmt = formatWhileClause(c.tokens, indent);
			fmt.split('\n').forEach(l => lines.push(l));
			lines.push('');
			return;
		}
		if (c.type === 'INSERT') {
			formatInsertClause(c.tokens).forEach(l => lines.push(l));
			lines.push('');
			return;
		}
		const fmt = formatClause(c);
		fmt.split('\n').forEach(l => lines.push(l));
		lines.push('');
	});

	// Trim trailing blank lines
	while (lines.length && lines[lines.length - 1] === '') lines.pop();
	return lines;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// INSERT INTO â€” basic passthrough with SELECT formatting
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatInsertClause(clauseTokens) {
	clauseTokens = clauseTokens.filter(t => t.t !== 'NL');
	// INSERT INTO @table SELECT ...
	const selectIdx = clauseTokens.findIndex(t => t.t === 'KW' && t.v === 'SELECT');
	if (selectIdx >= 0) {
		const intoToks = clauseTokens.slice(0, selectIdx);
		const selectToks = clauseTokens.slice(selectIdx);
		const lines = [];
		lines.push('INSERT INTO ' + tokStr(intoToks.filter(t => !(t.t === 'KW' && t.v === 'INTO'))));
		const selectFmt = formatSelectStatement(selectToks, true);
		selectFmt.split('\n').forEach(l => lines.push(l));
		return lines;
	}
	// INSERT INTO @table VALUES (...)
	const valuesIdx = clauseTokens.findIndex(t => t.t === 'KW' && t.v === 'VALUES');
	if (valuesIdx >= 0) {
		const intoToks = clauseTokens.slice(0, valuesIdx);
		const valuesToks = clauseTokens.slice(valuesIdx + 1);
		const lines = [];
		lines.push('INSERT INTO ' + tokStr(intoToks.filter(t => !(t.t === 'KW' && t.v === 'INTO'))));
		lines.push('VALUES');
		const rowGroups = splitAtCommas(valuesToks);
		rowGroups.forEach((rowToks, ri) => {
			lines.push((ri === 0 ? INDENT + INDENT : INDENT + INDENT + ', ') + tokStr(rowToks));
		});
		return lines;
	}
	return ['INSERT ' + tokStr(clauseTokens)];
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RULE 2 â€” STORED PROCEDURE HEADER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatProcStatement(tokens) {
	tokens = tokens.filter(t => t.t !== 'NL' && t.t !== 'GO');
	let i = 0;

	// Skip any leading comments before CREATE/ALTER
	while (i < tokens.length && tokens[i].t === 'COMMENT') i++;

	let action = tokens[i++]?.v || 'ALTER'; // CREATE or ALTER

	// Handle CREATE OR ALTER PROCEDURE
	if (tokens[i]?.t === 'KW' && tokens[i]?.v === 'OR') {
		i++; // skip OR
		if (tokens[i]?.t === 'KW' && tokens[i]?.v === 'ALTER') { action = 'CREATE OR ALTER'; i++; }
	}

	// Skip PROCEDURE / PROC keyword
	if (tokens[i]?.t === 'KW' && (tokens[i]?.v === 'PROCEDURE' || tokens[i]?.v === 'PROC')) i++;

	// Proc name
	let procName = '';
	while (i < tokens.length && (tokens[i].t === 'ID' || tokens[i].t === 'BID' || tokens[i].t === 'DOT')) {
		procName += tokens[i].v; i++;
	}
	if (!procName.includes('.')) procName = 'dbo.' + procName;

	const lines = [`${action} PROCEDURE ${procName}`];

	// Parameters â€” scan until we hit WITH (for RECOMPILE/ENCRYPTION/EXECUTE AS)
	// OR until we hit a bare AS that is the proc body AS
	// The trick: WITH EXECUTE AS CALLER must be skipped entirely
	// We detect param block end by: first non-param, non-COMMA token at depth 0
	// that is AS/WITH at the top level

	const params = [];

	while (i < tokens.length) {
		const tok = tokens[i];

		// Stop conditions for param block
		if (tok.t === 'KW' && tok.v === 'WITH') {
			// Could be WITH EXECUTE AS (skip entirely) or WITH RECOMPILE/ENCRYPTION
			// Peek ahead to decide
			const j = i + 1;
			if (tokens[j]?.v === 'EXECUTE' || tokens[j]?.v === 'EXEC') {
				// WITH EXECUTE AS CALLER â€” skip the whole thing until the proc-body AS
				i += 2; // skip WITH EXECUTE
				if (tokens[i]?.v === 'AS') i++; // skip AS
				if (tokens[i]?.t === 'ID') i++; // skip CALLER / OWNER / SELF / user
				continue;
			}
			// WITH RECOMPILE or ENCRYPTION â€” handled below
			break;
		}
		if (tok.t === 'KW' && tok.v === 'AS') break;
		if (tok.t === 'COMMENT') {
			// Attach comment to last param
			if (params.length > 0) params[params.length - 1].trailingComment = tok.v;
			i++; continue;
		}
		if (tok.t === 'VAR') {
			const param = parseProcParam(tokens, i);
			params.push(param);
			i = param.nextIdx;
			if (tokens[i]?.t === 'COMMA') i++;
			continue;
		}
		i++;
	}

	// Rule 2: first param = tab indent, rest = tab + ", "
	params.forEach((p, pi) => {
		const parts = [p.name + ' ' + p.datatype];
		if (p.defaultVal !== null) parts.push('= ' + p.defaultVal);
		if (p.isOutput) parts.push('OUTPUT');
		const indent = pi === 0 ? INDENT : INDENT + ', ';
		const comment = p.trailingComment ? '\t' + p.trailingComment : '';
		lines.push(indent + parts.join(' ') + comment);
	});

	// WITH RECOMPILE / ENCRYPTION (if present and not EXECUTE AS)
	if (i < tokens.length && tokens[i]?.v === 'WITH') {
		i++;
		const opts = [];
		if (tokens[i]?.v === 'RECOMPILE') { opts.push('RECOMPILE'); i++; }
		else if (tokens[i]?.v === 'ENCRYPTION') { opts.push('ENCRYPTION'); i++; }
		if (opts.length) lines.push('WITH ' + opts.join(', '));
	}

	lines.push('AS');
	lines.push('BEGIN');
	lines.push('');

	// Skip to body: advance past AS and optional BEGIN in token stream
	while (i < tokens.length && tokens[i]?.v !== 'AS') i++;
	i++; // skip AS
	if (i < tokens.length && tokens[i]?.v === 'BEGIN') i++; // skip BEGIN if present

	// Collect body tokens up to the matching END, tracking CASE depth separately
	const bodyToks = [];
	let depth = 1, caseD = 0;
	while (i < tokens.length) {
		const tok = tokens[i];
		if (tok.t === 'GO') { i++; continue; } // skip GO inside body
		if (tok.t === 'KW' && tok.v === 'CASE') caseD++;
		if (tok.t === 'KW' && tok.v === 'BEGIN') depth++;
		if (tok.t === 'KW' && tok.v === 'END') {
			if (caseD > 0) { caseD--; }
			else { depth--; if (depth === 0) break; }
		}
		bodyToks.push(tok); i++;
	}

	// If there was no BEGIN in original SQL (bare AS body), depth never hit 0
	// bodyToks still has all the body content â€” that's fine

	formatProcBody(bodyToks, INDENT).forEach(l => lines.push(l === '' ? '' : INDENT + l));
	lines.push('');
	lines.push('END');

	return lines.join('\n');
}

function parseProcParam(tokens, startIdx) {
	let i = startIdx;
	const name = tokens[i++]?.v || '';
 
	let datatype = '';
	if (tokens[i]?.t === 'DT' || tokens[i]?.t === 'BID' ||
		(tokens[i]?.t === 'KW' && DATATYPES.has(tokens[i]?.v))) {
		const raw = tokens[i++].v;
		// Strip [ ] brackets if present and uppercase â€” e.g. [nvarchar] â†’ NVARCHAR
		datatype = raw.startsWith('[') ? raw.slice(1, -1).toUpperCase() : raw.toUpperCase();
		if (tokens[i]?.t === 'LP') {
			datatype += ' ('; i++;
			while (i < tokens.length && tokens[i]?.t !== 'RP') datatype += tokens[i++].v;
			datatype += ')'; i++;
		}
	}
 
	if (tokens[i]?.t === 'KW' && tokens[i]?.v === 'READONLY') { datatype += ' READONLY'; i++; }
 
	let defaultVal = null, isOutput = false;
 
	if (tokens[i]?.t === 'OP' && tokens[i]?.v === '=') {
		i++;
		const defToks = [];
		while (i < tokens.length) {
			const t = tokens[i];
			if (t.t === 'COMMA') break;
			if (t.t === 'KW' && ['OUTPUT','WITH','AS'].includes(t.v)) break;
			if (t.t === 'COMMENT') break;
			defToks.push(t); i++;
		}
		defaultVal = tokStr(defToks);
	}
 
	if (tokens[i]?.t === 'KW' && tokens[i]?.v === 'OUTPUT') { isOutput = true; i++; }
 
	return { name, datatype, defaultVal, isOutput, trailingComment: null, nextIdx: i };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RULE 12 â€” CTE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatCTE(tokens) {
	tokens = tokens.filter(t => t.t !== 'NL' && t.t !== 'GO');
	const lines = [';WITH', ''];
	let i = 0;
	const cteBlocks = [];

	while (i < tokens.length) {
		while (i < tokens.length && tokens[i].t === 'COMMA') i++;
		if (tokens[i]?.t === 'KW' && ['SELECT','INSERT','UPDATE','DELETE','MERGE'].includes(tokens[i].v)) break;
		if (!tokens[i]) break;

		let description = null;
		if (tokens[i]?.t === 'COMMENT') { description = tokens[i].v; i++; }

		const nameTok = tokens[i++];
		if (!nameTok || (nameTok.t !== 'ID' && nameTok.t !== 'BID')) break;

		// Skip optional column list: CTE_Name (col1, col2) AS (body)
		if (tokens[i]?.t === 'LP') {
			const peekEnd = findMatchingParen(tokens, i);
			if (tokens[peekEnd + 1]?.t === 'KW' && tokens[peekEnd + 1]?.v === 'AS') {
				i = peekEnd + 1; // skip column list, land on AS
			}
		}

		if (tokens[i]?.t === 'KW' && tokens[i]?.v === 'AS') i++;
		if (tokens[i]?.t !== 'LP') break;
		const parenEnd = findMatchingParen(tokens, i);
		const bodyToks = tokens.slice(i + 1, parenEnd);
		i = parenEnd + 1;
		cteBlocks.push({ name: nameTok.v, description, bodyToks });
	}

	const mainToks = tokens.slice(i);

	cteBlocks.forEach((cte, ci) => {
		if (cte.description) lines.push(cte.description);
		lines.push(cte.name);
		lines.push('AS');
		lines.push('(');
		const inner = formatSelectStatement(cte.bodyToks, false);
		inner.split('\n').forEach(l => lines.push(INDENT + l));
		lines.push(ci < cteBlocks.length - 1 ? '),' : ')');
		lines.push('');
	});

	if (mainToks.length) lines.push(formatSelectStatement(mainToks, false));
	return lines.join('\n');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RULE 13 â€” UNION ALL / UNION / INTERSECT / EXCEPT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatSetOperators(clauses) {
	const blocks = [];
	let cur = [];
	for (const clause of clauses) {
		if (['UNION','INTERSECT','EXCEPT'].includes(clause.type)) {
			if (cur.length) blocks.push({ type: 'SELECT', clauses: cur });
			cur = [];
			blocks.push({ type: clause.type, tokens: clause.tokens });
		} else { cur.push(clause); }
	}
	if (cur.length) blocks.push({ type: 'SELECT', clauses: cur });

	const parts = [];
	for (const block of blocks) {
		if (block.type === 'SELECT') {
			parts.push(block.clauses.map(formatClause).join('\n\n'));
		} else {
			const allKw = block.tokens.some(t => t.v === 'ALL') ? ' ALL' : '';
			parts.push(block.type + allKw);
		}
	}
	return parts.join('\n\n');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CLAUSE DISPATCHER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatClause(clause) {
	switch (clause.type) {
		case 'SELECT':   return formatSelectClause(clause.tokens, false);
		case 'FROM':     return formatFromClause(clause.tokens);
		case 'WHERE':    return formatWhereClause(clause.tokens);
		case 'ORDER':    return formatOrderByClause(clause.tokens);
		case 'GROUP':    return formatGroupByClause(clause.tokens);
		case 'HAVING':   return formatHavingClause(clause.tokens);
		case 'DECLARE':  return formatDeclareClause(clause.tokens);
		case 'SET':      return formatSetClause(clause.tokens);
		case 'IF':       return formatIfClause(clause.tokens, INDENT);
		case 'WHILE':    return formatWhileClause(clause.tokens, INDENT);
		case 'INSERT':   return formatInsertClause(clause.tokens).join('\n');
		case 'RETURN':   return 'RETURN';
		case 'EXEC':
		case 'EXECUTE':  return clause.type + (clause.tokens.length ? ' ' + tokStr(clause.tokens) : '');
		case 'PRINT':    return 'PRINT ' + tokStr(clause.tokens);
		case 'RAISERROR':return 'RAISERROR ' + tokStr(clause.tokens);
		case 'THROW':    return 'THROW ' + tokStr(clause.tokens);
		default:         return clause.type + (clause.tokens.length ? ' ' + tokStr(clause.tokens) : '');
	}
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SELECT STATEMENT  (recursive â€” used by subqueries / CTEs)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatSelectStatement(tokens, noColumnNumbers) {
	tokens = tokens.filter(t => t.t !== 'NL' && t.t !== 'GO');
	const clauses = splitIntoClauses(tokens);
	const hasSetOps = clauses.some(c => ['UNION','INTERSECT','EXCEPT'].includes(c.type));
	if (hasSetOps) return formatSetOperators(clauses);
	return clauses.map(c => {
		if (c.type === 'SELECT') return formatSelectClause(c.tokens, noColumnNumbers);
		return formatClause(c);
	}).join('\n\n');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BATCH-LEVEL SPLITTER â€” handles SET ANSI_NULLS / GO / comments before proc
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function splitBatches(tokens) {
	// Split token stream at GO tokens into batches
	const batches = [];
	let cur = [];
	for (const tok of tokens) {
		if (tok.t === 'GO') {
			batches.push(cur);
			cur = [];
		} else {
			cur.push(tok);
		}
	}
	if (cur.length) batches.push(cur);
	return batches;
}

function formatBatch(tokens) {
	// Strip leading NL
	tokens = tokens.filter(t => t.t !== 'NL');
	if (!tokens.length) return null;

	// Pure comment batch
	if (tokens.every(t => t.t === 'COMMENT')) {
		return tokens.map(t => t.v).join('\n');
	}

	const firstKw = tokens.find(t => t.t === 'KW');
	if (!firstKw) {
		// No keywords at all (e.g. a batch of only identifiers/operators)
		return tokStr(tokens);
	}

	// Stored procedure â€” preserve any leading comments before CREATE/ALTER
	if (firstKw.v === 'CREATE' || firstKw.v === 'ALTER') {
		const firstIdx = tokens.indexOf(firstKw);
		const nextKw = tokens.slice(firstIdx + 1).find(t => t.t === 'KW' && (t.v === 'PROCEDURE' || t.v === 'PROC'));
		if (nextKw) {
			// Emit any leading comments on their own lines, then the proc
			const leadingComments = [];
			for (let ci = 0; ci < firstIdx; ci++) {
				if (tokens[ci].t === 'COMMENT') leadingComments.push(tokens[ci].v);
			}
			const procFormatted = formatProcStatement(tokens);
			if (leadingComments.length) {
				return leadingComments.join('\n') + '\n' + procFormatted;
			}
			return procFormatted;
		}
	}

	// CTE
	if (firstKw.v === 'WITH') {
		const withIdx = tokens.indexOf(firstKw);
		// Check for ;WITH (leading SEMI already stripped or not)
		return formatCTE(tokens.slice(withIdx + 1));
	}

	return formatSelectStatement(tokens, false);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN ENTRY POINT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function formatSQL(sql) {
	try {
		const tokens = tokenize(sql);
		if (!tokens.length) return sql;

		// Handle leading ;
		let workTokens = tokens;
		if (workTokens[0]?.t === 'SEMI') workTokens = workTokens.slice(1);

		// Check for CTE starting with ; WITH
		const firstMeaningful = workTokens.find(t => t.t !== 'NL');
		if (firstMeaningful?.t === 'KW' && firstMeaningful.v === 'WITH') {
			const withIdx = workTokens.indexOf(firstMeaningful);
			return formatCTE(workTokens.slice(withIdx + 1));
		}

		// Split at GO tokens for multi-batch scripts
		const batches = splitBatches(workTokens);

		if (batches.length <= 1) {
			// Single batch â€” original behaviour
			const result = formatBatch(workTokens); // splitBatches already removed GO tokens
			return result || sql;
		}

		// Multi-batch: format each, rejoin with GO
		const formatted = [];
		for (const batch of batches) {
			const result = formatBatch(batch);
			if (result) formatted.push(result);
		}
		return formatted.join('\nGO\n');

	} catch (err) {
		console.error('[SQL Zero Doctrine] formatter error:', err);
		return sql;
	}
}

module.exports = { formatSQL };

