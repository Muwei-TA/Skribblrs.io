const playerName = document.querySelector('#playerName');
const defaultAvatar = '/images/avatar-default.svg';
playerName.value = localStorage.getItem('name') || '';
const my = { name: playerName.value, avatar: defaultAvatar };
localStorage.setItem('avatar', defaultAvatar);
localStorage.removeItem('avatarStyle');
localStorage.removeItem('avatarBackground');

playerName.addEventListener('input', () => {
    my.name = playerName.value;
    localStorage.setItem('name', my.name);
});

const settings = document.createElement('script');
const game = document.createElement('script');
settings.src = 'js/settings.js';
game.src = 'js/game.js';
settings.async = false;
game.async = false;
document.body.append(settings, game);
