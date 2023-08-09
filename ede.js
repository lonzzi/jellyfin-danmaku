// ==UserScript==
// @name         Jellyfin danmaku extension
// @description  Jellyfin弹幕插件
// @namespace    https://github.com/RyoLee
// @author       RyoLee
// @version      1.11
// @copyright    2022, RyoLee (https://github.com/RyoLee)
// @license      MIT; https://raw.githubusercontent.com/Izumiko/jellyfin-danmaku/jellyfin/LICENSE
// @icon         https://github.githubassets.com/pinned-octocat.svg
// @updateURL    https://cdn.jsdelivr.net/gh/Izumiko/jellyfin-danmaku@gh-pages/ede.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/Izumiko/jellyfin-danmaku@gh-pages/ede.user.js
// @grant        GM_xmlhttpRequest
// @connect      *
// @match        *://*/*/web/index.html
// ==/UserScript==

(async function () {
    'use strict';
    if (document.querySelector('meta[name="application-name"]').content == 'Jellyfin') {
        // ------ configs start------
        let deviceId = localStorage.getItem('_deviceId2');
        const serversInfo = JSON.parse(localStorage.getItem('jellyfin_credentials')).Servers;
        let authorization = '';
        let userId = '';
        let isInTampermonkey = true;
        let apiPrefix = 'https://api.9-ch.com/cors/';
        const debugInfoLoc = 'ui'; // 'console' or 'ui'
        let logQueue = [];
        let logLines = 0;
        const baseUrl = window.location.origin + window.location.pathname.replace('/web/index.html', '');
        const check_interval = 200;
        const chConverTtitle = ['当前状态: 未启用', '当前状态: 转换为简体', '当前状态: 转换为繁体'];
        // 0:当前状态关闭 1:当前状态打开
        const danmaku_icons = ['comment', 'comments_disabled'];
        const search_icon = 'find_replace';
        const translate_icon = 'g_translate';
        const info_icon = 'import_contacts';
        const filter_icons = ['filter_none', 'filter_1', 'filter_2', 'filter_3'];
        const source_icon = 'library_add';
        const log_icon = 'adb';
        const spanClass = 'xlargePaperIconButton material-icons ';
        const buttonOptions = {
            class: 'paper-icon-button-light',
            is: 'paper-icon-button-light',
        };
        const uiAnchorStr = 'pause';
        const uiQueryStr = '.osdTimeText';
        const mediaContainerQueryStr = "div[data-type='video-osd']";
        // const mediaContainerQueryStr = "div[class='videoPlayerContainer']";
        const mediaQueryStr = 'video';
        const displayButtonOpts = {
            title: '弹幕开关',
            id: 'displayDanmaku',
            //innerText: null,
            class: '',
            onclick: () => {
                if (window.ede.loading) {
                    showDebugInfo('正在加载,请稍后再试');
                    return;
                }
                showDebugInfo('切换弹幕开关');
                window.ede.danmakuSwitch = (window.ede.danmakuSwitch + 1) % 2;
                window.localStorage.setItem('danmakuSwitch', window.ede.danmakuSwitch);
                document.querySelector('#displayDanmaku').children[0].className = spanClass + danmaku_icons[window.ede.danmakuSwitch];
                if (window.ede.danmaku) {
                    window.ede.danmakuSwitch == 1 ? window.ede.danmaku.show() : window.ede.danmaku.hide();
                }
            },
        };
        const searchButtonOpts = {
            title: '搜索弹幕',
            id: 'searchDanmaku',
            //innerText: search_icon,
            class: search_icon,
            onclick: () => {
                if (window.ede.loading) {
                    showDebugInfo('正在加载,请稍后再试');
                    return;
                }
                showDebugInfo('手动匹配弹幕');
                reloadDanmaku('search');
            },
        };
        const translateButtonOpts = {
            title: null,
            id: 'translateDanmaku',
            //innerText: translate_icon,
            class: translate_icon,
            onclick: () => {
                if (window.ede.loading) {
                    showDebugInfo('正在加载,请稍后再试');
                    return;
                }
                showDebugInfo('切换简繁转换');
                window.ede.chConvert = (window.ede.chConvert + 1) % 3;
                window.localStorage.setItem('chConvert', window.ede.chConvert);
                document.querySelector('#translateDanmaku').setAttribute('title', chConverTtitle[window.ede.chConvert]);
                reloadDanmaku('reload');
                showDebugInfo(document.querySelector('#translateDanmaku').getAttribute('title'));
            },
        };
        const infoButtonOpts = {
            title: '弹幕信息',
            id: 'printDanmakuInfo',
            //innerText: info_icon,
            class: info_icon,
            onclick: () => {
                if (!window.ede.episode_info || window.ede.loading) {
                    showDebugInfo('正在加载,请稍后再试');
                    return;
                }
                showDebugInfo('显示当前信息');
                let msg = '动画名称:' + window.ede.episode_info.animeTitle;
                if (window.ede.episode_info.episodeTitle) {
                    msg += '\n分集名称:' + window.ede.episode_info.episodeTitle;
                }
                sendNotification('当前弹幕匹配', msg);
            },
        };

        const filterButtonOpts = {
            title: '过滤等级(下次加载生效)',
            id: 'filteringDanmaku',
            //innerText: null,
            class: '',
            onclick: () => {
                showDebugInfo('切换弹幕过滤等级');
                let level = window.localStorage.getItem('danmakuFilterLevel');
                level = ((level ? parseInt(level) : 0) + 1) % 4;
                window.localStorage.setItem('danmakuFilterLevel', level);
                document.querySelector('#filteringDanmaku').children[0].className = spanClass + filter_icons[level];
            },
        };

        const sourceButtonOpts = {
            title: '手动增加弹幕源',
            id: 'addDanmakuSource',
            class: source_icon,
            onclick: () => {
                showDebugInfo('手动增加弹幕源');
                let source = prompt('请输入弹幕源地址:');
                if (source) {
                    getCommentsByUrl(source).then((comments) => {
                        createDanmaku(comments).then(() => {
                            showDebugInfo('弹幕就位');
                        });
                    });
                }
            },
        }

        const logButtonOpts = {
            title: '日志开关',
            id: 'displayLog',
            class: log_icon,
            onclick: () => {
                if (window.ede.loading) {
                    showDebugInfo('正在加载,请稍后再试');
                    return;
                }
                // showDebugInfo('切换日志开关');
                window.ede.logSwitch = (window.ede.logSwitch + 1) % 2;
                window.localStorage.setItem('logSwitch', window.ede.logSwitch);
                let logSpan = document.querySelector('#debugInfo');
                if (logSpan) {
                    window.ede.logSwitch == 1 ? (logSpan.style.display = 'block') : (logSpan.style.display = 'none');
                }
            },
        };

        // ------ configs end------

        /* Load DanmuJs */
        let danmujs = document.createElement('script');
        danmujs.setAttribute('type', 'text/javascript');
        danmujs.setAttribute('src', 'https://cdn.jsdelivr.net/npm/danmaku@2.0.6/dist/danmaku.min.js');
        document.getElementsByTagName('head')[0].appendChild(danmujs);

        // 检测是否在Tampermonkey中运行
        if (typeof GM_addStyle === 'undefined') {
            isInTampermonkey = false;
        } else {
            apiPrefix = '';
        }

        /*if (isInTampermonkey) {
            const md_icon_css = GM_getResourceText("MDICON_CSS");
            GM_addStyle(md_icon_css);
            apiPrefix = '';
        } else {
            // load css url
            const md_icon_css = 'https://fonts.googleapis.com/icon?family=Material+Icons';
            const md_icon_link = document.createElement('link');
            md_icon_link.rel = 'stylesheet';
            md_icon_link.href = md_icon_css;
            document.head.appendChild(md_icon_link);
        }*/

        class EDE {
            constructor() {
                this.chConvert = 1;
                if (window.localStorage.getItem('chConvert')) {
                    this.chConvert = window.localStorage.getItem('chConvert');
                }
                // 0:当前状态关闭 1:当前状态打开
                this.danmakuSwitch = 1;
                if (window.localStorage.getItem('danmakuSwitch')) {
                    this.danmakuSwitch = parseInt(window.localStorage.getItem('danmakuSwitch'));
                }
                this.logSwitch = 0;
                if (window.localStorage.getItem('logSwitch')) {
                    this.logSwitch = parseInt(window.localStorage.getItem('logSwitch'));
                }
                this.danmaku = null;
                this.episode_info = null;
                this.ob = null;
                this.loading = false;
            }
        }

        function createButton(opt) {
            //let button = document.createElement('button', buttonOptions);
            let button = document.createElement('button');
            button.className = buttonOptions.class;
            button.setAttribute('is', buttonOptions.is);
            button.setAttribute('title', opt.title);
            button.setAttribute('id', opt.id);
            let icon = document.createElement('span');
            icon.className = spanClass + opt.class;
            // icon.innerText = opt.innerText;
            button.appendChild(icon);
            button.onclick = opt.onclick;
            return button;
        }

        function initListener() {
            let container = document.querySelector(mediaQueryStr);
            // 页面未加载
            if (!container) {
                if (window.ede.episode_info) {
                    window.ede.episode_info = null;
                }
                return;
            }
            if (!container.getAttribute('ede_listening')) {
                showDebugInfo('正在初始化Listener');
                container.setAttribute('ede_listening', true);
                container.addEventListener('play', reloadDanmaku);
                showDebugInfo('Listener初始化完成');
            }
        }

        function initUI() {
            // 页面未加载
            // let uiAnchor = getElementsByInnerText('i', uiAnchorStr);
            let uiAnchor = document.getElementsByClassName(uiAnchorStr);
            if (!uiAnchor || !uiAnchor[0]) {
            // if (!document.querySelector(uiQueryStr)) {
                return;
            }
            // 已初始化
            if (document.getElementById('danmakuCtr')) {
                return;
            }
            showDebugInfo('正在初始化UI');
            // 弹幕按钮容器div
            let uiEle = null;
            document.querySelectorAll(uiQueryStr).forEach(function (element) {
                if (element.offsetParent != null) {
                    uiEle = element;
                }
            });
            if (uiEle == null) {
                return;
            }
            // let parent = uiAnchor[0].parentNode.parentNode;
            let parent = uiEle.parentNode;
            let menubar = document.createElement('div');
            menubar.id = 'danmakuCtr';
            if (!window.ede.episode_info) {
                menubar.style.opacity = 0.5;
            }
            // parent.append(menubar);
            parent.insertBefore(menubar, uiEle);
            // 弹幕开关
            displayButtonOpts.class = danmaku_icons[window.ede.danmakuSwitch];
            menubar.appendChild(createButton(displayButtonOpts));
            // 手动匹配
            menubar.appendChild(createButton(searchButtonOpts));
            // 简繁转换
            translateButtonOpts.title = chConverTtitle[window.ede.chConvert];
            menubar.appendChild(createButton(translateButtonOpts));
            // 屏蔽等级
            filterButtonOpts.class = filter_icons[parseInt(window.localStorage.getItem('danmakuFilterLevel') ? window.localStorage.getItem('danmakuFilterLevel') : 0)];
            menubar.appendChild(createButton(filterButtonOpts));
            // 弹幕信息
            menubar.appendChild(createButton(infoButtonOpts));
            // 手动增加弹幕源
            menubar.appendChild(createButton(sourceButtonOpts));

            if (debugInfoLoc == 'ui') {
                menubar.appendChild(createButton(logButtonOpts));

                let _container = null;
                document.querySelectorAll(mediaContainerQueryStr).forEach(function (element) {
                    if (!element.classList.contains('hide')) {
                        _container = element;
                    }
                });
                let span = document.createElement('span');
                span.id = 'debugInfo';
                span.style.position = 'absolute';
                span.style.overflow = 'auto';
                span.style.zIndex = '99';
                span.style.left = '10px';
                span.style.top = '50px';
                window.ede.logSwitch == 1 ? (span.style.display = 'block') : (span.style.display = 'none');
                _container.appendChild(span);

                let txt1 = deviceId ? deviceId : 'devId';
                let txt2 = serversInfo ? serversInfo[0].AccessToken : 'Token';
                showDebugInfo(txt1 + ' ' + txt2)
            }

            showDebugInfo('UI初始化完成');
        }

        async function showDebugInfo(msg) {
            if (debugInfoLoc == 'ui') {
                let span = document.getElementById('debugInfo');
                while (!span) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    span = document.getElementById('debugInfo');
                }
                if (logLines < 10) {
                    logLines++;
                    logQueue.push(msg);
                } else {
                    logQueue.shift();
                    logQueue.push(msg);
                }
                span.innerText = '';
                logQueue.forEach((line) => {
                    span.innerText += line + '\n';
                });
            } else if (debugInfoLoc == 'console') {
                console.log(msg);
            }
        }

        function sendNotification(title, msg) {
            const Notification = window.Notification || window.webkitNotifications;
            showDebugInfo(msg);
            if (Notification.permission === 'granted') {
                return new Notification(title, {
                    body: msg,
                });
            } else {
                Notification.requestPermission((permission) => {
                    if (permission === 'granted') {
                        return new Notification(title, {
                            body: msg,
                        });
                    }
                });
            }
        }

        async function initConfig() {
            showDebugInfo('serverInfo');
            // let srvInfo = await fetch(baseUrl + '/System/Info/Public').then(res => res.json());
            // let token = '';
            // let serverId = srvInfo.Id;
            // serversInfo.forEach(data => {
            //     if (data.Id == serverId) {
            //         token = data.AccessToken;
            //         userId = data.UserId;
            //     }
            // });
            let token = serversInfo[0].AccessToken;
            userId = serversInfo[0].UserId;

            let sessionUrl = baseUrl + '/Sessions?ControllableByUserId=' + userId
            if (deviceId) {
                sessionUrl += '&DeviceId=' + deviceId;
            }

            showDebugInfo('Get DevId');
            let sessionInfo = await fetch(sessionUrl, {
                "credentials": "include",
                "headers": {
                    "Accept": "application/json",
                    "Authorization": "MediaBrowser Token=\"" + token + "\""
                },
                "method": "GET",
                "mode": "cors"
            }).then(res => res.json());

            if (!deviceId) {
                deviceId = sessionInfo[0].DeviceId;
                localStorage.setItem('_deviceId2', deviceId);
            }

            let clientName = sessionInfo[0].Client;
            let deviceName = sessionInfo[0].DeviceName;
            let serverVersion = sessionInfo[0].ApplicationVersion;
            // Ref: https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f
            authorization = "MediaBrowser Client=\"" + clientName + "\", Device=\"" + deviceName + "\", DeviceId=\"" + deviceId + "\", Version=\"" + serverVersion + "\", Token=\"" + token + "\"";
        }


        async function getEmbyItemInfo() {
            showDebugInfo('准备获取Item信息');
            if (authorization.length > 0 && userId.length > 0 && deviceId.length > 0) {
                showDebugInfo('正在获取Item信息');
                let playingInfo = null;
                while (!playingInfo) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    let sessionUrl = baseUrl + '/Sessions?ControllableByUserId=' + userId + '&deviceId=' + deviceId;
                    showDebugInfo(sessionUrl);
                    let sessionInfo = await fetch(sessionUrl, {
                        "credentials": "include",
                        "headers": {
                            "Accept": "application/json",
                            "Authorization": authorization
                        },
                        "method": "GET",
                        "mode": "cors"
                    }).then(res => res.json());
                    playingInfo = sessionInfo[0].NowPlayingItem;
                }
                showDebugInfo('成功 ' + playingInfo.SeriesName);
                return playingInfo;
            } else {
                showDebugInfo('等待Config');
                await initConfig();
            }
        }

        function makeGetRequest(url) {
            if (isInTampermonkey) {
                return new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "GET",
                        url: url,
                        headers: {
                            "Accept-Encoding": "gzip",
                            "Accept": "application/json"
                        },
                        onload: function (response) {
                            resolve(response.responseText);
                        },
                        onerror: function (error) {
                            reject(error);
                        }
                    });
                });
            } else {
                return fetch(url, {
                    method: 'GET',
                    headers: {
                        "Accept-Encoding": "gzip",
                        "Accept": "application/json",
                        "User-Agent": navigator.userAgent
                    }
                })
            }
        }

        async function getEpisodeInfo(is_auto = true) {
            let item = await getEmbyItemInfo();
            if (!item) {
                return null;
            }
            let _id;
            let animeName;
            let anime_id = -1;
            let episode;
            if (item.Type == 'Episode') {
                _id = item.SeasonId;
                animeName = item.SeriesName;
                episode = item.IndexNumber;
                let session = item.ParentIndexNumber;
                if (session != 1) {
                    animeName += ' ' + session;
                }
            } else {
                _id = item.Id;
                animeName = item.Name;
                episode = 'movie';
            }
            let _id_key = '_anime_id_rel_' + _id;
            let _name_key = '_anime_name_rel_' + _id;
            let _episode_key = '_episode_id_rel_' + _id + '_' + episode;
            if (is_auto) {
                if (window.localStorage.getItem(_episode_key)) {
                    return JSON.parse(window.localStorage.getItem(_episode_key));
                }
            }
            if (window.localStorage.getItem(_id_key)) {
                anime_id = window.localStorage.getItem(_id_key);
            }
            if (window.localStorage.getItem(_name_key)) {
                animeName = window.localStorage.getItem(_name_key);
            }
            if (!is_auto) {
                animeName = prompt('确认动画名:', animeName);
            }

            let searchUrl = apiPrefix + 'https://api.dandanplay.net/api/v2/search/episodes?anime=' + animeName + '&withRelated=true';
            if (is_auto) {
                searchUrl += '&episode=' + episode;
            }
            let animaInfo = await makeGetRequest(searchUrl)
                .then((response) => isInTampermonkey ? JSON.parse(response) : response.json())
                .catch((error) => {
                    showDebugInfo('查询失败:', error);
                    return null;
                });
            if (animaInfo.animes.length == 0) {
                showDebugInfo('弹幕查询无结果');
                //alert('弹幕查询无结果');
                return null;
            }
            showDebugInfo('查询成功');
            showDebugInfo(animaInfo);
            let selecAnime_id = 1;
            if (anime_id != -1) {
                for (let index = 0; index < animaInfo.animes.length; index++) {
                    if (animaInfo.animes[index].animeId == anime_id) {
                        selecAnime_id = index + 1;
                    }
                }
            }
            if (!is_auto) {
                let anime_lists_str = list2string(animaInfo);
                showDebugInfo(anime_lists_str);
                selecAnime_id = prompt('选择:\n' + anime_lists_str, selecAnime_id);
                selecAnime_id = parseInt(selecAnime_id) - 1;
                window.localStorage.setItem(_id_key, animaInfo.animes[selecAnime_id].animeId);
                window.localStorage.setItem(_name_key, animaInfo.animes[selecAnime_id].animeTitle);
                let episode_lists_str = ep2string(animaInfo.animes[selecAnime_id].episodes);
                episode = prompt('确认集数:\n' + episode_lists_str, parseInt(episode));
                episode = parseInt(episode) - 1;
            } else {
                selecAnime_id = parseInt(selecAnime_id) - 1;
                episode = 0;
            }
            let episodeInfo = {
                episodeId: animaInfo.animes[selecAnime_id].episodes[episode].episodeId,
                animeTitle: animaInfo.animes[selecAnime_id].animeTitle,
                episodeTitle: animaInfo.animes[selecAnime_id].type == 'tvseries' ? animaInfo.animes[selecAnime_id].episodes[episode].episodeTitle : null,
            };
            window.localStorage.setItem(_episode_key, JSON.stringify(episodeInfo));
            return episodeInfo;
        }

        function getComments(episodeId) {
            let url = apiPrefix + 'https://api.dandanplay.net/api/v2/comment/' + episodeId + '?withRelated=true&chConvert=' + window.ede.chConvert;
            return makeGetRequest(url)
                .then((response) => isInTampermonkey ? JSON.parse(response) : response.json())
                .then((data) => {
                    showDebugInfo('弹幕下载成功: ' + data.comments.length);
                    return data.comments;
                })
                .catch((error) => {
                    showDebugInfo('获取弹幕失败:', error);
                    return null;
                });
        }

        async function getCommentsByUrl(src) {
            const url_encoded = encodeURIComponent(src);
            const url = apiPrefix + 'https://api.dandanplay.net/api/v2/extcomment?url=' + url_encoded;
            let comments = [];
            for (let i = 0; i < 2; i++) {
                comments = makeGetRequest(url)
                    .then((response) => isInTampermonkey ? JSON.parse(response) : response.json())
                    .then((data) => {
                        showDebugInfo('弹幕下载成功: ' + data.comments.length);
                        return data.comments;
                    })
                    .catch((error) => {
                        showDebugInfo('获取弹幕失败:', error);
                        return null;
                    });
                if (comments.length > 0) {
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, 3000));
            }
            return comments;
        }

        async function createDanmaku(comments) {
            if (!comments) {
                return;
            }
            if (window.ede.danmaku != null) {
                window.ede.danmaku.clear();
                window.ede.danmaku.destroy();
                window.ede.danmaku = null;
            }
            let _comments = danmakuFilter(danmakuParser(comments));
            showDebugInfo('弹幕加载成功: ' + _comments.length);

            while (!document.querySelector(mediaContainerQueryStr)) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }

            let _container = null;
            document.querySelectorAll(mediaContainerQueryStr).forEach(function (element) {
                if (!element.classList.contains('hide')) {
                    _container = element;
                }
            });
            if (!_container) {
                showDebugInfo('未找到播放器');
            }
            let _media = document.querySelector(mediaQueryStr);
            if (!_media) {
                showDebugInfo('未找到video');
            } else {
                //prompt(_media.outerHTML);
            }
            // showDebugInfo(_comments[0].text)
            showDebugInfo(_container.id + ' ' + _media.className)
            window.ede.danmaku = new Danmaku({
                container: _container,
                media: _media,
                comments: _comments,
                engine: 'canvas',
            });

            _container.childNodes.forEach(function (element) {
                if (element.nodeName == 'CANVAS') {
                    element.style.position = 'absolute';
                    element.style.top = '18px';
                }
            });

            // window.ede.danmaku.emit({
            //     text: 'example',
            //     mode: 'rtl',
            //     time: 5.0,
            // });

            window.ede.danmakuSwitch == 1 ? window.ede.danmaku.show() : window.ede.danmaku.hide();
            if (window.ede.ob) {
                window.ede.ob.disconnect();
            }
            window.ede.ob = new ResizeObserver(() => {
                if (window.ede.danmaku) {
                    showDebugInfo('Resizing');
                    window.ede.danmaku.resize();
                }
            });
            window.ede.ob.observe(_container);
        }

        function reloadDanmaku(type = 'check') {
            if (window.ede.loading) {
                showDebugInfo('正在重新加载');
                return;
            }
            window.ede.loading = true;
            getEpisodeInfo(type != 'search')
                .then((info) => {
                    return new Promise((resolve, reject) => {
                        if (!info) {
                            if (type != 'init') {
                                reject('播放器未完成加载');
                            } else {
                                reject(null);
                            }
                        }
                        if (type != 'search' && type != 'reload' && window.ede.danmaku && window.ede.episode_info && window.ede.episode_info.episodeId == info.episodeId) {
                            reject('当前播放视频未变动');
                        } else {
                            window.ede.episode_info = info;
                            resolve(info.episodeId);
                        }
                    });
                })
                .then(
                    (episodeId) =>
                        getComments(episodeId).then((comments) =>
                            createDanmaku(comments).then(() => {
                                showDebugInfo('弹幕就位');
                            }),
                        ),
                    (msg) => {
                        if (msg) {
                            showDebugInfo(msg);
                        }
                    },
                )
                .then(() => {
                    window.ede.loading = false;
                    if (document.getElementById('danmakuCtr').style.opacity != 1) {
                        document.getElementById('danmakuCtr').style.opacity = 1;
                    }
                });
        }

        function danmakuFilter(comments) {
            let level = parseInt(window.localStorage.getItem('danmakuFilterLevel') ? window.localStorage.getItem('danmakuFilterLevel') : 0);
            if (level == 0) {
                return comments;
            }
            let limit = 9 - level * 2;
            let vertical_limit = 6;
            let arr_comments = [];
            let vertical_comments = [];
            for (let index = 0; index < comments.length; index++) {
                let element = comments[index];
                let i = Math.ceil(element.time);
                let i_v = Math.ceil(element.time / 3);
                if (!arr_comments[i]) {
                    arr_comments[i] = [];
                }
                if (!vertical_comments[i_v]) {
                    vertical_comments[i_v] = [];
                }
                // TODO: 屏蔽过滤
                if (vertical_comments[i_v].length < vertical_limit) {
                    vertical_comments[i_v].push(element);
                } else {
                    element.mode = 'rtl';
                }
                if (arr_comments[i].length < limit) {
                    arr_comments[i].push(element);
                }
            }
            return arr_comments.flat();
        }

        function danmakuParser($obj) {
            //const $xml = new DOMParser().parseFromString(string, 'text/xml')
            // const fontSize = Math.round(((window.screen.height > window.screen.width ? window.screen.width : window.screen.height) / 1080) * 18);
            const fontSize = 18; // font size is buggy on mobile, fixed to 18
            showDebugInfo('Screen: ' + window.screen.width + 'x' + window.screen.height);
            showDebugInfo('fontSize: ' + fontSize);
            return $obj
                .map(($comment) => {
                    const p = $comment.p;
                    //if (p === null || $comment.childNodes[0] === undefined) return null
                    const values = p.split(',');
                    const mode = { 6: 'ltr', 1: 'rtl', 5: 'top', 4: 'bottom' }[values[1]];
                    if (!mode) return null;
                    // const fontSize = Number(values[2]) || 25
                    // const fontSize = Math.round((window.screen.height > window.screen.width ? window.screen.width : window.screen.height / 1080) * 18);
                    const color = `000000${Number(values[2]).toString(16)}`.slice(-6);
                    return {
                        text: $comment.m,
                        mode,
                        time: values[0] * 1,
                        style: {
                            // For DOMRenderer:
                            // fontSize: `${fontSize}px`,
                            // color: `#${color}`,
                            // textShadow:
                            //     color === '00000' ? '-1px -1px #fff, -1px 1px #fff, 1px -1px #fff, 1px 1px #fff' : '-1px -1px #000, -1px 1px #000, 1px -1px #000, 1px 1px #000',

                            // For CanvasRenderer:
                            font: `${fontSize}px sans-serif`,
                            fillStyle: `#${color}`,
                            strokeStyle: color === '000000' ? '#fff' : '#000',
                            lineWidth: 2.0,
                        },
                    };
                })
                .filter((x) => x);
        }

        function list2string($obj2) {
            const $animes = $obj2.animes;
            let anime_lists = $animes.map(($single_anime) => {
                return $single_anime.animeTitle + ' 类型:' + $single_anime.typeDescription;
            });
            let anime_lists_str = '1:' + anime_lists[0];
            for (let i = 1; i < anime_lists.length; i++) {
                anime_lists_str = anime_lists_str + '\n' + (i + 1).toString() + ':' + anime_lists[i];
            }
            return anime_lists_str;
        }

        function ep2string($obj3) {
            const $animes = $obj3;
            let anime_lists = $animes.map(($single_ep) => {
                return $single_ep.episodeTitle;
            });
            let ep_lists_str = '1:' + anime_lists[0];
            for (let i = 1; i < anime_lists.length; i++) {
                ep_lists_str = ep_lists_str + '\n' + (i + 1).toString() + ':' + anime_lists[i];
            }
            return ep_lists_str;
        }

        while (!document.querySelector('.htmlvideoplayer')) {
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        if (!window.ede) {
            window.ede = new EDE();
            setInterval(() => {
                initUI();
            }, check_interval);
            while (!(await getEmbyItemInfo())) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
            reloadDanmaku('init');
            setInterval(() => {
                initListener();
            }, check_interval);
        }
    }
})();
