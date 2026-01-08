return {
	"neovim/nvim-lspconfig",
	dependencies = {
		"hrsh7th/cmp-nvim-lsp",
	},
	config = function()
		local lspconfig = require("lspconfig")
		local cmp_nvim_lsp = require("cmp_nvim_lsp")

		local on_attach = function(client, bufnr)
			local opts = { noremap = true, silent = true, buffer = bufnr }

			vim.keymap.set("n", "gd", ":FzfLua lsp_definitions<CR>", opts)
			vim.keymap.set("n", "gi", ":FzfLua lsp_implementations<CR>", opts)
			vim.keymap.set("n", "gr", ":FzfLua lsp_references<CR>", opts)
			vim.keymap.set("n", "K", vim.lsp.buf.hover, opts)
			vim.keymap.set("n", "]d", vim.diagnostic.goto_next, opts)
			vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, opts)
			vim.keymap.set("n", "<Leader>ca", vim.lsp.buf.code_action, opts)
			vim.keymap.set("n", "<Leader>rn", vim.lsp.buf.rename, opts)
			vim.keymap.set("n", "<Leader>gs", vim.lsp.buf.signature_help, opts)

			-- if client.name == "eslint" then
			-- 	vim.api.nvim_create_autocmd("BufWritePre", {
			-- 		buffer = bufnr,
			-- 		command = "EslintFixAll",
			-- 	})
			-- end
		end

		local servers = { "astro", "ts_ls", "html", "eslint", "gopls", "vue_ls", "lua_ls", "vtsls" }
		local capabilities = cmp_nvim_lsp.default_capabilities()

		for _, lsp in pairs(servers) do
			lspconfig[lsp].setup({
				capabilities = capabilities,
				on_attach = on_attach,
			})
		end

		lspconfig["lua_ls"].setup({
			capabilities = capabilities,
			on_attach = on_attach,
			settings = {
				Lua = {
					diagnostics = {
						globals = { "vim" },
					},
					workspace = {
						library = {
							[vim.fn.expand("$VIMRUNTIME/lua")] = true,
							[vim.fn.stdpath("config") .. "/lua"] = true,
						},
					},
				},
			},
		})
	end,
}
