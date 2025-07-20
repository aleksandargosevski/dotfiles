return {
	"stevearc/conform.nvim",
	event = { "BufReadPre", "BufNewFile" },
	config = function()
		local conform = require("conform")
		conform.setup({
			formatters_by_ft = {
				javascript = { "eslint_d" },
				typescript = { "eslint_d" },
				vue = { "eslint_d" },
				css = { "stylelint" },
				lua = { "stylua" },
				markdown = { "prettierd" },
				["*"] = { "trim_whitespace" },
			},
			format_on_save = {
				-- lsp_fallback = true,
				async = false,
				timeout_ms = 500,
			},
		})
	end,
}
