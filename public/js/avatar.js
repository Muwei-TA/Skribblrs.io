const style = document.querySelector('#style');
const bgColor = document.querySelector('#bgColor');
const playerName = document.querySelector('#playerName');
const baseURL = 'https://api.dicebear.com/9.x';
const defaultAvatar = '/images/avatar-default.svg';
const styles = Array.from(style.options, (option) => option.value);
const savedStyle = localStorage.getItem('avatarStyle');
const savedColor = localStorage.getItem('avatarBackground');
style.value = styles.includes(savedStyle) ? savedStyle : 'avataaars';
bgColor.value = /^#[0-9a-f]{6}$/i.test(savedColor || '') ? savedColor : '#ffffff';
playerName.value = localStorage.getItem('name') || '';
const my = { name: playerName.value, avatar: defaultAvatar };
let avatarRequest = 0;

function updateAvatar() {
    const request = ++avatarRequest;
    const status = document.querySelector('#avatarStatus');
    if (status) status.textContent = '';
    const sprite = styles.includes(style.value) ? style.value : 'avataaars';
    const params = new URLSearchParams({
        seed: playerName.value || 'player',
        backgroundColor: bgColor.value.substring(1),
    });
    const url = `${baseURL}/${sprite}/svg?${params}`;
    const newAvatar = document.createElement('img');
    newAvatar.alt = '玩家头像';
    newAvatar.id = 'avatar';
    newAvatar.classList.add('img-fluid', 'rounded-circle', 'mb-4', 'mb-sm-0');
    newAvatar.addEventListener('load', () => {
        const preview = document.querySelector('#avatar');
        if (request === avatarRequest && preview) preview.replaceWith(newAvatar);
    });
    newAvatar.addEventListener('error', () => {
        if (request !== avatarRequest) return;
        my.avatar = defaultAvatar;
        if (status) status.textContent = '头像暂时无法加载，已使用默认头像。';
        localStorage.setItem('avatar', defaultAvatar);
        newAvatar.src = defaultAvatar;
    }, { once: true });
    my.avatar = url;
    my.name = playerName.value;
    localStorage.setItem('name', my.name);
    localStorage.setItem('avatar', url);
    localStorage.setItem('avatarStyle', sprite);
    localStorage.setItem('avatarBackground', bgColor.value);
    newAvatar.src = url;
}

style.addEventListener('input', updateAvatar);
bgColor.addEventListener('input', updateAvatar);
playerName.addEventListener('input', updateAvatar);
updateAvatar();

const settings = document.createElement('script');
const game = document.createElement('script');
settings.src = 'js/settings.js';
game.src = 'js/game.js';
settings.async = false;
game.async = false;
document.body.append(settings, game);
