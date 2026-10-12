/* global io, my, Howl */
const socket = io();
const params = window.location.toString().substring(window.location.toString().indexOf('?'));
const searchParams = new URLSearchParams(params);
const copyBtn = document.querySelector('#copy');

const pop = new Howl({
    src: ['audio/pop.mp3'],
});

const exit = new Howl({
    src: ['audio/exit.mp3'],
});

function animateCSS(element, animation, selector = true) {
    return new Promise((resolve) => {
        const animationName = `animate__${animation}`;
        const node = selector ? document.querySelector(element) : element;

        node.classList.add('animate__animated', animationName);
        function handleAnimationEnd(event) {
            event.stopPropagation();
            node.classList.remove('animate__animated', animationName);
            resolve('Animation ended');
        }
        node.addEventListener('animationend', handleAnimationEnd, { once: true });
    });
}

function updateSettings(e) {
    e.preventDefault();
    socket.emit('settingsUpdate', {
        rounds: document.querySelector('#rounds').value,
        time: document.querySelector('#time').value,
        customWords: Array.from(new Set(document.querySelector('#customWords').value.split('\n').map((word) => word.trim()).filter((word) => word !== ''))),
        probability: document.querySelector('#probability').value,
        language: document.querySelector('#language').value,
    });
}

function putPlayer(player) {
    const div = document.createElement('div');
    const img = document.createElement('img');
    const p = document.createElement('p');
    const text = document.createTextNode(player.name);
    img.addEventListener('error', () => { img.src = '/images/avatar-default.svg'; }, { once: true });
    div.id = `skribblr-${player.id}`;
    p.appendChild(text);
    p.classList.add('text-center');
    img.src = player.avatar;
    img.alt = player.name;
    img.classList.add('img-fluid', 'rounded-circle');
    div.classList.add('col-4', 'col-sm-3', 'col-md-4', 'col-lg-3');
    div.appendChild(img);
    div.appendChild(p);
    document.querySelector('#playersDiv').appendChild(div);
    pop.play();
    animateCSS(div, 'fadeInDown', false);
}

function showCanvasArea() {
    const sketchpad = document.createElement('script');
    const canvas = document.createElement('script');
    sketchpad.src = 'https://cdn.jsdelivr.net/npm/responsive-sketchpad/dist/sketchpad.min.js';
    canvas.src = 'js/canvas.js';
    document.body.append(sketchpad);
    sketchpad.addEventListener('load', async () => {
        document.body.append(canvas);
        animateCSS('#settings>div', 'fadeOutLeft');
        animateCSS('#settings>div:nth-of-type(2)', 'fadeOutRight');
        document.querySelector('#gameZone').classList.remove('d-none');
        await animateCSS('#gameZone', 'fadeInDown');
        document.querySelector('#settings').remove();
    });
}

socket.on('joinRoom', putPlayer);
socket.on('otherPlayers', (players) => players.forEach((player) => putPlayer(player)));
socket.on('disconnection', async (player) => {
    if (document.querySelector(`#skribblr-${player.id}`)) {
        exit.play();
        await animateCSS(`#skribblr-${player.id}`, 'fadeOutUp');
        document.querySelector(`#skribblr-${player.id}`).remove();
    }
});
socket.on('startGame', showCanvasArea);
function showOperationError(message) {
    let notice = document.querySelector('#operationError');
    if (!notice) {
        notice = document.createElement('p');
        notice.id = 'operationError';
        notice.className = 'alert alert-danger text-center';
        notice.setAttribute('role', 'alert');
        document.body.prepend(notice);
    }
    notice.textContent = message;
    return notice;
}
socket.on('operationError', ({ message }) => showOperationError(message));
function showClosedRoom(message) {
    const notice = showOperationError(message);
    const back = document.createElement('a');
    back.href = window.location.pathname;
    back.className = 'btn btn-primary ms-3';
    back.textContent = '返回首页';
    notice.append(back);
}
socket.on('roomClosed', ({ message }) => showClosedRoom(message));
socket.on('disconnect', () => showClosedRoom('连接已断开，请重新进入房间'));
socket.on('newPrivateRoom', (data) => {
    document.querySelector('#gameLink').value = `${window.location.protocol}//${window.location.host}/?id=${data.gameID}`;
    putPlayer(my);
});

function requestOperation(event, data) {
    return new Promise((resolve) => {
        socket.timeout(5000).emit(event, data, (error, response) => {
            if (error) showOperationError('连接中断或操作超时，请重试');
            resolve(!error && response && response.ok);
        });
    });
}

if (searchParams.has('id')) {
    // player
    document.querySelector('#rounds').setAttribute('disabled', true);
    document.querySelector('#time').setAttribute('disabled', true);
    document.querySelector('#startGame').setAttribute('disabled', true);
    document.querySelector('#language').setAttribute('disabled', true);
    document.querySelector('#playGame').addEventListener('click', async () => {
        my.id = socket.id;
        if (!await requestOperation('joinRoom', { id: searchParams.get('id'), player: my })) return;
        await animateCSS('#landing>div>div', 'hinge');
        document.querySelector('#landing').remove();
        document.querySelector('#settings').classList.remove('d-none');
        await animateCSS('#settings div', 'jackInTheBox');
        my.id = socket.id;
        if (searchParams.has('id')) {
            document.querySelector('#gameLink').value = `${window.location.protocol}//${window.location.host}/?id=${searchParams.get('id')}`;
            putPlayer(my);
        }
    });
} else {
    // room owner
    document.querySelector('#rounds').addEventListener('input', updateSettings);
    document.querySelector('#time').addEventListener('input', updateSettings);
    document.querySelector('#customWords').addEventListener('change', updateSettings);
    document.querySelector('#probability').addEventListener('change', updateSettings);
    document.querySelector('#createRoom').addEventListener('click', async () => {
        my.id = socket.id;
        if (!await requestOperation('newPrivateRoom', my)) return;
        await animateCSS('#landing>div>div', 'hinge');
        document.querySelector('#landing').remove();
        document.querySelector('#settings').classList.remove('d-none');
        animateCSS('#settings div', 'jackInTheBox');
        await animateCSS('#settings>div:nth-of-type(2)', 'jackInTheBox');
        my.id = socket.id;
    });
}

copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('#gameLink').select();
    document.execCommand('copy');
});

document.querySelector('#startGame').addEventListener('click', async () => {
    socket.emit('startGame');
});
