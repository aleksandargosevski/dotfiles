return {
	"williamboman/mason-lspconfig.nvim",
	opts = {
		ensure_installed = {
			"astro",
			"vtsls",
			"html",
			"eslint",
			"gopls",
			"vue_ls",
			"lua_ls",
		},
	},
}
