/**
* Destructive Action Guard
*
* Prompts for confirmation before destructive bash commands, package installs,
* and access to protected paths.
*
* Each prompt offers three choices: allow once, block, or allow that category
* for the rest of the session.
*
* Catastrophic commands (rm -rf /, dd to disk devices, etc.) are auto-denied
* with no confirmation — they are never safe to run from an agent.
*/

import { isToolCallEventType, type ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface GuardPattern {
 category: string;
 label: string;
 test: (command: string) => boolean;
}

interface AutoDenyPattern {
 label: string;
 test: (command: string) => boolean;
}

/** Tools that interact with file paths. */
type PathToolName = "read" | "write" | "edit";

interface ProtectedPath {
 /** Substring to match against the file path. */
 pattern: string;
 /** Which tool calls to block. */
 blockedTools: Set<PathToolName>;
 /** Human-readable label for the prompt/block reason. */
 label: string;
}

export default function (pi: ExtensionAPI) {
 const sessionAllowed = new Set<string>();

 pi.on("session_start", async () => {
   sessionAllowed.clear();
 });

 // ---------------------------------------------------------------
 // Auto-deny: catastrophic commands that are never safe from an agent.
 // These block immediately with no confirmation prompt.
 // ---------------------------------------------------------------
 const autoDenyPatterns: AutoDenyPattern[] = [
   {
     label: "recursive delete at filesystem root",
     test: (cmd) => /\brm\s+.*-[a-zA-Z]*r[a-zA-Z]*.*\s+\/\s*(?:$|[;&|])/i.test(cmd),
   },
   {
     label: "recursive delete of home directory",
     test: (cmd) => /\brm\s+.*-[a-zA-Z]*r[a-zA-Z]*.*\s+~\/?\s*(?:$|[;&|])/i.test(cmd),
   },
   {
     label: "dd write to raw disk device",
     test: (cmd) => /\bdd\b.*\bof=\/dev\/(sd[a-z]|nvme|vd[a-z]|hd[a-z]|disk)\b/i.test(cmd),
   },
   {
     label: "filesystem format",
     test: (cmd) => /\bmkfs\./i.test(cmd),
   },
   {
     label: "disk overwrite with /dev/zero or /dev/urandom",
     test: (cmd) => /\bdd\b.*\bif=\/dev\/(zero|urandom)\b/i.test(cmd),
   },
   {
     label: "fork bomb",
     test: (cmd) => /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;\s*:/.test(cmd),
   },
 ];

 // ---------------------------------------------------------------
 // Confirmable patterns: prompt user before running.
 // Order matters — more specific patterns first (force-push before push,
 // package-manager installs before the sudo catch-all).
 // ---------------------------------------------------------------
 const bashPatterns: GuardPattern[] = [
   // --- Destructive git operations ---
   {
     category: "git-force-push",
     label: "git force push",
     test: (cmd) => /\bgit\s+push\b.*(\s--force\b|\s-f\b|\s--force-with-lease\b)/i.test(cmd),
   },
   {
     category: "git-push",
     label: "git push",
     test: (cmd) => /\bgit\s+push\b/i.test(cmd),
   },
   {
     category: "git-reset",
     label: "git reset --hard",
     test: (cmd) => /\bgit\s+reset\b.*--hard\b/i.test(cmd),
   },
   {
     category: "git-clean",
     label: "git clean",
     test: (cmd) => /\bgit\s+clean\b.*-[a-zA-Z]*f/i.test(cmd),
   },
   {
     category: "git-branch-delete",
     label: "git branch delete",
     test: (cmd) => /\bgit\s+branch\b.*\s-(D|d)\b/i.test(cmd),
   },

   // --- Destructive filesystem / permissions ---
   {
     category: "rm",
     label: "destructive delete",
     test: (cmd) => /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\b|--recursive\b)/i.test(cmd),
   },
   {
     category: "chmod",
     label: "permission change (777)",
     test: (cmd) => /\b(chmod|chown)\b.*\b777\b/i.test(cmd),
   },

   // --- Publishing ---
   {
     category: "npm-publish",
     label: "npm publish",
     test: (cmd) => /\b(npm|npx|pnpm|yarn)\s+publish\b/i.test(cmd),
   },

   // --- Package installs (before sudo catch-all) ---
   {
     category: "npm-global-install",
     label: "npm global install",
     test: (cmd) =>
       /\b(npm|pnpm|bun)\s+(install|i|add)\s+(-g|--global)\b/.test(cmd) ||
       /\b(npm|pnpm|bun)\s+(-g|--global)\s+(install|i|add)\b/.test(cmd) ||
       /\byarn\s+global\s+add\b/.test(cmd),
   },
   {
     category: "pip-install",
     label: "pip install",
     test: (cmd) =>
       /\bpip3?\s+install\b/.test(cmd) ||
       /\bpython3?\s+-m\s+pip\s+install\b/.test(cmd),
   },
   {
     category: "brew-install",
     label: "brew install",
     test: (cmd) => /\bbrew\s+(install|cask\s+install)\b/.test(cmd),
   },
   {
     category: "cargo-install",
     label: "cargo install",
     test: (cmd) => /\bcargo\s+install\b/.test(cmd),
   },
   {
     category: "gem-install",
     label: "gem install",
     test: (cmd) => /\bgem\s+install\b/.test(cmd),
   },
   {
     category: "go-install",
     label: "go install",
     test: (cmd) => /\bgo\s+install\b/.test(cmd),
   },
   {
     category: "system-package-install",
     label: "system package install",
     test: (cmd) =>
       /\b(apt-get|apt|yum|dnf)\s+install\b/.test(cmd) ||
       /\bpacman\s+-S\b/.test(cmd) ||
       /\bapk\s+add\b/.test(cmd),
   },
   {
     category: "pi-install",
     label: "pi install",
     test: (cmd) => /\bpi\s+install\b/.test(cmd),
   },
   {
     category: "piped-install-script",
     label: "piped install script",
     test: (cmd) => /\b(curl|wget)\b.*\|\s*(ba)?sh\b/.test(cmd),
   },

   // --- Sudo catch-all (last so specific patterns above match first) ---
   {
     category: "sudo",
     label: "sudo",
     test: (cmd) => /\bsudo\b/i.test(cmd),
   },
 ];

 // ---------------------------------------------------------------
 // Protected paths: control which tools can access sensitive files.
 //   - .env files: block read, write, and edit (secrets should never
 //     enter the conversation context or be modified by the agent).
 //   - .git/ internals: block write and edit only (reads are fine for
 //     inspecting git state, but mutations risk repo corruption).
 // ---------------------------------------------------------------
 const protectedPaths: ProtectedPath[] = [
   {
     pattern: ".env",
     blockedTools: new Set(["read", "write", "edit"]),
     label: "secret file (.env)",
   },
   {
     pattern: ".git/",
     blockedTools: new Set(["write", "edit"]),
     label: ".git/ internal",
   },
 ];

 /**
  * Extract plausible file-path tokens from a bash command string.
  * This is intentionally simple — no shell parser dependency — and
  * errs on the side of over-matching (better a false prompt than a
  * missed secret-file access).
  */
 function extractPathTokens(command: string): string[] {
   const tokens: string[] = [];
   // Match quoted strings and bare tokens, skip flags
   const tokenRegex = /"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>|;&]+)/g;
   for (const match of command.matchAll(tokenRegex)) {
     const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
     if (token && !token.startsWith("-")) {
       tokens.push(token);
     }
   }
   return tokens;
 }

 pi.on("tool_call", async (event, ctx) => {
   // --- Bash commands ---
   if (isToolCallEventType("bash", event)) {
     const command = event.input.command;

     // 1. Auto-deny catastrophic commands — no prompt, just block.
     for (const pattern of autoDenyPatterns) {
       if (!pattern.test(command)) continue;
       const reason = `🚫 Auto-denied: ${pattern.label}`;
       if (ctx.hasUI) {
         ctx.ui.notify(reason, "error");
       }
       return { block: true, reason };
     }

     // 2. Check if bash command touches protected file paths.
     const tokens = extractPathTokens(command);
     for (const token of tokens) {
       for (const pp of protectedPaths) {
         if (!token.includes(pp.pattern)) continue;

         const sessionKey = `bash-path:${pp.pattern}`;
         if (sessionAllowed.has(sessionKey)) continue;

         if (!ctx.hasUI) {
           return { block: true, reason: `Bash access to ${pp.label} blocked (no UI for confirmation)` };
         }

         const allowAll = `Allow all bash access to "${pp.label}" this session`;
         const choice = await ctx.ui.select(
           `⚠️ Bash command touches ${pp.label}\n\n  ${command}\n\nAllow?`,
           ["Yes, this once", "No, block it", allowAll],
         );

         if (choice === allowAll) {
           sessionAllowed.add(sessionKey);
           break; // allowed for this protected path, check next
         }

         if (choice !== "Yes, this once") {
           return { block: true, reason: `Blocked by user: bash access to ${pp.label}` };
         }

         break; // allowed once for this protected path
       }
     }

     // 3. Dangerous-command confirmation.
     for (const pattern of bashPatterns) {
       if (!pattern.test(command)) continue;
       if (sessionAllowed.has(pattern.category)) return;

       if (!ctx.hasUI) {
         return { block: true, reason: `${pattern.label} blocked (no UI for confirmation)` };
       }

       const allowAll = `Allow all "${pattern.label}" this session`;
       const choice = await ctx.ui.select(
         `⚠️ ${pattern.label}\n\n  ${command}\n\nAllow?`,
         ["Yes, this once", "No, block it", allowAll],
       );

       if (choice === allowAll) {
         sessionAllowed.add(pattern.category);
         return;
       }

       if (choice !== "Yes, this once") {
         return { block: true, reason: `Blocked by user: ${pattern.label}` };
       }

       return; // allowed once
     }
   }

   // --- Protected path access (read / write / edit tools) ---
   let pathToolName: PathToolName | null = null;
   let path: string | null = null;
   if (isToolCallEventType("read", event)) {
     pathToolName = "read";
     path = event.input.path;
   } else if (isToolCallEventType("write", event)) {
     pathToolName = "write";
     path = event.input.path;
   } else if (isToolCallEventType("edit", event)) {
     pathToolName = "edit";
     path = event.input.path;
   }
   if (pathToolName && path !== null) {
     const toolName = pathToolName;

     for (const pp of protectedPaths) {
       if (!path.includes(pp.pattern)) continue;
       if (!pp.blockedTools.has(toolName as PathToolName)) continue;

       const sessionKey = `${toolName}-path:${pp.pattern}`;
       if (sessionAllowed.has(sessionKey)) return;

       if (!ctx.hasUI) {
         return { block: true, reason: `${toolName} on ${pp.label} blocked (no UI for confirmation)` };
       }

       const verb = toolName === "read" ? "read from" : "write to";
       const allowAll = `Allow all ${toolName} on "${pp.label}" this session`;
       const choice = await ctx.ui.select(
         `⚠️ ${toolName} on ${pp.label}\n\n  ${path}\n\nAllow ${verb}?`,
         ["Yes, this once", "No, block it", allowAll],
       );

       if (choice === allowAll) {
         sessionAllowed.add(sessionKey);
         return;
       }

       if (choice !== "Yes, this once") {
         return { block: true, reason: `Blocked by user: ${toolName} on ${pp.label}` };
       }

       return; // allowed once
     }
   }
 });
}
