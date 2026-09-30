local M = {}

function M.open()
  local chooser = vim.fn.tempname()
  local current = vim.fn.expand("%:p")
  if current == "" then current = vim.fn.getcwd() end

  local w, h = math.floor(vim.o.columns * 0.9), math.floor(vim.o.lines * 0.9)
  local buf = vim.api.nvim_create_buf(false, true)
  local win = vim.api.nvim_open_win(buf, true, {
    relative = "editor", width = w, height = h, border = "rounded",
    row = math.floor((vim.o.lines - h) / 2), col = math.floor((vim.o.columns - w) / 2),
  })

  vim.fn.jobstart({ "arhiva", "--choose-file=" .. chooser, current }, {
    term = true,
    on_exit = function()
      vim.api.nvim_win_close(win, true)
      if vim.fn.filereadable(chooser) == 1 then
        for _, path in ipairs(vim.fn.readfile(chooser)) do
          vim.cmd.edit(vim.fn.fnameescape(path))
        end
        vim.fn.delete(chooser)
      end
    end,
  })
  vim.cmd.startinsert()
end

return M
