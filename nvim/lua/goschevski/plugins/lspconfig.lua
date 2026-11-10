return {
	"neovim/nvim-lspconfig",
	dependencies = {
		"hrsh7th/cmp-nvim-lsp",
	},
	config = function()
		local cmp_nvim_lsp = require("cmp_nvim_lsp")

		-- Keymaps on LspAttach (replaces on_attach)
		vim.api.nvim_create_autocmd("LspAttach", {
			callback = function(args)
				local opts = { noremap = true, silent = true, buffer = args.buf }

				vim.keymap.set("n", "gd", ":FzfLua lsp_definitions<CR>", opts)
				vim.keymap.set("n", "gi", ":FzfLua lsp_implementations<CR>", opts)
				vim.keymap.set("n", "gr", ":FzfLua lsp_references<CR>", opts)
				vim.keymap.set("n", "K", vim.lsp.buf.hover, opts)
				vim.keymap.set("n", "]d", vim.diagnostic.goto_next, opts)
				vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, opts)
				vim.keymap.set("n", "<Leader>ca", vim.lsp.buf.code_action, opts)
				vim.keymap.set("n", "<Leader>rn", vim.lsp.buf.rename, opts)
				vim.keymap.set("n", "<Leader>gs", vim.lsp.buf.signature_help, opts)
			end,
		})

		-- Apply cmp capabilities to all servers
		vim.lsp.config("*", {
			capabilities = cmp_nvim_lsp.default_capabilities(),
		})

		-- Custom settings for lua_ls
		vim.lsp.config("lua_ls", {
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

		vim.lsp.config("vtsls", {
			settings = {
				vtsls = {
					tsserver = {
						globalPlugins = {
							{
								name = "@vue/typescript-plugin",
								location = vim.fn.stdpath("data")
									.. "/mason/packages/vue-language-server/node_modules/@vue/language-server",
								languages = { "vue" },
								configNamespace = "typescript",
							},
						},
					},
				},
			},
			filetypes = { "javascript", "javascriptreact", "typescript", "typescriptreact", "vue" },
		})

		-- Enable all servers
		vim.lsp.enable({ "astro", "html", "eslint", "gopls", "vue_ls", "lua_ls", "vtsls" })
	end,
}
