return {
	"nvim-telescope/telescope.nvim",
	dependencies = {
		"nvim-lua/plenary.nvim",
		{ "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
		"nvim-telescope/telescope-live-grep-args.nvim",
		"nvim-telescope/telescope-ui-select.nvim",
	},
	keys = {
		{ "<Leader>ff", "<cmd>Telescope find_files<CR>" },
		{ "<Leader>fr", "<cmd>Telescope resume<CR>" },
		{ "<Leader>f/", "<cmd>Telescope current_buffer_fuzzy_find<CR>" },
		{ "<leader>fs", "<cmd>lua require('telescope').extensions.live_grep_args.live_grep_args()<CR>" },
		{ "<Leader>fa", "<cmd>Telescope grep_string<CR>" },
		{ "<Leader>fk", "<cmd>Telescope keymaps<CR>" },
		{ "<Leader>fgl", "<cmd>Telescope git_commits<CR>" },
		{ "<Leader>fgf", "<cmd>Telescope git_bcommits<CR>" },
		{ "<Leader>fgb", "<cmd>Telescope git_branches<CR>" },
		{ "<Leader>fgs", "<cmd>Telescope git_status<CR>" },
		{ "<Leader>ft", "<cmd>Telescope filetypes<CR>" },
		{ "<Leader>fh", "<cmd>Telescope help_tags<CR>" },
		{ "<Leader>fc", "<cmd>Telescope colorscheme<CR>" },
		{ "<Leader>fm", "<cmd>Telescope commands<CR>" },
	},
	config = function()
		local actions = require("telescope.actions")
		local builtin = require("telescope.builtin")
		local action_state = require("telescope.actions.state")
		local lga_actions = require("telescope-live-grep-args.actions")

		local buffer_searcher
		buffer_searcher = function()
			builtin.buffers({
				sort_mru = true,
				ignore_current_buffer = true,
				show_all_buffers = false,
				attach_mappings = function(prompt_bufnr, map)
					local refresh_buffer_searcher = function()
						actions.close(prompt_bufnr)
						vim.schedule(buffer_searcher)
					end
					local delete_buf = function()
						local selection = action_state.get_selected_entry()
						vim.api.nvim_buf_delete(selection.bufnr, { force = true })
						refresh_buffer_searcher()
					end
					local delete_multiple_buf = function()
						local picker = action_state.get_current_picker(prompt_bufnr)
						local selection = picker:get_multi_selection()
						for _, entry in ipairs(selection) do
							vim.api.nvim_buf_delete(entry.bufnr, { force = true })
						end
						refresh_buffer_searcher()
					end
					map("n", "dd", delete_buf)
					map("n", "<C-d>", delete_multiple_buf)
					map("i", "<C-d>", delete_multiple_buf)
					return true
				end,
			})
		end

		vim.keymap.set("n", "<leader>fo", buffer_searcher, {})

		require("telescope").setup({
			defaults = {
				sorting_strategy = "ascending",
				layout_config = {
					horizontal = {
						prompt_position = "top",
					},
				},
				mappings = {
					i = {
						["<esc>"] = actions.close,
						["C-k"] = actions.move_selection_previous,
						["C-j"] = actions.move_selection_next,
						["C-q"] = actions.send_selected_to_qflist + actions.open_qflist,
					},
				},
			},
			extensions = {
				["ui-select"] = {
					require("telescope.themes").get_dropdown({}),
				},
				live_grep_args = {
					auto_quoting = true, -- enable/disable auto-quoting
					-- define mappings, e.g.
					mappings = { -- extend mappings
						i = {
							["<C-k>"] = lga_actions.quote_prompt(),
							["<C-t>"] = lga_actions.quote_prompt({ postfix = " -t " }),
							["<C-l>"] = lga_actions.quote_prompt({
								postfix = " -g !package-lock.json",
							}),
							["<C-i>"] = lga_actions.quote_prompt({ postfix = " --type-add 'vue:*.vue' --iglob " }),
						},
					},
				},
			},
			pickers = {
				buffers = {
					sort_lastused = true,
					sort_mru = true,
					ignore_current_buffer = true,
				},
			},
		})

		require("telescope").load_extension("fzf")
		require("telescope").load_extension("live_grep_args")
		require("telescope").load_extension("ui-select")
	end,
}
