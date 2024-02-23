const hostlist = { 'api.dandanplay.net': null };
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
};
const appId = '';
const appSecret = '';

function handleOptions(request) {
    let headers = request.headers;
    if (
        'OPTIONS' == request.method &&
        headers.get('Origin') &&
        headers.get('Access-Control-Request-Method') &&
        headers.get('Access-Control-Request-Headers')
    ) {
        let respHeaders = {
            ...corsHeaders,
            'Access-Control-Allow-Headers': headers.get('Access-Control-Request-Headers'),
        }
        return new Response(null, {
            headers: respHeaders,
        });
    } else {
        return new Response(null, {
            headers: {
                'Allow': 'GET, HEAD, POST, OPTIONS',
            },
        });
    }
}

async function handleRequest(request) {
    let response;
    if (request.method === 'OPTIONS') {
        response = handleOptions(request);
    } else {
        const urlObj = new URL(request.url);
        let url = urlObj.href.replace(urlObj.origin + '/cors/', '').trim();
        if (0 !== url.indexOf('https://') && 0 === url.indexOf('https:')) {
            url = url.replace('https:/', 'https://');
        } else if (0 !== url.indexOf('http://') && 0 === url.indexOf('http:')) {
            url = url.replace('http:/', 'http://');
        }
        let tUrlObj = new URL(url);
        if (!(tUrlObj.hostname in hostlist)) {
            return Forbidden(tUrlObj);
        }

        // dandanplay login, compute sigh hash with appId and appSecret
        if (request.method === 'POST' && tUrlObj.pathname === '/api/v2/login') {
            let body = await request.json();
            if (body.userName.length == 0 || body.password.length == 0) {
                return new Response('{"error": "用户名或密码不能为空"}', {
                    status: 400,
                    headers: corsHeaders,
                });
            }
            const unixTimeStamp = Math.round(new Date().getTime() / 1000);
            const tmp = appId + body.password + unixTimeStamp + body.userName + appSecret;
            const hash = await crypto.subtle.digest('MD5', new TextEncoder().encode(tmp));
            body.appId = appId;
            body.unixTimeStamp = unixTimeStamp;
            body.hash = Array.from(new Uint8Array(hash))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');

            response = await fetch(url, {
                headers: request.headers,
                body: JSON.stringify(body),
                method: request.method,
            });
            response = new Response(await response.body, response);
            response.headers.set('Access-Control-Allow-Origin', '*');
            response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');

            return response;
        }

        response = await fetch(url, {
            headers: request.headers,
            body: request.body,
            method: request.method,
        });
        response = new Response(await response.body, response);
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    }
    return response;
}

function Forbidden(url) {
    return new Response(`Hostname ${url.hostname} not allowed.`, {
        status: 403,
    });
}

addEventListener('fetch', (event) => {
    return event.respondWith(handleRequest(event.request));
});
