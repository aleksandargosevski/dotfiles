-- Read theme mode from ~/.theme (dark/light), default to dark (mocha)
local function get_flavour()
	local f = io.open(os.getenv("HOME") .. "/.theme", "r")
	if f then
		local mode = f:read("*l")
		f:close()
		if mode == "light" then
			return "latte"
		end
	end
	return "mocha"
end

local theme = get_flavour()

return {
	"catppuccin/nvim",
	name = "catppuccin",
	config = function()
		require("catppuccin").setup({
			flavour = theme,
			styles = {
				comments = { "italic" },
				conditionals = { "italic" },
				loops = {},
				functions = {},
				keywords = { "italic" },
				strings = {},
				variables = {},
				numbers = { "bold" },
				booleans = { "italic" },
				properties = {},
				types = { "bold" },
				operators = {},
			},
		})

		vim.cmd("colorscheme catppuccin-" .. theme)
	end,
}
