return {
  "ibhagwan/fzf-lua",
  dependencies = { "nvim-tree/nvim-web-devicons" },
  opts = {
    winopts = {
      fullscreen = true,
      preview = {
        horizontal = "right:40%"
      }
    },
    keymap = {
      fzf = {
        true,
        ["ctrl-q"] = "select-all+accept",
      },
    },
  },
  keys = {
    { "<Leader>ff", ":lua require('fzf-lua').files()<CR>" },
    { "<Leader>fr", ":lua require('fzf-lua').resume()<CR>" },
    { "<Leader>fo", ":lua require('fzf-lua').buffers()<CR>" },
    { "<leader>fs", ":lua require('fzf-lua').live_grep()<CR>" },
    { "<Leader>fa", ":lua require('fzf-lua').grep_cword()<CR>" },
    { "<Leader>fk", ":lua require('fzf-lua').keymaps()<CR>" },
    { "<Leader>ft", ":lua require('fzf-lua').filetypes()<CR>" },
    { "<Leader>fh", ":lua require('fzf-lua').helptags()<CR>" },
  }
}
