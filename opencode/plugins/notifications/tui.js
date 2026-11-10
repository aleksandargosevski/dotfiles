import path from "path"
import { Plugin } from "@opencode/plugin/tui"

// Replaces the built-in `opencode.notifications` (disabled in cli.json) so
// notifications show the project and branch instead of a bare "Session done".
export default Plugin.define({
  id: "godacode.notifications",
  setup(context) {
    const notified = new Set()
    const startedAt = new Map()
    const pendingForms = new Set()
    const pendingPermissions = new Set()

    const startSession = (sessionID) => {
      notified.delete(sessionID)
      startedAt.set(sessionID, Date.now())
    }

    const notifyDone = async (sessionID, { icon = "✓", detail, sound } = {}) => {
      const isSubagent = Boolean(context.data.session.get(sessionID)?.parentID)
      const summary = await summarizeTurn(context, sessionID, startedAt.get(sessionID))
      startedAt.delete(sessionID)
      notify(context, sessionID, {
        icon,
        detail,
        summary,
        sound: sound ?? (isSubagent ? "subagent_done" : "done"),
      })
    }

    const finishSession = (sessionID) => {
      if (notified.has(sessionID)) return
      notified.add(sessionID)
      notifyDone(sessionID)
    }

    const notifyWaiting = (sessionID, { icon, detail, sound }) => {
      const started = startedAt.get(sessionID)
      const summary = started ? `radi ${formatDuration(Date.now() - started)}` : undefined
      notify(context, sessionID, { icon, detail, summary, sound })
    }

    const unsubscribers = [
      context.data.on("form.created", (event) => {
        const form = event.data.form
        if (pendingForms.has(form.id)) return
        pendingForms.add(form.id)
        notifyWaiting(form.sessionID, { icon: "❓", detail: form.title ?? "Input needs response", sound: "question" })
      }),
      context.data.on("form.replied", (event) => pendingForms.delete(event.data.id)),
      context.data.on("form.cancelled", (event) => pendingForms.delete(event.data.id)),
      context.data.on("permission.asked", (event) => {
        if (pendingPermissions.has(event.data.id)) return
        pendingPermissions.add(event.data.id)
        notifyWaiting(event.data.sessionID, { icon: "🔐", detail: "Permission needs input", sound: "permission" })
      }),
      context.data.on("permission.replied", (event) => pendingPermissions.delete(event.data.requestID)),
      context.data.on("session.execution.started", (event) => startSession(event.data.sessionID)),
      context.data.on("session.execution.succeeded", (event) => {
        const sessionID = event.data.sessionID
        if (!context.data.session.get(sessionID)?.parentID && hasRunningSubagents(context, sessionID)) return
        finishSession(sessionID)
      }),
      context.data.on("session.execution.interrupted", (event) => finishSession(event.data.sessionID)),
      context.data.on("session.execution.failed", (event) => {
        const sessionID = event.data.sessionID
        const error = event.data.error
        if (notified.has(sessionID)) return
        notified.add(sessionID)
        if (!isQuotaError(error)) {
          notifyDone(sessionID, { icon: "✗", detail: error.message, sound: "error" })
          context.ui.toast.show({ sessionID, title: "Session failed", message: error.message, variant: "error" })
        }
      }),
    ]

    return () => unsubscribers.reverse().forEach((unsubscribe) => unsubscribe())
  },
})

async function notify(context, sessionID, { icon, detail, summary, sound }) {
  const session = sessionID ? context.data.session.get(sessionID) : undefined
  const isSubagent = session?.parentID !== undefined
  const sessionTitle = session?.title ?? "OpenCode"

  try {
    const title = await describeProject(context, session?.location)
    // Ghostty uses its window title as the notification subtitle
    if (!isSubagent) setTerminalTitle(summary ?? "OpenCode")
    await context.attention.notify({
      title,
      message: detail ? `${icon} ${sessionTitle}: ${detail}` : `${icon} ${sessionTitle}`,
      notification: isSubagent ? false : { when: "blurred" },
      sound: { name: sound, when: "always" },
    })
  } catch (error) {
    console.error("[godacode.notifications] failed to notify:", error)
  }
}

async function describeProject(context, location) {
  const resolved = location ?? context.location ?? context.data.location.default()
  const directory = resolved?.directory
  if (!directory) return "OpenCode"

  const project = path.basename(directory)
  const branch = await currentBranch(context, resolved)
  return branch ? `${project} · ${branch}` : project
}

async function currentBranch(context, location) {
  try {
    if (!context.data.location.vcs.info(location)) await context.data.location.vcs.sync(location)
    return context.data.location.vcs.info(location)?.branch?.current
  } catch {
    return undefined
  }
}

async function summarizeTurn(context, sessionID, startedAt) {
  const parts = []
  if (startedAt) parts.push(formatDuration(Date.now() - startedAt))

  const changedFiles = await countTurnChanges(context, sessionID)
  if (changedFiles > 0) parts.push(formatChangedFiles(changedFiles))

  return parts.length ? parts.join(" · ") : undefined
}

async function countTurnChanges(context, sessionID) {
  try {
    const response = await context.client.session.diff({ sessionID, context: 0 })
    const files = Array.isArray(response) ? response : response?.data
    return Array.isArray(files) ? files.length : 0
  } catch (error) {
    console.error("[godacode.notifications] failed to read turn diff:", error)
    return 0
  }
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function formatChangedFiles(count) {
  const lastDigit = count % 10
  const lastTwoDigits = count % 100
  if (lastDigit === 1 && lastTwoDigits !== 11) return `${count} izmenjen fajl`
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return `${count} izmenjena fajla`
  return `${count} izmenjenih fajlova`
}

// Inside tmux the title has to be passed through to the outer terminal, otherwise
// tmux keeps it as the pane title (needs `allow-passthrough on`).
function setTerminalTitle(text) {
  const sanitized = text.replace(/[\x00-\x1f\x7f]/g, "")
  const sequence = `\x1b]2;${sanitized}\x07`
  const output = process.env.TMUX ? `\x1bPtmux;${sequence.replaceAll("\x1b", "\x1b\x1b")}\x1b\\` : sequence
  process.stdout.write(output)
}

function hasRunningSubagents(context, sessionID) {
  return context.data.session
    .family(sessionID)
    .some(
      (id) =>
        id !== sessionID &&
        context.data.session.get(id)?.parentID === sessionID &&
        context.data.session.status(id) === "running",
    )
}

function isQuotaError(error) {
  return error.type === "provider.free-limit" || error.type === "provider.go-limit"
}
