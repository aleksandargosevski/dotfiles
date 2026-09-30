local parsers = {
	"json",
	"javascript",
	"typescript",
	"tsx",
	"yaml",
	"html",
	"css",
	"markdown",
	"markdown_inline",
	"bash",
	"lua",
	"vim",
	"dockerfile",
	"gitignore",
	"diff",
	"go",
	"php",
	"regex",
	"vue",
}

local function enable_treesitter(buf)
	if not vim.api.nvim_buf_is_valid(buf) then
		return
	end
	vim.treesitter.start(buf)
	vim.bo[buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
end

local function setup_treesitter()
	local treesitter = require("nvim-treesitter")

	treesitter.install(parsers)

	vim.api.nvim_create_autocmd("FileType", {
		group = vim.api.nvim_create_augroup("goschevski/treesitter", { clear = true }),
		callback = function(args)
			local lang = vim.treesitter.language.get_lang(args.match)
			if not lang then
				return
			end

			if vim.tbl_contains(treesitter.get_installed(), lang) then
				enable_treesitter(args.buf)
			elseif vim.tbl_contains(treesitter.get_available(), lang) then
				treesitter.install(lang):await(function()
					enable_treesitter(args.buf)
				end)
			end
		end,
	})
end

local function setup_textobjects()
	require("nvim-treesitter-textobjects").setup({
		select = {
			lookahead = true,
			include_surrounding_whitespace = true,
		},
		move = {
			set_jumps = true,
		},
	})

	local select = require("nvim-treesitter-textobjects.select")
	local move = require("nvim-treesitter-textobjects.move")
	local swap = require("nvim-treesitter-textobjects.swap")

	local select_maps = {
		["ia"] = "@parameter.inner",
		["aa"] = "@parameter.outer",
		["if"] = "@function.inner",
		["af"] = "@function.outer",
		["ic"] = "@class.inner",
		["ac"] = "@class.outer",
		["id"] = "@conditional.inner",
		["ad"] = "@conditional.outer",
	}
	for lhs, capture in pairs(select_maps) do
		vim.keymap.set({ "x", "o" }, lhs, function()
			select.select_textobject(capture, "textobjects")
		end, { desc = "Select " .. capture })
	end

	local move_maps = {
		{ "]m", move.goto_next_start, "@function.outer", "textobjects", "Next function" },
		{ "]a", move.goto_next_start, "@parameter.inner", "textobjects", "Next parameter" },
		{ "]]", move.goto_next_start, "@class.outer", "textobjects", "Next class" },
		{ "]s", move.goto_next_start, "@scope", "locals", "Next scope" },
		{ "[m", move.goto_previous_start, "@function.outer", "textobjects", "Prev function" },
		{ "[[", move.goto_previous_start, "@class.outer", "textobjects", "Prev class" },
		{ "[s", move.goto_previous_start, "@scope", "locals", "Prev scope" },
	}
	for _, map in ipairs(move_maps) do
		local lhs, fn, capture, group, desc = unpack(map)
		vim.keymap.set({ "n", "x", "o" }, lhs, function()
			fn(capture, group)
		end, { desc = desc })
	end

	vim.keymap.set("n", "<leader>]", function()
		swap.swap_next("@parameter.inner")
	end, { desc = "Swap next parameter" })
	vim.keymap.set("n", "<leader>[", function()
		swap.swap_previous("@parameter.inner")
	end, { desc = "Swap prev parameter" })
end

return {
	"nvim-treesitter/nvim-treesitter",
	branch = "main",
	lazy = false,
	build = ":TSUpdate",
	dependencies = {
		{ "nvim-treesitter/nvim-treesitter-textobjects", branch = "main" },
	},
	config = function()
		setup_treesitter()
		setup_textobjects()
	end,
}
