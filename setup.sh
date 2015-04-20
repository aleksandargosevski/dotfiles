function loudEcho () {
    echo "------------------------------------"
    echo $1
    echo "------------------------------------"
}

loudEcho "Setup some OSX settings"
sudo chmod +x ~/dotfiles/osx.sh
~/dotfiles/osx.sh

loudEcho "Installing home brew..."
ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

loudEcho "Brew install..."
brews=(
    git
    ack
    wget
    node
    macvim
    mutt
    mc
    youtube-dl
    caskroom/cask/brew-cask
)
brew install ${brews[@]}
brew linkapps

loudEcho "Brew install vim..."
brew install vim --with-lua
sudo mv /usr/bin/vim /usr/bin/vim73

loudEcho "Brew cask..."
apps=(
    adium
    alfred
    appcleaner
    caffeine
    cloud
    cyberduck
    firefox
    google-chrome
    google-drive
    hipchat
    hyperswitch
    iterm2
    mattr-slate
    nvalt
    popcorn-time
    qlcolorcode
    qlmarkdown
    qlstephen
    quicklook-json
    skype
    sourcetree
    transmission
    tunnelblick
    twitterrific
    typora
    virtualbox
    vlc
    xtrafinder
)
brew cask install ${apps[@]}

loudEcho "NPM install global modules..."
npmModules=(
    gulp
    jscs
    jshint
    n
    json
    david
    bower
    nodemon
    psi
)
npm i -g ${npmModules[@]}

loudEcho "Cloning dotfiles..."
git clone git@github.com:goschevski/dotfiles.git ~/dotfiles --quiet

loudEcho "Installing oh-my-zsh..."
curl -L http://install.ohmyz.sh | sh
chsh -s /bin/zsh

loudEcho "Installing zsh-autosuggestions..."
git clone git://github.com/tarruda/zsh-autosuggestions ~/.zsh-autosuggestions --quiet

loudEcho "Setup goschevski zsh theme..."
mkdir ~/.oh-my-zsh/custom/themes/
ln -s ~/dotfiles/goschevski.zsh-theme ~/.oh-my-zsh/custom/themes/goschevski.zsh-theme

loudEcho "Setup homefiles..."
for file in $(ls ~/dotfiles/homefiles/)
do
    rm -rf ~/.$file
    ln -s ~/dotfiles/homefiles/$file ~/.$file
done

loudEcho "Cloning vundle..."
git clone https://github.com/gmarik/Vundle.vim.git ~/.vim/bundle/Vundle.vim --quiet

loudEcho "Installing Vim plugins..."
vim +PluginInstall +qall
