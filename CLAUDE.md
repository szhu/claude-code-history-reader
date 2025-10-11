# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This is a Deno-compatible CLI tool that exports Claude Code chat history from `~/.claude/projects` to Markdown format. It uses TypeScript with Zod for runtime validation of the JSONL chat format, and Remark for proper CommonMark-compliant markdown generation.

## Installation & Quick Start

```bash
# Install Deno (if not already installed)
curl -fsSL https://deno.land/install.sh | sh

# Run directly from GitHub (one-line usage, always gets latest version)
deno run --reload --allow-read --allow-write --allow-env https://raw.githubusercontent.com/szhu/claude-code-history-exporter/main/src/app/cli.ts <path-to-project>
```

## Development Commands

```bash
# Use the binary script (recommended)
bin/claude-history-export <path-to-project> [options]

# Use current directory's project
bin/claude-history-export --current-project

# Run tests
deno test --allow-read --allow-write --allow-run src/app/cli.test.ts

# Check TypeScript types
deno check src/app/*.ts src/content/*.ts

# Advanced: Run the CLI directly
deno run --allow-read --allow-write --allow-env src/app/cli.ts <path-to-project> [options]
```

## Architecture

- **src/app/cli.ts**: Main CLI application with argument parsing and markdown export logic
- **src/claude-project/types.ts**: Zod schemas and TypeScript types for Claude Code JSONL format validation
- **src/app/export.ts**: Claude chat export orchestration and document building
- **src/app/chat-processing.ts**: Claude chat entry processing and content merging
- **src/app/claude-formatting.ts**: Claude-specific formatting and smart collapsible content
- **src/content/markdown.ts**: Generic markdown AST processing with Remark
- **src/content/html.ts**: HTML generation utilities for unist nodes
- **src/claude-project/claude-project.ts**: Claude Code project detection and file utilities
- **src/jsonl.ts**: Generic JSONL parsing utilities
- **src/cli-args.ts**: Generic CLI argument parsing
- **bin/claude-history-export**: Executable binary script that wraps the CLI
- **src/app/cli.test.ts**: Comprehensive test suite covering all CLI functionality
- **src/app/claude-formatting.test.ts**: Timestamp formatting and edge case tests

## Key Principles Discovered

### Type Safety & Runtime Validation

- **Zod for Runtime Safety**: Use Zod schemas for all external data validation (JSONL parsing) to catch malformed data early
- **TypeScript for Compile-time Safety**: Use proper `RootContent` types from `@types/mdast` instead of generic `Node` types to ensure AST nodes are compatible with remark
- **Literal Types for Constraints**: Use `as const` for values with constraints (e.g., heading depths must be `1 | 2 | 3 | 4 | 5 | 6`, not generic `number`)
- **Surgical Type Application**: Be strategic about where strict types vs. generic types are used - functions that produce markdown content should return `RootContent[]`

### Content Processing Architecture

- **Unified Content Generation**: Abstract content generation so formatting (like bold text) works the same whether targeting markdown or HTML contexts
- **All Assistant Content Must Go Through Collapsing**: Any markdown from JSONL files must go through conditional collapsing to ensure headings don't appear bare in the output
- **Remark Ecosystem Integration**: Use remark + unist-builder for proper CommonMark compliance and automatic escaping instead of manual string manipulation

### Code Organization

- **Separation of Concerns**: Generic utilities should be reusable by other applications; application-specific code should be clearly separated
- **Descriptive Naming**: Module names must reflect their specificity - no misleadingly generic names
- **Future-Proof Guarantees**: Proper typing provides compile-time guarantees that prevent future bugs, which runtime checks cannot provide

## Key Features

- Validates JSONL format using Zod schemas at ingestion time
- Supports exporting all chats or specific chat IDs from a project (automatically sorted chronologically by last message)
- **Two export modes for handling multiple chats:**
  - **Separate mode** (default): Each chat exported as its own section with full content
  - **Merge mode**: Deduplicates shared history from forked chats, creates single chronological timeline sorted by first message time (then last message time)
- Configurable options for meta messages and output formatting
- Handles both regular chat messages and summary entries
- Graceful error handling for malformed JSONL lines
- Automatically generates metadata tables for each chat with session info, token usage, and timing
- Creates export-level metadata table with project info and export settings
- Enhanced tool result display with content previews and tool use parameter details
- Tool use parameters formatted in collapsible details blocks with proper JSON code blocks
- Intelligent tool use summaries for common tools (TodoWrite, Read, Write, Edit, Bash, etc.)
- Clean formatting: user messages in blockquotes with timestamp headings, assistant messages interpreted as markdown with automatic collapsing for long content
- Tool results integrated with their corresponding tool uses for better readability
- Enhanced todo summaries with task status counts and visual indicators (✅🔄⏳)
- No string clipping - full content preserved for better analysis
- Special formatting for Read (collapsible details) and Write (open display) tool results
- All other tool results in collapsible details with proper code blocks
- Ergonomic single collapsible per tool use with summary as clickable header
- Formatted results (like todo lists) displayed openly after collapsibles for quick scanning
- Automatic Markdown escaping handled by Remark library for robust formatting
- User message timestamps displayed as h3 headings for clear chronological navigation
- Assistant messages fully support markdown formatting (bold, code, lists, etc.) with smart collapsing for readability
- Long assistant messages automatically collapse after the first 3 paragraphs or first non-paragraph block under "More..." details
- Proper padding in collapsible summaries for Markdown formatting activation
- Uses Remark with GFM plugin for table support and proper CommonMark output
- Automatic handling of problematic cases like nested HTML, markdown special characters, and pipe characters
- Multiple chats exported in chronological order (by last message timestamp) for better readability

## CLI Usage Examples

```bash
# Export all chats from a project (separate mode, default)
bin/claude-history-export ~/.claude/projects/my-project

# Export current directory's project
bin/claude-history-export --current-project

# Export with merged/deduplicated timeline (useful for forked chats)
bin/claude-history-export ~/.claude/projects/my-project --multiple-chats=merge

# Export to specific file
bin/claude-history-export ~/.claude/projects/my-project --output custom.md

# Show help
bin/claude-history-export --help
```

### When to use merge mode

Use `--multiple-chats=merge` when:
- Your project has many forked chats with shared history
- You want a single chronological timeline without duplication
- You want to see the actual conversation flow across all branches

Use the default separate mode when:
- You want to see each chat independently
- You need to understand the fork structure
- You want per-chat metadata and clear boundaries

## Testing

The test suite creates mock JSONL data and validates:

- Full project export functionality
- Specific chat filtering
- Timestamp headings for user messages
- Meta message handling
- Error conditions (invalid paths, malformed data)
- Help text display
