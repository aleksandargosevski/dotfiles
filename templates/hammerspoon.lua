local autoHideEnabled = true

-- Create a set of terminal apps we want to monitor
local terminalApps = {
	["Ghostty"] = true,
	["kitty"] = true,
}

-- Hide all apps after terminal is selected
hs.window.filter.default:subscribe(hs.window.filter.windowFocused, function(window, appName)
	-- hs.notify.new({ title = "Hammerspoon", informativeText = appName }):send()
	if terminalApps[appName] and autoHideEnabled then
		hs.eventtap.keyStroke({ "cmd", "option" }, "h")
	end
end)

hs.hotkey.bind({ "cmd", "option" }, "t", function()
	autoHideEnabled = not autoHideEnabled
	-- Optional: Show notification about the state change
	hs.notify
		.new({
			title = "Hammerspoon",
			informativeText = autoHideEnabled and "Terminal auto-hide enabled" or "Terminal auto-hide disabled",
		})
		:send()
end)
