/**
 * Claude Code chat export functionality
 * Orchestrates the export process from Claude projects to markdown
 */

import { basename } from "https://deno.land/std@0.208.0/path/mod.ts";
import { u } from "npm:unist-builder@4";
import type { RootContent } from "npm:@types/mdast@4";
import {
  createMetadataTableNodes,
  stringifyMarkdown,
} from "../content/markdown.ts";
import {
  extractChatMetadata,
  findChatFiles,
  getChatTime,
  parseClaudeChatFile,
  sortChatFilesByTime,
} from "../claude-project/claude-project.ts";
import {
  type AppCliOptions,
  createChatEntryNodes,
  createExportMetadata,
  mergeToolResults,
} from "./chat-processing.ts";
import { formatTimestamp } from "./claude-formatting.ts";

/**
 * Build markdown document with merged chats (deduplicated timeline)
 */
async function buildMergedMarkdownDocument(
  title: string,
  chatFiles: string[],
  options: AppCliOptions,
): Promise<string> {
  const documentNodes: RootContent[] = [];

  // Main title
  documentNodes.push(u("heading", { depth: 1 as const }, [u("text", title)]));

  // Export metadata table
  if (chatFiles.length > 1) {
    const exportMetadata = createExportMetadata(
      basename(chatFiles[0]).split("/").slice(-2, -1)[0] || "Chat",
      chatFiles,
      options,
    );
    const exportMetadataNodes = createMetadataTableNodes(exportMetadata);
    documentNodes.push(...exportMetadataNodes);
    documentNodes.push(u("thematicBreak"));
  }

  // Sort chats by first message time, then by last message time
  const chatFilesWithTimes = await Promise.all(
    chatFiles.map(async (chatFile) => ({
      file: chatFile,
      startTime: await getChatTime(chatFile, "start"),
      endTime: await getChatTime(chatFile, "end"),
    })),
  );
  const sortedChatFiles = chatFilesWithTimes
    .sort((a, b) => {
      const startDiff = a.startTime.getTime() - b.startTime.getTime();
      if (startDiff !== 0) return startDiff;
      return a.endTime.getTime() - b.endTime.getTime();
    })
    .map((item) => item.file);

  // Show metadata tables for each chat
  for (const chatFile of sortedChatFiles) {
    const chatId = basename(chatFile, ".jsonl");
    console.error(`Loading chat metadata: ${chatId}`);

    try {
      const entries = await parseClaudeChatFile(chatFile);
      const metadata = extractChatMetadata(entries);

      // Format timestamps
      const formattedMetadata = { ...metadata };
      if (formattedMetadata["Start Time"]) {
        formattedMetadata["Start Time"] = formatTimestamp(
          formattedMetadata["Start Time"],
        );
      }
      if (formattedMetadata["End Time"]) {
        formattedMetadata["End Time"] = formatTimestamp(
          formattedMetadata["End Time"],
        );
      }

      // Add chat heading and metadata
      documentNodes.push(
        u("heading", { depth: 2 as const }, [u("text", `Chat: ${chatId}`)]),
      );
      const metadataNodes = createMetadataTableNodes(formattedMetadata);
      documentNodes.push(...metadataNodes);
    } catch (error) {
      console.error(`Error loading metadata for ${chatFile}:`, error);
    }
  }

  documentNodes.push(u("thematicBreak"));

  // Load all entries and deduplicate by UUID
  const entriesByUuid = new Map();
  const entryTimestamps = new Map();

  for (const chatFile of chatFiles) {
    const chatId = basename(chatFile, ".jsonl");
    console.error(`Processing chat entries: ${chatId}`);

    try {
      const entries = await parseClaudeChatFile(chatFile);
      console.error(`  Found ${entries.length} entries`);

      for (const entry of entries) {
        // Skip summary entries in merge mode
        if ("type" in entry && entry.type === "summary") {
          continue;
        }

        // Extract UUID and timestamp
        const uuid = "uuid" in entry ? entry.uuid : null;
        const timestamp = "timestamp" in entry ? entry.timestamp : null;

        if (uuid && !entriesByUuid.has(uuid)) {
          entriesByUuid.set(uuid, { entry, chatId });
          if (timestamp) {
            entryTimestamps.set(uuid, new Date(timestamp));
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error(`Error processing ${chatFile}:`, errorMessage);
    }
  }

  // Sort entries by timestamp
  const sortedUuids = Array.from(entriesByUuid.keys()).sort((a, b) => {
    const timeA = entryTimestamps.get(a) || new Date(0);
    const timeB = entryTimestamps.get(b) || new Date(0);
    return timeA.getTime() - timeB.getTime();
  });

  console.error(
    `Merged ${sortedUuids.length} unique entries from ${chatFiles.length} chats`,
  );

  // Add conversation heading
  documentNodes.push(
    u("heading", { depth: 2 as const }, [u("text", "Conversation Timeline")]),
  );

  // Process entries with tool result merging per chat
  const chatEntries = new Map();
  for (const [, { entry, chatId }] of entriesByUuid) {
    if (!chatEntries.has(chatId)) {
      chatEntries.set(chatId, []);
    }
    chatEntries.get(chatId).push(entry);
  }

  // Merge tool results within each chat's entries
  const mergedChatEntries = new Map();
  for (const [chatId, entries] of chatEntries) {
    mergedChatEntries.set(chatId, mergeToolResults(entries));
  }

  // Rebuild the merged entries map with tool results
  const mergedEntriesByUuid = new Map();
  for (const entries of mergedChatEntries.values()) {
    for (const entry of entries) {
      const uuid = "uuid" in entry ? entry.uuid : null;
      if (uuid) {
        mergedEntriesByUuid.set(uuid, entry);
      }
    }
  }

  // Output entries in chronological order with chat markers
  let lastChatId = null;
  for (const uuid of sortedUuids) {
    const { chatId } = entriesByUuid.get(uuid);
    const entry = mergedEntriesByUuid.get(uuid);

    if (!entry) continue;

    // Add HTML comment when switching to a different chat
    if (lastChatId !== chatId) {
      documentNodes.push(
        u("html", `<!-- From chat: ${chatId} -->`),
      );
      lastChatId = chatId;
    }

    const entryNodes = createChatEntryNodes(entry, options);
    documentNodes.push(...entryNodes);
  }

  return stringifyMarkdown(documentNodes);
}

/**
 * Build the complete markdown document from chat files (separate mode)
 */
async function buildSeparateMarkdownDocument(
  title: string,
  chatFiles: string[],
  options: AppCliOptions,
): Promise<string> {
  const documentNodes: RootContent[] = [];

  // Main title
  documentNodes.push(u("heading", { depth: 1 as const }, [u("text", title)]));

  // Export metadata table (only for multi-chat exports)
  if (chatFiles.length > 1) {
    const exportMetadata = createExportMetadata(
      basename(chatFiles[0]).split("/").slice(-2, -1)[0] || "Chat",
      chatFiles,
      options,
    );
    const exportMetadataNodes = createMetadataTableNodes(exportMetadata);
    documentNodes.push(...exportMetadataNodes);
    documentNodes.push(u("thematicBreak"));
  }

  // Sort chat files by chronological order
  const sortedChatFiles = await sortChatFilesByTime(chatFiles);

  for (const chatFile of sortedChatFiles) {
    const chatId = basename(chatFile, ".jsonl");
    console.error(`Processing chat: ${chatId}`);

    // Chat heading
    documentNodes.push(
      u("heading", { depth: 2 as const }, [u("text", `Chat: ${chatId}`)]),
    );

    try {
      const entries = await parseClaudeChatFile(chatFile);
      console.error(`  Found ${entries.length} entries`);

      // Add metadata table for this chat
      const metadata = extractChatMetadata(entries);
      // Apply timestamp formatting to metadata
      const formattedMetadata = { ...metadata };
      if (formattedMetadata["Start Time"]) {
        formattedMetadata["Start Time"] = formatTimestamp(
          formattedMetadata["Start Time"],
        );
      }
      if (formattedMetadata["End Time"]) {
        formattedMetadata["End Time"] = formatTimestamp(
          formattedMetadata["End Time"],
        );
      }

      const metadataNodes = createMetadataTableNodes(formattedMetadata);
      documentNodes.push(...metadataNodes);

      // Process entries and merge tool results with tool uses
      const processedEntries = mergeToolResults(entries);

      for (const entry of processedEntries) {
        const entryNodes = createChatEntryNodes(entry, options);
        documentNodes.push(...entryNodes);
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error(`Error processing ${chatFile}:`, errorMessage);
      documentNodes.push(
        u("paragraph", [
          u("emphasis", [
            u("text", `Error processing this chat: ${errorMessage}`),
          ]),
        ]),
      );
    }

    // Add separator
    documentNodes.push(u("thematicBreak"));
  }

  // Build and return markdown
  return stringifyMarkdown(documentNodes);
}

/**
 * Build the complete markdown document from chat files
 */
async function buildMarkdownDocument(
  title: string,
  chatFiles: string[],
  options: AppCliOptions,
): Promise<string> {
  if (options.multipleChats === "merge") {
    return buildMergedMarkdownDocument(title, chatFiles, options);
  } else {
    return buildSeparateMarkdownDocument(title, chatFiles, options);
  }
}

/**
 * Export a Claude project to markdown
 */
export async function exportProject(
  projectPath: string,
  options: AppCliOptions,
): Promise<void> {
  const projectName = basename(projectPath);

  // Find chat files
  const chatFiles = await findChatFiles(projectPath, options.chats);
  console.error(`Found ${chatFiles.length} chat file(s)`);

  // Build markdown document
  const title = `${projectName} - Claude Code History Export`;
  const markdown = await buildMarkdownDocument(title, chatFiles, options);

  // Output result
  if (options.output) {
    await Deno.writeTextFile(options.output, markdown);
    console.error(`✅ Export completed: ${options.output}`);
  } else {
    // Output to stdout
    console.log(markdown);
  }
}

/**
 * Export a single chat file to markdown
 */
export async function exportChat(
  chatPath: string,
  options: AppCliOptions,
): Promise<void> {
  const chatName = basename(chatPath, ".jsonl");
  console.error(`Processing chat: ${chatName}`);

  // Build markdown document with single chat
  const title = `${chatName} - Claude Code Chat Export`;
  const markdown = await buildMarkdownDocument(title, [chatPath], options);

  // Output result
  if (options.output) {
    await Deno.writeTextFile(options.output, markdown);
    console.error(`✅ Export completed: ${options.output}`);
  } else {
    // Output to stdout
    console.log(markdown);
  }
}
