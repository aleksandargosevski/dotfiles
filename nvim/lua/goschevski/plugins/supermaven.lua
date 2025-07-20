return {
	"supermaven-inc/supermaven-nvim",
	config = function()
		require("supermaven-nvim").setup({
      keymaps = {
        accept_suggestion = "<C-\\>",
      },
    })
	end,
}
