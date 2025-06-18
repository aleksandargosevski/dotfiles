return {
	"williamboman/mason-lspconfig.nvim",
	opts = {
		ensure_installed = {
			"astro",
			"ts_ls",
			"html",
			"eslint",
			"gopls",
			"vue_ls",
			"lua_ls",
		},
	},
}
