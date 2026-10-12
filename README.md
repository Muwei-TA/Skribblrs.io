# Skribblrs.io

![CodeQL](https://github.com/Aditya-ds-1806/Skribblrs.io/workflows/CodeQL/badge.svg?branch=main)
![OSSAR](https://github.com/Aditya-ds-1806/Skribblrs.io/workflows/OSSAR/badge.svg?branch=main)
![Website](https://img.shields.io/website?url=https%3A%2F%2Fskribblrs.up.railway.app/)
[![GitHub license](https://img.shields.io/github/license/Aditya-ds-1806/Skribblrs.io)](https://github.com/Aditya-ds-1806/Skribblrs.io/blob/main/LICENSE)

Skribblrs.io is my attempt at building a clone of the web-based drawing and guessing game [skribbl.io](https://skribbl.io).

To play a game: [https://skribblrs.up.railway.app/](https://skribblrs.up.railway.app/)

> It might take a few seconds to respond due to inactivity.

The site does not collect any user data or display ads.

## Local setup

The project requires Node.js to be installed on your system. To run the project locally:

```bash
git clone https://github.com/Muwei-TA/Skribblrs.io.git
cd Skribblrs.io
npm i
npm run start
```

The app will run by default on port 3000. Open your browser and go to [http://localhost:3000](http://localhost:3000).

## 简体中文游戏

新建房间默认使用简体中文词库，内置 633 个常见词语，涵盖动物、食物、物品、交通、场景和动作。
游戏仅保留简体中文词库；新加入的玩家会同步房间的当前设置。
首页提供玩法介绍，头像用于在房间和游戏中标识玩家。
头像统一使用本地默认图片，无需访问外部头像接口；已保存的旧头像地址会自动替换。

房主可在“游戏设置 → 上传自定义词库”选择 UTF-8 编码的 `.txt` 文件，每行一个词语。例如：

```text
苹果
自行车
公共汽车
```

导入会替换当前自定义词语，自动去除空行和重复项，并默认将“自定义词语出现概率”设为 100%；调低概率可与内置词库混合。导入后仍可在文本框内编辑。
词库须包含 3–100 个不同词语，每个最多 40 字，文件最多 16 KB。仅使用自定义词库时，词语不足 3 个会阻止保存和开始游戏。词库仅在当前房间生效，不保存上传文件，房间关闭后清除。
自定义词语每行一个，至少填写三个不同词语后生效，可通过出现概率调整出题比例。

中文使用系统输入法直接输入；确认输入法候选词时不会提前发送猜测。
答案去除首尾空格后精确匹配，不自动转换繁体字、拼音或同义词。
一、二字词不提供“接近答案”提示，也不揭示单字；三字及以上词只对相差一个字的猜测提示接近。
较长中文词从剩余约三分之一时间开始揭字，每三个字最多揭示一个字。

使用 Node.js 24 安装依赖后，可运行回归检查：

```bash
npm ci
npm test
```

检查覆盖中文词库、默认语言、提示、输入法和真实 WebSocket 多人猜词计分。
代码检查使用 `npm run lint`，依赖漏洞扫描使用 `npm audit`。

## 服务端规则与资源限制

房主身份和玩家 ID 由服务端绑定到 Socket.IO 连接；客户端提交的 ID、分数和聊天昵称不会覆盖服务端身份。
仅房主可以修改设置或开始游戏；至少两名玩家才能开始。游戏进行中禁止修改设置和新玩家加入。
仅当前绘图者能从服务端提供的三个候选词中选词、绘图和清屏；选词超时 15 秒由服务端自动选择。
猜对通知、聊天、绘图和分数更新均限制在当前房间。

服务端会校验消息字段，并返回中文错误提示；无效输入不会直接进入游戏处理逻辑。
每个传输消息最多 16 KiB，聊天最多 500 个 UTF-16 单元，昵称最多 32 个 UTF-16 单元。
最多允许 100 个自定义词语，每个词语最多 40 个 UTF-16 单元；重复词语会去重，少于三个不同词语时使用内置词库。
轮次范围为 1–10，绘画时间为 30–180 秒，概率范围为 0–1。

限流采用每个连接独立的令牌桶：聊天每秒补充 4 次、突发最多 8 次；绘图每秒补充 60 次、突发最多 90 次。
所有业务事件合计每秒补充 120 次、突发最多 180 次，另有创建房间及控制操作限制。
单房间最多 12 人，单进程最多 200 个房间和 300 个 Engine.IO 连接。

房主退出时关闭房间；游戏中剩余不足两人时结束游戏。等待房间连续 15 分钟没有加入、设置或聊天活动会自动关闭。
游戏结束或房间关闭时会释放成员关系、计时器及轮次监听器；当前绘图者断线后会跳过其回合。
断线重连不会恢复原玩家身份，需重新进入房间。房间仍存放在内存中，重启恢复和多实例共享状态尚未实现。
这些权限规则用于匿名游戏连接，尚未接入 BlackRoom 站点账号验证。

## Docker 部署

需要安装 Docker Engine 和 Docker Compose v2。在仓库根目录运行：

```bash
docker compose up -d --build
```

应用默认使用宿主机的 3000 端口。浏览器访问服务器地址的 3000 端口即可。
如需改用其他宿主机端口（例如 8080）：

```bash
HOST_PORT=8080 docker compose up -d --build
```

查看状态和日志、停止服务：

```bash
docker compose ps
docker compose logs -f skribblrs
docker compose down
```

拉取代码更新后，再次执行 `docker compose up -d --build` 即可重新构建并部署。
镜像使用 Node.js 24，以非 root 用户运行，仅安装生产依赖，并内置 HTTP 健康检查。
应用无需数据库或持久化卷；房间和游戏状态存放在内存中，重启或更新容器会清空这些状态。
建议部署一个实例；多实例部署需要另行实现共享状态和 Socket.IO 会话协调。
使用 Nginx 等反向代理时，需配置 WebSocket 升级转发。
浏览器仍需访问外部 CDN，头像由应用本地提供。

如果构建网络需要代理，可通过 `docker compose build --build-arg HTTP_PROXY --build-arg HTTPS_PROXY`
传入已配置的代理环境变量。如果代理还需要自定义 CA，可在构建时使用
`docker build --secret id=npm_ca,src=/path/to/trusted-ca.pem -t skribblrs .`；
CA 仅供依赖安装使用，不会保存在镜像中。保持证书校验开启。

## Screenshots

| ![Landing page][landing]  | ![Landing page][settings] |
|:-------------------------:|:-------------------------:|
|  ![Landing page][game]    |  ![Landing page][scores]  |

## Technologies used

1. Back End
    - [Node.js](https://github.com/nodejs/node)
    - [Socket.io](https://github.com/socketio/socket.io)
    - [Express](https://github.com/expressjs/express)
    - [Chance](https://github.com/chancejs/chancejs)
    - [Leven](https://github.com/sindresorhus/leven)
    - [Nanoid](https://github.com/ai/nanoid)

2. Front End
    - [Socket.io client](https://github.com/socketio/socket.io-client)
    - [EJS](https://github.com/mde/ejs)
    - [Animate.css](https://github.com/animate-css/animate.css)
    - [Howler.js](https://github.com/goldfire/howler.js)
    - [DiceBear Avatars](https://github.com/DiceBear/avatars)
    - [Bootstrap](https://github.com/twbs/bootstrap)


## Credits

1. Background Image: [https://skribbl.io/res/background.png](https://skribbl.io/res/background.png)
2. Feature ideas: [https://github.com/scribble-rs/scribble.rs](https://github.com/scribble-rs/scribble.rs)
3. Sounds: [https://freesound.org/](https://freesound.org/)

## License

MIT License

Copyright (c) 2021 Aditya DS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

[landing]: ./public/images/screenshots/landing.jpeg
[settings]: ./public/images/screenshots/settings.jpeg
[game]: ./public/images/screenshots/game.png
[scores]: ./public/images/screenshots/scores.jpeg
