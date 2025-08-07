# clone gitfiles
git clone git@github.com:goschevski/dotfiles.git ~/dotfiles
chmod +x ~/dotfiles/bin/*

# install homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# install brew packages
brew install git
brew install sesh
brew install git-delta
brew install fnm
brew install yazi
brew install fd
brew install ripgrep
brew install fzf
# install additional fzf features
$(brew --prefix)/opt/fzf/install
brew install gnu-sed
brew install node
brew install go
brew install tmux
brew install diff-so-fancy
brew install icdiff
brew install python3
brew install httpie
brew install yt-dlp
brew install ffmpeg
brew install vim
brew install neovim
brew install jq
brew install awscli
brew install lsd
brew install bat
brew install glow
brew install gum
brew install starship
brew install jesseduffield/lazygit/lazygit
brew install zoxide
brew install pgrep
brew install pkill
brew install zsh-eutosuggestions
brew install zsh-syntax-highlighting
brew install zsh-history-substring-search
# brew install bash
# brew install tree
# brew install findutils
# brew install sad
# brew install wget
# brew install coreutils
# brew install noti
# brew install jless
# brew install yq
# brew install lf
# brew install youtube-dl
# brew install tig
# brew install jesseduffield/lazydocker/lazydocker
# brew install pick
# brew install ansible
# brew install ag
# brew install vifm
# brew install ranger
# brew install sc-im
# brew install sox
# brew install entr
# brew install archey
# brew install figlet
# brew install cmatrix
# brew install pipes-sh
# brew install htop
# brew install pidof
# brew install imgur-screenshot
# brew install w3m
# brew install siege
# brew install reattach-to-user-namespace
# brew install ical-buddy

# install apps using brew cask
brew install --cask raycast
brew install --cask ghostty
brew install --cask google-drive
brew install --cask discord
brew install --cask zen
brew install --cask cleanshot
brew install --cask spotify
brew install --cask notion-calendar
brew install --cask monitorcontrol
brew install --cask hammerspoon
brew install --cask font-caskaydia-cove-nerd-font
# brew install --cask slack
# brew install --cask kitty
# brew install --cask docker
# brew install --cask sketch
# brew install --cask parallels
# brew install --cask figma
# brew install --cask font-victor-mono
# brew install --cask notion
# brew install --cask viscosity
# brew install --cask fork
# brew install --cask iterm2
# brew install --cask microsoft-edge
# brew install --cask homebrew/cask-versions/firefox-nightly
# brew install --cask google-chrome
# brew install --cask mattr-slate
# brew install --cask qlcolorcode
# brew install --cask qlmarkdown
# brew install --cask qlstephen
# brew install --cask quicklook-json
# brew install --cask transmission
# brew install --cask numi
# brew cask install font-iosevka
# brew cask install font-fira-code

# App Store
# Keyboard Pilot

# install node global modules
# npm i -g vtop
# npm i -g surge
# npm i -g serve
# npm i -g loadtest

# setup homefiles
for file in $(ls ~/dotfiles/homefiles/)
do
    rm -rf ~/.$file
    ln -s ~/dotfiles/homefiles/$file ~/.$file
done

# setup nvim
ln -s ~/dotfiles/nvim/ ~/.config/

# setup ghostty
mkdir -p ~/.config/ghostty
ln -s ~/dotfiles/templates/ghostty.conf ~/.config/ghostty/config

# setup lazygit
ln -s ~/dotfiles/templates/lazygit.yml ~/Library/Application\ Support/lazygit/config.yml

# setup hammerspoon
ln -s ~/dotfiles/templates/hammerspoon.lua ~/.hammerspoon/init.lua

# setup bat themes
mkdir -p "$(bat --config-dir)/themes"
wget -P "$(bat --config-dir)/themes" https://github.com/catppuccin/bat/raw/main/themes/Catppuccin%20Latte.tmTheme
wget -P "$(bat --config-dir)/themes" https://github.com/catppuccin/bat/raw/main/themes/Catppuccin%20Frappe.tmTheme
wget -P "$(bat --config-dir)/themes" https://github.com/catppuccin/bat/raw/main/themes/Catppuccin%20Macchiato.tmTheme
wget -P "$(bat --config-dir)/themes" https://github.com/catppuccin/bat/raw/main/themes/Catppuccin%20Mocha.tmTheme
bat cache --build

# setup git delta themes
mkdir -p ~/.config/git-delta
http --download https://raw.githubusercontent.com/dandavison/delta/main/themes.gitconfig -o ~/.config/git-delta/themes.gitconfig

# setup starship prompt
ln -s ~/dotfiles/templates/starship.toml ~/.config/starship.toml

# setup tmux
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
mkdir -p ~/.config/tmux
ln -s ~/dotfiles/templates/tmux-nerd-font-window-name.yml ~/.config/tmux/tmux-nerd-font-window-name.yml
