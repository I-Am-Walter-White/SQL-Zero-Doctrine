'use strict';

const vscode = require('vscode');

const REPO = 'I-Am-Walter-White/SQL-Zero-Doctrine';
const ISSUES_URL = `https://github.com/${REPO}/issues/new`;

// ── Gather context automatically ──
function getContext(includeSQL, sqlText) {
	const ext = vscode.extensions.getExtension('Harsh.sql-formatter');
	const extVersion  = ext?.packageJSON?.version  ?? 'unknown';
	const vscodeVer   = vscode.version;
	const os          = process.platform === 'win32'  ? 'Windows'
	                  : process.platform === 'darwin' ? 'macOS'
	                  : 'Linux';

	const sqlBlock = includeSQL && sqlText
		? `\`\`\`sql\n${sqlText}\n\`\`\``
		: '<!-- paste your SQL here -->';

	return { extVersion, vscodeVer, os, sqlBlock };
}

// ── Build the pre-filled GitHub issue URL ──
function buildIssueUrl(type, ctx) {
	const isBug = type === 'bug';

	const title = isBug ? '[BUG] ' : '[FEATURE] ';

	const body = isBug
		? [
			'## What happened?',
			'<!-- Describe what went wrong -->\n',
			'## Expected output',
			'<!-- What should the formatted SQL look like? -->\n',
			'## SQL that caused the issue',
			ctx.sqlBlock + '\n',
			'## Actual output',
			'```sql\n\n```\n',
			'## Screenshots',
			'<!-- Drag and drop images here -->\n',
			'## Environment',
			`- **Extension version:** ${ctx.extVersion}`,
			`- **VS Code version:** ${ctx.vscodeVer}`,
			`- **OS:** ${ctx.os}`,
		].join('\n')
		: [
			'## What formatting behaviour are you asking for?',
			'<!-- Describe the rule or change -->\n',
			'## Before formatting',
			'```sql\n\n```\n',
			'## After formatting (what you want)',
			'```sql\n\n```\n',
			'## Why is this needed?',
			'<!-- Optional -->',
		].join('\n');

	const label = isBug ? 'bug' : 'enhancement';

	const params = new URLSearchParams({
		template: isBug ? 'bug_report.md' : 'feature_request.md',
		title,
		body,
		labels: label,
	});

	return `${ISSUES_URL}?${params.toString()}`;
}

// ── Main command ──
async function reportFeedback() {
	// Step 1 — bug or feature?
	const type = await vscode.window.showQuickPick(
		[
			{ label: '🐛  Bug report',       description: 'Something formatted incorrectly or the extension crashed', value: 'bug' },
			{ label: '💡  Feature request',  description: 'Suggest a new rule or improvement',                        value: 'feature' },
		],
		{ placeHolder: 'What would you like to report?' }
	);
	if (!type) return; // user cancelled

	let includeSQL = false;
	let sqlText    = '';

	// Step 2 — if bug, offer to include current SQL
	if (type.value === 'bug') {
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document.languageId !== 'plaintext') {
			const sqlInEditor = editor.selection.isEmpty
				? editor.document.getText()
				: editor.document.getText(editor.selection);

			if (sqlInEditor.trim()) {
				const include = await vscode.window.showQuickPick(
					[
						{ label: '✅  Yes — Include the SQL', description: 'Helps reproduce the issue faster', value: true  },
						{ label: '❌  No — leave it blank',   description: "I'll paste it manually",          value: false },
					],
					{ placeHolder: 'Include current SQL in the report?' }
				);
				if (include === undefined) return; // cancelled
				includeSQL = include.value;
				if (includeSQL) sqlText = sqlInEditor;
			}
		}
	}

	// Step 3 — build URL and open browser
	const ctx = getContext(includeSQL, sqlText);
	const url = buildIssueUrl(type.value, ctx);

	await vscode.env.openExternal(vscode.Uri.parse(url));

	vscode.window.showInformationMessage(
		'GitHub opened in your browser. Add a screenshot if it helps, then hit Submit.',
		'OK'
	);
}

module.exports = { reportFeedback };