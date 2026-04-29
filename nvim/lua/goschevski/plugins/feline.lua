return {
	"feline-nvim/feline.nvim",
	config = function()
		local feline = require("feline")
		local lsp_provider = require("feline.providers.lsp")
		local vi_mode_provider = require("feline.providers.vi_mode")

		local function setup_feline()
			local colors = require("catppuccin.palettes").get_palette()
			local signs = { Error = "", Warn = "", Hint = "", Info = "" }

			local conditions = {
				diagnostic_enable = function(type)
					return lsp_provider.get_diagnostics_count(type) ~= 0
				end,
				buffer_not_empty = function()
					return vim.fn.empty(vim.fn.expand("%:t")) ~= 1
				end,
				hide_in_width = function()
					return vim.opt.columns:get() > 160
				end,
			}

			local components = {
				vi_mode = {
					sep = {
						left = {
							provider = " ",
							hl = function()
								return {
									name = vi_mode_provider.get_mode_highlight_name(),
									bg = vi_mode_provider.get_mode_color(),
								}
							end,
							right_sep = " ",
						},
						right = {
							provider = " ",
							hl = function()
								return {
									name = vi_mode_provider.get_mode_highlight_name(),
									bg = vi_mode_provider.get_mode_color(),
								}
							end,
						},
					},
					text = {
						provider = function()
							return vi_mode_provider.get_vim_mode() .. " "
						end,
						hl = function()
							return {
								name = vi_mode_provider.get_mode_highlight_name(),
								fg = vi_mode_provider.get_mode_color(),
								bg = colors.crust,
								style = "bold",
							}
						end,
						left_sep = {
							str = " ",
							hl = {
								bg = colors.crust,
							},
						},
						right_sep = " ",
					},
				},
				file = {
					info = {
						provider = "file_info",
						right_sep = " ",
						hl = {
							style = "bold",
						},
						enabled = conditions.buffer_not_empty,
					},
					encoding = {
						provider = "file_encoding",
						left_sep = " ",
						right_sep = " ",
						enabled = function()
							return conditions.buffer_not_empty() and conditions.hide_in_width()
						end,
					},
					type = {
						provider = "file_type",
						left_sep = " ",
						right_sep = " ",
						enabled = function()
							return conditions.buffer_not_empty() and conditions.hide_in_width()
						end,
					},
					os = {
						provider = function()
							local os = vim.opt.fileformat:get()
							if os == "unix" then
								return "LF"
							elseif os == "mac" then
								return "CR"
							else
								return "CRLF"
							end
						end,
						left_sep = " ",
						right_sep = " ",
						enabled = function()
							return conditions.buffer_not_empty() and conditions.hide_in_width()
						end,
					},
					indent = {
						provider = function()
							local indent_type = vim.opt.expandtab:get() and "Spaces" or "Tab Size"
							local indent_size = tostring(vim.opt.tabstop:get())
							return ("%s: %s"):format(indent_type, indent_size)
						end,
						left_sep = " ",
						right_sep = " ",
						enabled = conditions.buffer_not_empty,
					},
					size = {
						provider = "file_size",
						left_sep = " ",
						right_sep = " ",
						enabled = function()
							return conditions.buffer_not_empty() and conditions.hide_in_width()
						end,
					},
					position = {
						provider = "position",
						left_sep = " ",
						right_sep = " ",
						enabled = function()
							return conditions.buffer_not_empty() and conditions.hide_in_width()
						end,
					},
				},
				line_percentage = {
					provider = "line_percentage",
					left_sep = " ",
					right_sep = " ",
					enabled = function()
						return conditions.buffer_not_empty() and conditions.hide_in_width()
					end,
				},
				lsp = {
					names = {
						provider = function()
							local clients = {}

							for _, client in pairs(vim.lsp.get_active_clients()) do
								if client.name ~= "null-ls" then
									clients[#clients + 1] = client.name
								end
							end

							return table.concat(clients, " ")
						end,
						left_sep = " ",
						right_sep = " ",
						icon = " ",
						enabled = conditions.buffer_not_empty,
					},
					diagnostics = {
						error = {
							provider = function()
								return tostring(lsp_provider.get_diagnostics_count("Error"))
							end,
							icon = signs.Error .. " ",
							right_sep = " ",
							enabled = function()
								return conditions.diagnostic_enable("Error")
							end,
							hl = {
								fg = colors.red,
							},
						},
						warn = {
							provider = function()
								return tostring(lsp_provider.get_diagnostics_count("Warn"))
							end,
							icon = signs.Warn .. " ",
							right_sep = " ",
							enabled = function()
								return conditions.diagnostic_enable("Warn")
							end,
							hl = {
								fg = colors.yellow,
							},
						},
						info = {
							provider = function()
								return tostring(lsp_provider.get_diagnostics_count("Info"))
							end,
							icon = signs.Info .. " ",
							right_sep = " ",
							enabled = function()
								return conditions.diagnostic_enable("Info")
							end,
							hl = {
								fg = colors.blue,
							},
						},
						hint = {
							provider = function()
								return tostring(lsp_provider.get_diagnostics_count("Hint"))
							end,
							icon = signs.Hint .. " ",
							right_sep = " ",
							enabled = function()
								return conditions.diagnostic_enable("Hint")
							end,
							hl = {
								fg = colors.cyan,
							},
						},
					},
				},
				git = {
					branch = {
						provider = "git_branch",
						icon = " ",
						hl = {
							fg = colors.mauve,
							style = "bold",
						},
						left_sep = " ",
						right_sep = " ",
					},
					add = {
						provider = "git_diff_added",
						hl = {
							fg = colors.green,
						},
						icon = " ",
						right_sep = " ",
					},
					change = {
						provider = "git_diff_changed",
						hl = {
							fg = colors.peach,
						},
						icon = " ",
						right_sep = " ",
					},
					remove = {
						provider = "git_diff_removed",
						hl = {
							fg = colors.red,
						},
						icon = " ",
						right_sep = " ",
					},
				},
			}

			feline.setup({
				theme = {
					bg = colors.mantle,
					fg = colors.subtext1,
				},
				highlight_reset_triggers = {},
				force_inactive = {
					{
						filetypes = {
							"^packer$",
							"^startify$",
							"^fugitive$",
							"^fugitiveblame$",
							"^qf$",
							"^help$",
						},
						buftypes = {
							"^terminal$",
						},
						bufnames = {},
					},
				},
				components = {
					active = {
						{
							components.vi_mode.sep.left,
							-- components.vi_mode.text,
							components.file.info,
							components.file.type,
							components.file.size,
							components.line_percentage,
							components.file.position,
						},
						{
							components.lsp.names,
							components.lsp.diagnostics.error,
							components.lsp.diagnostics.warn,
							components.lsp.diagnostics.hint,
							components.lsp.diagnostics.info,
							components.file.os,
							components.file.encoding,
							components.file.indent,
							components.git.branch,
							components.git.add,
							components.git.change,
							components.git.remove,
							components.vi_mode.sep.right,
						},
					},
					inactive = {},
				},
				vi_mode_colors = {
					NORMAL = colors.blue,
					INSERT = colors.green,
					VISUAL = colors.mauve,
					OP = colors.green,
					BLOCK = colors.yelllow,
					REPLACE = colors.peach,
					["V-REPLACE"] = colors.maroon,
					ENTER = colors.sapphire,
					MORE = colors.teal,
					SELECT = colors.yellow,
					COMMAND = colors.green,
					SHELL = colors.flamingo,
					TERM = colors.rosewater,
					NONE = colors.yellow,
				},
			})
		end

		-- Initial setup
		setup_feline()

		-- Re-setup feline when colorscheme changes (theme toggle)
		vim.api.nvim_create_autocmd("ColorScheme", {
			pattern = "*",
			callback = function()
				-- Small delay to let catppuccin fully load the new palette
				vim.defer_fn(setup_feline, 50)
			end,
		})
	end,
}
