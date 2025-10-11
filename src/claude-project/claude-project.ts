/**
 * Claude Code project detection and structure utilities
 * Specific to Claude Code's project organization in ~/.claude/projects
 */

import { exists } from "https://deno.land/std@0.208.0/fs/mod.ts";
import { basename, join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { parseJsonlFile } from "../jsonl.ts";
import { type ChatEntry, ChatEntrySchema, type ChatMessage } from "./types.ts";

/**
 * Auto-detect Claude project from current directory
 * Looks for matching project in ~/.claude/projects based on directory name
 */
export async function detectCurrentProject(): Promise<string | null> {
  const currentDir = Deno.cwd();
  const currentDirName = basename(currentDir);

  // Look for Claude project in ~/.claude/projects that matches current directory name
  //
  // Note: An alternative approach would be to scan all JSONL files in ~/.claude/projects
  // and check their 'cwd' field to find the project that matches the current directory.
  // However, this would require reading and parsing potentially many files, making it
  // much slower than the directory name matching approach used here.

  const homeDir = Deno.env.get("HOME");
  if (!homeDir) {
    return null;
  }

  const claudeProjectsDir = join(homeDir, ".claude", "projects");
  if (!await exists(claudeProjectsDir)) {
    return null;
  }

  // Try exact match first
  const exactMatch = join(claudeProjectsDir, currentDirName);
  if (await exists(exactMatch)) {
    return exactMatch;
  }

  // Try full path encoding (Claude sometimes uses full path with slashes and dots replaced by hyphens)
  const fullPathEncoded = currentDir.replace(/[\/\.]/g, "-");
  const fullPathMatch = join(claudeProjectsDir, fullPathEncoded);
  if (await exists(fullPathMatch)) {
    return fullPathMatch;
  }

  // Try common variations of directory names
  const variations = [
    currentDirName.replace(/[-_]/g, "-"),
    currentDirName.replace(/[-_]/g, "_"),
    currentDirName.replace(/[-_]/g, ""),
    currentDirName.replace(/\./g, "-"),
    currentDirName.toLowerCase(),
    currentDirName.toLowerCase().replace(/[-_]/g, "-"),
    currentDirName.toLowerCase().replace(/\./g, "-"),
  ];

  for (const variation of variations) {
    const projectPath = join(claudeProjectsDir, variation);
    if (await exists(projectPath)) {
      return projectPath;
    }
  }

  return null;
}

/**
 * Find chat files in a Claude project directory, optionally filtering by chat IDs
 */
export async function findChatFiles(
  projectPath: string,
  chatIds?: string[],
): Promise<string[]> {
  if (!await exists(projectPath)) {
    throw new Error(`Project directory not found: ${projectPath}`);
  }

  const chatFiles: string[] = [];

  if (chatIds) {
    for (const chatId of chatIds) {
      const chatFile = join(projectPath, `${chatId}.jsonl`);
      if (await exists(chatFile)) {
        chatFiles.push(chatFile);
      } else {
        console.warn(`Warning: Chat file not found: ${chatFile}`);
      }
    }
  } else {
    for await (const entry of Deno.readDir(projectPath)) {
      if (entry.isFile && entry.name.endsWith(".jsonl")) {
        chatFiles.push(join(projectPath, entry.name));
      }
    }
  }

  if (chatFiles.length === 0) {
    throw new Error("No chat files found to export");
  }

  return chatFiles;
}

/**
 * Parse a Claude Code JSONL chat file with validation
 */
export async function parseClaudeChatFile(
  filePath: string,
): Promise<ChatEntry[]> {
  return await parseJsonlFile(filePath, (obj) => ChatEntrySchema.parse(obj));
}

/**
 * Get a timestamp from a Claude chat file by reading the first or last entry
 * @param chatFile - Path to the chat file
 * @param position - 'start' to get the first timestamp, 'end' to get the last timestamp
 */
export async function getChatTime(
  chatFile: string,
  position: "start" | "end" = "start",
): Promise<Date> {
  try {
    const content = await Deno.readTextFile(chatFile);
    const lines = content.trim().split("\n").filter((line) => line.trim());

    if (lines.length === 0) {
      return new Date(0); // Fallback for empty files
    }

    // Determine iteration order based on position
    const lineIndices = position === "end"
      ? Array.from({ length: lines.length }, (_, i) => lines.length - 1 - i)
      : Array.from({ length: lines.length }, (_, i) => i);

    // Try to parse lines to get the timestamp
    for (const i of lineIndices) {
      try {
        const json = JSON.parse(lines[i]);
        const entry = ChatEntrySchema.parse(json);
        if ("timestamp" in entry) {
          return new Date(entry.timestamp);
        }
      } catch {
        // Skip malformed lines
        continue;
      }
    }

    return new Date(0); // Fallback if no valid timestamps found
  } catch {
    return new Date(0); // Fallback for file read errors
  }
}

/**
 * Sort Claude chat files by chronological order (earliest end time first)
 */
export async function sortChatFilesByTime(
  chatFiles: string[],
): Promise<string[]> {
  const chatFilesWithTimes = await Promise.all(
    chatFiles.map(async (chatFile) => ({
      file: chatFile,
      endTime: await getChatTime(chatFile, "end"),
    })),
  );

  return chatFilesWithTimes
    .sort((a, b) => a.endTime.getTime() - b.endTime.getTime())
    .map((item) => item.file);
}

/**
 * Extract metadata from Claude chat entries
 */
export function extractChatMetadata(
  entries: ChatEntry[],
): Record<string, string> {
  const chatMessages = entries.filter((entry) =>
    "sessionId" in entry
  ) as ChatMessage[];
  if (chatMessages.length === 0) return {};

  const firstEntry = chatMessages[0];
  const lastEntry = chatMessages[chatMessages.length - 1];

  const userMessages = chatMessages.filter((msg) => msg.type === "user");
  const assistantMessages = chatMessages.filter((msg) =>
    msg.type === "assistant"
  );

  // Extract model info from assistant messages
  const models = new Set(
    assistantMessages
      .map((msg) => "model" in msg.message ? msg.message.model : null)
      .filter(Boolean),
  );

  // Calculate total tokens from assistant messages
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  assistantMessages.forEach((msg) => {
    if ("usage" in msg.message && msg.message.usage) {
      totalInputTokens += msg.message.usage.input_tokens || 0;
      totalOutputTokens += msg.message.usage.output_tokens || 0;
    }
  });

  return {
    "Session ID": firstEntry.sessionId,
    "Working Directory": firstEntry.cwd,
    "Claude Code Version": firstEntry.version,
    "Start Time": firstEntry.timestamp,
    "End Time": lastEntry.timestamp,
    "Total Messages": entries.length.toString(),
    "User Messages": userMessages.length.toString(),
    "Assistant Messages": assistantMessages.length.toString(),
    "Models Used": Array.from(models).join(", ") || "Unknown",
    "Total Input Tokens": totalInputTokens.toString(),
    "Total Output Tokens": totalOutputTokens.toString(),
    "Total Tokens": (totalInputTokens + totalOutputTokens).toString(),
  };
}
