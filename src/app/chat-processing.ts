/**
 * Claude Code chat processing and entry handling
 * Application-specific logic for processing Claude chat entries
 */

import { u } from "npm:unist-builder@4";
import { parseMarkdown } from "../content/markdown.ts";
import {
  createToolUseNodes,
  formatTimestamp,
  processAssistantContent,
} from "./claude-formatting.ts";
import type { RootContent } from "npm:@types/mdast@4";
import type {
  ChatEntry,
  ChatMessage,
  ContentBlock,
  SummaryMessage,
  SystemMessage,
} from "../claude-project/types.ts";

/**
 * Application CLI options
 */
export interface AppCliOptions {
  project?: string;
  output?: string;
  chats?: string[];
  help?: boolean;
  currentProject?: boolean;
  multipleChats?: "separate" | "merge";
}

/**
 * Merge tool results with their corresponding tool uses
 */
export function mergeToolResults(entries: ChatEntry[]): ChatEntry[] {
  const result: ChatEntry[] = [];
  const toolResults = new Map<string, string>();

  // First pass: collect all tool results
  for (const entry of entries) {
    if (
      "message" in entry && entry.type === "user" &&
      typeof entry.message.content !== "string"
    ) {
      const content = entry.message.content as ContentBlock[];
      for (const block of content) {
        if (
          block.type === "tool_result" && block.tool_use_id && block.content
        ) {
          // Handle both string and complex content
          const content = typeof block.content === "string"
            ? block.content
            : JSON.stringify(block.content, null, 2);
          toolResults.set(block.tool_use_id, content);
        }
      }
    }
  }

  // Second pass: process entries and skip standalone tool result messages
  for (const entry of entries) {
    if (
      "message" in entry && entry.type === "user" &&
      typeof entry.message.content !== "string"
    ) {
      const content = entry.message.content as ContentBlock[];
      // Skip entries that are only tool results
      const hasNonToolResult = content.some((block) =>
        block.type !== "tool_result"
      );
      if (!hasNonToolResult) {
        continue; // Skip this entry
      }
    }

    // For assistant messages, attach tool results
    if ("message" in entry && entry.type === "assistant") {
      const modifiedEntry = { ...entry, toolResults };
      result.push(modifiedEntry);
    } else {
      result.push(entry);
    }
  }

  return result;
}

/**
 * Extract text content as AST nodes, handling both string and array content
 */
function extractTextContentAsNodes(
  content: string | ContentBlock[],
  toolResults?: Map<string, string>,
  isAssistant = false,
): RootContent[] {
  // Convert string content to array format for unified processing
  if (typeof content === "string") {
    content = [{ type: "text", text: content }];
  }

  const nodes: RootContent[] = [];

  for (const block of content) {
    if (block.type === "text" && block.text) {
      if (isAssistant) {
        // Parse assistant text content as markdown to preserve formatting
        const parsed = parseMarkdown(block.text);
        nodes.push(...parsed);
      } else {
        // User text should preserve newlines using break nodes
        const lines = block.text.split("\n");
        const children: Array<{ type: string; value?: string }> = []; // Allow mixed text and break nodes

        for (let i = 0; i < lines.length; i++) {
          children.push(u("text", lines[i]));

          // Add break between lines (except after the last line)
          if (i < lines.length - 1) {
            children.push(u("break"));
          }
        }

        nodes.push(u("paragraph", children) as RootContent);
      }
    } else if (block.type === "tool_use") {
      const result = toolResults && block.id
        ? toolResults.get(block.id)
        : undefined;
      const toolNodes = createToolUseNodes(block, result);
      nodes.push(...toolNodes);
    }
    // Skip tool_result blocks as they're now handled above
    // Skip thinking blocks as they're internal to Claude
  }

  return nodes;
}

/**
 * Create chat entry nodes from a chat entry
 */
export function createChatEntryNodes(
  entry: ChatEntry,
  _options: AppCliOptions,
): RootContent[] {
  if ("type" in entry && entry.type === "summary") {
    const summary = entry as SummaryMessage;
    const summaryNodes = [
      u("heading", { depth: 2 as const }, [u("text", "Summary")]),
      u("paragraph", [u("text", summary.summary)]),
    ];
    // Apply conditional collapsing to ensure any headings are properly handled
    return processAssistantContent(summaryNodes);
  }

  if ("type" in entry && entry.type === "system") {
    const systemMsg = entry as SystemMessage;

    const systemNodes = [
      u("heading", { depth: 3 as const }, [
        u("text", formatTimestamp(systemMsg.timestamp)),
      ]),
      u("paragraph", [
        u("text", "🔧 "),
        u("strong", [u("text", "System")]),
        u("text", `: ${systemMsg.content}`),
      ]),
    ];
    // Apply conditional collapsing to ensure any headings are properly handled
    return processAssistantContent(systemNodes);
  }

  const chatMsg = entry as ChatMessage;

  const nodes: RootContent[] = [];

  // Use unified pipeline for both string and array content
  const toolResults = "toolResults" in chatMsg
    ? (chatMsg as ChatMessage & { toolResults: Map<string, string> })
      .toolResults
    : undefined;

  const contentNodes: RootContent[] = extractTextContentAsNodes(
    chatMsg.message.content,
    toolResults,
    chatMsg.type === "assistant",
  );

  if (contentNodes.length === 0) {
    return [];
  }

  // Add timestamp heading for user messages
  if (chatMsg.type === "user") {
    nodes.push(
      u("heading", { depth: 3 as const }, [
        u("text", formatTimestamp(chatMsg.timestamp)),
      ]),
    );

    // Convert content nodes to blockquote nodes
    nodes.push(u("blockquote", contentNodes) as RootContent);
  } else if (chatMsg.type === "assistant") {
    // Assistant messages: ALWAYS use collapsible truncation to ensure no bare headings
    const processedNodes = processAssistantContent(contentNodes);
    nodes.push(...processedNodes);
  } else {
    // Fallback for any other message types: treat as assistant to ensure headings are collapsed
    const processedNodes = processAssistantContent(contentNodes);
    nodes.push(...processedNodes);
  }

  return nodes;
}

/**
 * Create export-level metadata
 */
export function createExportMetadata(
  projectName: string,
  chatFiles: string[],
  options: AppCliOptions,
): Record<string, string> {
  const chatCount = chatFiles.length;
  const selectedChats = options.chats ? options.chats.length : chatCount;
  const exportTime = formatTimestamp(new Date());

  return {
    "Project Name": projectName,
    "Export Date": exportTime,
    "Total Chat Files": chatCount.toString(),
    "Exported Chats": selectedChats.toString(),
    "Output Format": "Markdown",
  };
}
