/**
 * Claude Code History Exporter CLI application
 * Main application entry point and CLI handling
 */

import { basename } from "https://deno.land/std@0.208.0/path/mod.ts";
import { type BaseCliOptions, parseCliArgs, showHelp } from "../cli-args.ts";
import { detectCurrentProject } from "../claude-project/claude-project.ts";
import { exportChat, exportProject } from "./export.ts";
import type { AppCliOptions } from "./chat-processing.ts";

/**
 * Application-specific CLI options
 */
export interface CliOptions extends BaseCliOptions {
  input?: string; // Path to project folder or chat JSONL file
  output?: string;
  "current-project"?: boolean; // Use current directory's Claude project
  "multiple-chats"?: "separate" | "merge"; // How to handle multiple chats
  _?: (string | number)[]; // Positional arguments
}

/**
 * Parse command line arguments for this application
 */
export function parseAppArgs(args: string[] = Deno.args): CliOptions {
  const parsed = parseCliArgs<CliOptions>(args, {
    string: ["output", "multiple-chats"],
    boolean: ["current-project"],
    alias: {
      o: "output",
    },
  });

  // Take first positional argument as input
  if (parsed._ && parsed._.length > 0) {
    parsed.input = String(parsed._[0]);
  }

  // Validate multiple-chats option
  if (
    parsed["multiple-chats"] &&
    parsed["multiple-chats"] !== "separate" &&
    parsed["multiple-chats"] !== "merge"
  ) {
    throw new Error(
      `Invalid value for --multiple-chats: "${parsed["multiple-chats"]}". Must be "separate" or "merge".`,
    );
  }

  return parsed;
}

/**
 * Show help information for Claude Code History Exporter
 */
export function showAppHelp() {
  showHelp(
    "Claude Code History Exporter",
    "Export Claude Code chat history to Markdown format.",
    "claude-history-export [<input>] [options]",
    [
      {
        flag: "<input>",
        description: "Path to Claude project directory or chat JSONL file",
      },
      {
        flag: "--current-project",
        description: "Use current directory's Claude project",
      },
      {
        flag: "--output <path>",
        description: "Output markdown file path (default: stdout)",
      },
      {
        flag: "--multiple-chats <mode>",
        description:
          'How to handle multiple chats: "separate" or "merge" (default: separate)',
      },
      { flag: "--help", description: "Show this help message" },
    ],
    [
      {
        description: "Export all chats from a project to stdout",
        command: "claude-history-export ~/.claude/projects/my-project",
      },
      {
        description: "Export current directory's project",
        command: "claude-history-export --current-project",
      },
      {
        description: "Export single chat file to stdout",
        command:
          "claude-history-export ~/.claude/projects/my-project/chat123.jsonl",
      },
      {
        description: "Export to file",
        command:
          "claude-history-export ~/.claude/projects/my-project --output export.md",
      },
      {
        description: "Export with merged chats (deduplicated timeline)",
        command:
          "claude-history-export ~/.claude/projects/my-project --multiple-chats=merge",
      },
    ],
  );
}

/**
 * Convert CLI options to app options format
 */
function convertCliOptions(cliOptions: CliOptions): AppCliOptions {
  return {
    output: cliOptions.output,
    currentProject: cliOptions["current-project"],
    multipleChats: cliOptions["multiple-chats"],
  };
}

/**
 * Resolve input path from CLI options
 * Returns object with path type and resolved path
 */
export async function resolveInputPath(
  options: CliOptions,
): Promise<{ type: "project" | "chat"; path: string }> {
  if (!options.input && options["current-project"]) {
    // Use current project detection
    const detectedProject = await detectCurrentProject();
    if (!detectedProject) {
      throw new Error(
        "No Claude project found for current directory. Make sure you're in a directory that has a corresponding project in ~/.claude/projects/",
      );
    }
    return { type: "project", path: detectedProject };
  }

  if (!options.input) {
    throw new Error(
      "No input provided. Provide a path to a Claude project directory or chat JSONL file, or use --current-project flag.",
    );
  }

  // Check if input is a JSONL file
  if (options.input.endsWith(".jsonl")) {
    return { type: "chat", path: options.input };
  }

  // Assume it's a project directory
  return { type: "project", path: options.input };
}

/**
 * Main entry point for the CLI application
 */
export async function main(args: string[] = Deno.args): Promise<void> {
  const options = parseAppArgs(args);

  if (options.help || (!options.input && !options["current-project"])) {
    showAppHelp();
    return;
  }

  const { type, path } = await resolveInputPath(options);
  const appOptions = convertCliOptions(options);

  if (type === "chat") {
    // Export single chat file
    const chatName = basename(path, ".jsonl");
    console.error(`Exporting chat: ${chatName}`);
    if (options.output) {
      console.error(`Output file: ${options.output}`);
    } else {
      console.error(`Output: stdout`);
    }

    await exportChat(path, appOptions);
  } else {
    // Export entire project
    const projectName = basename(path);
    console.error(`Exporting project: ${projectName}`);
    if (options.output) {
      console.error(`Output file: ${options.output}`);
    } else {
      console.error(`Output: stdout`);
    }

    await exportProject(path, appOptions);
  }
}

// Run main if this is the entry point
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    Deno.exit(1);
  }
}
