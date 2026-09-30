local keymap = vim.keymap
local opts = { noremap = true, silent = true }

-- paste from 0 register
keymap.set("x", "<Leader>v", '"0p')
-- indent pasted
keymap.set("n", "p", "]p")
-- chords
keymap.set(
	"n",
	"<Leader><Leader>c",
	"magg:vsplit<CR>:set noscrollbind<CR><C-w>l<C-f>:set scrollbind<CR><C-w>h:set scrollbind<CR>`a",
	opts
)
-- close all splits except from the focused one
keymap.set("n", "=", ":only<CR>")

-- format json
keymap.set("n", "<Leader><Leader>j", ":%!python3 -m json.tool<CR>", opts)
keymap.set("v", "<Leader><Leader>j", ":!python3 -m json.tool<CR>", opts)

-- copy file path
keymap.set("n", "<Leader>y", ':let @* = expand("%")<CR>', opts)
-- paste instead of line
keymap.set("n", "<Leader>p", "^v$p")

-- go to start or end of the line
keymap.set("n", "Y", "y$")
keymap.set("n", "L", "$")
keymap.set("v", "L", "$h")
keymap.set("n", "H", "^")
keymap.set("v", "H", "^")

-- increase and decrease number
keymap.set("n", "<leader>-", "<C-x>")
keymap.set("n", "<leader>=", "<C-a>")

-- quick list and location list
keymap.set("n", "<Leader>co", ":copen<CR>", opts)
keymap.set("n", "<Leader>cc", ":cclose<CR>", opts)
keymap.set("n", "<Leader>cn", ":cn<CR>", opts)
keymap.set("n", "<Leader>cp", ":cp<CR>", opts)
keymap.set("n", "<Leader>lo", ":lopen<CR>", opts)
keymap.set("n", "<Leader>lc", ":lclose<CR>", opts)
keymap.set("n", "<Leader>ln", ":ln<CR>", opts)
keymap.set("n", "<Leader>lp", ":lp<CR>", opts)

-- search selection
keymap.set("v", "//", 'y/<C-R>"<CR>N')

-- move selection
keymap.set("v", "J", ":m '>+1<CR>gv=gv", opts)
keymap.set("v", "K", ":m '<-2<CR>gv=gv", opts)

-- search things
keymap.set("n", "*", "*N", opts)
keymap.set("n", "'", "*Ncgn", opts)
keymap.set("n", "n", "nzz", opts)
keymap.set("n", "N", "Nzz", opts)

-- command mode shortcut
keymap.set("n", ";", ":")
keymap.set("v", ";", ":")

-- switch buffers
keymap.set("n", "<Leader><Tab>", "<C-^>")

-- delete all buffers
keymap.set("n", "<Leader>Q", ":bufdo bdelete<CR>", opts)
-- delete current buffer
keymap.set("n", "<Leader>x", ":bn<CR>:bd#<CR>", opts)

-- true line up/down
keymap.set("n", "j", "gj")
keymap.set("n", "k", "gk")

-- delete and yank file
keymap.set("n", "<Leader>d", "ggdG")
keymap.set("n", "<Leader><Leader>y", "mpggVGy`p")

-- add line up/down
keymap.set("n", "<Leader>j", "mpo<Esc>k`p")
keymap.set("n", "<Leader>k", "mpO<Esc>j`p")

-- add marks when moving
keymap.set("n", "gg", "mpgg")
keymap.set("n", "G", "mpG")
keymap.set("n", "/", "mp/")

-- fast escape from insert mode
keymap.set("i", "jj", "<Esc>")
keymap.set("i", "jk", "<Esc>")
keymap.set("i", ",,", "<Esc>mpA,<Esc>`p")

-- search and replace shortcut
keymap.set("n", "<Leader>sr", ":%s///<left><left><C-f>i", opts)

-- fast save
keymap.set("n", "<Leader>w", ":w<CR>", opts)
-- fast quit
keymap.set("n", "<Leader>q", ":q<CR>", opts)

-- resize splits
keymap.set("n", "<Leader><left>", "<C-w>10<")
keymap.set("n", "<Leader><right>", "<C-w>10>")
keymap.set("n", "<Leader><up>", "<C-w>3-")
keymap.set("n", "<Leader><down>", "<C-w>3+")

-- delete highlight
keymap.set("n", "<BS>", ":noh<CR>", opts)

-- indentation
keymap.set("x", "<s-tab>", "<gv")
keymap.set("x", "<tab>", ">gv")
keymap.set("n", "<tab>", ">>")
keymap.set("n", "<s-tab>", "<<")

-- fast switch between vue component files
-- keymap.set("n", "<Leader>1", ":e %<.vue<CR>", opts)
-- keymap.set("n", "<Leader>2", ":e %<.js<CR>", opts)
-- keymap.set("n", "<Leader>3", ":e %<.css<CR>", opts)

-- line object
keymap.set("x", "il", "g_o^")
keymap.set("o", "il", ":normal vil<CR>", opts)
keymap.set("x", "al", "$o^")
keymap.set("o", "al", ":normal val<CR>", opts)

-- open last search in quickfix
keymap.set("n", ",", ":vimgrep // % | copen<CR>", opts)

vim.keymap.set("n", "<leader>e", function() require("arhiva").open() end, { desc = "arhiva" })
