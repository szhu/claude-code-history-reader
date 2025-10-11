# Claude Code History Exporter

A Deno-compatible CLI tool that exports Claude Code chat history from `~/.claude/projects` to Markdown format. Features type-safe JSONL parsing, smart collapsible formatting, and comprehensive markdown generation.

## Installation & Quick Start

```bash
# Install Deno (if not already installed)
curl -fsSL https://deno.land/install.sh | sh

# Run directly from GitHub
deno check --reload https://raw.githubusercontent.com/szhu/claude-code-history-exporter/main/src/app/cli.ts # Re-run to get latest version
deno run --allow-read --allow-write --allow-env https://raw.githubusercontent.com/szhu/claude-code-history-exporter/main/src/app/cli.ts <path-to-project>

# Or clone and use locally
git clone https://github.com/szhu/claude-code-history-exporter.git
cd claude-code-history-exporter

# Export current project to stdout
bin/claude-history-export --current-project

# Export specific project to file
bin/claude-history-export ~/.claude/projects/my-project --output export.md

# Export with deduplicated timeline (for forked chats)
bin/claude-history-export ~/.claude/projects/my-project --multiple-chats=merge

# Show help
bin/claude-history-export --help
```

## Architecture

Simple, focused architecture with clear separation of concerns:

- **src/app/cli.ts**: Main CLI application with argument parsing and export logic
- **src/claude-project/types.ts**: Zod schemas and TypeScript types for JSONL format validation
- **bin/claude-history-export**: Executable binary script wrapper
- **src/app/cli.test.ts**: Comprehensive test suite

## Key Features

- **Type-Safe JSONL Parsing**: Zod schemas validate Claude Code chat format at ingestion time
- **Smart Collapsible Formatting**: Assistant messages automatically collapse after 3 paragraphs, headings always go inside `<details>` blocks
- **Comprehensive Tool Use Display**: Tool parameters, results, and intelligent summaries for common Claude Code tools
- **Metadata Tables**: Session info, token usage, timing, and export settings for each chat and project
- **Two Export Modes**: Separate mode (default) for independent chats, or merge mode to deduplicate forked chats into single chronological timeline
- **Chronological Organization**: Multiple chats sorted by last message timestamp for better readability
- **Robust Markdown Generation**: Uses Remark ecosystem for proper CommonMark compliance and automatic escaping
- **Configurable Options**: Export specific chats, include/exclude meta messages, custom output files
- **Current Project Detection**: Automatically finds and exports the current working directory's Claude project

## Development

```bash
# Use binary script (recommended)
bin/claude-history-export --current-project

# Run tests
deno test --allow-read --allow-write --allow-run src/app/cli.test.ts

# Check types
deno check src/app/*.ts src/content/*.ts

# Advanced: Run CLI directly
deno run --allow-read --allow-write --allow-env src/app/cli.ts --current-project
```

## Testing

The test suite validates export functionality, chat filtering, timestamp handling, meta message processing, error conditions, and help display using mock JSONL data.
