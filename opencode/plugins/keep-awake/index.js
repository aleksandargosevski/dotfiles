import { execFile, spawn } from "child_process"
import { Plugin } from "@opencode/plugin"

const CAFFEINATE = "/usr/bin/caffeinate"
const ACTIVE_SESSIONS_TIMEOUT_MS = 15_000
const ACTIVE_SESSIONS_CACHE_MS = 5_000
const TRACKED_EVENTS = [
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.interrupted",
  "session.execution.failed",
  "form.created",
  "form.replied",
  "form.cancelled",
  "permission.asked",
  "permission.replied",
]

// Keeps the Mac from idle-sleeping while any session is actively working.
// Sessions waiting on a question or permission don't count, so the Mac may sleep then.
export default Plugin.define({
  id: "godacode.keep-awake",
  async setup(ctx) {
    if (process.platform !== "darwin") return

    const holderID = Symbol("keep-awake-holder")
    const running = new Set()
    const waiting = new Map()

    const sync = () => {
      const working = [...running].some((sessionID) => !waiting.get(sessionID)?.size)
      if (working) keepAwake.hold(holderID)
      else keepAwake.release(holderID)
    }

    const markWaiting = (sessionID, requestID) => {
      if (!waiting.has(sessionID)) waiting.set(sessionID, new Set())
      waiting.get(sessionID).add(requestID)
    }

    const clearWaiting = (sessionID, requestID) => {
      waiting.get(sessionID)?.delete(requestID)
      if (!waiting.get(sessionID)?.size) waiting.delete(sessionID)
    }

    const finishedDuringSeed = new Set()
    const finish = (sessionID) => {
      running.delete(sessionID)
      waiting.delete(sessionID)
      finishedDuringSeed.add(sessionID)
    }

    const handlers = {
      "session.execution.started": ({ sessionID }) => running.add(sessionID),
      "session.execution.succeeded": ({ sessionID }) => finish(sessionID),
      "session.execution.interrupted": ({ sessionID }) => finish(sessionID),
      "session.execution.failed": ({ sessionID }) => finish(sessionID),
      "form.created": ({ form }) => markWaiting(form.sessionID, form.id),
      "form.replied": ({ sessionID, id }) => clearWaiting(sessionID, id),
      "form.cancelled": ({ sessionID, id }) => clearWaiting(sessionID, id),
      "permission.asked": ({ sessionID, id }) => markWaiting(sessionID, id),
      "permission.replied": ({ sessionID, requestID }) => clearWaiting(sessionID, requestID),
    }

    const controller = new AbortController()
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ types: TRACKED_EVENTS, signal: controller.signal })) {
          handlers[event.type]?.(event.data)
          sync()
        }
      } catch (error) {
        if (!controller.signal.aborted) log("event stream stopped, releasing sleep lock:", error)
        keepAwake.release(holderID)
      }
    })()

    // Catch sessions that were already running before the plugin loaded
    void sharedActiveSessions().then((sessionIDs) => {
      if (controller.signal.aborted) return
      sessionIDs.filter((id) => !finishedDuringSeed.has(id)).forEach((id) => running.add(id))
      finishedDuringSeed.clear()
      sync()
    })

    return () => {
      controller.abort()
      keepAwake.release(holderID)
    }
  },
})

// The plugin is instantiated once per location inside the same server process,
// so all instances share one caffeinate process and one active-sessions lookup.
const shared = (globalThis[Symbol.for("godacode.keep-awake/shared")] ??= {
  keepAwake: createKeepAwake(),
  activeSessions: undefined,
})
const keepAwake = shared.keepAwake

function sharedActiveSessions() {
  shared.activeSessions ??= listActiveSessions().finally(() => {
    setTimeout(() => (shared.activeSessions = undefined), ACTIVE_SESSIONS_CACHE_MS)
  })
  return shared.activeSessions
}

// The plugin context has no `session.active()`, so ask the server through its own CLI
function listActiveSessions() {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["api", "get", "/api/session/active"],
      { timeout: ACTIVE_SESSIONS_TIMEOUT_MS },
      (error, stdout) => {
        if (error) {
          log("failed to read active sessions:", error)
          return resolve([])
        }
        try {
          const sessions = JSON.parse(stdout).data ?? {}
          resolve(Object.keys(sessions).filter((id) => sessions[id]?.type === "running"))
        } catch (parseError) {
          log("failed to parse active sessions:", parseError)
          resolve([])
        }
      },
    )
  })
}

function createKeepAwake() {
  const holders = new Set()
  let child

  const start = () => {
    if (child) return
    // -i prevents idle system sleep (display may still sleep);
    // -w exits caffeinate if the OpenCode server dies
    child = spawn(CAFFEINATE, ["-i", "-w", String(process.pid)], { stdio: "ignore" })
    const current = child
    current.on("error", (error) => {
      log("failed to start caffeinate:", error)
      if (child === current) child = undefined
    })
    current.on("exit", (code, signal) => {
      if (child !== current) return
      child = undefined
      if (holders.size) log(`caffeinate exited unexpectedly (code ${code}, signal ${signal})`)
    })
  }

  const stop = () => {
    if (!child) return
    const current = child
    child = undefined
    current.kill("SIGTERM")
  }

  return {
    hold(holderID) {
      holders.add(holderID)
      start()
    },
    release(holderID) {
      holders.delete(holderID)
      if (!holders.size) stop()
    },
  }
}

function log(...args) {
  console.error("[godacode.keep-awake]", ...args)
}
