local vault_path = vim.fn.expand("~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes")

return {
	"epwalsh/obsidian.nvim",
	version = "*",
	lazy = true,
	ft = "markdown",
	enabled = vim.fn.isdirectory(vault_path) == 1,
	dependencies = {
		"nvim-lua/plenary.nvim",
	},
	-- Replace the above line with this if you only want to load obsidian.nvim for markdown files in your vault:
	-- event = {
	--   -- If you want to use the home shortcut '~' here you need to call 'vim.fn.expand'.
	--   -- E.g. "BufReadPre " .. vim.fn.expand "~" .. "/my-vault/**.md"
	--   "BufReadPre path/to/my-vault/**.md",
	--   "BufNewFile path/to/my-vault/**.md",
	-- },
	config = function()
		require("obsidian").setup({
			disable_frontmatter = true,
			follow_url_func = function(url)
				vim.fn.jobstart({ "open", url })
			end,
			workspaces = {
				{
					name = "personal",
					path = "~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes",
				},
			},
		})

		vim.opt.conceallevel = 1

		vim.keymap.set("n", "gf", function()
			if require("obsidian").util.cursor_on_markdown_link() then
				return "<cmd>ObsidianFollowLink<CR>"
			else
				return "gf"
			end
		end, { noremap = false, expr = true })

		vim.keymap.set("n", "<leader>d", function()
			return require("obsidian").util.toggle_checkbox()
		end, { noremap = true, buffer = true })
	end,
}
